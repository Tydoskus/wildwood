import { clamp } from "../math";
import type { PlayerState } from "./types";
import { createEmptyResearchRanks, researchStatRewardMultiplier, type ResearchRanks } from "../../../shared/research";
import { applyPlayerMaxHealthMultiplierBonus } from "./player-health";
import { movementSpeedMultiplier } from "../../../shared/rules";
import { prestigeStatMultiplier } from "../../../shared/prestige";
import { prestigePerkValue, type PrestigePerkRanks } from "../../../shared/prestige-perks";

export type { ResearchRanks } from "../../../shared/research";

type ResearchControllerOptions = {
  player: PlayerState;
  getRanks: () => ResearchRanks | null | undefined;
  isDueling: () => boolean;
  maxPlayerStat: number;
  saveProgress: () => void;
  healthMultiplierBonus?: () => number;
  /** Prestige levels banked. Stat rewards carry it exactly as the server does. */
  prestigeLevel?: () => number;
  /** Prestige perk ranks. Keen Edge grants criticals outside the tech tree. */
  prestigePerks?: () => Partial<PrestigePerkRanks> | null | undefined;
};

const EMPTY_RANKS = createEmptyResearchRanks();

export function createResearchController(options: ResearchControllerOptions) {
  let appliedVitalityRank = 0;

  const ranks = (): ResearchRanks => options.getRanks() ?? EMPTY_RANKS;

  return {
    ranks,
    damageMultiplier: () => 1 + ranks().warcraft * .02,
    movementSpeedMultiplier: () => movementSpeedMultiplier(ranks().moveSpeed),
    rewardMultiplier: () => researchStatRewardMultiplier(ranks()) * prestigeStatMultiplier(options.prestigeLevel?.() ?? 0),
    effectiveArmor: () => options.player.armor * (1 + ranks().precision * .02),
    regenerationMultiplier: () => 1 + ranks().regeneration * .02,
    criticalChance: () => ranks().criticalChance * .01 + prestigePerkValue(options.prestigePerks?.(), "keenEdge"),
    criticalDamageMultiplier: () => 1.05 + ranks().criticalDamage * .05,
    setAppliedVitalityRank: (rank: number) => { appliedVitalityRank = rank; },
    applyVitality() {
      if (options.isDueling()) return;
      const nextRank = ranks().vitality;
      if (nextRank === appliedVitalityRank) return;
      const previousMultiplier = 1 + appliedVitalityRank * .02;
      const nextMultiplier = 1 + nextRank * .02;
      options.player.baseMaxHp = clamp(options.player.baseMaxHp / previousMultiplier * nextMultiplier, 1, options.maxPlayerStat);
      applyPlayerMaxHealthMultiplierBonus(options.player, options.healthMultiplierBonus?.() ?? 0);
      appliedVitalityRank = nextRank;
      options.saveProgress();
    },
  };
}
