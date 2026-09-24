import { SenderError, table, t } from "spacetimedb/server";
import {
  CHAT_MUTE_OWNER_MAX_MINUTES,
  CHAT_MUTE_STRIKE_LIMIT,
  CHAT_MUTE_STRIKE_WINDOW_MS,
  EMPTY_CHAT_MUTE as EMPTY,
  addChatStrike,
  chatMuteRefusal,
  chatMuteRemainingMs,
  formatChatMuteRemaining,
  mergeChatMuteRecords,
  type ChatMuteRecord,
} from "../../shared/chat-mute";
import { isDeveloperIdentity } from "../../shared/developer-identity";
import { recordModerationAction } from "./moderation-history";

/**
 * Automatic chat mutes. Each message the chat filter moderates is a strike;
 * the rules and thresholds live in shared/chat-mute.ts. The send paths call
 * assertChatNotMuted before their cooldown and before inserting anything, and
 * recordChatStrike after a filtered message is stored. The my_chat_mute view
 * and the dev_set_chat_mute reducer are declared in index.ts and call in here.
 *
 * Its own private table rather than columns on a table every session reads: a
 * column change strands every open tab on publish. No row means the account
 * has never had a filtered message. A mute only stops sending: reading chat,
 * history and reactions is untouched. Prestige and reset never touch this row.
 */
export const playerChatMute = table({ name: "player_chat_mute", public: false }, {
  identity: t.identity().primaryKey(),
  /** Filtered messages still inside the strike window, oldest first. */
  strikeAtMicros: t.array(t.u64()),
  /** When the current mute ends; at or before now means not muted. */
  mutedUntilMicros: t.u64(),
  /** When the latest mute started; 0 when the account has never been muted. */
  lastMuteAtMicros: t.u64(),
  muteCount: t.u32(),
});

type Ctx = { db: any; sender: any; timestamp: { microsSinceUnixEpoch: bigint } };
type Row = { identity: any; strikeAtMicros: bigint[]; mutedUntilMicros: bigint; lastMuteAtMicros: bigint; muteCount: number };

const millis = (micros: bigint) => Number(micros / 1000n);
const nowMs = (ctx: Ctx) => millis(ctx.timestamp.microsSinceUnixEpoch);
const recordOf = (row: Row): ChatMuteRecord => ({
  strikeAtMs: row.strikeAtMicros.map(millis),
  mutedUntilMs: millis(row.mutedUntilMicros),
  lastMuteAtMs: millis(row.lastMuteAtMicros),
  muteCount: row.muteCount,
});
const rowOf = (identity: any, record: ChatMuteRecord): Row => ({
  identity,
  strikeAtMicros: record.strikeAtMs.map(ms => BigInt(ms) * 1000n),
  mutedUntilMicros: BigInt(record.mutedUntilMs) * 1000n,
  lastMuteAtMicros: BigInt(record.lastMuteAtMs) * 1000n,
  muteCount: record.muteCount,
});

function write(ctx: Ctx, identity: any, record: ChatMuteRecord, existed: boolean) {
  const row = rowOf(identity, record);
  if (existed) ctx.db.playerChatMute.identity.update(row);
  else ctx.db.playerChatMute.insert(row);
}

/** Refuses a chat send or reaction while the sender is muted. */
export function assertChatNotMuted(ctx: Ctx) {
  const row: Row | null = ctx.db.playerChatMute.identity.find(ctx.sender) ?? null;
  const remaining = chatMuteRemainingMs(row && recordOf(row), nowMs(ctx));
  if (remaining > 0) throw new SenderError(chatMuteRefusal(remaining));
}

const hoursLabel = (ms: number) => ms % 3_600_000 === 0 ? `${ms / 3_600_000}h` : formatChatMuteRemaining(ms);

/**
 * One filtered message from the sender, already stored and logged. The third
 * inside the window starts a mute and logs it. Called after the insert, never
 * throws, so the message and its strike commit together.
 */
export function recordChatStrike(ctx: Ctx, channel: string, displayName: string) {
  const previous: Row | null = ctx.db.playerChatMute.identity.find(ctx.sender) ?? null;
  const { record, mutedMs, strikes } = addChatStrike(previous ? recordOf(previous) : EMPTY, nowMs(ctx));
  write(ctx, ctx.sender, record, Boolean(previous));
  if (!mutedMs) return;
  recordModerationAction(ctx as any, {
    targetIdentity: ctx.sender.toHexString(), targetName: displayName, channel,
    action: "Chat muted",
    reason: `${strikes} filtered messages in ${CHAT_MUTE_STRIKE_WINDOW_MS / 3_600_000}h · muted ${hoursLabel(mutedMs)}`,
    actorType: "automatic", rule: "auto-chat-mute",
    before: `${strikes} strikes (limit ${CHAT_MUTE_STRIKE_LIMIT}) · ${record.muteCount - 1} earlier mutes`,
    after: `Muted ${hoursLabel(mutedMs)} from this entry's time · mute #${record.muteCount}`,
  });
}

/**
 * The owner's and developer's tool: mute an account for `minutes`, or lift its mute with 0.
 * A set mute counts like an automatic one (it clears strikes and is the
 * "previous mute" the next automatic one escalates from); lifting only ends
 * the current mute. Both are logged.
 */
export function setChatMute(ctx: Ctx, identity: any, minutes: number) {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > CHAT_MUTE_OWNER_MAX_MINUTES)
    throw new SenderError(`Choose 0 to ${CHAT_MUTE_OWNER_MAX_MINUTES} minutes.`);
  const profile = ctx.db.playerProfile.identity.find(identity);
  if (!profile) throw new SenderError("Player not found.");
  const previous: Row | null = ctx.db.playerChatMute.identity.find(identity) ?? null;
  const before = previous ? recordOf(previous) : EMPTY;
  const now = nowMs(ctx);
  const lifting = minutes === 0;
  if (lifting && chatMuteRemainingMs(before, now) === 0) return;
  const record: ChatMuteRecord = lifting
    ? { ...before, mutedUntilMs: now }
    : { strikeAtMs: [], mutedUntilMs: now + minutes * 60_000, lastMuteAtMs: now, muteCount: before.muteCount + 1 };
  write(ctx, identity, record, Boolean(previous));
  const actor = isDeveloperIdentity(ctx.sender.toHexString()) ? "developer" : "owner";
  const describe = (value: ChatMuteRecord) => chatMuteRemainingMs(value, now) > 0
    ? `Muted for ${formatChatMuteRemaining(chatMuteRemainingMs(value, now))} · ${value.strikeAtMs.length} strikes · ${value.muteCount} mutes`
    : `Not muted · ${value.strikeAtMs.length} strikes · ${value.muteCount} mutes`;
  recordModerationAction(ctx as any, {
    targetIdentity: identity.toHexString(), targetName: profile.displayName, channel: "account",
    action: lifting ? "Chat mute lifted" : "Chat muted",
    reason: lifting ? `Lifted by ${actor}` : `Set by ${actor} · ${minutes} min`,
    actorType: actor, rule: "owner-chat-mute",
    before: describe(before), after: describe(record),
  });
}

/** Linking can neither lift a mute nor reset escalation; the guest row never survives. */
export function mergeChatMute(ctx: { db: any }, guest: any, account: any) {
  const guestRow: Row | null = ctx.db.playerChatMute.identity.find(guest) ?? null;
  if (!guestRow) return;
  const accountRow: Row | null = ctx.db.playerChatMute.identity.find(account) ?? null;
  const merged = accountRow ? mergeChatMuteRecords(recordOf(accountRow), recordOf(guestRow)) : recordOf(guestRow);
  ctx.db.playerChatMute.identity.delete(guest);
  write(ctx as Ctx, account, merged, Boolean(accountRow));
}

export function removeChatMute(ctx: { db: any }, identity: any) {
  if (ctx.db.playerChatMute.identity.find(identity)) ctx.db.playerChatMute.identity.delete(identity);
}
