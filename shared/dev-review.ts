/**
 * The developer triage queue: player reports and bug reports, and the
 * decision log that moves each one out of pending. Shared so the server's
 * validation and the panel's buttons cannot disagree about a decision's name.
 */

/** Decisions on a chat or player report. Every one except "reopened" closes it. */
export const REPORT_DECISIONS = ["removed", "restored", "dismissed", "muted_1h", "muted_24h", "banned", "reopened"] as const;
export type ReportDecision = typeof REPORT_DECISIONS[number];

/** Decisions on a bug report. "deleted" is written only by the spam delete. */
export const BUG_DECISIONS = ["resolved", "wont_fix", "duplicate", "reopened"] as const;
export type BugDecision = typeof BUG_DECISIONS[number];

export const REVIEW_NOTE_MAX_LENGTH = 300;

const BUG_SUMMARY_LENGTH = 120;

/**
 * The letter a reporter gets for a decision, or null when that decision sends
 * none. Player-report letters never name the other player or the penalty; the
 * reporter learns only that action was or was not taken. A developer note, when
 * there is one, rides along in the same letter.
 */
export function reviewMailLetter(kind: "bug" | "report", decision: string, reported: string, note: string) {
  let lines: string[];
  if (kind === "bug") {
    const opening = decision === "resolved" ? "Thanks for your bug report — it's been fixed."
      : decision === "wont_fix" ? "Thanks for your bug report — we looked into it and won't be changing this."
      : decision === "duplicate" ? "Thanks — this bug was already reported and is being tracked."
      : null;
    if (!opening) return null;
    const text = reported.trim().replace(/\s+/g, " ");
    const summary = text.length > BUG_SUMMARY_LENGTH ? `${text.slice(0, BUG_SUMMARY_LENGTH - 1)}…` : text;
    lines = [opening, ...(summary ? [`You reported: “${summary}”`] : [])];
  } else {
    const opening = decision === "dismissed" ? "Thanks for your report — we reviewed it and didn't find a rule break."
      : ["removed", "muted_1h", "muted_24h", "banned"].includes(decision) ? "Thanks for your report — we reviewed it and took action."
      : null;
    if (!opening) return null;
    lines = [opening];
  }
  if (note) lines.push(`Note from the developer: ${note}`);
  return { title: kind === "bug" ? "About your bug report" : "About your report", body: lines.join("\n\n") };
}

export type DevReviewDecision = {
  decision: string;
  note: string;
  reviewerName: string;
  reviewedAtMs: number;
  /** A letter about this decision went to the reporter. */
  mailed: boolean;
};

export type DevReportStatus = "open" | "resolved" | "dismissed";
export type DevReportChannel = "world" | "dm" | "guild" | "profile";

export type DevReportEntry = {
  /** "chat:<id>" for world chat reports, "player:<id>" for profile and private-chat reports. */
  key: string;
  status: DevReportStatus;
  channel: DevReportChannel;
  reporterIdentity: string;
  reporterName: string;
  targetIdentity: string;
  targetName: string;
  reason: string;
  /** The reported message as sent, from the report's own evidence or the moderation log. */
  text: string;
  reportedAtMs: number;
  /** "World chat", "DM with Alice" or "Guild: Name"; empty for a profile report. */
  where: string;
  /** When the reported message was sent; 0 for a profile report. */
  sentAtMs: number;
  /** A few messages either side in the same conversation, oldest first. Developer-only. */
  context: DevReportContextLine[];
  /** The reported message still exists and still shows its original text. */
  canRemoveMessage: boolean;
  messageRemoved: boolean;
  canRestoreMessage?: boolean;
  decisions: DevReviewDecision[];
};

export type DevReportContextLine = {
  senderName: string;
  text: string;
  sentAtMs: number;
  /** This line is the reported message. */
  reported: boolean;
};

export type DevBugStatus = "open" | "resolved" | "wont_fix" | "duplicate";

export type DevBugEntry = {
  id: string;
  status: DevBugStatus;
  reporterIdentity: string;
  reporterName: string;
  protocolVersion: number;
  message: string;
  reportedAtMs: number;
  decisions: DevReviewDecision[];
};

export type DevReviewQueue = {
  reports: DevReportEntry[];
  bugs: DevBugEntry[];
  openReports: number;
  openBugs: number;
  serverNowMs: number;
};

export type DevPlayerSummary = {
  identity: string;
  displayName: string;
  isGuest: boolean;
  online: boolean;
  /** Zero when the account is not suspended. */
  suspendedUntilMs: number;
  permanentlySuspended: boolean;
  /** Zero when the account can chat. */
  chatMutedUntilMs: number;
};

export function isReportDecision(value: string): value is ReportDecision {
  return (REPORT_DECISIONS as readonly string[]).includes(value);
}

export function isBugDecision(value: string): value is BugDecision {
  return (BUG_DECISIONS as readonly string[]).includes(value);
}

/** The status a bug shows after its decisions, oldest first. */
export function bugStatusAfter(decisions: readonly { decision: string }[]): DevBugStatus {
  const last = decisions.at(-1)?.decision;
  return last === "resolved" || last === "wont_fix" || last === "duplicate" ? last : "open";
}

/**
 * The pending queue is first in, first out, so the oldest report cannot sit
 * behind a stream of new ones. Reviewed items follow, newest first.
 */
export function compareReviewItems(
  a: { status: string; reportedAtMs: number },
  b: { status: string; reportedAtMs: number },
) {
  const aOpen = a.status === "open", bOpen = b.status === "open";
  if (aOpen !== bOpen) return aOpen ? -1 : 1;
  return aOpen ? a.reportedAtMs - b.reportedAtMs : b.reportedAtMs - a.reportedAtMs;
}
