/** Regular and elite enemy hits deal 10% of their maximum health before armor. */
export function enemyDamageFromHealth(maxHp: number): number {
  return Math.max(0, maxHp) * .1;
}
