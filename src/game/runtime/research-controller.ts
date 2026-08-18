import { clamp } from "../math";
import type { PlayerState } from "./types";
import { createEmptyResearchRanks, type ResearchRanks } from "../../../shared/research";

export type { ResearchRanks } from "../../../shared/research";

type ResearchControllerOptions = {
  player: PlayerState;
  getRanks: () => ResearchRanks | null | undefined;
  isDueling: () => boolean;
  maxPlayerStat: number;
  saveProgress: () => void;
};

const EMPTY_RANKS = createEmptyResearchRanks();

export function createResearchController(options: ResearchControllerOptions) {
  let appliedVitalityRank = 0;

  const ranks = (): ResearchRanks => options.getRanks() ?? EMPTY_RANKS;

  return {
    ranks,
    damageMultiplier: () => 1 + ranks().warcraft * .02,
    movementSpeedMultiplier: () => 1 + ranks().moveSpeed * .02,
    rewardMultiplier: () => 1 + ranks().foraging * .01 + ranks().prosperity * .02,
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
      const hpRatio = options.player.maxHp > 0 ? options.player.hp / options.player.maxHp : 1;
      options.player.maxHp = clamp(options.player.maxHp / previousMultiplier * nextMultiplier, 1, options.maxPlayerStat);
      options.player.hp = clamp(options.player.maxHp * hpRatio, 0, options.player.maxHp);
      appliedVitalityRank = nextRank;
      options.saveProgress();
    },
  };
}
