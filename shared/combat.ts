// The unchanged armor formula, shared by combat and map-tier damage authoring.
const ARMOR_TIER_MAGNITUDE = 1_000;
const ARMOR_TIER_REMAINING_DAMAGE = .5;

/** 1,000 armor = 50%, 1,000,000 = 75%; each 1,000x halves remaining damage. */
export function armorDamageReduction(armor: number) {
  const normalized = Math.max(0, Number.isFinite(armor) ? armor : 0);
  if (normalized <= 0) return 0;
  const tier = Math.log(normalized) / Math.log(ARMOR_TIER_MAGNITUDE);
  return Math.min(1 - Number.EPSILON, Math.max(0, 1 - Math.pow(ARMOR_TIER_REMAINING_DAMAGE, tier)));
}

export function damageAfterArmor(damage: number, armor: number) {
  const incoming = Math.max(0, Number.isFinite(damage) ? damage : 0);
  return Math.max(1, Math.round(incoming * (1 - armorDamageReduction(armor))));
}
