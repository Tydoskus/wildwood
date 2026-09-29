import { armorDamageReduction as authoredArmorReduction } from "../../shared/combat";
import { curveArmorReduction } from "../../shared/balance-curve";

/**
 * The map curve's armor rule, on trial: while the map's balance carries
 * ARMOR_CURVE, the hits this client takes and the Block it shows use it.
 * Duels, guild fights, offline progress and the server keep the authored rule.
 */
let curveArmor = false;
export function useCurveArmor(on: boolean) { curveArmor = on; }
export function armorDamageReduction(armor: number) {
  return curveArmor ? curveArmorReduction(armor) : authoredArmorReduction(armor);
}
export function damageAfterArmor(damage: number, armor: number) {
  const incoming = Math.max(0, Number.isFinite(damage) ? damage : 0);
  const landed = incoming * (1 - armorDamageReduction(armor));
  // The curve prices hits in fractions; the authored rule rounds to at least 1.
  return curveArmor ? landed : Math.max(1, Math.round(landed));
}

export function formatArmorReduction(armor: number) {
  const percentage = armorDamageReduction(armor) * 100;
  const decimals = percentage < 10 ? 1 : percentage < 99 ? 1 : 2;
  return `${percentage.toFixed(decimals).replace(/\.?0+$/, "")}%`;
}
