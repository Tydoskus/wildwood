import { SenderError, table, t } from "spacetimedb/server";
import {
  REVIEW_NOTE_MAX_LENGTH, bugStatusAfter, compareReviewItems, isBugDecision, isReportDecision, reviewMailLetter,
  type DevBugEntry, type DevPlayerSummary, type DevReportEntry, type DevReviewDecision, type DevReviewQueue,
} from "../../shared/dev-review";
import { MODERATED_CHAT_MESSAGE } from "../../shared/chat-message";
import { isDeveloperIdentity } from "../../shared/developer-identity";
import { moderateReportedMessage } from "./chat-report-moderation";
import { playerMail, sendPersonalMail } from "./dev-review-mail";
import { PERMANENT_SUSPENSION_MICROS } from "./defeat-session";
import { recordModerationAction } from "./moderation-history";
import type { GameReducerContext } from "./index";

/**
 * Every triage decision, append-only. The report tables keep only a status
 * string, and bug reports none at all, so this is where "who closed it, when,
 * and why" lives. Private: only the developer-gated queue procedure reads it.
 * The reviewer is kept as text, like moderation_action, so erasing a player
 * never has to walk the developer's own decision log. `mailed` says whether
 * this decision wrote the reporter a letter.
 */
const devReportReview = table({ name: "dev_report_review", public: false }, {
  id: t.u64().primaryKey().autoInc(),
  reportKey: t.string().index("btree"),
  decision: t.string(),
  note: t.string(),
  reviewerIdentity: t.string(),
  reviewerName: t.string(),
  reviewedAt: t.timestamp(),
  mailed: t.bool(),
});
export const devReviewTables = { devReportReview, playerMail };

type ReadCtx = Pick<GameReducerContext, "db" | "timestamp">;

/** Closed items beyond this many are left out; the open queue is never cut. */
const REVIEWED_LIMIT = 150;
const PLAYER_SEARCH_LIMIT = 20;
const SOCIAL_NOTE = /^\[(Private message|Guild chat) #(\d+)\] ([\s\S]*)$/;

const toMs = (timestamp: { microsSinceUnixEpoch: bigint }) => Number(timestamp.microsSinceUnixEpoch / 1000n);

function decisionsFor(ctx: ReadCtx, key: string): DevReviewDecision[] {
  return [...ctx.db.devReportReview.reportKey.filter(key)]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map(row => ({ decision: row.decision, note: row.note, reviewerName: row.reviewerName, reviewedAtMs: toMs(row.reviewedAt), mailed: row.mailed }));
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

/** What a report points at, kept beside the entry until the queue is cut to size. */
type MessageRef = { social: boolean; messageId: bigint; stored: string };

/** How far back the moderation log is read for an already-redacted original. */
const HISTORY_FALLBACK_SCAN = 5_000n;
const CONTEXT_BEFORE = 2;
const CONTEXT_AFTER = 1;

function chatEntry(ctx: ReadCtx, row: any, refs: Map<DevReportEntry, MessageRef>): DevReportEntry {
  const message = reportedChatMessage(ctx, row);
  const key = `chat:${row.id}`;
  const entry: DevReportEntry = {
    key, status: reportStatus(row.status), channel: "world",
    reporterIdentity: row.reporter.toHexString(), reporterName: row.reporterName,
    targetIdentity: row.accused.toHexString(), targetName: row.senderName,
    reason: row.reason, text: row.message, reportedAtMs: toMs(row.reportedAt),
    where: "World chat", sentAtMs: toMs(row.sentAt), context: [],
    canRemoveMessage: Boolean(message && !message.moderated),
    messageRemoved: Boolean(message?.moderated),
    decisions: decisionsFor(ctx, key),
  };
  refs.set(entry, { social: false, messageId: row.messageId, stored: row.messageModerated ? MODERATED_CHAT_MESSAGE : row.message });
  return entry;
}

function playerEntry(ctx: ReadCtx, row: any, refs: Map<DevReportEntry, MessageRef>): DevReportEntry {
  const social = socialReference(row.note);
  const message = reportedSocialMessage(ctx, row);
  const key = `player:${row.id}`;
  // The social_report row is the evidence copy written at report time.
  const evidence = social ? ctx.db.socialReport.key.find(`${row.reporter.toHexString()}:${social.messageId}`)?.message : undefined;
  const entry: DevReportEntry = {
    key, status: reportStatus(row.status), channel: social?.channel ?? "profile",
    reporterIdentity: row.reporter.toHexString(), reporterName: row.reporterName,
    targetIdentity: row.target.toHexString(), targetName: row.targetName,
    reason: row.reason, text: evidence ?? social?.text ?? row.note, reportedAtMs: toMs(row.reportedAt),
    where: "", sentAtMs: 0, context: [],
    canRemoveMessage: Boolean(message && !message.moderated),
    messageRemoved: Boolean(message?.moderated),
    decisions: decisionsFor(ctx, key),
  };
  if (social) refs.set(entry, { social: true, messageId: social.messageId, stored: entry.text });
  return entry;
}

/** Originals of redacted messages, from the moderation log's "before" text. */
function redactedOriginals(ctx: ReadCtx) {
  const originals = new Map<string, string>();
  const head = ctx.db.moderationHead.id.find(0)?.lastId ?? 0n;
  const floor = head > HISTORY_FALLBACK_SCAN ? head - HISTORY_FALLBACK_SCAN : 0n;
  for (let id = head; id > floor; id--) {
    const row = ctx.db.moderationAction.id.find(id);
    if (!row?.messageId || !row.before || row.before === MODERATED_CHAT_MESSAGE) continue;
    const key = `${row.channel === "world" ? "world" : "social"}:${row.messageId}`;
    if (!originals.has(key)) originals.set(key, row.before);
  }
  return originals;
}

function contextLine(row: any, reportedId: bigint) {
  return { senderName: row.senderName, text: row.message, sentAtMs: toMs(row.sentAt), reported: row.id === reportedId };
}

/**
 * Fills in the conversation around each report left after the cut: the
 * original text when the stored copy is redacted, where it was sent, and a few
 * neighbouring messages. Only the developer-gated queue procedure calls this.
 */
function addMessageContext(ctx: ReadCtx, entries: DevReportEntry[], refs: Map<DevReportEntry, MessageRef>) {
  let originals: Map<string, string> | null = null;
  const original = (ref: MessageRef) => (originals ??= redactedOriginals(ctx)).get(`${ref.social ? "social" : "world"}:${ref.messageId}`);
  for (const entry of entries) {
    const ref = refs.get(entry);
    if (!ref) continue;
    if (ref.stored === MODERATED_CHAT_MESSAGE) entry.text = original(ref) ?? entry.text;
    if (!ref.social) {
      const lines = [];
      for (let id = ref.messageId - BigInt(CONTEXT_BEFORE); id <= ref.messageId + BigInt(CONTEXT_AFTER); id++) {
        const row = id > 0n ? ctx.db.chatMessage.id.find(id) : null;
        if (row) lines.push(contextLine(row, ref.messageId));
      }
      entry.context = lines;
      continue;
    }
    const message = ctx.db.socialMessage.id.find(ref.messageId);
    if (!message) continue;
    entry.sentAtMs = toMs(message.sentAt);
    entry.where = message.channel === "dm"
      ? `DM with ${message.recipientName || "a player"}`
      : `Guild: ${ctx.db.guild.id.find(message.guildId)?.name ?? "left guild"}`;
    const thread = [...ctx.db.socialMessage.conversation.filter(message.conversation)].sort((x, y) => (x.id < y.id ? -1 : 1));
    const at = thread.findIndex(row => row.id === message.id);
    entry.context = thread.slice(Math.max(0, at - CONTEXT_BEFORE), at + CONTEXT_AFTER + 1).map(row => contextLine(row, message.id));
  }
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

/** The overview's two queue counts, without building the queue. */
export function countOpenItems(ctx: ReadCtx) {
  let pendingReports = [...ctx.db.chatMessageReport.byStatus.filter("pending")].length;
  for (const row of ctx.db.playerReport.iter()) if (row.status === "pending") pendingReports++;
  let openBugs = 0;
  for (const row of ctx.db.bugReport.iter()) if (bugStatusAfter(decisionsFor(ctx, `bug:${row.id}`)) === "open") openBugs++;
  return { pendingReports, openBugs };
}

export function readDevReviewQueue(ctx: ReadCtx): DevReviewQueue {
  const refs = new Map<DevReportEntry, MessageRef>();
  const reports = boundedQueue([
    ...[...ctx.db.chatMessageReport.iter()].map(row => chatEntry(ctx, row, refs)),
    ...[...ctx.db.playerReport.iter()].map(row => playerEntry(ctx, row, refs)),
  ]);
  addMessageContext(ctx, reports, refs);
  const bugs = boundedQueue([...ctx.db.bugReport.iter()].map(row => bugEntry(ctx, row)));
  return {
    reports, bugs,
    openReports: reports.filter(entry => entry.status === "open").length,
    openBugs: bugs.filter(entry => entry.status === "open").length,
    serverNowMs: toMs(ctx.timestamp),
  };
}

function cleanNote(note: string) {
  const value = note.replace(/[\u0000-\u001f\u007f]/g, " ").trim().replace(/\s+/g, " ");
  if (value.length > REVIEW_NOTE_MAX_LENGTH) throw new SenderError(`Keep the note under ${REVIEW_NOTE_MAX_LENGTH} characters.`);
  return value;
}

function recordDecision(ctx: GameReducerContext, reportKey: string, decision: string, note: string, mailed = false) {
  ctx.db.devReportReview.insert({
    id: 0n, reportKey, decision, note, mailed,
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

/**
 * Writes the reporter's letter for a decision, in the decision's transaction.
 * One letter per report, ever: the id is the report's, so an edited decision
 * or a double click finds it already sent. An erased or deleted reporter is
 * skipped silently. True only when a letter was written now.
 */
function mailReporter(ctx: GameReducerContext, reportKey: string, reporter: any, letter: { title: string; body: string } | null) {
  if (!letter || !ctx.db.playerProfile.identity.find(reporter)) return false;
  return sendPersonalMail(ctx, { key: `dev-reply-${reportKey.replace(":", "-")}`, identity: reporter, ...letter });
}

type ReviewArgs = { decision: string; note: string; mailReporter: boolean };

const actorType = (ctx: GameReducerContext) => isDeveloperIdentity(ctx.sender.toHexString()) ? "developer" as const : "owner" as const;

/** The audit line for a triage decision, so the moderation log holds every developer action. */
function auditDecision(ctx: GameReducerContext, entry: { channel: "report" | "bug"; key: string; target: any; targetName: string;
  decision: string; note: string; evidence: string; mailed: boolean; closed: number }) {
  const [reportTable, reportId] = entry.key.split(":");
  recordModerationAction(ctx, {
    targetIdentity: entry.target.toHexString(), targetName: entry.targetName, channel: entry.channel,
    action: `${entry.channel === "bug" ? "Bug" : "Report"} ${decisionWords(entry.decision)}`,
    reason: entry.note || "No note", actorType: actorType(ctx), rule: "developer-triage",
    reportTable, reportId, before: entry.evidence,
    after: [entry.mailed ? "Reporter mailed" : "No letter", entry.closed > 1 ? `${entry.closed} reports closed` : ""].filter(Boolean).join(" · "),
  });
}

function decisionWords(decision: string) {
  return ({ removed: "message removed", dismissed: "dismissed", muted_1h: "muted 1h", muted_24h: "muted 24h", banned: "banned",
    reopened: "reopened", resolved: "resolved", wont_fix: "won't fix", duplicate: "duplicate", deleted: "deleted" } as Record<string, string>)[decision] ?? decision;
}

/** Called only after the reducer verifies the developer or the database owner. */
export function reviewReport(ctx: GameReducerContext, args: ReviewArgs & { reportKey: string }) {
  if (!isReportDecision(args.decision)) throw new SenderError("Choose a valid report decision.");
  const note = cleanNote(args.note);
  const report = findReport(ctx, args.reportKey);
  const audit = (mailed: boolean, closed: number) => auditDecision(ctx, {
    channel: "report", key: report.key, target: report.table === "chat" ? report.row.accused : report.row.target,
    targetName: report.table === "chat" ? report.row.senderName : report.row.targetName,
    decision: args.decision, note, evidence: report.table === "chat" ? report.row.message : report.row.note, mailed, closed,
  });
  if (args.decision === "reopened") {
    setReportStatus(ctx, report, "pending");
    recordDecision(ctx, report.key, "reopened", note);
    audit(false, 0);
    return;
  }
  if (args.decision === "removed") removeReportedMessage(ctx, report);
  const status = args.decision === "dismissed" ? "dismissed" : "resolved";
  // The letter says only that action was or was not taken, never what or to whom.
  const letter = args.mailReporter ? reviewMailLetter("report", args.decision, "", note) : null;
  const closing = [report, ...siblingReports(ctx, report)];
  let anyMailed = false;
  for (const current of closing) {
    setReportStatus(ctx, current, status);
    const mailed = mailReporter(ctx, current.key, current.row.reporter, letter);
    anyMailed ||= mailed;
    recordDecision(ctx, current.key, args.decision, current === report ? note : `Same message as ${report.key}. ${note}`.trim(), mailed);
  }
  audit(anyMailed, closing.length);
}

/** Called only after the reducer verifies the developer or the database owner. */
export function reviewBug(ctx: GameReducerContext, args: ReviewArgs & { id: bigint }) {
  if (!isBugDecision(args.decision)) throw new SenderError("Choose a valid bug decision.");
  const bug = ctx.db.bugReport.id.find(args.id);
  if (!bug) throw new SenderError("Bug report not found.");
  const note = cleanNote(args.note);
  const key = `bug:${args.id}`;
  const mailed = args.mailReporter && mailReporter(ctx, key, bug.reporter, reviewMailLetter("bug", args.decision, bug.message, note));
  recordDecision(ctx, key, args.decision, note, mailed);
  auditDecision(ctx, { channel: "bug", key, target: bug.reporter, targetName: bug.reporterName, decision: args.decision,
    note, evidence: bug.message, mailed, closed: 1 });
}

/** The spam delete sends no letter but still leaves a line saying who removed the report. */
export function recordBugDeletion(ctx: GameReducerContext, id: bigint) {
  const bug = ctx.db.bugReport.id.find(id);
  recordDecision(ctx, `bug:${id}`, "deleted", "");
  if (bug) auditDecision(ctx, { channel: "bug", key: `bug:${id}`, target: bug.reporter, targetName: bug.reporterName,
    decision: "deleted", note: "", evidence: bug.message, mailed: false, closed: 1 });
}

export function playerSummary(ctx: ReadCtx, identity: any, displayName: string): DevPlayerSummary {
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
