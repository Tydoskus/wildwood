/**
 * Gems are earned from defeats the server has already accepted, so the count
 * inherits the defeat budget and boss DPS validation rather than trusting a
 * client. There is no dice roll: every accepted kill adds credit, and each
 * full block of credit is one gem. Two players with the same kills get the
 * same gems.
 *
 * Active play earns double. The server decides "active" from its own record
 * of the player's presence, never from a reported flag.
 */
export const GEM_KILL_CREDIT_PER_GEM = 2_000n;
/** One gem per thousand kills while present in the world. */
export const GEM_KILL_CREDIT_ACTIVE = 2n;
/** One gem per two thousand kills while hidden or idle. */
export const GEM_KILL_CREDIT_IDLE = 1n;

export function gemKillCredit(acceptedDefeats: number, active: boolean): bigint {
  if (!Number.isInteger(acceptedDefeats) || acceptedDefeats < 1) return 0n;
  return BigInt(acceptedDefeats) * (active ? GEM_KILL_CREDIT_ACTIVE : GEM_KILL_CREDIT_IDLE);
}

/** Split accumulated credit into whole gems and the remainder carried forward. */
export function settleGemKillCredit(credit: bigint) {
  if (credit < 0n) return { gems: 0n, remainder: 0n };
  return { gems: credit / GEM_KILL_CREDIT_PER_GEM, remainder: credit % GEM_KILL_CREDIT_PER_GEM };
}
