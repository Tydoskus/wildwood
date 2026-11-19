import { isPresenceChatMessage } from "../../shared/presence-chat";
import { GUILD_CHAT_RETENTION_DAYS } from "../../shared/social";

export const PUBLIC_CHAT_DISPLAY_TTL_MS = 86_400_000;
export const GUILD_CHAT_DISPLAY_TTL_MS = GUILD_CHAT_RETENTION_DAYS * 86_400_000;

/** How long a message stays visible in chat: 1 day in public chat, 1 week in guild chat, unlimited in DMs. */
export function chatMessageDisplayTtlMs(channel: "public" | "guild" | "private") {
  if (channel === "private") return Number.POSITIVE_INFINITY;
  return channel === "guild" ? GUILD_CHAT_DISPLAY_TTL_MS : PUBLIC_CHAT_DISPLAY_TTL_MS;
}

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
