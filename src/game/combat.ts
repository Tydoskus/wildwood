const ARMOR_TIER_MAGNITUDE = 1_000;
const ARMOR_TIER_REMAINING_DAMAGE = .5;

/**
 * WildStat armor curve anchors:
 * 1,000 = 50%, 1,000,000 = 75%, then every 1,000x tier halves
 * the remaining incoming damage without reaching complete immunity.
 */
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

export function formatArmorReduction(armor: number) {
  const percentage = armorDamageReduction(armor) * 100;
  const decimals = percentage < 10 ? 1 : percentage < 99 ? 1 : 2;
  return `${percentage.toFixed(decimals).replace(/\.?0+$/, "")}%`;
}
