import type { Identity } from "spacetimedb";
import { SenderError } from "spacetimedb/server";
import type { ModuleReducerCtx, ModuleViewCtx } from "./index";
import { SOCIAL_FRIEND_LIMIT, SOCIAL_REQUEST_LIMIT, SOCIAL_MESSAGE_LIMIT, type SocialSnapshot } from "../../shared/social";
import { GUILD_MEMBER_LIMIT } from "../../shared/guilds";
import { moderatePublicChatMessage } from "./chat-moderation";
type Ctx = ModuleReducerCtx;
/** Shared by reducer/procedure/view contexts; this service's read functions never mutate. */
export type SocialReadCtx = Pick<ModuleViewCtx, "db" | "sender">;
const hex = (id: Identity) => id.toHexString();
const same = (a: Identity, b: Identity) => a.equals(b);
const friendKey = (a: Identity, b: Identity) => `${hex(a)}:${hex(b)}`;
const dmKey = (a: Identity, b: Identity) => `dm:${[hex(a), hex(b)].sort().join(":")}`;
function fail(message: string): never { throw new SenderError(message); }
function blocked(ctx: SocialReadCtx, a: Identity, b: Identity) {
  return Boolean(ctx.db.playerBlock.key.find(friendKey(a, b)) || ctx.db.playerBlock.key.find(friendKey(b, a)));
}
function target(ctx: SocialReadCtx, value: string) {
  const needle = value.normalize("NFKC").trim().toLowerCase();
  if (!needle || needle.length > 128) return fail("Enter a player username.");
  // Existing profiles have no name index; reject ambiguous display names rather than choosing an arbitrary account.
  const matches = [...ctx.db.playerProfile.iter()].filter(row => hex(row.identity).toLowerCase() === needle || row.displayName.normalize("NFKC").toLowerCase() === needle);
  if (matches.length !== 1) return fail(matches.length ? "That username is ambiguous. Choose the player from your friends list." : "Player not found.");
  if (same(matches[0].identity, ctx.sender)) fail("Choose another player.");
  return matches[0];
}
function name(ctx: SocialReadCtx, who: Identity) { return ctx.db.playerProfile.identity.find(who)?.displayName ?? "Deleted player"; }
function rowId(value: string) { if (!/^\d{1,20}$/.test(value)) fail("Invalid request."); return BigInt(value); }
function requests(ctx: SocialReadCtx, who: Identity) { return [...ctx.db.socialRequest.sender.filter(who), ...ctx.db.socialRequest.recipient.filter(who)]; }
function assertFriendSpace(ctx: SocialReadCtx, who: Identity) {
  if ([...ctx.db.socialFriend.owner.filter(who)].length >= SOCIAL_FRIEND_LIMIT) fail("Friend list is full.");
}
function assertContact(ctx: SocialReadCtx, who: Identity) { if (blocked(ctx, ctx.sender, who)) fail("This interaction is unavailable."); }
function addFriend(ctx: Ctx, a: Identity, b: Identity) {
  for (const [owner, peer] of [[a, b], [b, a]]) {
    const key = friendKey(owner, peer);
    if (!ctx.db.socialFriend.key.find(key)) ctx.db.socialFriend.insert({ key, owner, peer });
  }
}
export function visibleSocialMessages(ctx: SocialReadCtx) {
  const membership = ctx.db.guildMember.identity.find(ctx.sender);
  const rows = new Map<bigint, NonNullable<ReturnType<Ctx["db"]["socialMessage"]["id"]["find"]>>>();
  for (const row of [...ctx.db.socialMessage.sender.filter(ctx.sender), ...ctx.db.socialMessage.recipient.filter(ctx.sender)]) {
    if (row.channel === "dm" && !blocked(ctx, row.sender, row.recipient)) rows.set(row.id, row);
  }
  if (membership) for (const row of ctx.db.socialMessage.conversation.filter(`guild:${membership.guildId}`)) {
    if (!blocked(ctx, ctx.sender, row.sender)) rows.set(row.id, row);
  }
  return [...rows.values()].map(row => row.replyToMessageId && blocked(ctx, ctx.sender, row.replySender) ? { ...row, replyToMessageId: 0n, replyToSenderName: "", replyToMessage: "" } : row).sort((a, b) => a.id < b.id ? -1 : 1);
}
export function socialSnapshot(ctx: SocialReadCtx, signedIn = true): SocialSnapshot {
  const member = ctx.db.guildMember.identity.find(ctx.sender);
  const guild = member ? ctx.db.guild.id.find(member.guildId) : null;
  return {
    identity: hex(ctx.sender), signedIn,
    friends: [...ctx.db.socialFriend.owner.filter(ctx.sender)].filter(row => !blocked(ctx, ctx.sender, row.peer)).map(row => ({ identity: hex(row.peer), name: name(ctx, row.peer) })),
    incomingRequests: [...ctx.db.socialRequest.recipient.filter(ctx.sender)].filter(row => !blocked(ctx, row.sender, row.recipient)).map(row => ({ id: String(row.id), identity: hex(row.sender), name: name(ctx, row.sender) })),
    outgoingRequests: [...ctx.db.socialRequest.sender.filter(ctx.sender)].filter(row => !blocked(ctx, row.sender, row.recipient)).map(row => ({ id: String(row.id), identity: hex(row.recipient), name: name(ctx, row.recipient) })),
    guildInvitations: [...ctx.db.socialGuildInvite.recipient.filter(ctx.sender)].flatMap(row => {
      const invitedGuild = ctx.db.guild.id.find(row.guildId);
      return invitedGuild && same(invitedGuild.leader, row.sender) && !blocked(ctx, row.sender, row.recipient) ? [{ id: String(row.id), guildId: String(row.guildId), guildName: invitedGuild.name, inviterName: name(ctx, row.sender) }] : [];
    }),
    outgoingGuildInvitations: guild && same(guild.leader, ctx.sender) ? [...ctx.db.socialGuildInvite.guildId.filter(guild.id)].map(row => ({ id: String(row.id), identity: hex(row.recipient), name: name(ctx, row.recipient), guildId: String(row.guildId) })) : [],
    currentGuild: guild ? { id: String(guild.id), name: guild.name } : null,
  };
}
export function createSocialService(deps: { joinGuild(ctx: Ctx, guildId: bigint): void }) {
  return {
    friendAction(ctx: Ctx, action: string, value: string) {
      if (action === "accept" || action === "decline" || action === "cancel") {
        const row = ctx.db.socialRequest.id.find(rowId(value)) ?? fail("Request no longer exists.");
        if (!(action === "cancel" ? same(row.sender, ctx.sender) : same(row.recipient, ctx.sender))) fail("This request is not yours.");
        if (action === "accept") { assertContact(ctx, row.sender); assertFriendSpace(ctx, row.sender); assertFriendSpace(ctx, row.recipient); addFriend(ctx, row.sender, row.recipient); }
        ctx.db.socialRequest.id.delete(row.id); return;
      }
      if (action !== "request" && action !== "remove") fail("Unknown friend action.");
      const peer = target(ctx, value).identity;
      if (action === "remove") { ctx.db.socialFriend.key.delete(friendKey(ctx.sender, peer)); ctx.db.socialFriend.key.delete(friendKey(peer, ctx.sender)); return; }
      assertContact(ctx, peer); assertFriendSpace(ctx, ctx.sender); assertFriendSpace(ctx, peer);
      if (ctx.db.socialFriend.key.find(friendKey(ctx.sender, peer))) fail("You are already friends.");
      const own = requests(ctx, ctx.sender), theirs = requests(ctx, peer);
      if (own.some(row => same(row.sender, peer) || same(row.recipient, peer))) fail("A friend request is already pending.");
      if (own.length >= SOCIAL_REQUEST_LIMIT || theirs.length >= SOCIAL_REQUEST_LIMIT) fail("Too many pending friend requests.");
      ctx.db.socialRequest.insert({ id: 0n, sender: ctx.sender, recipient: peer });
    },
    guildInviteAction(ctx: Ctx, action: string, value: string, invitationId: bigint) {
      if (action === "invite") {
        const membership = ctx.db.guildMember.identity.find(ctx.sender) ?? fail("Join a guild first.");
        const guild = ctx.db.guild.id.find(membership.guildId) ?? fail("Guild no longer exists.");
        if (!same(guild.leader, ctx.sender)) fail("Only the guild leader can invite players.");
        if (guild.members >= GUILD_MEMBER_LIMIT) fail("This guild is full.");
        const peer = target(ctx, value).identity; assertContact(ctx, peer);
        if (ctx.db.guildMember.identity.find(peer)) fail("That player already belongs to a guild.");
        const pending = [...ctx.db.socialGuildInvite.guildId.filter(guild.id)];
        if (pending.some(row => same(row.recipient, peer))) fail("That player is already invited.");
        if (pending.length >= SOCIAL_REQUEST_LIMIT || [...ctx.db.socialGuildInvite.recipient.filter(peer)].length >= SOCIAL_REQUEST_LIMIT) fail("Too many pending guild invitations.");
        ctx.db.socialGuildInvite.insert({ id: 0n, guildId: guild.id, sender: ctx.sender, recipient: peer }); return;
      }
      if (!["accept", "decline", "revoke"].includes(action)) fail("Unknown invitation action.");
      const row = ctx.db.socialGuildInvite.id.find(invitationId) ?? fail("Invitation no longer exists.");
      const guild = ctx.db.guild.id.find(row.guildId);
      if (action === "revoke") { if (!guild || !same(guild.leader, ctx.sender)) fail("Only the guild leader can revoke invitations."); }
      else if (!same(row.recipient, ctx.sender)) fail("This invitation is not yours.");
      if (action === "accept") {
        if (!guild || !same(guild.leader, row.sender)) fail("This invitation is no longer valid.");
        assertContact(ctx, row.sender); deps.joinGuild(ctx, row.guildId);
        for (const invite of ctx.db.socialGuildInvite.recipient.filter(ctx.sender)) ctx.db.socialGuildInvite.id.delete(invite.id);
      } else ctx.db.socialGuildInvite.id.delete(row.id);
    },
    sendMessage(ctx: Ctx, channel: string, value: string, message: string, replyToMessageId: bigint) {
      const text = message.trim();
      if (!text || text.length > 250) fail("Messages must contain 1–250 characters.");
      const profile = ctx.db.playerProfile.identity.find(ctx.sender) ?? fail("Player unavailable.");
      let recipient = ctx.sender, guildId = 0n, conversation = "";
      if (channel === "guild") {
        const membership = ctx.db.guildMember.identity.find(ctx.sender) ?? fail("Join a guild first.");
        guildId = membership.guildId; conversation = `guild:${guildId}`;
      } else if (channel === "dm") {
        recipient = target(ctx, value).identity; assertContact(ctx, recipient);
        if (!ctx.db.socialFriend.key.find(friendKey(ctx.sender, recipient))) fail("Add this player as a friend before messaging.");
        conversation = dmKey(ctx.sender, recipient);
      } else fail("Unknown chat channel.");
      const reply = replyToMessageId ? ctx.db.socialMessage.id.find(replyToMessageId) : null;
      if (replyToMessageId && (!reply || reply.conversation !== conversation || blocked(ctx, ctx.sender, reply.sender))) fail("Reply message is unavailable in this conversation.");
      const cooldown = ctx.db.chatCooldown.identity.find(ctx.sender);
      if (cooldown && ctx.timestamp.microsSinceUnixEpoch - cooldown.lastSentAt.microsSinceUnixEpoch < 3_000_000n) fail("Wait 3 seconds before sending another message.");
      if (cooldown) ctx.db.chatCooldown.identity.update({ ...cooldown, lastSentAt: ctx.timestamp });
      else ctx.db.chatCooldown.insert({ identity: ctx.sender, lastSentAt: ctx.timestamp });
      const moderated = moderatePublicChatMessage(text);
      ctx.db.socialMessage.insert({ id: 0n, channel, conversation, guildId, sender: ctx.sender, recipient,
        recipientName: channel === "dm" ? name(ctx, recipient) : "", senderName: profile.displayName, senderGender: profile.gender,
        powerLevel: ctx.db.player.identity.find(ctx.sender)?.powerLevel ?? 0, senderIsGuest: ctx.db.playerAccountStatus.identity.find(ctx.sender)?.isGuest ?? true,
        message: moderated.message, moderated: moderated.moderated, sentAt: ctx.timestamp,
        replySender: reply?.sender ?? ctx.sender, replyToMessageId: reply?.id ?? 0n, replyToSenderName: reply?.senderName ?? "", replyToMessage: reply?.message ?? "" });
      pruneSocialMessages(ctx, conversation, channel === "dm" ? [ctx.sender, recipient] : []);
    },
  };
}
function pruneSocialMessages(ctx: Ctx, conversation: string, participants: Identity[]) {
  const history = [...ctx.db.socialMessage.conversation.filter(conversation)].sort((a, b) => a.id < b.id ? -1 : 1);
  for (const row of history.slice(0, Math.max(0, history.length - SOCIAL_MESSAGE_LIMIT))) ctx.db.socialMessage.id.delete(row.id);
  // Bound all DMs even across repeated unfriend/re-friend cycles and account links.
  for (const who of participants) {
    const rows = [...new Map([...ctx.db.socialMessage.sender.filter(who), ...ctx.db.socialMessage.recipient.filter(who)].filter(row => row.channel === "dm").map(row => [row.id, row])).values()].sort((a, b) => a.id < b.id ? -1 : 1);
    for (const row of rows.slice(0, Math.max(0, rows.length - 500))) ctx.db.socialMessage.id.delete(row.id);
  }
}
/** Account erasure removes private content and relationships through indexed references. */
export function removeSocialAccount(ctx: Ctx, who: Identity) {
  for (const row of [...ctx.db.socialFriend.owner.filter(who), ...ctx.db.socialFriend.peer.filter(who)]) ctx.db.socialFriend.key.delete(row.key);
  for (const row of requests(ctx, who)) ctx.db.socialRequest.id.delete(row.id);
  for (const row of [...ctx.db.socialGuildInvite.sender.filter(who), ...ctx.db.socialGuildInvite.recipient.filter(who)]) ctx.db.socialGuildInvite.id.delete(row.id);
  for (const row of [...ctx.db.socialMessage.sender.filter(who), ...ctx.db.socialMessage.recipient.filter(who)]) ctx.db.socialMessage.id.delete(row.id);
  for (const row of ctx.db.socialMessage.replySender.filter(who)) ctx.db.socialMessage.id.update({ ...row, replyToMessageId: 0n, replyToSenderName: "", replyToMessage: "", replySender: row.sender });
  for (const row of [...ctx.db.socialReport.reporter.filter(who), ...ctx.db.socialReport.accused.filter(who)]) ctx.db.socialReport.key.delete(row.key);
}
export function mergeSocialAccount(ctx: Ctx, guest: Identity, account: Identity) {
  for (const row of [...ctx.db.socialFriend.owner.filter(guest)]) {
    ctx.db.socialFriend.key.delete(row.key); ctx.db.socialFriend.key.delete(friendKey(row.peer, guest));
    if (!same(row.peer, account) && !blocked(ctx, account, row.peer) && [...ctx.db.socialFriend.owner.filter(account)].length < SOCIAL_FRIEND_LIMIT) addFriend(ctx, account, row.peer);
  }
  for (const row of requests(ctx, guest)) {
    ctx.db.socialRequest.id.delete(row.id);
    const sender = same(row.sender, guest) ? account : row.sender, recipient = same(row.recipient, guest) ? account : row.recipient;
    if (!same(sender, recipient) && !blocked(ctx, sender, recipient) && !ctx.db.socialFriend.key.find(friendKey(sender, recipient)) && requests(ctx, account).length < SOCIAL_REQUEST_LIMIT
      && !requests(ctx, sender).some(other => same(other.sender, recipient) || same(other.recipient, recipient))) ctx.db.socialRequest.insert({ ...row, sender, recipient });
  }
  for (const row of [...ctx.db.socialGuildInvite.sender.filter(guest), ...ctx.db.socialGuildInvite.recipient.filter(guest)]) {
    ctx.db.socialGuildInvite.id.delete(row.id);
    const sender = same(row.sender, guest) ? account : row.sender, recipient = same(row.recipient, guest) ? account : row.recipient;
    if (!same(sender, recipient) && !blocked(ctx, sender, recipient) && [...ctx.db.socialGuildInvite.recipient.filter(recipient)].length < SOCIAL_REQUEST_LIMIT
      && ![...ctx.db.socialGuildInvite.guildId.filter(row.guildId)].some(other => same(other.recipient, recipient))) ctx.db.socialGuildInvite.insert({ ...row, sender, recipient });
  }
  for (const row of [...new Map([...ctx.db.socialMessage.sender.filter(guest), ...ctx.db.socialMessage.recipient.filter(guest)].map(row => [row.id, row])).values()]) {
    const sender = same(row.sender, guest) ? account : row.sender, recipient = same(row.recipient, guest) ? account : row.recipient;
    if (row.channel === "dm" && same(sender, recipient)) ctx.db.socialMessage.id.delete(row.id);
    else ctx.db.socialMessage.id.update({ ...row, sender, recipient, senderName: name(ctx, sender), recipientName: row.channel === "dm" ? name(ctx, recipient) : "", conversation: row.channel === "dm" ? dmKey(sender, recipient) : row.conversation });
  }
  const conversations = new Set([...ctx.db.socialMessage.sender.filter(account), ...ctx.db.socialMessage.recipient.filter(account)].filter(row => row.channel === "dm").map(row => row.conversation));
  for (const conversation of conversations) pruneSocialMessages(ctx, conversation, [account]);
  for (const row of ctx.db.socialMessage.replySender.filter(guest)) ctx.db.socialMessage.id.update({ ...row, replySender: account });
  for (const row of ctx.db.playerReport.iter()) {
    if (same(row.reporter, guest) || same(row.target, guest)) ctx.db.playerReport.id.update({ ...row,
      reporter: same(row.reporter, guest) ? account : row.reporter,
      target: same(row.target, guest) ? account : row.target,
      reporterName: same(row.reporter, guest) ? name(ctx, account) : row.reporterName,
      targetName: same(row.target, guest) ? name(ctx, account) : row.targetName });
  }
  for (const row of [...ctx.db.socialReport.reporter.filter(guest), ...ctx.db.socialReport.accused.filter(guest)]) ctx.db.socialReport.key.update({ ...row, reporter: same(row.reporter, guest) ? account : row.reporter, accused: same(row.accused, guest) ? account : row.accused });
}
