export const PRESENCE_CHAT_COOLDOWN_MICROS = 15n * 60n * 1_000_000n;

export type PresenceChatEvent = "login" | "leave";
export type PresenceChatCooldownState = {
  lastLoginAtMicros: bigint;
  lastLeaveAtMicros: bigint;
};

export function presenceChatMessage(displayName: string, event: PresenceChatEvent) {
  return event === "login"
    ? `${displayName} has logged in.`
    : `${displayName} has left.`;
}

export function presenceChatCooldownElapsed(nowMicros: bigint, lastEventAtMicros: bigint) {
  return lastEventAtMicros === 0n || nowMicros - lastEventAtMicros >= PRESENCE_CHAT_COOLDOWN_MICROS;
}

export function advancePresenceChatCooldown(
  current: PresenceChatCooldownState | null | undefined,
  event: PresenceChatEvent,
  nowMicros: bigint,
): PresenceChatCooldownState | null {
  const state = current ?? { lastLoginAtMicros: 0n, lastLeaveAtMicros: 0n };
  const lastEventAtMicros = event === "login" ? state.lastLoginAtMicros : state.lastLeaveAtMicros;
  if (!presenceChatCooldownElapsed(nowMicros, lastEventAtMicros)) return null;
  return event === "login"
    ? { ...state, lastLoginAtMicros: nowMicros }
    : { ...state, lastLeaveAtMicros: nowMicros };
}

// Presence messages deliberately leave senderName blank so clients can render
// them as plain system text without player portraits, names, power, or gender.
export function isPresenceChatMessage(senderName: string) {
  return senderName.length === 0;
}
