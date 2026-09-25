import type { DevReportChannel } from "../../shared/dev-review";

const CHANNEL_LABELS: Record<DevReportChannel, string> = {
  world: "World chat",
  dm: "Private message",
  guild: "Guild chat",
  profile: "Profile report",
};

const DECISION_LABELS: Record<string, string> = {
  removed: "Message removed",
  restored: "Message restored",
  dismissed: "Dismissed",
  muted_1h: "Muted 1h",
  muted_24h: "Muted 24h",
  banned: "Banned",
  reopened: "Reopened",
  resolved: "Resolved",
  wont_fix: "Won't fix",
  duplicate: "Duplicate",
  deleted: "Deleted",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  resolved: "Resolved",
  dismissed: "Dismissed",
  wont_fix: "Won't fix",
  duplicate: "Duplicate",
};

/** `hours` 0 is permanent. Timed bans stay inside the server's seven-day rail. */
export const BAN_CHOICES = [
  { label: "Ban 24h", hours: 24, words: "for 24 hours" },
  { label: "Ban 7d", hours: 168, words: "for 7 days" },
  { label: "Ban permanently", hours: 0, words: "permanently" },
] as const;

/** What the ban confirmation says happens next. */
export function banConsequence(hours: number) {
  return hours === 0
    ? "They are signed out now and can't play again unless you lift it."
    : "They are signed out now and can't play until it ends.";
}

export const MUTE_CHOICES = [
  { label: "Mute 1h", minutes: 60, decision: "muted_1h" },
  { label: "Mute 24h", minutes: 1_440, decision: "muted_24h" },
] as const;

export function channelLabel(channel: string) {
  return CHANNEL_LABELS[channel as DevReportChannel] ?? channel;
}

export function decisionLabel(decision: string) {
  return DECISION_LABELS[decision] ?? decision;
}

export function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}

/** "just now", "5m ago", "3h ago", "2d ago", then the date. */
export function relativeTime(atMs: number, nowMs: number) {
  const seconds = Math.max(0, Math.floor((nowMs - atMs) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(atMs).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

/** "for 3h 10m" style remaining time, for suspensions and mutes. */
export function remainingLabel(untilMs: number, nowMs: number) {
  const minutes = Math.max(1, Math.ceil((untilMs - nowMs) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/** Access failures close the panel; every other error is shown and retried. */
export function isAccessDenied(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /access required|owner required/i.test(message);
}
