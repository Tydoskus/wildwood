import type { PlayerState } from "./types";
import { createEmptyResearchRanks, researchStatRewardMultiplier, type ResearchRanks } from "../../../shared/research";
import { applyPlayerMaxHealthMultiplierBonus } from "./player-health";
import { prestigeStatMultiplier } from "../../../shared/prestige";
import type { PrestigePerkRanks } from "../../../shared/prestige-perks";
import { criticalDamageMultiplier, type CriticalDamageParts } from "../../../shared/critical-damage";
import type { CardStatFactors } from "../../../shared/card-effects";
import { bootArmorFactor, type ItemLevel } from "../../../shared/items";
import { researchStatFactors } from "../../../shared/player-power";
import { critChanceFor } from "../../../shared/player-stats";

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
  /** This week's guild quest bonus on stat rewards (weekly quests), as the server pays it. */
  guildQuestBonus?: () => number;
  /** A running Server Boost's 2x on stat rewards, as the server pays it. */
  serverBoost?: () => number;
  /** Prestige perk ranks. Keen Edge grants criticals outside the tech tree. */
  prestigePerks?: () => Partial<PrestigePerkRanks> | null | undefined;
  /** What the active cards do to stats (card-effects.ts cardStatFactors); none without. */
  cards?: () => CardStatFactors | null | undefined;
  /** The worn boots and an item's slot tier and refine: Warrior Boots raise armor (items.ts bootArmorFactor). */
  equippedFeet?: () => string;
  /** The weapon in hand: a bow adds its own crit chance (bow-skills.ts). */
  equippedWeapon?: () => string;
  itemLevel?: (itemId: string) => ItemLevel;
};

const EMPTY_RANKS = createEmptyResearchRanks();

export function createResearchController(options: ResearchControllerOptions) {
  let appliedVitalityRank = 0;

  const ranks = (): ResearchRanks => options.getRanks() ?? EMPTY_RANKS;
  const cards = () => options.cards?.();
  const bootArmor = () => {
    const feet = options.equippedFeet?.() ?? "";
    return feet ? bootArmorFactor(feet, options.itemLevel?.(feet) ?? 0) : 1;
  };

  return {
    ranks,
    /** Warcraft, and attack cards on top: what weapon damage is multiplied by beyond the gear. */
    damageMultiplier: () => researchStatFactors(ranks()).damage * (cards()?.damage ?? 1),
    rewardMultiplier: () => researchStatRewardMultiplier(ranks()) * prestigeStatMultiplier(options.prestigeLevel?.() ?? 0)
      * Math.max(1, options.guildQuestBonus?.() ?? 1) * Math.max(1, options.serverBoost?.() ?? 1),
    effectiveArmor: () => options.player.armor * bootArmor() * researchStatFactors(ranks()).armor * (cards()?.armor ?? 1),
    criticalChance: () => critChanceFor(ranks(), options.prestigePerks?.(), cards()?.critChance ?? 0, options.equippedWeapon?.()),
    /** Everything critical damage adds up from but the soul's share, and the cap's rank. */
    criticalDamageParts: (): CriticalDamageParts => ({ researchRank: ranks().criticalDamage, perks: options.prestigePerks?.(), capRank: ranks().critCap,
      card: cards()?.critDamage }),
    /** The capped multiplier: the run's crit rating, the soul's when there is some, research, Keen Edge and cards. */
    criticalDamageMultiplier: (soul = 0, rating = options.player.critRating ?? 0) => criticalDamageMultiplier({
      researchRank: ranks().criticalDamage, perks: options.prestigePerks?.(), soul, rating, capRank: ranks().critCap, card: cards()?.critDamage,
    }),
    setAppliedVitalityRank: (rank: number) => { appliedVitalityRank = rank; },
    /**
     * Vitality is part of the health bonus (main.ts healthMultiplierBonus), so a
     * new rank only re-applies it.
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
