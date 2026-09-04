import { armorDamageReduction } from "../../shared/combat";
export { armorDamageReduction, damageAfterArmor } from "../../shared/combat";

export function formatArmorReduction(armor: number) {
  const percentage = armorDamageReduction(armor) * 100;
  const decimals = percentage < 10 ? 1 : percentage < 99 ? 1 : 2;
  return `${percentage.toFixed(decimals).replace(/\.?0+$/, "")}%`;
}
