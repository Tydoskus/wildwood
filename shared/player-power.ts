import { DEFAULT_ATTACK_INTERVAL, MIN_ATTACK_INTERVAL } from "./rules";
import {
  equipmentDamageMultiplier,
  equipmentMaxHealthMultiplier,
  equipmentRegenerationMultiplier,
  weaponAttackInterval,
} from "./items";

export type PlayerPowerStats = {
  maxHp: number;
  damage: number;
  attackRate: number;
  armor: number;
  regen: number;
};

export type PlayerPowerProgress = PlayerPowerStats & {
  equippedHead?: string;
  equippedChest?: string;
  equippedRightHand?: string;
  equippedLeftHand?: string;
};

export type PlayerPowerResearch = {
  warcraft?: number;
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
  return {
    maxHp: progress.maxHp * equipmentMaxHealthMultiplier(headItem, chestItem, 1, headLevel, chestLevel),
    damage: progress.damage * equipmentDamageMultiplier(
      weaponItem,
      headItem,
      chestItem,
      1 + researchRank(research?.warcraft) * .02,
      weaponLevel,
      headLevel,
      chestLevel,
    ),
    attackRate: weaponAttackInterval(weaponItem, progress.attackRate, 1, weaponLevel),
    armor: progress.armor * (1 + researchRank(research?.precision) * .02),
    regen: progress.regen * equipmentRegenerationMultiplier(
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
  const attackSpeedMultiplier = DEFAULT_ATTACK_INTERVAL / Math.max(MIN_ATTACK_INTERVAL, stats.attackRate);
  const power = Math.round(
    stats.damage * attackSpeedMultiplier +
    stats.maxHp +
    stats.armor * 3 +
    stats.regen * 10,
  );
  return Number.isFinite(power) ? Math.max(0, power) : 0;
}

export function legacyU32Power(power: number) {
  return Math.max(0, Math.min(0xffffffff, Math.round(power)));
}
