import { damageAfterArmor as flatDamageAfterArmor } from "../../shared/combat";
import { formatCompactNumber } from "../ui/number-format";
import { curveArmorReduction } from "../../shared/balance-curve";
import { addSpeedRating } from "../../shared/attack-speed-rating";

/**
 * The map curve's armor rule, on trial: while the map's balance carries
 * ARMOR_CURVE, the hits this client takes and the Block it shows use it.
 * Duels, guild fights, offline progress and the server keep the authored rule.
 */
let curveArmor = false;
export function useCurveArmor(on: boolean) { curveArmor = on; }

/** While the map's balance carries SPEED_RATING, speed rewards are Speed points, not attacks per second. */
let speedRating = false;
export function useSpeedRating(on: boolean) { speedRating = on; }
export function paysSpeedRating() { return speedRating; }
/** The attack interval after a speed reward, on whichever rule the map pays. */
export function attackIntervalAfterSpeedReward(attackInterval: number, amount: number, minAttackInterval: number) {
  return speedRating ? addSpeedRating(attackInterval, amount) : 1 / Math.min(1 / minAttackInterval, 1 / attackInterval + amount);
}
/** An enemy's hit after the player's armor: flat, the hit less the armor, never below 1 (shared/combat.ts). */
export function damageAfterArmor(damage: number, armor: number) {
  if (!curveArmor) return flatDamageAfterArmor(damage, armor);
  // The curve map trial priced hits in fractions on its own reduction.
  return Math.max(0, Number.isFinite(damage) ? damage : 0) * (1 - curveArmorReduction(armor));
}

/** The profile's Armor line: armor is flat, so it says how much it takes off each enemy hit. */
export function formatArmorReduction(armor: number) {
  const value = Math.max(0, Number.isFinite(armor) ? armor : 0);
  return `blocks ${value >= 1_000 ? formatCompactNumber(value) : Number(value.toFixed(1))} a hit`;
}
