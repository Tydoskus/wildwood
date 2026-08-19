import { BASE_ATTACK_RANGE, BASE_PROJECTILE_SPEED } from "../constants";
import { clamp } from "../math";
import { inventoryFromSave, serialiseInventory, TRAILBLAZER_BOOTS, type EquipmentSlot, type InventoryState } from "../inventory";
import type { PlayerState } from "./types";
import { setPlayerBaseMaxHealth } from "./player-health";
import type { PlayerProgress, ProgressSave } from "../../coop/services/progress";
import {
  BOOTS_SPEED_BONUS,
  DEFAULT_ATTACK_INTERVAL,
  MAX_ARMOR,
  MAX_PLAYER_STAT,
  MIN_ATTACK_INTERVAL,
  PLAYER_BASE_HP,
  PLAYER_SPEED,
} from "../../../shared/rules";

type Inventory = InventoryState & { selectedItemId: string; selectedItemLocation?: EquipmentSlot | "BAG" | "" };
type BootPickup = { collected: boolean };

type ProgressDependencies = {
  player: PlayerState;
  inventory: Inventory;
  bootsPickup: BootPickup;
  legacyStorageKey: string;
  getSavedProgress: () => PlayerProgress | null;
  saveRemoteProgress: (progress: ProgressSave, immediate: boolean) => void;
  localIdentity: () => string;
  lifetimeEnemyKills: (identity: string) => number | undefined;
  isDeveloper: (identity: string) => boolean;
  getTotalKills: () => number;
  setTotalKills: (kills: number) => void;
  researchVitalityRank: () => number;
  healthMultiplier: () => number;
  setAppliedVitalityRank: (rank: number) => void;
  renderInventory: () => void;
  onLoaded: () => void;
};

type LegacyProgress = { stats: Partial<PlayerProgress>; bootsCollected?: unknown };

/** Server progress persistence, legacy migration, bounds checks, and load state. */
export function createProgressController(dependencies: ProgressDependencies) {
  let hasSavedProgress = false;
  let progressLoaded = false;
  let progressLoadedIdentity = "";
  let waitingForFreshStart = false;
  let startupKind: "new" | "returning" | null = null;
  let lifetimeKillsIdentity = "";

  function save(immediate = false) {
    const { player, inventory, bootsPickup } = dependencies;
    dependencies.saveRemoteProgress({
      maxHp: player.baseMaxHp,
      damage: player.damage,
      attackRate: player.attackRate,
      projectileSpeed: player.projectileSpeed,
      projectileCount: player.projectileCount,
      attackRange: player.attackRange,
      armor: player.armor,
      regen: player.regen,
      speed: player.speed,
      bootsCollected: bootsPickup.collected,
      inventoryJson: serialiseInventory(inventory),
      equippedHead: inventory.equippedHead,
      equippedChest: inventory.equippedChest,
      equippedFeet: inventory.equippedFeet,
      equippedRightHand: inventory.equippedRightHand,
      equippedLeftHand: inventory.equippedLeftHand,
      enemyKills: dependencies.getTotalKills(),
    }, immediate);
  }

  function syncLifetimeKills(identity: string) {
    const enemyKills = dependencies.lifetimeEnemyKills(identity);
    if (enemyKills === undefined) return;
    const nextKills = identity === lifetimeKillsIdentity
      ? Math.max(dependencies.getTotalKills(), enemyKills)
      : enemyKills;
    dependencies.setTotalKills(nextKills);
    lifetimeKillsIdentity = identity;
  }

  function load() {
    const progressIdentity = dependencies.localIdentity();
    if (progressLoaded && progressLoadedIdentity === progressIdentity) return;
    const saved = dependencies.getSavedProgress();
    if (!saved) return;
    syncLifetimeKills(progressIdentity);

    const legacy = readLegacyProgress(dependencies.legacyStorageKey);
    const serverIsDefault = isDefaultProgress(saved);
    const source = legacy && serverIsDefault
      ? { ...legacy.stats, bootsCollected: legacy.bootsCollected === true }
      : saved;
    if (waitingForFreshStart && saved.introComplete) return;

    applyProgress(source);
    hasSavedProgress = true;
    progressLoaded = true;
    progressLoadedIdentity = progressIdentity;
    waitingForFreshStart = false;
    if (legacy && serverIsDefault) {
      save(false);
      try { localStorage.removeItem(dependencies.legacyStorageKey); } catch {}
    }
    startupKind = !saved.introComplete && isDefaultProgress(source) ? "new" : "returning";
    dependencies.onLoaded();
  }

  function applyProgress(source: Partial<PlayerProgress>) {
    const { player, inventory, bootsPickup } = dependencies;
    const bounded = (value: number | undefined, fallback: number, min: number, max: number) =>
      Number.isFinite(value) ? clamp(value as number, min, max) : fallback;
    player.baseMaxHp = bounded(source.maxHp, player.baseMaxHp, 1, MAX_PLAYER_STAT);
    player.damage = bounded(source.damage, player.damage, 1, MAX_PLAYER_STAT);
    player.attackRate = bounded(source.attackRate, player.attackRate, MIN_ATTACK_INTERVAL, 10);
    player.projectileSpeed = BASE_PROJECTILE_SPEED;
    player.projectileCount = Math.floor(bounded(source.projectileCount, player.projectileCount, 1, 20));
    player.attackRange = BASE_ATTACK_RANGE;
    player.armor = bounded(source.armor, player.armor, 0, MAX_ARMOR);
    player.regen = bounded(source.regen, player.regen, 0, MAX_PLAYER_STAT);
    bootsPickup.collected = source.bootsCollected === true;
    dependencies.setAppliedVitalityRank(dependencies.researchVitalityRank());
    const savedInventory = inventoryFromSave(
      source.inventoryJson,
      source.equippedFeet,
      source.equippedHead,
      source.equippedChest,
      bootsPickup.collected,
      dependencies.isDeveloper(dependencies.localIdentity()),
      source.equippedRightHand,
      source.equippedLeftHand,
    );
    inventory.itemIds = savedInventory.itemIds;
    inventory.equippedHead = savedInventory.equippedHead;
    inventory.equippedChest = savedInventory.equippedChest;
    inventory.equippedFeet = savedInventory.equippedFeet;
    inventory.equippedRightHand = savedInventory.equippedRightHand;
    inventory.equippedLeftHand = savedInventory.equippedLeftHand;
    setPlayerBaseMaxHealth(player, player.baseMaxHp, dependencies.healthMultiplier(), true);
    player.speed = inventory.equippedFeet === TRAILBLAZER_BOOTS ? PLAYER_SPEED + BOOTS_SPEED_BONUS : PLAYER_SPEED;
    inventory.selectedItemId = "";
    inventory.selectedItemLocation = "";
    dependencies.renderInventory();
  }

  return {
    hasSavedProgress: () => hasSavedProgress,
    isLoaded: () => progressLoaded,
    load,
    resetState: () => {
      hasSavedProgress = false;
      progressLoaded = false;
      progressLoadedIdentity = "";
      waitingForFreshStart = true;
      startupKind = null;
    },
    save,
    startupKind: () => startupKind,
    syncLifetimeKills,
  };
}

function readLegacyProgress(storageKey: string): LegacyProgress | null {
  try {
    const candidate: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    if (!candidate || typeof candidate !== "object" || !("stats" in candidate)) return null;
    const stats = (candidate as { stats?: unknown }).stats;
    if (!stats || typeof stats !== "object") return null;
    return {
      stats: stats as Partial<PlayerProgress>,
      bootsCollected: (candidate as { bootsCollected?: unknown }).bootsCollected,
    };
  } catch {
    return null;
  }
}

function isDefaultProgress(progress: Partial<PlayerProgress>) {
  return progress.maxHp === PLAYER_BASE_HP &&
    progress.damage === 4 &&
    progress.attackRate === DEFAULT_ATTACK_INTERVAL &&
    progress.projectileSpeed === BASE_PROJECTILE_SPEED &&
    progress.projectileCount === 1 &&
    progress.attackRange === BASE_ATTACK_RANGE &&
    progress.armor === 0 &&
    progress.regen === 0 &&
    progress.speed === PLAYER_SPEED &&
    progress.bootsCollected === false;
}
