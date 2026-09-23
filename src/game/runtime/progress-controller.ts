import { canonicalItemId, itemDefinition } from "../../../shared/items";
import { equipmentMapRequirement, EQUIPMENT_ACCESS_FIELDS, withoutLockedEquipment } from "../../../shared/equipment-access";
import { BASE_ATTACK_RANGE, BASE_PROJECTILE_SPEED } from "../constants";
import { clamp } from "../math";
import { inventoryFromSave, serialiseInventory, type EquipmentSlot, type InventoryState } from "../inventory";
import type { PlayerState } from "./types";
import { applyPlayerMaxHealthMultiplierBonus, setPlayerBaseMaxHealth } from "./player-health";
import type { PlayerProgress, ProgressSave } from "../../coop/services/progress";
import {
  DEFAULT_ATTACK_INTERVAL,
  MAX_MOVEMENT_SPEED_OVERRIDE,
  MAX_ARMOR,
  MAX_PLAYER_STAT,
  MIN_ATTACK_INTERVAL,
  PLAYER_BASE_HP, PLAYER_BASE_DAMAGE,
  PLAYER_BASE_REGEN,
  PLAYER_SPEED,
  playerBaseMovementSpeed,
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
  healthMultiplierBonus: () => number;
  setAppliedVitalityRank: (rank: number) => void;
  renderInventory: () => void;
  onLoaded: () => void;
};

/** Server progress persistence, legacy migration, bounds checks, and load state. */
export function createProgressController(dependencies: ProgressDependencies) {
  let hasSavedProgress = false;
  let progressLoaded = false;
  let progressLoadedIdentity = "";
  let waitingForFreshStart = false;
  let startupKind: "new" | "returning" | null = null;
  let lifetimeKillsIdentity = "";
  let movementSpeedOverride = 0;
  let ownershipJson = "";
  let ownedItems: string[] = [];

  function reconcileInventory(saved: PlayerProgress) {
    // Cache decoding, but compare the current bag too: reconnect hydration can
    // miss the one-shot completion callback even when the snapshot is unchanged.
    if (ownershipJson !== saved.inventoryJson) {
      let parsed: unknown;
      try { parsed = JSON.parse(saved.inventoryJson); } catch { return; }
      if (!Array.isArray(parsed)) return;
      ownedItems = parsed.map(canonicalItemId).filter(item => item !== undefined);
      ownershipJson = saved.inventoryJson;
    }
    const inventory = dependencies.inventory;
    const sameOwnership = inventory.itemIds.length === ownedItems.length &&
      inventory.itemIds.every((item, index) => item === ownedItems[index]);
    let removedLocked = false;
    for (const field of EQUIPMENT_ACCESS_FIELDS) {
      if (inventory[field] && equipmentMapRequirement(inventory[field], saved)) {
        inventory[field] = equipmentMapRequirement(saved[field], saved) ? "" : saved[field];
        removedLocked = true;
      }
    }
    if (sameOwnership && !removedLocked) return;
    inventory.itemIds = [...ownedItems];
    // Keep local loadout choices. Server ownership still determines what can
    // be equipped; upgrading/destroying an item must not leave ghost equipment.
    for (const field of ["equippedHead", "equippedChest", "equippedFeet", "equippedRightHand", "equippedLeftHand",
      "cosmeticHead", "cosmeticChest", "cosmeticFeet", "cosmeticRightHand", "cosmeticLeftHand"] as const) {
      if (itemDefinition(inventory[field]) && !ownedItems.includes(inventory[field])) inventory[field] = "";
    }
    applyPlayerMaxHealthMultiplierBonus(dependencies.player, dependencies.healthMultiplierBonus());
    dependencies.renderInventory();
  }

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
      cosmeticHead: inventory.cosmeticHead,
      cosmeticChest: inventory.cosmeticChest,
      cosmeticFeet: inventory.cosmeticFeet,
      cosmeticRightHand: inventory.cosmeticRightHand,
      cosmeticLeftHand: inventory.cosmeticLeftHand,
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
    const saved = dependencies.getSavedProgress();
    if (progressLoaded && progressLoadedIdentity === progressIdentity) {
      if (saved) {
        // The service includes still-pending local defeats. Reconcile every stat
        // so delayed receipts/reconnects cannot strand rewards until a reload.
        const player = dependencies.player;
        player.damage = boundedProgressValue(saved.damage, player.damage, 1, MAX_PLAYER_STAT);
        player.armor = boundedProgressValue(saved.armor, player.armor, 0, MAX_ARMOR);
        player.attackRate = boundedProgressValue(saved.attackRate, player.attackRate, MIN_ATTACK_INTERVAL, 10);
        player.regen = boundedProgressValue(saved.regen, player.regen, 0, MAX_PLAYER_STAT);
        player.projectileCount = saved.projectileCount;
        player.attackRange = boundedProgressValue(saved.attackRange, player.attackRange, BASE_ATTACK_RANGE, BASE_ATTACK_RANGE + 50);
        if (player.baseMaxHp !== saved.maxHp) setPlayerBaseMaxHealth(player, saved.maxHp, dependencies.healthMultiplierBonus());
        reconcileInventory(saved);
        applyMovementSpeed(saved, false);
      }
      return;
    }
    if (!saved) return;
    syncLifetimeKills(progressIdentity);

    const source = saved;
    if (waitingForFreshStart && saved.introComplete) return;

    applyProgress(source);
    hasSavedProgress = true;
    progressLoaded = true;
    progressLoadedIdentity = progressIdentity;
    waitingForFreshStart = false;
    startupKind = !saved.introComplete && isDefaultProgress(source) ? "new" : "returning";
    dependencies.onLoaded();
  }

  function applyProgress(source: Partial<PlayerProgress>) {
    source = withoutLockedEquipment(source, source);
    const { player, inventory, bootsPickup } = dependencies;
    player.baseMaxHp = boundedProgressValue(source.maxHp, player.baseMaxHp, 1, MAX_PLAYER_STAT);
    player.damage = boundedProgressValue(source.damage, player.damage, 1, MAX_PLAYER_STAT);
    player.attackRate = boundedProgressValue(source.attackRate, player.attackRate, MIN_ATTACK_INTERVAL, 10);
    player.projectileSpeed = BASE_PROJECTILE_SPEED;
    player.projectileCount = Math.floor(boundedProgressValue(source.projectileCount, player.projectileCount, 1, 20));
    player.attackRange = boundedProgressValue(source.attackRange, BASE_ATTACK_RANGE, BASE_ATTACK_RANGE, BASE_ATTACK_RANGE + 50);
    player.armor = boundedProgressValue(source.armor, player.armor, 0, MAX_ARMOR);
    player.regen = boundedProgressValue(source.regen, player.regen, 0, MAX_PLAYER_STAT);
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
      source.cosmeticHead,
      source.cosmeticChest,
      source.cosmeticFeet,
      source.cosmeticRightHand,
      source.cosmeticLeftHand,
    );
    inventory.itemIds = savedInventory.itemIds;
    inventory.equippedHead = savedInventory.equippedHead;
    inventory.equippedChest = savedInventory.equippedChest;
    inventory.equippedFeet = savedInventory.equippedFeet;
    inventory.equippedRightHand = savedInventory.equippedRightHand;
    inventory.equippedLeftHand = savedInventory.equippedLeftHand;
    inventory.cosmeticHead = savedInventory.cosmeticHead;
    inventory.cosmeticChest = savedInventory.cosmeticChest;
    inventory.cosmeticFeet = savedInventory.cosmeticFeet;
    inventory.cosmeticRightHand = savedInventory.cosmeticRightHand;
    inventory.cosmeticLeftHand = savedInventory.cosmeticLeftHand;
    setPlayerBaseMaxHealth(player, player.baseMaxHp, dependencies.healthMultiplierBonus(), true);
    applyMovementSpeed(source, false);
    inventory.selectedItemId = "";
    inventory.selectedItemLocation = "";
    dependencies.renderInventory();
  }

  function applyMovementSpeed(source: Partial<PlayerProgress>, bootsEquipped: boolean) {
    movementSpeedOverride = Number.isFinite(source.speedOverride) && Number(source.speedOverride) > 0
      ? clamp(Number(source.speedOverride), 1, MAX_MOVEMENT_SPEED_OVERRIDE)
      : 0;
    dependencies.player.speed = playerBaseMovementSpeed(bootsEquipped, movementSpeedOverride);
  }

  return {
    hasSavedProgress: () => hasSavedProgress,
    isLoaded: () => progressLoaded,
    isLoadedFor: (identity: string) => progressLoaded && progressLoadedIdentity === identity,
    load,
    resetState: () => {
      hasSavedProgress = false;
      progressLoaded = false;
      progressLoadedIdentity = "";
      waitingForFreshStart = true;
      startupKind = null;
      movementSpeedOverride = 0;
    },
    save,
    startupKind: () => startupKind,
    syncLifetimeKills,
    movementSpeedForEquipment: (bootsEquipped: boolean) => playerBaseMovementSpeed(bootsEquipped, movementSpeedOverride),
  };
}

function boundedProgressValue(value: number | undefined, fallback: number, min: number, max: number) {
  return Number.isFinite(value) ? clamp(value as number, min, max) : fallback;
}

function isDefaultProgress(progress: Partial<PlayerProgress>) {
  return progress.maxHp === PLAYER_BASE_HP &&
    progress.damage === PLAYER_BASE_DAMAGE &&
    progress.attackRate === DEFAULT_ATTACK_INTERVAL &&
    progress.projectileSpeed === BASE_PROJECTILE_SPEED &&
    progress.projectileCount === 1 &&
    progress.attackRange === BASE_ATTACK_RANGE &&
    progress.armor === 0 &&
    (progress.regen === 0 || Math.abs((progress.regen ?? 0) - PLAYER_BASE_REGEN) < 1e-6) &&
    progress.speed === PLAYER_SPEED &&
    (progress.speedOverride ?? 0) === 0;
}
