import type { RewardType } from "./enemy-definitions";
import { preparePlayerPowerStats } from "./player-power";
import type { ResearchRanks } from "./research";

type RewardEquipment = {
  weapon: string; head: string; chest: string;
  weaponLevel: number; headLevel: number; chestLevel: number;
};

const ZERO_STATS = { damage: 0, maxHp: 0, attackRate: 1, armor: 0, regen: 0 };
const SCALED_STAT = { damage: "damage", health: "maxHp", armor: "armor", regen: "regen" } as const;

/**
 * The increase in the displayed combat stat from one server-awarded base
 * reward: the base times the stat gain the server pays it at (Tech × Prestige
 * × Guild, as researchRewardMultiplier gives it), times the gear and research
 * factors the profile shows that stat with. Those factors come from
 * preparePlayerPowerStats, the profile's own calculation, so the popup, the
 * labels and the stat they raise cannot drift apart. (Vitality used to be
 * left out here when it was baked into saved health; since 0.883 it
 * multiplies health live, so health popups read short by every rank.)
 */
export function effectiveRewardAmount(
  type: RewardType, baseAmount: number, statGainMultiplier: number,
  research: Partial<ResearchRanks>, equipment: RewardEquipment,
) {
  const amount = baseAmount * statGainMultiplier;
  const field = SCALED_STAT[type as keyof typeof SCALED_STAT];
  // Attack speed has no gear or research factor.
  if (!field) return amount;
  const { weapon, head, chest, weaponLevel, headLevel, chestLevel } = equipment;
  const levelOf = (itemId: string) => itemId === weapon ? weaponLevel : itemId === head ? headLevel : itemId === chest ? chestLevel : 0;
  const scale = preparePlayerPowerStats({ ...ZERO_STATS, equippedRightHand: weapon, equippedHead: head, equippedChest: chest }, research, levelOf);
  return scale({ ...ZERO_STATS, [field]: amount })[field];
}
