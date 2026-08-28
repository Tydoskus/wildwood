/**
 * Night Forest darkness is owned entirely by the screen vignette. Actors stay
 * at full opacity so enemies never pop into existence at attack range.
 */
export function nightEnemyOpacity(_distance: number, _attackRange: number, _enemyRadius = 0) {
  return 1;
}

/** Night Forest's vignette already grounds the scene without extra black ovals. */
export function nightGroundShadowsVisible(currentMapId: string, nightMapId: string) {
  return currentMapId !== nightMapId;
}
