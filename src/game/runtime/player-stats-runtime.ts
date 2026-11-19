import type { CardTotals } from "../../../shared/card-effects";
import type { FoodBuffFactors } from "../../../shared/cooking";
import type { ItemLevel } from "../../../shared/items";
import type { PrestigePerkRanks } from "../../../shared/prestige-perks";
import type { ResearchRanks } from "../../../shared/research";
import type { SoulStats } from "../../../shared/soul-dimension";
import type { AttackCapArg } from "../../../shared/stat-rating";
import { computePlayerStats, playerCoreStats, playerMoveSpeed, type PlayerStatInputs } from "../../../shared/player-stats";
import type { PlayerState } from "./types";

/** What the stats read from the coop session: the bonuses in play. Offline, all of it is missing. */
export type PlayerStatsSource = {
  itemLevel?: (itemId: string) => ItemLevel;
  researchInPlay?: () => ResearchRanks | null | undefined;
  prestigePerks?: () => Partial<PrestigePerkRanks> | null | undefined;
  activeCardTotals?: () => CardTotals | null | undefined;
  attackCapInPlay?: () => AttackCapArg;
  prestige?: () => { level: number } | null | undefined;
  prestigeStatGainInPlay?: () => boolean;
  weeklyQuests?: () => { bonus: number } | null | undefined;
  activeFoodBuffFactors?: () => FoodBuffFactors | null | undefined;
};

type WornGear = { equippedHead: string; equippedChest: string; equippedFeet: string; equippedRightHand: string; equippedLeftHand: string };

/**
 * The live player's final stats: shared/player-stats.ts fed from the player,
 * the bag and the coop session. This is where to read them while playing.
 */
export function createPlayerStatsRuntime(deps: {
  player: PlayerState;
  inventory: WornGear;
  source: () => PlayerStatsSource | null | undefined;
  /** The soul's stats in play (its crit damage counts; the rest is already in the player's stats). */
  soul?: () => Partial<SoulStats> | null | undefined;
  /** Swordplay's Tailwind share of move speed now. */
  tailwind?: () => number;
  isDueling?: () => boolean;
}) {
  const { player, inventory } = deps;
  // Without the live parts (soul, Tailwind, duel), which max health and regen never need and may not exist yet.
  const coreInputs = (): PlayerStatInputs => {
    const source = deps.source();
    return {
      base: { maxHp: player.baseMaxHp, damage: player.damage, armor: player.armor, regen: player.regen, attackInterval: player.attackRate,
        attackRange: player.attackRange, moveSpeed: player.speed, critRating: player.critRating ?? 0 },
      loadout: { head: inventory.equippedHead, chest: inventory.equippedChest, feet: inventory.equippedFeet,
        rightHand: inventory.equippedRightHand, leftHand: inventory.equippedLeftHand },
      itemLevel: itemId => source?.itemLevel?.(itemId) ?? 0,
      research: source?.researchInPlay?.(), perks: source?.prestigePerks?.(), cards: source?.activeCardTotals?.(),
      attackCap: source?.attackCapInPlay?.(),
      prestigeLevel: source?.prestigeStatGainInPlay?.() === false ? 0 : source?.prestige?.()?.level ?? 0,
      guildBonus: source?.weeklyQuests?.()?.bonus ?? 1,
      food: source?.activeFoodBuffFactors?.(),
    };
  };
  const inputs = (): PlayerStatInputs => ({ ...coreInputs(), soul: deps.soul?.(), tailwind: deps.tailwind?.() ?? 0, dueling: deps.isDueling?.() ?? false });
  const moveSpeed = () => playerMoveSpeed(inputs());
  return {
    inputs,
    /** Every stat with its sources. */
    stats: () => computePlayerStats(inputs()),
    /** Gear, Vitality, health cards and active food as one bonus on saved max health (player-health.ts applies it). */
    healthMultiplierBonus: () => {
      const { gear, research, cards, food } = playerCoreStats(coreInputs()).factors;
      return gear.maxHp * research.maxHp * cards.maxHp * food.maxHp - 1;
    },
    regenerationPerSecond: () => playerCoreStats(coreInputs()).stats.regen,
    moveSpeed,
    /** Move speed over the player's base speed, for callers that scale player.speed. */
    movementMultiplier: () => moveSpeed() / Math.max(1, player.speed),
  };
}
