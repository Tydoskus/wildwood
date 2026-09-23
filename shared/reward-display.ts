import type { RewardType } from "./enemy-definitions";
import { equipmentDamageMultiplierBonus, equipmentMaxHealthMultiplierBonus, equipmentRegenerationMultiplierBonus } from "./items";
import type { ResearchRanks } from "./research";

type RewardEquipment = {
  weapon: string; head: string; chest: string;
  weaponLevel: number; headLevel: number; chestLevel: number;
};

/** The increase in the displayed combat stat from one server-awarded base reward. */
export function effectiveRewardAmount(
  type: RewardType, baseAmount: number, statGainMultiplier: number,
  research: Partial<ResearchRanks>, equipment: RewardEquipment,
) {
  const { weapon, head, chest, weaponLevel, headLevel, chestLevel } = equipment;
  const rank = (value: number | undefined) => Number.isFinite(value) ? Math.max(0, Math.floor(value!)) : 0;
  const bonus = type === "damage"
    ? (1 + equipmentDamageMultiplierBonus(weapon, head, chest, weaponLevel, headLevel, chestLevel)) * (1 + rank(research.warcraft) * .02)
    : type === "health"
      // Vitality is already folded into saved base HP before the reward is paid.
      ? 1 + equipmentMaxHealthMultiplierBonus(head, chest, headLevel, chestLevel)
      : type === "armor" ? 1 + rank(research.precision) * .02
      : type === "regen"
        ? (1 + equipmentRegenerationMultiplierBonus(head, chest, headLevel, chestLevel)) * (1 + rank(research.regeneration) * .02)
        : 1;
  return baseAmount * statGainMultiplier * bonus;
}
