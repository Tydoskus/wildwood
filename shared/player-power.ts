import { DEFAULT_ATTACK_INTERVAL, MIN_ATTACK_INTERVAL, PLAYER_BASE_DAMAGE, PLAYER_BASE_HP, PLAYER_BASE_REGEN } from "./rules";
import {
  equipmentDamage,
  equipmentMaxHealth,
  equipmentRegeneration,
} from "./items";

export type PlayerPowerStats = {
  maxHp: number;
  damage: number;
  attackRate: number;
  armor: number;
  regen: number;
};

/**
 * The stats kills raise, as a new run starts them: a new account, a prestige
 * and a perk respec all set them back to these.
 */
export const PLAYER_STARTING_POWER: Readonly<PlayerPowerStats> = Object.freeze({
  maxHp: PLAYER_BASE_HP, damage: PLAYER_BASE_DAMAGE, attackRate: DEFAULT_ATTACK_INTERVAL, armor: 0, regen: PLAYER_BASE_REGEN,
});

export type PlayerPowerProgress = PlayerPowerStats & {
  equippedHead?: string;
  equippedChest?: string;
  equippedRightHand?: string;
  equippedLeftHand?: string;
};

export type PlayerPowerResearch = {
  warcraft?: number;
  vitality?: number;
  precision?: number;
  regeneration?: number;
};

type ItemUpgradeLevel = (itemId: string) => number;

function researchRank(value: unknown) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(Number(value))) : 0;
}

/** One canonical effective-stat calculation for profile, world, and leaderboard power. */
export function effectivePlayerPowerStats(
  progress: PlayerPowerProgress,
  research: PlayerPowerResearch | null | undefined = null,
  itemUpgradeLevel: ItemUpgradeLevel = () => 0,
): PlayerPowerStats {
  const weaponItem = progress.equippedRightHand || progress.equippedLeftHand || "";
  const headItem = progress.equippedHead || "";
  const chestItem = progress.equippedChest || "";
  const weaponLevel = itemUpgradeLevel(weaponItem);
  const headLevel = itemUpgradeLevel(headItem);
  const chestLevel = itemUpgradeLevel(chestItem);
  // Saved maxHp already includes Vitality. Undo that part before multiplying
  // equipment and research, so existing earned health is not boosted twice.
  const vitalityMultiplier = 1 + researchRank(research?.vitality) * .02;
  return {
    maxHp: equipmentMaxHealth(progress.maxHp / vitalityMultiplier, headItem, chestItem, vitalityMultiplier, headLevel, chestLevel),
    damage: equipmentDamage(progress.damage,
      weaponItem,
      headItem,
      chestItem,
      1 + researchRank(research?.warcraft) * .02,
      weaponLevel,
      headLevel,
      chestLevel,
    ),
    attackRate: Math.max(MIN_ATTACK_INTERVAL, progress.attackRate),
    armor: progress.armor * (1 + researchRank(research?.precision) * .02),
    regen: equipmentRegeneration(progress.regen,
      headItem,
      chestItem,
      1 + researchRank(research?.regeneration) * .02,
      headLevel,
      chestLevel,
    ),
  };
}

export function effectivePlayerPower(
  progress: PlayerPowerProgress,
  research?: PlayerPowerResearch | null,
  itemUpgradeLevel?: ItemUpgradeLevel,
) {
  return playerPowerForStats(effectivePlayerPowerStats(progress, research, itemUpgradeLevel));
}

export function playerPowerForStats(stats: PlayerPowerStats) {
  return Math.round(unroundedPlayerPower(stats));
}

/**
 * The same sum before rounding. Comparing two pieces of gear needs it: a
 * small weapon difference on a low-level player can round away entirely.
 */
export function unroundedPlayerPower(stats: PlayerPowerStats) {
  const attackSpeedMultiplier = DEFAULT_ATTACK_INTERVAL / Math.max(MIN_ATTACK_INTERVAL, stats.attackRate);
  const power =
    stats.damage * attackSpeedMultiplier +
    stats.maxHp +
    stats.armor * 3 +
    stats.regen * 10;
  return Number.isFinite(power) ? Math.max(0, power) : 0;
}

export function legacyU32Power(power: number) {
  return Math.max(0, Math.min(0xffffffff, Math.round(power)));
}
