// Armor against enemies is flat: it takes its own value off every hit, down to
// a floor of 1 (0.845). The percentage curve below stays for player-versus-player
// fights, where a typical build's armor outweighs its own damage and a flat
// rule would let no duel hit land, and for the authoring math that generated
// the base enemy stats, which must not move under the live balance.
const ARMOR_TIER_MAGNITUDE = 1_000;
const ARMOR_TIER_REMAINING_DAMAGE = .5;

/** Low armor: 10 = 12%, 100 = 25%, 1,000 = 50%, interpolated in log space.
 * From 1,000 upward, the original curve still halves remaining damage per 1,000x. */
export function percentArmorReduction(armor: number) {
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

/** Duels and guild fights: the percentage curve. */
export function duelDamageAfterArmor(damage: number, armor: number) {
  const incoming = Math.max(0, Number.isFinite(damage) ? damage : 0);
  return Math.max(1, Math.round(incoming * (1 - percentArmorReduction(armor))));
}

const finiteAtLeastZero = (value: number) => Math.max(0, Number.isFinite(value) ? value : 0);

/** An enemy's hit after the player's armor: the hit less the armor, never below 1. */
export function damageAfterArmor(damage: number, armor: number) {
  return Math.max(1, Math.round(finiteAtLeastZero(damage) - finiteAtLeastZero(armor)));
}

/** The share of a hit this size that armor stops: all but 1 of a hit no bigger than the armor. */
export function armorDamageReduction(armor: number, damage: number) {
  const incoming = finiteAtLeastZero(damage);
  if (!(incoming > 0)) return 0;
  return Math.max(0, Math.min(1, 1 - damageAfterArmor(incoming, armor) / incoming));
}

/** The hit that leaves `landed` after this armor: what authoring a target hit has to aim at. */
export function hitLandingAfterArmor(landed: number, armor: number) {
  return finiteAtLeastZero(landed) + finiteAtLeastZero(armor);
}
