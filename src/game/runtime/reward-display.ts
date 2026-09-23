import { equipmentRegeneration } from "../../../shared/items";
import type { RewardType } from "../../../shared/enemy-definitions";
import type { ResearchRanks } from "../../../shared/research";
import { effectiveRewardAmount } from "../../../shared/reward-display";

type EquippedStats = {
  equippedRightHand: string; equippedLeftHand: string;
  equippedHead: string; equippedChest: string;
};

export function createRewardDisplay(
  statGain: () => number, ranks: () => ResearchRanks, showBase: () => boolean,
  equipped: () => EquippedStats, upgradeLevel: (itemId: string) => number,
) {
  const totalAmount = (type: RewardType, amount: number) => {
    const items = equipped();
    const weapon = items.equippedRightHand || items.equippedLeftHand;
    const head = items.equippedHead, chest = items.equippedChest;
    return effectiveRewardAmount(type, amount, statGain(), ranks(), {
      weapon, head, chest,
      weaponLevel: upgradeLevel(weapon), headLevel: upgradeLevel(head), chestLevel: upgradeLevel(chest),
    });
  };
  return {
    totalAmount,
    displayedAmount: (type: RewardType, amount: number) => showBase() ? amount : totalAmount(type, amount),
    displayedMultiplier: () => showBase() ? 1 : statGain(),
  };
}

export function playerRegenerationPerSecond(
  base: number, equipped: Pick<EquippedStats, "equippedHead" | "equippedChest">,
  researchMultiplier: number, upgradeLevel: (itemId: string) => number,
) {
  const head = equipped.equippedHead, chest = equipped.equippedChest;
  return equipmentRegeneration(base, head, chest, researchMultiplier, upgradeLevel(head), upgradeLevel(chest));
}
