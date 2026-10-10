import type { PlayerState } from "./types";
import { createEmptyResearchRanks, researchStatRewardMultiplier, utilityMovementSpeedBonus, type ResearchRanks } from "../../../shared/research";
import { applyPlayerMaxHealthMultiplierBonus } from "./player-health";
import { movementSpeedMultiplier } from "../../../shared/rules";
import { prestigeStatMultiplier } from "../../../shared/prestige";
import { prestigePerkValue, type PrestigePerkRanks } from "../../../shared/prestige-perks";
import { criticalDamageMultiplier, type CriticalDamageParts } from "../../../shared/critical-damage";

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
  /** This week's guild quest bonus on stat rewards (daily quests), as the server pays it. */
  guildQuestBonus?: () => number;
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
    movementSpeedMultiplier: () => (movementSpeedMultiplier(ranks().moveSpeed) + utilityMovementSpeedBonus(ranks().utilityMoveSpeed) / Math.max(1, options.player.speed))
      * (1 + prestigePerkValue(options.prestigePerks?.(), "fleetFoot")),
    rewardMultiplier: () => researchStatRewardMultiplier(ranks()) * prestigeStatMultiplier(options.prestigeLevel?.() ?? 0)
      * Math.max(1, options.guildQuestBonus?.() ?? 1),
    effectiveArmor: () => options.player.armor * (1 + ranks().precision * .02),
    regenerationMultiplier: () => 1 + ranks().regeneration * .02,
    criticalChance: () => ranks().criticalChance * .01 + prestigePerkValue(options.prestigePerks?.(), "keenEdge"),
    /** Everything critical damage adds up from but the soul's share, and the cap's rank. */
    criticalDamageParts: (): CriticalDamageParts => ({ researchRank: ranks().criticalDamage, perks: options.prestigePerks?.(), capRank: ranks().critCap }),
    /** The capped multiplier: the run's crit rating, the soul's when there is some, research and Keen Edge. */
    criticalDamageMultiplier: (soul = 0, rating = options.player.critRating ?? 0) => criticalDamageMultiplier({
      researchRank: ranks().criticalDamage, perks: options.prestigePerks?.(), soul, rating, capRank: ranks().critCap,
    }),
    setAppliedVitalityRank: (rank: number) => { appliedVitalityRank = rank; },
    /**
     * Vitality is part of the health bonus (main.ts healthMultiplierBonus), so a
     * new rank only re-applies it. It used to rewrite saved health, which the
     * server ignores: the boost vanished on the next sync, and a login where
     * research arrived after stats applied every rank a second time.
     */
    applyVitality() {
      if (options.isDueling()) return;
      const nextRank = ranks().vitality;
      if (nextRank === appliedVitalityRank) return;
      appliedVitalityRank = nextRank;
      applyPlayerMaxHealthMultiplierBonus(options.player, options.healthMultiplierBonus?.() ?? 0);
    },
  };
}
