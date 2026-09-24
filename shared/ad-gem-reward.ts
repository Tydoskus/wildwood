/**
 * The rewarded ad pays Gems. The server decides every claim (claim_ad_gems);
 * the client reads the same rules only to show when the next ad is ready.
 *
 * Two limits, and both hold at once: a claim needs thirty minutes since the
 * last one, and a UTC day holds four. The day is the daily Gem bonus's day, so
 * both reset together at 00:00 UTC.
 */
export const AD_GEM_REWARD = 10;
export const AD_GEM_COOLDOWN_MS = 30 * 60_000;
export const AD_GEM_DAILY_LIMIT = 4;

const UTC_DAY_MS = 86_400_000;

/** What the server keeps for an account: its last claim and today's count. */
export type AdGemRewardRecord = { lastClaimAtMs: number; dayKey: string; claimsToday: number };

export type AdGemRewardStatus =
  /** A claim now is paid. `claimsToday` is the count before it. */
  | { kind: "ready"; dayKey: string; claimsToday: number; claimsLeft: number }
  /** Too soon after the last claim; `claimsLeft` still counts today's. */
  | { kind: "cooldown"; waitMs: number; claimsLeft: number }
  /** Today's four are used; `waitMs` runs to the UTC day boundary. */
  | { kind: "limit"; waitMs: number; claimsLeft: 0 };

/**
 * The daily Gem bonus's day key: whole UTC days since the epoch, as a string.
 * The server's `currentUtcDayKey` divides microseconds by the same day.
 */
export function utcDayKey(nowMs: number) {
  return String(Math.floor(nowMs / UTC_DAY_MS));
}

/**
 * Where an account stands at `nowMs`. The daily limit is checked first, so a
 * spent day reads as waiting for the reset rather than for a cooldown that
 * would only lead to another refusal. A cooldown still runs across midnight:
 * the new day brings new claims, not an early one.
 */
export function adGemRewardStatus(record: AdGemRewardRecord | null, nowMs: number): AdGemRewardStatus {
  const dayKey = utcDayKey(nowMs);
  const claimsToday = record && record.dayKey === dayKey ? Math.max(0, record.claimsToday) : 0;
  if (claimsToday >= AD_GEM_DAILY_LIMIT) {
    return { kind: "limit", waitMs: (Number(dayKey) + 1) * UTC_DAY_MS - nowMs, claimsLeft: 0 };
  }
  const claimsLeft = AD_GEM_DAILY_LIMIT - claimsToday;
  const readyAtMs = record ? record.lastClaimAtMs + AD_GEM_COOLDOWN_MS : 0;
  if (nowMs < readyAtMs) return { kind: "cooldown", waitMs: readyAtMs - nowMs, claimsLeft };
  return { kind: "ready", dayKey, claimsToday, claimsLeft };
}

/**
 * A wait as the HUD and the refusal show it: "12:34" under an hour, "5:12:00"
 * from an hour up. Partial seconds round up, so it never reads ready early.
 */
export function formatAdGemWait(waitMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(waitMs / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

/** The refusal a claim gets, or null when it would be paid. */
export function adGemRefusal(status: AdGemRewardStatus) {
  if (status.kind === "cooldown") return `Next ad in ${formatAdGemWait(status.waitMs)}`;
  if (status.kind === "limit") return `No more ads today · resets in ${formatAdGemWait(status.waitMs)}`;
  return null;
}

/**
 * Two accounts' records folded into one, for a guest signing in. The later
 * claim is kept, so linking cannot shorten a cooldown, and on the later day
 * the higher count is kept, so it cannot reset the day either.
 */
export function mergeAdGemRewardRecords(first: AdGemRewardRecord, second: AdGemRewardRecord): AdGemRewardRecord {
  const dayKey = Number(second.dayKey) > Number(first.dayKey) ? second.dayKey : first.dayKey;
  const claimsToday = Math.max(...[first, second].filter(record => record.dayKey === dayKey).map(record => record.claimsToday));
  return { lastClaimAtMs: Math.max(first.lastClaimAtMs, second.lastClaimAtMs), dayKey, claimsToday };
}
