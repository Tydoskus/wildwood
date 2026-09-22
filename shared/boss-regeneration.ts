/** All personal bosses recover 0.1% of maximum HP per active simulation second. */
export const BOSS_REGEN_FRACTION_PER_SECOND = .001;
/**
 * The tutorial dragon regenerates a fifth as fast as every other boss. It is
 * the first boss anyone meets and the only one fought without a stat line
 * behind it. Held here rather than in the balance panel so a fresh
 * configuration reads 1.
 */
export const BOSS_REGEN_FRACTION_OVERRIDES: Readonly<Record<string, number>> = { tutorial_forest: .0002 };
export function bossRegenFractionFor(mapId: string) {
  return BOSS_REGEN_FRACTION_OVERRIDES[mapId] ?? BOSS_REGEN_FRACTION_PER_SECOND;
}

/** Discrete hits, with healing between attacks. Infinity means DPS cannot overcome regen. */
export function bossHitsToDefeat(maxHp: number, hitDamage: number, attackInterval: number, regenFraction = BOSS_REGEN_FRACTION_PER_SECOND) {
  if (hitDamage >= maxHp) return 1;
  const netDamage = hitDamage - maxHp * regenFraction * attackInterval;
  return netDamage > 0 ? 1 + Math.ceil((maxHp - hitDamage) / netDamage) : Infinity;
}
