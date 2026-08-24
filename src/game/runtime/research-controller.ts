import { clamp } from "../math";
import type { PlayerState } from "./types";
import { createEmptyResearchRanks, researchStatRewardMultiplier, type ResearchRanks } from "../../../shared/research";
import { applyPlayerMaxHealthMultiplier } from "./player-health";
import { movementSpeedMultiplier } from "../../../shared/rules";

export type { ResearchRanks } from "../../../shared/research";

type ResearchControllerOptions = {
  player: PlayerState;
  getRanks: () => ResearchRanks | null | undefined;
  isDueling: () => boolean;
  maxPlayerStat: number;
  saveProgress: () => void;
  healthMultiplier?: () => number;
};

const EMPTY_RANKS = createEmptyResearchRanks();

export function createResearchController(options: ResearchControllerOptions) {
  let appliedVitalityRank = 0;

  const ranks = (): ResearchRanks => options.getRanks() ?? EMPTY_RANKS;

  return {
    ranks,
    damageMultiplier: () => 1 + ranks().warcraft * .02,
    movementSpeedMultiplier: () => movementSpeedMultiplier(ranks().moveSpeed),
    rewardMultiplier: () => researchStatRewardMultiplier(ranks()),
    effectiveArmor: () => options.player.armor * (1 + ranks().precision * .02),
    regenerationMultiplier: () => 1 + ranks().regeneration * .02,
    criticalChance: () => ranks().criticalChance * .01,
    criticalDamageMultiplier: () => 1.05 + ranks().criticalDamage * .05,
    setAppliedVitalityRank: (rank: number) => { appliedVitalityRank = rank; },
    applyVitality() {
      if (options.isDueling()) return;
      const nextRank = ranks().vitality;
      if (nextRank === appliedVitalityRank) return;
      const previousMultiplier = 1 + appliedVitalityRank * .02;
      const nextMultiplier = 1 + nextRank * .02;
      options.player.baseMaxHp = clamp(options.player.baseMaxHp / previousMultiplier * nextMultiplier, 1, options.maxPlayerStat);
      applyPlayerMaxHealthMultiplier(options.player, options.healthMultiplier?.() ?? 1);
      appliedVitalityRank = nextRank;
      options.saveProgress();
    },
  };
}
