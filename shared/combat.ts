// Shared by combat, profile Block display, and map-tier damage authoring.
const ARMOR_TIER_MAGNITUDE = 1_000;
const ARMOR_TIER_REMAINING_DAMAGE = .5;

/** Low armor: 10 = 12%, 100 = 25%, 1,000 = 50%, interpolated in log space.
 * From 1,000 upward, the original curve still halves remaining damage per 1,000x. */
export function armorDamageReduction(armor: number) {
  const normalized = Math.max(0, Number.isFinite(armor) ? armor : 0);
  if (normalized <= 1) return 0;
  if (normalized < ARMOR_TIER_MAGNITUDE) {
    const decade = Math.log10(normalized);
    if (decade <= 1) return .12 * decade;
    if (decade <= 2) return .12 + .13 * (decade - 1);
    return .25 + .25 * (decade - 2);
  }
  const tier = Math.log(normalized) / Math.log(ARMOR_TIER_MAGNITUDE);
  return Math.min(1 - Number.EPSILON, Math.max(0, 1 - Math.pow(ARMOR_TIER_REMAINING_DAMAGE, tier)));
}

export function damageAfterArmor(damage: number, armor: number) {
  const incoming = Math.max(0, Number.isFinite(damage) ? damage : 0);
  return Math.max(1, Math.round(incoming * (1 - armorDamageReduction(armor))));
}
