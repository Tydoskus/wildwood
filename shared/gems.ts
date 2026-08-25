/** Currency rules shared by the browser and authoritative server module. */
export const GEM_CURRENCY_ID = "gems";
export const GEM_DISPLAY_NAME = "Gems";
export const DAILY_LOGIN_GEM_BONUS = 7n;
export const RESEARCH_SPEED_UP_MS_PER_GEM = 10 * 60 * 1_000;
export const UPGRADE_BENCH_SECOND_SLOT_GEM_COST = 150n;

// Keep balances comfortably inside signed i64 transaction deltas while still
// leaving far more headroom than the game economy should ever need.
export const MAX_GEM_BALANCE = 9_000_000_000_000n;

export function gemBalanceAfter(currentBalance: bigint, delta: bigint) {
  if (currentBalance < 0n || currentBalance > MAX_GEM_BALANCE) {
    throw new RangeError("Gem balance is outside the supported range.");
  }
  const nextBalance = currentBalance + delta;
  if (nextBalance < 0n) throw new RangeError("Not enough Gems.");
  if (nextBalance > MAX_GEM_BALANCE) throw new RangeError("Gem balance limit reached.");
  return nextBalance;
}

/** Gems needed to finish a timer now; a partial final ten-minute block costs one Gem. */
export function researchSpeedUpGemCost(remainingMs: number) {
  if (!Number.isFinite(remainingMs)) throw new RangeError("Research time must be finite.");
  return BigInt(Math.max(1, Math.ceil(Math.max(0, remainingMs) / RESEARCH_SPEED_UP_MS_PER_GEM)));
}

/** Item upgrades use the same one-Gem-per-started-ten-minute timer rate. */
export function itemUpgradeSpeedUpGemCost(remainingMs: number) {
  if (!Number.isFinite(remainingMs)) throw new RangeError("Upgrade time must be finite.");
  return BigInt(Math.max(1, Math.ceil(Math.max(0, remainingMs) / RESEARCH_SPEED_UP_MS_PER_GEM)));
}
