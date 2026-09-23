/**
 * Gems are earned from defeats the server has already accepted, so the count
 * inherits the defeat budget and boss DPS validation rather than trusting a
 * client. There is no dice roll: every accepted kill adds credit, and each
 * full block of credit is one gem. Two players with the same kills get the
 * same gems.
 *
 * Manual kills earn the same credit whether the player is visible or hidden.
 * Auto Farm earns two thirds as much credit per kill.
 */
export const GEM_KILL_CREDIT_PER_GEM = 6_000n;
export const GEM_KILL_CREDIT_MANUAL = 6n;
export const GEM_KILL_CREDIT_AUTO_FARM = 4n;
/** Credit for a pre-migration kill valued at the previous hidden rate. */
export const GEM_KILL_CREDIT_LEGACY_IDLE = 3n;

export function gemKillCredit(acceptedDefeats: number, autoFarm: boolean): bigint {
  if (!Number.isInteger(acceptedDefeats) || acceptedDefeats < 1) return 0n;
  return BigInt(acceptedDefeats) * (autoFarm ? GEM_KILL_CREDIT_AUTO_FARM : GEM_KILL_CREDIT_MANUAL);
}

/** Split accumulated credit into whole gems and the remainder carried forward. */
export function settleGemKillCredit(credit: bigint) {
  if (credit < 0n) return { gems: 0n, remainder: 0n };
  return { gems: credit / GEM_KILL_CREDIT_PER_GEM, remainder: credit % GEM_KILL_CREDIT_PER_GEM };
}
