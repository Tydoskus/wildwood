import { SenderError } from "spacetimedb/server";
import {
  WARNING_MAX_LENGTH, warningLetter,
  type DevBannedPlayer, type DevChatLine, type DevConsole, type DevMutedPlayer, type DevPlayerCard,
} from "../../shared/dev-console";
import { isDeveloperIdentity } from "../../shared/developer-identity";
import { PERMANENT_SUSPENSION_MICROS } from "./defeat-session";
import { sendPersonalMail } from "./dev-review-mail";
import { countOpenItems, playerSummary } from "./dev-review";
import { readPlayerModerationHistory, recordModerationAction } from "./moderation-history";
import type { GameReducerContext } from "./index";

/**
 * The developer console's reads: who is muted or banned now, the headline
 * counts, and the player card. Every export is called only after its
 * procedure or reducer has verified the developer's session or the database
 * owner; nothing here is reachable from a view.
 */

type ReadCtx = Pick<GameReducerContext, "db" | "timestamp">;

const toMs = (micros: bigint) => Number(micros / 1000n);
/** How far back the moderation log is read for "who muted/banned them and why". */
const LOG_SCAN = 5_000n;
const RECENT_CHAT_LIMIT = 50;

type LogRow = { targetIdentity: string; action: string; reason: string; actorType: string; actorName: string; rule: string };

/** The newest matching moderation entry per target, for the targets asked about. */
function latestLogEntries(ctx: ReadCtx, targets: Set<string>, matches: (row: LogRow) => boolean) {
  const found = new Map<string, LogRow>();
  const head = ctx.db.moderationHead.id.find(0)?.lastId ?? 0n;
  const floor = head > LOG_SCAN ? head - LOG_SCAN : 0n;
  for (let id = head; id > floor && found.size < targets.size; id--) {
    const row = ctx.db.moderationAction.id.find(id);
    const target = row?.targetIdentity.replace(/^0x/i, "").toLowerCase();
    if (!row || !target || !targets.has(target) || found.has(target) || !matches(row)) continue;
    found.set(target, row);
  }
  return found;
}

const displayName = (ctx: ReadCtx, identity: any) => ctx.db.playerProfile.identity.find(identity)?.displayName ?? "";
const isMuteEntry = (row: LogRow) => row.action === "Chat muted";
const isBanEntry = (row: LogRow) => /suspended|session_revoked|connection_blocked/.test(row.action);

export function readDevConsole(ctx: ReadCtx): DevConsole {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const mutes = [...ctx.db.playerChatMute.iter()].filter(row => row.mutedUntilMicros > now);
  const bans = [...ctx.db.defeatSessionRestriction.iter()].filter(row => row.blockedUntilMicros > now);
  const muteLog = latestLogEntries(ctx, new Set(mutes.map(row => row.identity.toHexString())), isMuteEntry);
  const banLog = latestLogEntries(ctx, new Set(bans.map(row => row.identity.toHexString())), isBanEntry);
  const muted: DevMutedPlayer[] = mutes.map(row => {
    const log = muteLog.get(row.identity.toHexString());
    return {
      identity: row.identity.toHexString(), displayName: displayName(ctx, row.identity),
      mutedUntilMs: toMs(row.mutedUntilMicros), startedAtMs: toMs(row.lastMuteAtMicros), muteCount: row.muteCount,
      source: log?.actorType ?? "", reason: log?.reason ?? "",
    };
  }).sort((a, b) => a.mutedUntilMs - b.mutedUntilMs);
  const banned: DevBannedPlayer[] = bans.map(row => {
    const log = banLog.get(row.identity.toHexString());
    return {
      identity: row.identity.toHexString(), displayName: displayName(ctx, row.identity),
      bannedUntilMs: toMs(row.blockedUntilMicros), permanent: row.blockedUntilMicros >= PERMANENT_SUSPENSION_MICROS,
      startedAtMs: toMs(row.revokedAtMicros), reason: log?.reason ?? "",
      by: !log ? "" : log.actorType === "automatic" ? "Automatic" : log.actorName,
    };
  }).sort((a, b) => Number(a.permanent) - Number(b.permanent) || a.bannedUntilMs - b.bannedUntilMs);
  return {
    overview: { ...countOpenItems(ctx), muted: muted.length, banned: banned.length },
    muted, banned, serverNowMs: toMs(now),
  };
}

function recentChat(ctx: ReadCtx, identity: any): DevChatLine[] {
  const world = [...ctx.db.chatMessage.bySender.filter(identity)].map(row => ({
    channel: "world" as const, where: "World chat", text: row.message, sentAtMs: toMs(row.sentAt.microsSinceUnixEpoch), moderated: row.moderated,
  }));
  const social = [...ctx.db.socialMessage.sender.filter(identity)].map(row => ({
    channel: row.channel === "dm" ? "dm" as const : "guild" as const,
    where: row.channel === "dm" ? `DM with ${row.recipientName || "a player"}` : `Guild: ${ctx.db.guild.id.find(row.guildId)?.name ?? "left guild"}`,
    text: row.message, sentAtMs: toMs(row.sentAt.microsSinceUnixEpoch), moderated: row.moderated,
  }));
  return [...world, ...social].sort((a, b) => b.sentAtMs - a.sentAtMs).slice(0, RECENT_CHAT_LIMIT);
}

export function readDevPlayerCard(ctx: ReadCtx, identity: any): DevPlayerCard {
  const profile = ctx.db.playerProfile.identity.find(identity);
  if (!profile) throw new SenderError("Player not found.");
  const hex = identity.toHexString();
  const history = readPlayerModerationHistory(ctx, hex).entries;
  // There is no name-history table; earlier names are the ones the log and reports kept.
  const names = [
    ...history.flatMap(entry => entry.action === "Name changed" ? [entry.before, entry.after] : [entry.targetName]),
    ...[...ctx.db.chatMessageReport.iter()].filter(row => row.accused.toHexString() === hex).map(row => row.senderName),
    ...[...ctx.db.playerReport.iter()].filter(row => row.target.toHexString() === hex).map(row => row.targetName),
  ];
  const pastNames = [...new Set(names.filter(name => name && name !== profile.displayName))];
  const sameAs = (value: any) => value.toHexString() === hex;
  const reportsFiled = [...ctx.db.chatMessageReport.iter()].filter(row => sameAs(row.reporter)).length
    + [...ctx.db.playerReport.iter()].filter(row => sameAs(row.reporter)).length;
  const reportsAgainst = [...ctx.db.chatMessageReport.iter()].filter(row => sameAs(row.accused)).length
    + [...ctx.db.playerReport.iter()].filter(row => sameAs(row.target)).length;
  const mute = ctx.db.playerChatMute.identity.find(identity);
  const joined = ctx.db.playerJoinDate.identity.find(identity) ?? ctx.db.playerLifetime.identity.find(identity);
  return {
    summary: playerSummary(ctx, identity, profile.displayName),
    pastNames,
    prestigeLevel: ctx.db.playerPrestige.identity.find(identity)?.level ?? 0,
    power: ctx.db.leaderboardEntry.identity.find(identity)?.power ?? 0,
    joinedAtMs: joined ? toMs(joined.joinedAt.microsSinceUnixEpoch) : 0,
    strikes: mute?.strikeAtMicros.length ?? 0,
    muteCount: mute?.muteCount ?? 0,
    reportsFiled, reportsAgainst, history,
    recentChat: recentChat(ctx, identity),
    serverNowMs: toMs(ctx.timestamp.microsSinceUnixEpoch),
  };
}

/**
 * A warning letter from the developer, logged. It is not a chat strike: strikes
 * are the chat filter's automatic count and three of them mute on their own, so
 * a warning that counted would quietly turn into a mute nobody chose.
 */
export function warnPlayer(ctx: GameReducerContext, identity: any, message: string) {
  const profile = ctx.db.playerProfile.identity.find(identity);
  if (!profile) throw new SenderError("Player not found.");
  const text = message.replace(/[\u0000-\u001f\u007f]/g, " ").trim().replace(/\s+/g, " ");
  if (!text) throw new SenderError("Write the warning first.");
  if (text.length > WARNING_MAX_LENGTH) throw new SenderError(`Keep the warning under ${WARNING_MAX_LENGTH} characters.`);
  const key = `dev-warning-${identity.toHexString().slice(0, 16)}-${ctx.timestamp.microsSinceUnixEpoch}`;
  sendPersonalMail(ctx, { key, identity, ...warningLetter(text) });
  recordModerationAction(ctx, {
    targetIdentity: identity.toHexString(), targetName: profile.displayName, channel: "account",
    action: "Warning sent", reason: text, actorType: isDeveloperIdentity(ctx.sender.toHexString()) ? "developer" : "owner",
    rule: "developer-warning", before: "", after: key,
  });
}
