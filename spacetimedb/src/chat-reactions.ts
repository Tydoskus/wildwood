import { table, t, SenderError } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import type { ModuleReducerCtx, ModuleViewCtx } from "./index";
import { CHAT_REACTIONS, chatReactionCounts, isChatReaction } from "../../shared/chat-reactions";
import { assertChatNotMuted } from "./chat-mute";
export const chatReactionUnlock = table({ name: "chat_reaction_unlock", public: false }, {
  identity: t.identity().primaryKey(), gemHeart: t.bool().default(false),
});
export const chatReaction = table({ name: "chat_reaction" }, {
  key: t.string().primaryKey(), messageKey: t.string().index("btree"),
  actor: t.identity().index("btree"), reaction: t.string(),
  active: t.bool().default(true), heartCredited: t.bool().default(false),
});
// Private, constant-time allowance per giver, shared across public/guild chat.
// Named for hearts because it began as theirs; it now covers every reaction, so
// a script cannot sit on thumbs-down forever while hearts stayed rationed.
export const chatHeartAllowance = table({ name: "chat_heart_allowance" }, {
  identity: t.identity().primaryKey(), windowStart: t.timestamp(), used: t.u32(),
});
// Its own table rather than a column on the allowance: adding a column to a
// live table disconnects every client, and a new table costs nothing.
export const chatReactionCooldown = table({ name: "chat_reaction_cooldown" }, {
  identity: t.identity().primaryKey(), lastAtMicros: t.u64(),
});
const REACTIONS_PER_HOUR = 30;
const HOUR_MICROS = 3_600_000_000n;
/** One reaction every two seconds: fast enough to read as instant, slow enough
 *  that a script cannot bury a message under a held-down key. */
const REACTION_COOLDOWN_MICROS = 2_000_000n;
export const REACTION_LIMIT_MESSAGE = `You can give ${REACTIONS_PER_HOUR} reactions per hour in public and guild chat. Try again later.`;
export const REACTION_COOLDOWN_MESSAGE = "One reaction every two seconds.";
function currentAllowance(ctx: ModuleReducerCtx, actor: Identity) {
  const row = ctx.db.chatHeartAllowance.identity.find(actor);
  return row && ctx.timestamp.microsSinceUnixEpoch - row.windowStart.microsSinceUnixEpoch < HOUR_MICROS ? row : null;
}
function spendReaction(ctx: ModuleReducerCtx) {
  const previous = ctx.db.chatHeartAllowance.identity.find(ctx.sender);
  const current = currentAllowance(ctx, ctx.sender);
  if (current && current.used >= REACTIONS_PER_HOUR) throw new SenderError(REACTION_LIMIT_MESSAGE);
  const next = { identity: ctx.sender, windowStart: current?.windowStart ?? ctx.timestamp, used: (current?.used ?? 0) + 1 };
  if (previous) ctx.db.chatHeartAllowance.identity.update(next); else ctx.db.chatHeartAllowance.insert(next);
}
/** Charged for any change, including taking a reaction back, since a toggle
 *  loop is the cheapest way to hammer the summary rows. */
function spendReactionCooldown(ctx: ModuleReducerCtx) {
  const previous = ctx.db.chatReactionCooldown.identity.find(ctx.sender);
  const now = ctx.timestamp.microsSinceUnixEpoch;
  if (previous && now - previous.lastAtMicros < REACTION_COOLDOWN_MICROS) throw new SenderError(REACTION_COOLDOWN_MESSAGE);
  const next = { identity: ctx.sender, lastAtMicros: now };
  if (previous) ctx.db.chatReactionCooldown.identity.update(next); else ctx.db.chatReactionCooldown.insert(next);
}
// Separate records preserve the wire schemas used by installed mobile builds.
export const chatReactionSummary = table({ name: "chat_reaction_summary" }, {
  key: t.string().primaryKey(), countsJson: t.string(),
});
export const playerChatHearts = table({ name: "player_chat_hearts", public: true }, {
  identity: t.identity().primaryKey(), chatHeartsReceived: t.u64(),
});
export function reactionCountsFor(ctx: Pick<ModuleViewCtx, "db">, channel: string, id: bigint) {
  return ctx.db.chatReactionSummary.key.find(messageKey(channel, id))?.countsJson ?? "{}";
}
function writeCounts(ctx: ModuleReducerCtx, key: string, counts: ReturnType<typeof chatReactionCounts>) {
  const next = { key, countsJson: JSON.stringify(counts) };
  if (ctx.db.chatReactionSummary.key.find(key)) ctx.db.chatReactionSummary.key.update(next);
  else ctx.db.chatReactionSummary.insert(next);
}
type ReadContext = Pick<ModuleViewCtx, "db" | "sender">;
function gemHeartUnlocked(ctx: ReadContext) {
  return Boolean(ctx.db.chatReactionUnlock.identity.find(ctx.sender)?.gemHeart);
}
export function grantGemHeartUnlock(ctx: ModuleReducerCtx, identity: Identity, enabled: boolean) {
  const existing = ctx.db.chatReactionUnlock.identity.find(identity);
  if (!enabled) { if (existing) ctx.db.chatReactionUnlock.identity.delete(identity); return; }
  const next = { identity, gemHeart: true };
  if (existing) ctx.db.chatReactionUnlock.identity.update(next);
  else ctx.db.chatReactionUnlock.insert(next);
}
const messageKey = (channel: string, id: bigint) => `${channel}:${id}`;
function readableMessage(ctx: ReadContext, channel: string, id: bigint) {
  if (channel !== "public" && channel !== "social") throw new SenderError("Unknown chat channel.");
  const row = channel === "public" ? ctx.db.chatMessage.id.find(id) : ctx.db.socialMessage.id.find(id);
  if (!row || row.moderated) throw new SenderError("Message unavailable.");
  const blocked = (a: Identity, b: Identity) => Boolean(
    ctx.db.playerBlock.key.find(`${a.toHexString()}:${b.toHexString()}`) || ctx.db.playerBlock.key.find(`${b.toHexString()}:${a.toHexString()}`));
  if (blocked(ctx.sender, row.sender)) throw new SenderError("Message unavailable.");
  if ("channel" in row) {
    if (row.channel === "dm") {
      if ((!row.sender.equals(ctx.sender) && !row.recipient.equals(ctx.sender)) || blocked(row.sender, row.recipient)) throw new SenderError("Message unavailable.");
    } else if (row.channel !== "guild" || ctx.db.guildMember.identity.find(ctx.sender)?.guildId !== row.guildId) throw new SenderError("Message unavailable.");
  }
  return row;
}
export function readChatReactions(ctx: ReadContext, channel: string, id: bigint) {
  readableMessage(ctx, channel, id);
  const prefix = `${messageKey(channel, id)}:${ctx.sender.toHexString()}:`;
  return { counts: chatReactionCounts(reactionCountsFor(ctx, channel, id)), selected: CHAT_REACTIONS
    .filter(reaction => ctx.db.chatReaction.key.find(prefix + reaction.id)?.active).map(reaction => reaction.id),
    ...(gemHeartUnlocked(ctx) ? { gemHeartUnlocked: true } : {}) };
}
/** Indexed lookups keep switching atomic without scanning other players. */
function clearOtherReactions(ctx: ModuleReducerCtx, target: string, actor: Identity, keep: string,
  counts: ReturnType<typeof chatReactionCounts>) {
  let changed = false;
  for (const { id } of CHAT_REACTIONS) {
    if (id === keep) continue;
    const previous = ctx.db.chatReaction.key.find(`${target}:${actor.toHexString()}:${id}`);
    if (!previous?.active) continue;
    ctx.db.chatReaction.key.update({ ...previous, active: false });
    counts[id] = Math.max(0, (counts[id] ?? 0) - 1);
    changed = true;
  }
  return changed;
}
export function setChatReaction(ctx: ModuleReducerCtx, channel: string, id: bigint, reaction: string, active: boolean) {
  // Muted players still see reactions; they cannot add or take one back.
  assertChatNotMuted(ctx);
  if (!isChatReaction(reaction)) throw new SenderError("Unknown reaction.");
  if (reaction === "gemHeart" && active && !gemHeartUnlocked(ctx)) throw new SenderError("Gem heart reaction is locked.");
  const row = readableMessage(ctx, channel, id);
  if (active && row.sender.equals(ctx.sender)) throw new SenderError("You cannot react to your own message.");
  const target = messageKey(channel, id), key = `${target}:${ctx.sender.toHexString()}:${reaction}`;
  const previous = ctx.db.chatReaction.key.find(key);
  // Nothing to do, so nothing to charge: an idempotent click is not spam.
  const rationed = channel === "public" || ("channel" in row && row.channel === "guild");
  if (Boolean(previous?.active) !== active) spendReactionCooldown(ctx);
  // heartCredited is per reaction row, so it reads as "this one already spent".
  // Taking a reaction back and giving it again does not cost a second time.
  const spend = active && !previous?.active && !previous?.heartCredited && rationed;
  const creditHeart = spend && reaction === "heart";
  if (spend) spendReaction(ctx);
  const counts = chatReactionCounts(reactionCountsFor(ctx, channel, id));
  const switched = active && clearOtherReactions(ctx, target, ctx.sender, reaction, counts);
  if (Boolean(previous?.active) === active) {
    if (switched) writeCounts(ctx, target, counts);
    return;
  }
  const next = { key, messageKey: target, actor: ctx.sender, reaction, active, heartCredited: Boolean(previous?.heartCredited || spend) };
  if (previous) ctx.db.chatReaction.key.update(next);
  else ctx.db.chatReaction.insert(next);
  if (creditHeart) {
    const lifetime = ctx.db.playerChatHearts.identity.find(row.sender);
    const total = { identity: row.sender, chatHeartsReceived: (lifetime?.chatHeartsReceived ?? 0n) + 1n };
    if (lifetime) ctx.db.playerChatHearts.identity.update(total);
    else ctx.db.playerChatHearts.insert(total);
  }
  counts[reaction] = Math.max(0, (counts[reaction] ?? 0) + (active ? 1 : -1));
  writeCounts(ctx, target, counts);
}
export function removeMessageReactions(ctx: ModuleReducerCtx, channel: string, id: bigint) {
  ctx.db.chatReactionSummary.key.delete(messageKey(channel, id));
  for (const row of ctx.db.chatReaction.messageKey.filter(messageKey(channel, id))) ctx.db.chatReaction.key.delete(row.key);
}
export function removeAccountReactions(ctx: ModuleReducerCtx, actor: Identity) {
  ctx.db.playerChatHearts.identity.delete(actor);
  ctx.db.chatHeartAllowance.identity.delete(actor);
  ctx.db.chatReactionCooldown.identity.delete(actor);
  for (const reaction of ctx.db.chatReaction.actor.filter(actor)) {
    const [channel, id] = reaction.messageKey.split(":");
    const row = channel === "public" ? ctx.db.chatMessage.id.find(BigInt(id)) : ctx.db.socialMessage.id.find(BigInt(id));
    ctx.db.chatReaction.key.delete(reaction.key);
    if (!row || !reaction.active || !isChatReaction(reaction.reaction)) continue;
    const counts = chatReactionCounts(reactionCountsFor(ctx, channel, BigInt(id)));
    counts[reaction.reaction] = Math.max(0, (counts[reaction.reaction] ?? 0) - 1);
    writeCounts(ctx, reaction.messageKey, counts);
  }
}

/** Preserve a guest's selections/credit history through registration. */
export function mergeAccountReactions(ctx: ModuleReducerCtx, guest: Identity, account: Identity) {
  const guestAllowance = currentAllowance(ctx, guest), accountAllowance = currentAllowance(ctx, account);
  if (guestAllowance) {
    const next = { identity: account,
      windowStart: accountAllowance && accountAllowance.windowStart.microsSinceUnixEpoch > guestAllowance.windowStart.microsSinceUnixEpoch ? accountAllowance.windowStart : guestAllowance.windowStart,
      used: Math.min(REACTIONS_PER_HOUR, guestAllowance.used + (accountAllowance?.used ?? 0)) };
    if (ctx.db.chatHeartAllowance.identity.find(account)) ctx.db.chatHeartAllowance.identity.update(next);
    else ctx.db.chatHeartAllowance.insert(next);
  }
  ctx.db.chatHeartAllowance.identity.delete(guest);
  // Keep the stricter of the two clocks so registering cannot clear a cooldown.
  const guestCooldown = ctx.db.chatReactionCooldown.identity.find(guest);
  if (guestCooldown) {
    const accountCooldown = ctx.db.chatReactionCooldown.identity.find(account);
    const next = { identity: account, lastAtMicros: accountCooldown && accountCooldown.lastAtMicros > guestCooldown.lastAtMicros ? accountCooldown.lastAtMicros : guestCooldown.lastAtMicros };
    if (accountCooldown) ctx.db.chatReactionCooldown.identity.update(next); else ctx.db.chatReactionCooldown.insert(next);
    ctx.db.chatReactionCooldown.identity.delete(guest);
  }
  const guestHearts = ctx.db.playerChatHearts.identity.find(guest);
  if (guestHearts) {
    const accountHearts = ctx.db.playerChatHearts.identity.find(account);
    const total = { identity: account, chatHeartsReceived: guestHearts.chatHeartsReceived + (accountHearts?.chatHeartsReceived ?? 0n) };
    if (accountHearts) ctx.db.playerChatHearts.identity.update(total); else ctx.db.playerChatHearts.insert(total);
    ctx.db.playerChatHearts.identity.delete(guest);
  }
  for (const previous of [...ctx.db.chatReaction.actor.filter(guest)]) {
    const key = `${previous.messageKey}:${account.toHexString()}:${previous.reaction}`;
    const existing = ctx.db.chatReaction.key.find(key);
    ctx.db.chatReaction.key.delete(previous.key);
    const next = { ...previous, key, actor: account,
      active: Boolean(previous.active || existing?.active), heartCredited: Boolean(previous.heartCredited || existing?.heartCredited) };
    if (existing) ctx.db.chatReaction.key.update(next); else ctx.db.chatReaction.insert(next);
    if (!next.active || !isChatReaction(previous.reaction)) continue;
    const [channel, id] = previous.messageKey.split(":");
    const counts = chatReactionCounts(reactionCountsFor(ctx, channel, BigInt(id)));
    const switched = clearOtherReactions(ctx, previous.messageKey, account, previous.reaction, counts);
    const duplicate = previous.active && existing?.active;
    if (duplicate) counts[previous.reaction] = Math.max(0, (counts[previous.reaction] ?? 0) - 1);
    if (switched || duplicate) writeCounts(ctx, previous.messageKey, counts);
  }
}
