import { damageAfterArmor } from "../../shared/combat";
export { armorDamageReduction, damageAfterArmor } from "../../shared/combat";

/** Damage credited to the defender whose armor reduced the incoming hit. */
export function damageBlockedByArmor(damage: number, defenderArmor: number) {
  const incoming = Math.max(0, Number.isFinite(damage) ? damage : 0);
  return Math.max(0, incoming - damageAfterArmor(incoming, defenderArmor));
}
