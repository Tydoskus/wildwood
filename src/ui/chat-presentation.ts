import { isPresenceChatMessage } from "../../shared/presence-chat";

export function duelReplayIsInteractive(replayId: bigint, large: boolean) {
  return replayId > 0n && large;
}

export function shouldShowGlobalChatMessage(senderName: string) {
  return !isPresenceChatMessage(senderName);
}

export function formatChatTime(date: Date) {
  const hour = date.getHours() % 12 || 12;
  return `${hour}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** The time beside a name: "3:42 PM" today, "9/30 3:42 PM" before. */
export function formatChatStamp(date: Date, now = new Date()) {
  const time = `${formatChatTime(date)} ${date.getHours() < 12 ? "AM" : "PM"}`;
  return date.toDateString() === now.toDateString() ? time : `${date.getMonth() + 1}/${date.getDate()} ${time}`;
}

export function formatChatDateTime(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()} · ${formatChatTime(date)} ${date.getHours() < 12 ? "AM" : "PM"}`;
}

export function formatChatReplyPreview(senderName: string, message: string) {
  return `Reply ${senderName.trim() || "Player"}: ${message.replace(/\s+/g, " ").trim()}`;
}
