/**
 * The developer triage queue: player reports and bug reports, and the
 * decision log that moves each one out of pending. Shared so the server's
 * validation and the panel's buttons cannot disagree about a decision's name.
 */

/** Decisions on a chat or player report. Every one except "reopened" closes it. */
export const REPORT_DECISIONS = ["removed", "dismissed", "muted_1h", "muted_24h", "banned", "reopened"] as const;
export type ReportDecision = typeof REPORT_DECISIONS[number];

/** Decisions on a bug report. "deleted" is written only by the spam delete. */
export const BUG_DECISIONS = ["resolved", "wont_fix", "duplicate", "reopened"] as const;
export type BugDecision = typeof BUG_DECISIONS[number];

export const REVIEW_NOTE_MAX_LENGTH = 300;

export type DevReviewDecision = {
  decision: string;
  note: string;
  reviewerName: string;
  reviewedAtMs: number;
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
  text: string;
  reportedAtMs: number;
  /** The reported message still exists and still shows its original text. */
  canRemoveMessage: boolean;
  messageRemoved: boolean;
  decisions: DevReviewDecision[];
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
