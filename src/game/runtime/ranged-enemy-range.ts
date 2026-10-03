export const RANGED_ENEMY_ATTACK_RANGE_GAP = 15;
export const RANGED_ENEMY_PREFERRED_RANGE_INSET = 10;

function finiteRange(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** Keeps a ranged enemy's firing edge visibly inside its target player's edge. */
export function rangedEnemyAttackRange(playerAttackRange: number) {
  return Math.max(0, finiteRange(playerAttackRange) - RANGED_ENEMY_ATTACK_RANGE_GAP);
}

/** Gives the enemy a small movement cushion before its own firing edge. */
export function rangedEnemyPreferredDistance(playerAttackRange: number, minimumDistance = 0) {
  return Math.max(
    finiteRange(minimumDistance),
    rangedEnemyAttackRange(playerAttackRange) - RANGED_ENEMY_PREFERRED_RANGE_INSET,
  );
}

/** An engaged ranged enemy walks in beyond this far past its preferred distance. */
export const RANGED_ENEMY_APPROACH_DEAD_BAND = 5;

/**
 * How far an engaged ranged enemy lets its target get before walking in.
 * Inside it the enemy holds still and fires: it walks closer to get in range,
 * and never backs away from a player who closes in (it used to retreat inside
 * its preferred distance, which made melee and short-range builds chase it).
 */
export function rangedEnemyHoldBand(playerAttackRange: number, minimumDistance = 0) {
  return { approachAbove: rangedEnemyPreferredDistance(playerAttackRange, minimumDistance) + RANGED_ENEMY_APPROACH_DEAD_BAND };
}
