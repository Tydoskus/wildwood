export const NIGHT_ENEMY_FULL_VISIBILITY_RANGE = .92;
export const NIGHT_ENEMY_REVEAL_RANGE = 1.15;

/** Keeps Night Forest enemies hidden until they are nearly within attack range. */
export function nightEnemyOpacity(distance: number, attackRange: number, enemyRadius = 0) {
  const safeRange = Number.isFinite(attackRange) ? Math.max(1, attackRange) : 1;
  const safeRadius = Number.isFinite(enemyRadius) ? Math.max(0, enemyRadius) : 0;
  const fullDistance = safeRange * NIGHT_ENEMY_FULL_VISIBILITY_RANGE + safeRadius;
  const revealDistance = safeRange * NIGHT_ENEMY_REVEAL_RANGE + safeRadius;
  if (!Number.isFinite(distance) || distance >= revealDistance) return 0;
  if (distance <= fullDistance) return 1;
  return Math.max(0, Math.min(1, (revealDistance - distance) / (revealDistance - fullDistance)));
}
