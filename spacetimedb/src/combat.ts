const FIRST_ARMOR_TIER = 1_000;
const ARMOR_TIER_MAGNITUDE = 1_000;

export function armorDamageReduction(armor: number) {
  const normalized = Math.max(0, Number.isFinite(armor) ? armor : 0);
  if (normalized <= FIRST_ARMOR_TIER) return .09 * normalized / FIRST_ARMOR_TIER;

  const tier = Math.log(normalized / FIRST_ARMOR_TIER) / Math.log(ARMOR_TIER_MAGNITUDE);
  if (tier <= 1) return .09 + (.9 - .09) * tier;
  return Math.min(.999999, 1 - .1 * Math.pow(.1, tier - 1));
}

export function damageAfterArmor(damage: number, armor: number) {
  const incoming = Math.max(0, Number.isFinite(damage) ? damage : 0);
  return Math.max(1, Math.round(incoming * (1 - armorDamageReduction(armor))));
}
