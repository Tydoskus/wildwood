import { clamp } from "../math";
import type { PlayerState } from "./types";

export type ResearchRanks = {
  warcraft: number;
  moveSpeed: number;
  foraging: number;
  frontierMastery: number;
  vitality: number;
  precision: number;
  criticalChance: number;
};

type ResearchControllerOptions = {
  player: PlayerState;
  getRanks: () => ResearchRanks | null | undefined;
  isDueling: () => boolean;
  maxPlayerStat: number;
  saveProgress: () => void;
};

const EMPTY_RANKS: ResearchRanks = {
  warcraft: 0,
  moveSpeed: 0,
  foraging: 0,
  frontierMastery: 0,
  vitality: 0,
  precision: 0,
  criticalChance: 0,
};

export function createResearchController(options: ResearchControllerOptions) {
  let appliedVitalityRank = 0;

  const ranks = (): ResearchRanks => options.getRanks() ?? EMPTY_RANKS;

  return {
    ranks,
    damageMultiplier: () => 1 + ranks().warcraft * .02,
    movementSpeedMultiplier: () => 1 + ranks().moveSpeed * .02,
    rewardMultiplier: () => 1 + ranks().foraging * .01,
    effectiveArmor: () => options.player.armor * (1 + ranks().precision * .02),
    criticalChance: () => ranks().criticalChance * .01,
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
