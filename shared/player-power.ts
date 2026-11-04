import { CHALLENGE_ABSOLUTE_MIN_INTERVAL } from "./prestige-challenge";
import { DEFAULT_ATTACK_INTERVAL, PLAYER_BASE_DAMAGE, PLAYER_BASE_HP, PLAYER_BASE_REGEN } from "./rules";
import { cardStatFactors, cardTotals, type CardTotals } from "./card-effects";
import {
  bootArmorFactor,
  equipmentDamageFactor,
  equipmentMaxHealthMultiplierBonus,
  equipmentRegenerationMultiplierBonus,
  weaponRatings,
  type ItemLevel,
} from "./items";
import { attackIntervalWithGear, cleanRating, type AttackCapArg } from "./stat-rating";

export type PlayerPowerStats = {
  maxHp: number;
  damage: number;
  attackRate: number;
  armor: number;
  regen: number;
  /** The run's crit damage rating (stat-rating.ts), where a caller tracks it. Not part of power itself. */
  critRating?: number;
  /**
   * Crit chance (0–1) and the crit multiplier in play, where the caller knows them: power counts damage at
   * its average hit, crits included (critPowerFactor). Without them a hit is plain damage.
   */
  critChance?: number;
  critMultiplier?: number;
};

/**
 * What crits multiply the average hit by: 1 + chance × (multiplier − 1), as duels count them, so a crit
 * build's power reads as strong as it fights.
 */
export function critPowerFactor(stats: Pick<PlayerPowerStats, "critChance" | "critMultiplier">) {
  const chance = Number.isFinite(stats.critChance) ? Math.min(1, Math.max(0, Number(stats.critChance))) : 0;
  const multiplier = Number.isFinite(stats.critMultiplier) ? Math.max(1, Number(stats.critMultiplier)) : 1;
  return 1 + chance * (multiplier - 1);
}

/**
 * The stats kills raise, as a new run starts them: a new account, a prestige
 * and a perk respec all set them back to these.
 */
export const PLAYER_STARTING_POWER: Readonly<PlayerPowerStats> = Object.freeze({
  maxHp: PLAYER_BASE_HP, damage: PLAYER_BASE_DAMAGE, attackRate: DEFAULT_ATTACK_INTERVAL, armor: 0, regen: PLAYER_BASE_REGEN, critRating: 0,
});

export type PlayerPowerProgress = PlayerPowerStats & {
  equippedHead?: string;
  equippedChest?: string;
  /** Boots: Warrior Boots raise armor (items.ts bootArmorFactor). */
  equippedFeet?: string;
  equippedRightHand?: string;
  equippedLeftHand?: string;
  /** The active cards in play (active-cards.ts); none is no card factor. */
  activeCards?: readonly string[];
};

export type PlayerPowerResearch = {
  warcraft?: number;
  vitality?: number;
  precision?: number;
  regeneration?: number;
};

/** An item's slot tier, or its slot tier and refine (items.ts ItemLevel). */
type ItemUpgradeLevel = (itemId: string) => ItemLevel;

function researchRank(value: unknown) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(Number(value))) : 0;
}

/** One canonical effective-stat calculation for profile, world, and leaderboard power. */
export function effectivePlayerPowerStats(
  progress: PlayerPowerProgress,
  research: PlayerPowerResearch | null | undefined = null,
  itemUpgradeLevel: ItemUpgradeLevel = () => 0,
  cards?: CardTotals,
  attackCap?: AttackCapArg,
): PlayerPowerStats {
  return preparePlayerPowerStats(progress, research, itemUpgradeLevel, cards, attackCap)(progress);
}

/** What research multiplies the four core stats by: 2% a rank of Vitality, Warcraft, Precision and Regeneration. */
export function researchStatFactors(research: PlayerPowerResearch | null | undefined) {
  return {
    maxHp: 1 + researchRank(research?.vitality) * .02,
    damage: 1 + researchRank(research?.warcraft) * .02,
    armor: 1 + researchRank(research?.precision) * .02,
    regen: 1 + researchRank(research?.regeneration) * .02,
  };
}

/** What gear, research and active cards each multiply the four core stats by, kept apart for floating-point order. */
export function playerStatFactors(
  loadout: Omit<PlayerPowerProgress, keyof PlayerPowerStats>,
  research: PlayerPowerResearch | null | undefined = null,
  itemUpgradeLevel: ItemUpgradeLevel = () => 0,
  activeCardTotals?: CardTotals,
  /** The attack cap in play, where the caller knows it (stat-rating.ts attackIntervalWithGear). */
  attackCap?: AttackCapArg,
) {
  const weaponItem = loadout.equippedRightHand || loadout.equippedLeftHand || "";
  const headItem = loadout.equippedHead || "";
  const chestItem = loadout.equippedChest || "";
  const weaponLevel = itemUpgradeLevel(weaponItem);
  const headLevel = itemUpgradeLevel(headItem);
  const chestLevel = itemUpgradeLevel(chestItem);
  const feetItem = loadout.equippedFeet || "";
  // Vitality multiplies saved health live, like every other research.
  const gear = {
    maxHp: 1 + equipmentMaxHealthMultiplierBonus(headItem, chestItem, headLevel, chestLevel),
    damage: equipmentDamageFactor(weaponItem, headItem, chestItem, weaponLevel, headLevel, chestLevel),
    armor: feetItem ? bootArmorFactor(feetItem, itemUpgradeLevel(feetItem)) : 1,
    regen: 1 + equipmentRegenerationMultiplierBonus(headItem, chestItem, headLevel, chestLevel),
    // The weapon's attack speed and crit damage rating: kills pay neither.
    rating: weaponRatings(weaponItem, weaponLevel),
    attackCap,
  };
  // The active cards; a factor of one without any.
  const cards = cardStatFactors(activeCardTotals ?? cardTotals(loadout.activeCards ?? []));
  return { gear, research: researchStatFactors(research), cards };
}

/** The four core stats from earned ones: base × gear × research × cards. */
export function applyPlayerStatFactors(factors: ReturnType<typeof playerStatFactors>, progress: PlayerPowerStats): PlayerPowerStats {
  const { gear, research, cards } = factors;
  return {
    maxHp: progress.maxHp * gear.maxHp * research.maxHp * cards.maxHp,
    damage: progress.damage * gear.damage * research.damage * cards.damage,
    attackRate: Math.max(CHALLENGE_ABSOLUTE_MIN_INTERVAL, attackIntervalWithGear(progress.attackRate, gear.rating.speed, gear.attackCap)),
    armor: progress.armor * gear.armor * research.armor * cards.armor,
    regen: progress.regen * gear.regen * research.regen * cards.regen,
    // The crit rating with the weapon's; chance and multiplier pass through as given (worked out elsewhere).
    ...(progress.critRating !== undefined || gear.rating.crit > 0 ? { critRating: cleanRating((progress.critRating ?? 0) + gear.rating.crit) } : {}),
    ...(progress.critChance !== undefined ? { critChance: progress.critChance } : {}),
    ...(progress.critMultiplier !== undefined ? { critMultiplier: progress.critMultiplier } : {}),
  };
}

/** Resolve fixed gear/research once; reuse while only the earned base stats change. */
export function preparePlayerPowerStats(
  loadout: PlayerPowerProgress,
  research: PlayerPowerResearch | null | undefined = null,
  itemUpgradeLevel: ItemUpgradeLevel = () => 0,
  /** The active cards added up, when the caller has them; otherwise the loadout's activeCards. */
  activeCardTotals?: CardTotals,
  attackCap?: AttackCapArg,
): (progress: PlayerPowerStats) => PlayerPowerStats {
  const factors = playerStatFactors(loadout, research, itemUpgradeLevel, activeCardTotals, attackCap);
  return progress => applyPlayerStatFactors(factors, progress);
}

export function effectivePlayerPower(
  progress: PlayerPowerProgress,
  research?: PlayerPowerResearch | null,
  itemUpgradeLevel?: ItemUpgradeLevel,
  cards?: CardTotals,
) {
  return playerPowerForStats(effectivePlayerPowerStats(progress, research, itemUpgradeLevel, cards));
}

export function playerPowerForStats(stats: PlayerPowerStats) {
  return Math.round(unroundedPlayerPower(stats));
}

/**
 * The same sum before rounding. Comparing two pieces of gear needs it: a
 * small weapon difference on a low-level player can round away entirely.
 */
export function unroundedPlayerPower(stats: PlayerPowerStats) {
  const attackSpeedMultiplier = DEFAULT_ATTACK_INTERVAL / Math.max(CHALLENGE_ABSOLUTE_MIN_INTERVAL, stats.attackRate);
  const power =
    stats.damage * critPowerFactor(stats) * attackSpeedMultiplier +
    stats.maxHp +
    stats.armor * 3 +
    stats.regen * 10;
  return Number.isFinite(power) ? Math.max(0, power) : 0;
}

export function legacyU32Power(power: number) {
  return Math.max(0, Math.min(0xffffffff, Math.round(power)));
}
