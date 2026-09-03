import { isChatReportReason } from "./chat-report";

export const PLAYER_REPORT_NOTE_LIMIT = 500;

export function playerReportValidationError(self: string, target: string, reason: string, note: string) {
  if (!target || target === self) return "You cannot report yourself.";
  if (!isChatReportReason(reason)) return "Choose a valid report reason.";
  if (note.trim().length > PLAYER_REPORT_NOTE_LIMIT) return "Keep the report note to 500 characters.";
  return null;
}

export function playerBlockKey(owner: string, target: string) {
  return `${owner}:${target}`;
}
