/**
 * Automatic chat mutes. Every message the chat filter moderates, in any
 * channel, is a strike against the account that sent it. Enough strikes inside
 * the window mute the account from sending chat; a further mute soon after the
 * last one lasts longer. The server applies these rules (spacetimedb/src/
 * chat-mute.ts); the client only reads the account's own row to show the
 * countdown.
 */
export const CHAT_MUTE_STRIKE_LIMIT = 3;
export const CHAT_MUTE_STRIKE_WINDOW_MS = 24 * 60 * 60_000;
export const CHAT_MUTE_FIRST_MS = 60 * 60_000;
export const CHAT_MUTE_REPEAT_MS = 24 * 60 * 60_000;
/** A mute that starts within this long of the previous one's start is a repeat. */
export const CHAT_MUTE_REPEAT_WINDOW_MS = 7 * 24 * 60 * 60_000;
/** The longest mute the owner tool will set, as a guard against a typo. */
export const CHAT_MUTE_OWNER_MAX_MINUTES = 30 * 24 * 60;

export type ChatMuteRecord = {
  /** Filtered messages still inside the strike window, oldest first. */
  strikeAtMs: number[];
  /** When the current mute ends; at or before now means not muted. */
  mutedUntilMs: number;
  /** When the latest mute started; 0 when the account has never been muted. */
  lastMuteAtMs: number;
  muteCount: number;
};

export const EMPTY_CHAT_MUTE: ChatMuteRecord = { strikeAtMs: [], mutedUntilMs: 0, lastMuteAtMs: 0, muteCount: 0 };

export function chatMuteRemainingMs(record: ChatMuteRecord | null, nowMs: number) {
  return record ? Math.max(0, record.mutedUntilMs - nowMs) : 0;
}

/** 42:10 under an hour, 23:59:59 beyond it; always rounded up to the second. */
export function formatChatMuteRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor(totalSeconds % 3_600 / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

export function chatMuteRefusal(remainingMs: number) {
  return `Chat muted for ${formatChatMuteRemaining(remainingMs)} — repeated filtered messages.`;
}

/** The mute a new one would be: a repeat inside the window is the long one. */
export function nextChatMuteMs(record: ChatMuteRecord, nowMs: number) {
  const repeat = record.lastMuteAtMs > 0 && nowMs - record.lastMuteAtMs < CHAT_MUTE_REPEAT_WINDOW_MS;
  return repeat ? CHAT_MUTE_REPEAT_MS : CHAT_MUTE_FIRST_MS;
}

/**
 * One filtered message. Strikes older than the window fall away; reaching the
 * limit starts a mute and clears the strikes, so the next mute needs a fresh
 * set. `mutedMs` is the new mute's length, or 0 when this strike did not mute.
 */
export function addChatStrike(record: ChatMuteRecord, nowMs: number): { record: ChatMuteRecord; mutedMs: number; strikes: number } {
  const strikeAtMs = [...record.strikeAtMs.filter(at => nowMs - at < CHAT_MUTE_STRIKE_WINDOW_MS), nowMs];
  if (strikeAtMs.length < CHAT_MUTE_STRIKE_LIMIT) return { record: { ...record, strikeAtMs }, mutedMs: 0, strikes: strikeAtMs.length };
  const mutedMs = nextChatMuteMs(record, nowMs);
  return {
    record: { strikeAtMs: [], mutedUntilMs: nowMs + mutedMs, lastMuteAtMs: nowMs, muteCount: record.muteCount + 1 },
    mutedMs,
    strikes: strikeAtMs.length,
  };
}

/**
 * A guest signing in to an account: the mute that ends later, the latest mute
 * start, the higher count and every strike either side still holds. Linking can
 * neither lift a mute nor reset the escalation.
 */
export function mergeChatMuteRecords(account: ChatMuteRecord, guest: ChatMuteRecord): ChatMuteRecord {
  const strikeAtMs = [...account.strikeAtMs, ...guest.strikeAtMs].sort((a, b) => a - b).slice(-(CHAT_MUTE_STRIKE_LIMIT - 1));
  return {
    strikeAtMs,
    mutedUntilMs: Math.max(account.mutedUntilMs, guest.mutedUntilMs),
    lastMuteAtMs: Math.max(account.lastMuteAtMs, guest.lastMuteAtMs),
    muteCount: Math.max(account.muteCount, guest.muteCount),
  };
}
