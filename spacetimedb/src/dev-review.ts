import { SenderError, table, t } from "spacetimedb/server";
import {
  REVIEW_NOTE_MAX_LENGTH, bugStatusAfter, compareReviewItems, isBugDecision, isReportDecision,
  type DevBugEntry, type DevPlayerSummary, type DevReportEntry, type DevReviewDecision, type DevReviewQueue,
} from "../../shared/dev-review";
import { isDeveloperIdentity } from "../../shared/developer-identity";
import { moderateReportedMessage } from "./chat-report-moderation";
import { PERMANENT_SUSPENSION_MICROS } from "./defeat-session";
import { recordModerationAction } from "./moderation-history";
import type { GameReducerContext } from "./index";

/**
 * Every triage decision, append-only. The report tables keep only a status
 * string, and bug reports none at all, so this is where "who closed it, when,
 * and why" lives. Private: only the developer-gated queue procedure reads it.
 * The reviewer is kept as text, like moderation_action, so erasing a player
 * never has to walk the developer's own decision log.
 */
const devReportReview = table({ name: "dev_report_review", public: false }, {
  id: t.u64().primaryKey().autoInc(),
  reportKey: t.string().index("btree"),
  decision: t.string(),
  note: t.string(),
  reviewerIdentity: t.string(),
  reviewerName: t.string(),
  reviewedAt: t.timestamp(),
});
export const devReviewTables = { devReportReview };

type ReadCtx = Pick<GameReducerContext, "db" | "timestamp">;

/** Closed items beyond this many are left out; the open queue is never cut. */
const REVIEWED_LIMIT = 150;
const PLAYER_SEARCH_LIMIT = 20;
const SOCIAL_NOTE = /^\[(Private message|Guild chat) #(\d+)\] ([\s\S]*)$/;

const toMs = (timestamp: { microsSinceUnixEpoch: bigint }) => Number(timestamp.microsSinceUnixEpoch / 1000n);

function decisionsFor(ctx: ReadCtx, key: string): DevReviewDecision[] {
  return [...ctx.db.devReportReview.reportKey.filter(key)]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map(row => ({ decision: row.decision, note: row.note, reviewerName: row.reviewerName, reviewedAtMs: toMs(row.reviewedAt) }));
}

function reportStatus(status: string) {
  return status === "pending" ? "open" : status === "dismissed" ? "dismissed" : "resolved";
}

/** The private-chat message a player_report row was written for, if it was. */
function socialReference(note: string) {
  const match = SOCIAL_NOTE.exec(note);
  return match ? { channel: match[1] === "Private message" ? "dm" as const : "guild" as const, messageId: BigInt(match[2]), text: match[3] } : null;
}

const sameHex = (a: any, b: any) => Boolean(a && b && a.toHexString() === b.toHexString());

/** The reported message, only while it is still the accused player's own. */
function reportedChatMessage(ctx: ReadCtx, row: any) {
  const message = ctx.db.chatMessage.id.find(row.messageId);
  return message && sameHex(message.sender, row.accused) ? message : null;
}

function reportedSocialMessage(ctx: ReadCtx, row: any) {
  const social = socialReference(row.note);
  const message = social ? ctx.db.socialMessage.id.find(social.messageId) : null;
  return message && sameHex(message.sender, row.target) ? message : null;
}

function chatEntry(ctx: ReadCtx, row: any): DevReportEntry {
  const message = reportedChatMessage(ctx, row);
  const key = `chat:${row.id}`;
  return {
    key, status: reportStatus(row.status), channel: "world",
    reporterIdentity: row.reporter.toHexString(), reporterName: row.reporterName,
    targetIdentity: row.accused.toHexString(), targetName: row.senderName,
    reason: row.reason, text: row.message, reportedAtMs: toMs(row.reportedAt),
    canRemoveMessage: Boolean(message && !message.moderated),
    messageRemoved: Boolean(message?.moderated),
    decisions: decisionsFor(ctx, key),
  };
}

function playerEntry(ctx: ReadCtx, row: any): DevReportEntry {
  const social = socialReference(row.note);
  const message = reportedSocialMessage(ctx, row);
  const key = `player:${row.id}`;
  return {
    key, status: reportStatus(row.status), channel: social?.channel ?? "profile",
    reporterIdentity: row.reporter.toHexString(), reporterName: row.reporterName,
    targetIdentity: row.target.toHexString(), targetName: row.targetName,
    reason: row.reason, text: social?.text ?? row.note, reportedAtMs: toMs(row.reportedAt),
    canRemoveMessage: Boolean(message && !message.moderated),
    messageRemoved: Boolean(message?.moderated),
    decisions: decisionsFor(ctx, key),
  };
}

function bugEntry(ctx: ReadCtx, row: any): DevBugEntry {
  const decisions = decisionsFor(ctx, `bug:${row.id}`);
  return {
    id: row.id.toString(), status: bugStatusAfter(decisions),
    reporterIdentity: row.reporter.toHexString(), reporterName: row.reporterName,
    protocolVersion: row.protocolVersion, message: row.message, reportedAtMs: toMs(row.reportedAt),
    decisions,
  };
}

/** Every open item plus the most recent reviewed ones, pending first. */
function boundedQueue<T extends { status: string; reportedAtMs: number }>(entries: T[]) {
  const sorted = entries.sort(compareReviewItems);
  const open = sorted.filter(entry => entry.status === "open");
  return [...open, ...sorted.filter(entry => entry.status !== "open").slice(0, REVIEWED_LIMIT)];
}

export function readDevReviewQueue(ctx: ReadCtx): DevReviewQueue {
  const reports = boundedQueue([
    ...[...ctx.db.chatMessageReport.iter()].map(row => chatEntry(ctx, row)),
    ...[...ctx.db.playerReport.iter()].map(row => playerEntry(ctx, row)),
  ]);
  const bugs = boundedQueue([...ctx.db.bugReport.iter()].map(row => bugEntry(ctx, row)));
  return {
    reports, bugs,
    openReports: reports.filter(entry => entry.status === "open").length,
    openBugs: bugs.filter(entry => entry.status === "open").length,
    serverNowMs: toMs(ctx.timestamp),
  };
}

function cleanNote(note: string) {
  const value = note.trim().replace(/\s+/g, " ");
  if (value.length > REVIEW_NOTE_MAX_LENGTH) throw new SenderError(`Keep the note under ${REVIEW_NOTE_MAX_LENGTH} characters.`);
  return value;
}

function recordDecision(ctx: GameReducerContext, reportKey: string, decision: string, note: string) {
  ctx.db.devReportReview.insert({
    id: 0n, reportKey, decision, note,
    reviewerIdentity: ctx.sender.toHexString(),
    reviewerName: ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? "Database owner",
    reviewedAt: ctx.timestamp,
  });
}

type ReportRow = { key: string; table: "chat" | "player"; row: any };

function findReport(ctx: GameReducerContext, key: string): ReportRow {
  const match = /^(chat|player):(\d+)$/.exec(key);
  const row = match && (match[1] === "chat"
    ? ctx.db.chatMessageReport.id.find(BigInt(match[2]))
    : ctx.db.playerReport.id.find(BigInt(match[2])));
  if (!match || !row) throw new SenderError("Report not found.");
  return { key, table: match[1] as "chat" | "player", row };
}

/** Pending reports about the same message close together: one decision, one message. */
function siblingReports(ctx: GameReducerContext, report: ReportRow): ReportRow[] {
  if (report.table === "chat") {
    return [...ctx.db.chatMessageReport.byStatus.filter("pending")]
      .filter(row => row.id !== report.row.id && row.messageId === report.row.messageId)
      .map(row => ({ key: `chat:${row.id}`, table: "chat", row }));
  }
  const social = socialReference(report.row.note);
  if (!social) return [];
  return [...ctx.db.playerReport.iter()]
    .filter(row => row.id !== report.row.id && row.status === "pending" && socialReference(row.note)?.messageId === social.messageId)
    .map(row => ({ key: `player:${row.id}`, table: "player", row }));
}

function removeReportedMessage(ctx: GameReducerContext, report: ReportRow) {
  if (report.table === "chat") {
    if (!reportedChatMessage(ctx, report.row)) throw new SenderError("That message has left chat history. Dismiss the report instead.");
    moderateReportedMessage(ctx, "public", report.row.messageId, report.row.reason, "chat_message_report", report.row.id.toString());
    return;
  }
  const social = socialReference(report.row.note);
  if (!social) throw new SenderError("A profile report has no message to remove.");
  if (!reportedSocialMessage(ctx, report.row)) throw new SenderError("That message no longer exists. Dismiss the report instead.");
  moderateReportedMessage(ctx, "social", social.messageId, report.row.reason, "social_report",
    `${report.row.reporter.toHexString()}:${social.messageId}`);
}

function setReportStatus(ctx: GameReducerContext, report: ReportRow, status: string) {
  if (report.row.status === status) return;
  if (report.table === "chat") ctx.db.chatMessageReport.id.update({ ...report.row, status });
  else ctx.db.playerReport.id.update({ ...report.row, status });
}

/** Called only after the reducer verifies the developer or the database owner. */
export function reviewReport(ctx: GameReducerContext, args: { reportKey: string; decision: string; note: string }) {
  if (!isReportDecision(args.decision)) throw new SenderError("Choose a valid report decision.");
  const note = cleanNote(args.note);
  const report = findReport(ctx, args.reportKey);
  if (args.decision === "reopened") {
    setReportStatus(ctx, report, "pending");
    recordDecision(ctx, report.key, "reopened", note);
    return;
  }
  if (args.decision === "removed") removeReportedMessage(ctx, report);
  const status = args.decision === "dismissed" ? "dismissed" : "resolved";
  for (const current of [report, ...siblingReports(ctx, report)]) {
    setReportStatus(ctx, current, status);
    recordDecision(ctx, current.key, args.decision, current === report ? note : `Same message as ${report.key}. ${note}`.trim());
  }
}

/** Called only after the reducer verifies the developer or the database owner. */
export function reviewBug(ctx: GameReducerContext, args: { id: bigint; decision: string; note: string }) {
  if (!isBugDecision(args.decision)) throw new SenderError("Choose a valid bug decision.");
  if (!ctx.db.bugReport.id.find(args.id)) throw new SenderError("Bug report not found.");
  recordDecision(ctx, `bug:${args.id}`, args.decision, cleanNote(args.note));
}

/** The spam delete still leaves a line saying who removed the report. */
export function recordBugDeletion(ctx: GameReducerContext, id: bigint) {
  recordDecision(ctx, `bug:${id}`, "deleted", "");
}

function playerSummary(ctx: ReadCtx, identity: any, displayName: string): DevPlayerSummary {
  const restriction = ctx.db.defeatSessionRestriction.identity.find(identity);
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const suspended = restriction && restriction.blockedUntilMicros > now ? restriction.blockedUntilMicros : 0n;
  const mute = ctx.db.playerChatMute.identity.find(identity);
  const muted = mute && mute.mutedUntilMicros > now ? mute.mutedUntilMicros : 0n;
  return {
    identity: identity.toHexString(), displayName,
    isGuest: ctx.db.playerAccountStatus.identity.find(identity)?.isGuest ?? false,
    online: Boolean(ctx.db.player.identity.find(identity)),
    suspendedUntilMs: Number(suspended / 1000n),
    permanentlySuspended: suspended >= PERMANENT_SUSPENSION_MICROS,
    chatMutedUntilMs: Number(muted / 1000n),
  };
}

/** Name search for the developer's player lookup. Exact names sort first. */
export function findDevPlayers(ctx: ReadCtx, query: string): DevPlayerSummary[] {
  const needle = query.trim().toLowerCase().replace(/^0x/, "");
  if (!needle || needle.length > 80) throw new SenderError("Enter a player name.");
  const matches = [...ctx.db.playerProfile.iter()]
    .filter(row => row.identity.toHexString() === needle || row.displayName.toLowerCase().includes(needle))
    .sort((a, b) => Number(b.displayName.toLowerCase() === needle) - Number(a.displayName.toLowerCase() === needle)
      || a.displayName.localeCompare(b.displayName))
    .slice(0, PLAYER_SEARCH_LIMIT);
  return matches.map(row => playerSummary(ctx, row.identity, row.displayName));
}

/** Called only after the reducer verifies the developer or the database owner. */
export function liftPlayerSuspension(ctx: GameReducerContext, identity: any, reason: string) {
  const profile = ctx.db.playerProfile.identity.find(identity);
  const prior = ctx.db.defeatSessionRestriction.identity.find(identity);
  const active = prior && (prior.requireSignIn || prior.blockedUntilMicros > ctx.timestamp.microsSinceUnixEpoch);
  if (!active) throw new SenderError("That player is not suspended.");
  const note = reason.trim() || "Lifted from developer tools";
  if (note.length > 500) throw new SenderError("Keep the reason under 500 characters.");
  ctx.db.defeatSessionRestriction.identity.delete(identity);
  const json = (value: unknown) => JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item);
  recordModerationAction(ctx, {
    targetIdentity: identity.toHexString(), targetName: profile?.displayName ?? "",
    channel: "account", action: "Suspension lifted", reason: note,
    actorType: isDeveloperIdentity(ctx.sender.toHexString()) ? "developer" : "owner", rule: "owner-account-suspension",
    before: json(prior), after: "",
  });
}
