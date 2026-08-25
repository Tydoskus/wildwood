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
