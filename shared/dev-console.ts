import type { DevPlayerSummary } from "./dev-review";
import type { ModerationHistoryEntry } from "./moderation-history";

/**
 * The rest of the developer moderation console: who is muted or banned right
 * now, the headline counts, and everything the player card shows. Every one
 * of these is served only by a developer-gated procedure.
 */

export type DevMutedPlayer = {
  identity: string;
  displayName: string;
  mutedUntilMs: number;
  startedAtMs: number;
  muteCount: number;
  /** Who set the latest mute, from the moderation log: "automatic", "developer", "owner", or "" when it has aged out. */
  source: string;
  reason: string;
};

export type DevBannedPlayer = {
  identity: string;
  displayName: string;
  bannedUntilMs: number;
  permanent: boolean;
  startedAtMs: number;
  reason: string;
  /** "Automatic", the developer's name, or "" when the log entry has aged out. */
  by: string;
};

export type DevConsoleOverview = { pendingReports: number; openBugs: number; muted: number; banned: number };

export type DevConsole = {
  overview: DevConsoleOverview;
  /** Soonest to expire first. */
  muted: DevMutedPlayer[];
  /** Soonest to expire first; permanent bans last. */
  banned: DevBannedPlayer[];
  serverNowMs: number;
};

export type DevChatLine = {
  channel: "world" | "dm" | "guild";
  /** "World chat", "DM with Alice", "Guild: Wolves". */
  where: string;
  text: string;
  sentAtMs: number;
  moderated: boolean;
};

export type DevPlayerCard = {
  summary: DevPlayerSummary;
  /** Earlier names seen in the moderation log and in reports, newest first. */
  pastNames: string[];
  prestigeLevel: number;
  power: number;
  joinedAtMs: number;
  /** Filtered messages inside the current strike window. */
  strikes: number;
  muteCount: number;
  reportsFiled: number;
  reportsAgainst: number;
  history: ModerationHistoryEntry[];
  /** World, guild and private messages they sent, newest first. */
  recentChat: DevChatLine[];
  serverNowMs: number;
};

export const WARNING_MAX_LENGTH = 300;
export const CUSTOM_MUTE_MAX_MINUTES = 30 * 24 * 60;
export const CUSTOM_BAN_MAX_HOURS = 7 * 24;

export function warningLetter(message: string) {
  return { title: "Warning from the developer", body: `Warning from the developer: ${message}` };
}

/** Moderation log filters. Each matches on the recorded action and rule text. */
export const MODERATION_LOG_CATEGORIES = [
  { id: "", label: "All actions" },
  { id: "mute", label: "Mutes" },
  { id: "ban", label: "Bans" },
  { id: "warn", label: "Warnings" },
  { id: "message", label: "Messages" },
  { id: "report", label: "Report decisions" },
  { id: "bug", label: "Bug decisions" },
  { id: "name", label: "Names" },
  { id: "automatic", label: "Automatic" },
] as const;

export function moderationCategoryMatches(category: string, entry: Pick<ModerationHistoryEntry, "action" | "actorType" | "channel">) {
  const action = entry.action.toLowerCase();
  switch (category) {
    case "": return true;
    case "mute": return action.includes("mute");
    case "ban": return action.includes("suspen") || action.includes("session_revoked") || action.includes("connection_blocked");
    case "warn": return action.includes("warning");
    case "message": return action.includes("message");
    case "report": return entry.channel === "report";
    case "bug": return entry.channel === "bug";
    case "name": return action.includes("name");
    case "automatic": return entry.actorType === "automatic";
    default: return false;
  }
}

export type ModerationLogQuery = { text: string; category: string; fromMs: number; toMs: number };

/** The quick search: player name or ID, moderator, reason or evidence text. */
export function moderationEntryMatches(entry: ModerationHistoryEntry, query: ModerationLogQuery) {
  if (!moderationCategoryMatches(query.category, entry)) return false;
  if (query.fromMs && entry.recordedAtMs < query.fromMs) return false;
  if (query.toMs && entry.recordedAtMs > query.toMs) return false;
  const text = query.text.trim().toLowerCase();
  if (!text) return true;
  return [entry.targetName, entry.targetIdentity, entry.actorName, entry.reason, entry.action, entry.before, entry.after]
    .some(value => value.toLowerCase().includes(text));
}
