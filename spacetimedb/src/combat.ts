const ARMOR_TIER_MAGNITUDE = 1_000;
const ARMOR_TIER_REMAINING_DAMAGE = .5;

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

/** Damage credited to the defender whose armor reduced the incoming hit. */
export function damageBlockedByArmor(damage: number, defenderArmor: number) {
  const incoming = Math.max(0, Number.isFinite(damage) ? damage : 0);
  return Math.max(0, incoming - damageAfterArmor(incoming, defenderArmor));
}
