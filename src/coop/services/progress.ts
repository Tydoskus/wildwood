import {
  ATTACK_BALANCE_VERSION,
  DEFAULT_ATTACK_INTERVAL,
  DEFAULT_ATTACK_RANGE,
  MAX_ARMOR,
  MAX_PLAYER_STAT,
  MIN_ATTACK_INTERVAL,
  movementSpeedsMatch,
  PLAYER_SPEED,
} from "../../../shared/rules";
import { compressLegacyProgressionOutlier } from "../../../shared/progression-balance";

const MIN_PROJECTILE_SPEED = 390;
const MAX_PROJECTILE_SPEED = 2730;

export type PlayerProgress = {
  maxHp: number;
  damage: number;
  attackRate: number;
  projectileSpeed: number;
  projectileCount: number;
  attackRange: number;
  armor: number;
  regen: number;
  speed: number;
  speedOverride: number;
  bootsCollected: boolean;
  inventoryJson: string;
  equippedHead: string;
  equippedChest: string;
  equippedFeet: string;
  equippedRightHand: string;
  equippedLeftHand: string;
  cosmeticHead: string;
  cosmeticChest: string;
  cosmeticFeet: string;
  cosmeticRightHand: string;
  cosmeticLeftHand: string;
  introComplete: boolean;
  desertUnlocked: boolean;
  snowlandsUnlocked: boolean;
  lavaUnlocked: boolean;
  infernalUnlocked: boolean;
  bowCount: number;
  woodenArmorCount: number;
};

export type ProgressSave = Omit<PlayerProgress, "speedOverride" | "introComplete" | "desertUnlocked" | "snowlandsUnlocked" | "lavaUnlocked" | "infernalUnlocked" | "bowCount" | "woodenArmorCount"> & { enemyKills: number };

export function bounded(value: number, min: number, max: number, fallback: number) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

export function copyProgress(progress: ProgressSave): ProgressSave {
  return {
    maxHp: bounded(progress.maxHp, 1, MAX_PLAYER_STAT, 100),
    damage: bounded(progress.damage, 1, MAX_PLAYER_STAT, 4),
    attackRate: bounded(progress.attackRate, MIN_ATTACK_INTERVAL, 10, DEFAULT_ATTACK_INTERVAL),
    projectileSpeed: bounded(progress.projectileSpeed, MIN_PROJECTILE_SPEED, MAX_PROJECTILE_SPEED, MIN_PROJECTILE_SPEED),
    projectileCount: Number.isInteger(progress.projectileCount)
      ? Math.max(1, Math.min(20, progress.projectileCount))
      : 1,
    attackRange: DEFAULT_ATTACK_RANGE,
    armor: bounded(progress.armor, 0, MAX_ARMOR, 0),
    regen: bounded(progress.regen, 0, MAX_PLAYER_STAT, 0),
    speed: bounded(progress.speed, 1, 2_000, PLAYER_SPEED),
    bootsCollected: progress.bootsCollected,
    inventoryJson: typeof progress.inventoryJson === "string" ? progress.inventoryJson : "[]",
    equippedHead: typeof progress.equippedHead === "string" ? progress.equippedHead : "",
    equippedChest: typeof progress.equippedChest === "string" ? progress.equippedChest : "",
    equippedFeet: typeof progress.equippedFeet === "string" ? progress.equippedFeet : "",
    equippedRightHand: typeof progress.equippedRightHand === "string" ? progress.equippedRightHand : "",
    equippedLeftHand: typeof progress.equippedLeftHand === "string" ? progress.equippedLeftHand : "",
    cosmeticHead: typeof progress.cosmeticHead === "string" ? progress.cosmeticHead : "",
    cosmeticChest: typeof progress.cosmeticChest === "string" ? progress.cosmeticChest : "",
    cosmeticFeet: typeof progress.cosmeticFeet === "string" ? progress.cosmeticFeet : "",
    cosmeticRightHand: typeof progress.cosmeticRightHand === "string" ? progress.cosmeticRightHand : "",
    cosmeticLeftHand: typeof progress.cosmeticLeftHand === "string" ? progress.cosmeticLeftHand : "",
    enemyKills: Number.isInteger(progress.enemyKills)
      ? Math.max(0, Math.min(4_294_967_295, progress.enemyKills))
      : 0,
  };
}

export function isProgressSave(value: unknown): value is ProgressSave {
  if (!value || typeof value !== "object") return false;
  const progress = value as Record<string, unknown>;
  return [
    progress.maxHp,
    progress.damage,
    progress.attackRate,
    progress.projectileSpeed,
    progress.attackRange,
    progress.armor,
    progress.regen,
    progress.speed,
  ].every(Number.isFinite) && Number.isInteger(progress.projectileCount) &&
    typeof progress.bootsCollected === "boolean" && typeof progress.inventoryJson === "string" &&
    typeof progress.equippedHead === "string" && typeof progress.equippedChest === "string" && typeof progress.equippedFeet === "string" &&
    typeof progress.equippedRightHand === "string" && typeof progress.equippedLeftHand === "string" &&
    [progress.cosmeticHead, progress.cosmeticChest, progress.cosmeticFeet, progress.cosmeticRightHand, progress.cosmeticLeftHand]
      .every((value) => value === undefined || typeof value === "string") &&
    (progress.enemyKills === undefined || Number.isInteger(progress.enemyKills));
}

export function migrateProgressSave(progress: ProgressSave, savedBalanceVersion: unknown): ProgressSave {
  if (savedBalanceVersion === ATTACK_BALANCE_VERSION) return copyProgress(progress);
  const version = Number.isFinite(savedBalanceVersion) ? Number(savedBalanceVersion) : 0;
  const attackBalanced = {
    ...progress,
    // Version 1 halved legacy attack speed once. Version 2 enforces the lower
    // base-speed cap, including on already-maxed local pending saves.
    attackRate: bounded(
      version < 1 ? progress.attackRate * 2 : progress.attackRate,
      MIN_ATTACK_INTERVAL,
      DEFAULT_ATTACK_INTERVAL,
      DEFAULT_ATTACK_INTERVAL,
    ),
  };
  return copyProgress(version < 3 ? compressLegacyProgressionOutlier(attackBalanced) : attackBalanced);
}

export function progressCovers(saved: PlayerProgress, pending: ProgressSave) {
  const epsilon = 0.0001;
  const savedMovementBase = saved.speedOverride > 0 ? saved.speedOverride : saved.speed;
  return saved.maxHp >= pending.maxHp &&
    saved.damage >= pending.damage &&
    saved.attackRate <= pending.attackRate + epsilon &&
    saved.projectileSpeed >= pending.projectileSpeed &&
    saved.projectileCount >= pending.projectileCount &&
    Math.abs(saved.attackRange - pending.attackRange) <= epsilon &&
    saved.armor >= pending.armor &&
    saved.regen >= pending.regen &&
    movementSpeedsMatch(savedMovementBase, pending.speed) &&
    (!pending.bootsCollected || saved.bootsCollected) &&
    saved.inventoryJson === pending.inventoryJson && saved.equippedHead === pending.equippedHead && saved.equippedChest === pending.equippedChest && saved.equippedFeet === pending.equippedFeet &&
    saved.equippedRightHand === pending.equippedRightHand && saved.equippedLeftHand === pending.equippedLeftHand &&
    saved.cosmeticHead === pending.cosmeticHead && saved.cosmeticChest === pending.cosmeticChest && saved.cosmeticFeet === pending.cosmeticFeet &&
    saved.cosmeticRightHand === pending.cosmeticRightHand && saved.cosmeticLeftHand === pending.cosmeticLeftHand;
}

export function mergeProgress(saved: PlayerProgress, pending: ProgressSave): PlayerProgress {
  return {
    ...saved,
    maxHp: Math.max(saved.maxHp, pending.maxHp),
    damage: Math.max(saved.damage, pending.damage),
    attackRate: Math.min(saved.attackRate, pending.attackRate),
    projectileSpeed: Math.max(saved.projectileSpeed, pending.projectileSpeed),
    projectileCount: Math.max(saved.projectileCount, pending.projectileCount),
    armor: Math.max(saved.armor, pending.armor),
    regen: Math.max(saved.regen, pending.regen),
    speed: Math.max(saved.speed, pending.speed),
    bootsCollected: saved.bootsCollected || pending.bootsCollected,
    inventoryJson: pending.inventoryJson,
    equippedHead: pending.equippedHead,
    equippedChest: pending.equippedChest,
    equippedFeet: pending.equippedFeet,
    equippedRightHand: pending.equippedRightHand,
    equippedLeftHand: pending.equippedLeftHand,
    cosmeticHead: pending.cosmeticHead,
    cosmeticChest: pending.cosmeticChest,
    cosmeticFeet: pending.cosmeticFeet,
    cosmeticRightHand: pending.cosmeticRightHand,
    cosmeticLeftHand: pending.cosmeticLeftHand,
  };
}

export function sameProgressSave(a: ProgressSave, b: ProgressSave) {
  return JSON.stringify(copyProgress(a)) === JSON.stringify(copyProgress(b));
}
