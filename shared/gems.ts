/** Currency rules shared by the browser and authoritative server module. */
export const GEM_CURRENCY_ID = "gems";
export const GEM_DISPLAY_NAME = "Gems";

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
