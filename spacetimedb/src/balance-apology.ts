export const BALANCE_APOLOGY_ACTIVITY_WINDOW_MICROS = 24n * 60n * 60n * 1_000_000n;
export const BALANCE_APOLOGY_TRANSACTION_PREFIX = "balance-apology:v0.541";

export type BalanceApologyActivity = {
  lastSeenAtMicros?: bigint;
  sessionStartedAtMicros?: bigint;
  currentlyActive: boolean;
};

/** Deployment-time eligibility for the one-time major-balance-change apology. */
export function isBalanceApologyEligible(nowMicros: bigint, activity: BalanceApologyActivity) {
  if (activity.currentlyActive) return true;
  const cutoffMicros = nowMicros - BALANCE_APOLOGY_ACTIVITY_WINDOW_MICROS;
  return (activity.lastSeenAtMicros !== undefined && activity.lastSeenAtMicros >= cutoffMicros) ||
    (activity.sessionStartedAtMicros !== undefined && activity.sessionStartedAtMicros >= cutoffMicros);
}

export function balanceApologyTransactionReference(identityHex: string) {
  return `${BALANCE_APOLOGY_TRANSACTION_PREFIX}:${identityHex}`;
}
