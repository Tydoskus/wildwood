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
/** An engaged ranged enemy backs away when its target is this far inside its preferred distance. */
export const RANGED_ENEMY_RETREAT_DEAD_BAND = 20;

/**
 * The distance band an engaged ranged enemy holds still in. Closer than
 * `retreatBelow` it backs away; farther than `approachAbove` it walks in.
 */
export function rangedEnemyHoldBand(playerAttackRange: number, minimumDistance = 0) {
  const preferred = rangedEnemyPreferredDistance(playerAttackRange, minimumDistance);
  return {
    retreatBelow: preferred - RANGED_ENEMY_RETREAT_DEAD_BAND,
    approachAbove: preferred + RANGED_ENEMY_APPROACH_DEAD_BAND,
  };
}
