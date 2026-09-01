import type { Identity } from "spacetimedb";
import { normalizedInventorySlotsUnlocked } from "../../../shared/gems";
import { itemUpgradeDurationMs, normalizeItemUpgradeLevel } from "../../../shared/items";
import { createEmptyResearchRanks, isResearchId, type ResearchId } from "../../../shared/research";
import type {
  ActiveItemUpgrade,
  ActiveResearch,
  PlayerLifetime,
  PlayerResearch,
  UpgradeBenchSlot,
} from "../contracts";
import type { ReducerPort } from "../ports";
import {
  copyProgress,
  mergeProgress,
  progressCovers,
  sameProgressSave,
  type PlayerProgress,
  type ProgressSave,
} from "./progress";
import { createProgressStore } from "./progress-store";

type ProgressionServiceDependencies = {
  reducers: ReducerPort;
  notify: () => void;
  localIdentity: () => string;
  worldEntryReady: () => boolean;
  hydrationReady: () => boolean;
  activeProfileIdentity: () => string;
  completeAccountReturn: () => void;
  reserveStoppedMotion: () => { sequence: number; simulationTick: number; motionEpoch: number };
  commitStoppedPosition: (position: { x: number; y: number }, sequence: number) => void;
  storage: Storage;
  pendingProgressKey: string;
};

type ProgressRow = { identity: Identity } & Omit<
  PlayerProgress,
  | "speedOverride"
  | "lavaUnlocked"
  | "infernalUnlocked"
  | "waterUnlocked"
  | "samuraiUnlocked"
  | "cloudspireUnlocked"
  | "bowCount"
  | "woodenArmorCount"
  | "cosmeticHead"
  | "cosmeticChest"
  | "cosmeticFeet"
  | "cosmeticRightHand"
  | "cosmeticLeftHand"
> & {
  speedOverride?: number;
  lavaUnlocked?: boolean;
  infernalUnlocked?: boolean;
  waterUnlocked?: boolean;
  samuraiUnlocked?: boolean;
  cloudspireUnlocked?: boolean;
  bowCount?: number;
  woodenArmorCount?: number;
  cosmeticHead?: string;
  cosmeticChest?: string;
  cosmeticFeet?: string;
  cosmeticRightHand?: string;
  cosmeticLeftHand?: string;
};

type LifetimeRow = {
  identity: Identity;
  joinedAt: { microsSinceUnixEpoch: bigint };
  playedMicros: bigint;
  sessionStartedAt: { microsSinceUnixEpoch: bigint };
  enemyKills: bigint;
  deathCount: bigint;
};

export function createProgressionService(dependencies: ProgressionServiceDependencies) {
  const store = createProgressStore(dependencies.storage, dependencies.pendingProgressKey);
  const progressByIdentity = new Map<string, PlayerProgress>();
  const researchByIdentity = new Map<string, PlayerResearch>();
  const upgradeLevelsByIdentity = new Map<string, Map<string, number>>();
  const lifetimeByIdentity = new Map<string, PlayerLifetime>();
  const activeItemUpgrades = new Map<UpgradeBenchSlot, ActiveItemUpgrade>();
  let localProgress: PlayerProgress | null = null;
  let localResearch: PlayerResearch = createEmptyResearchRanks();
  let activeResearch: ActiveResearch | null = null;
  let gemBalance = 0n;
  let dailyGemBonusClaimable = false;
  let balanceApologyGiftAmount = 0n;
  let secondUpgradeSlotUnlocked = false;
  let inventorySlotsUnlocked = 0;
  let pendingProgress: ProgressSave | null = null;
  let saveInFlightUntil = 0;
  let savePromise: Promise<boolean> | null = null;
  let itemDropListener: ((drop: { itemId: string; alreadyOwned: boolean }) => void) | null = null;
  let itemUpgradeListener: ((upgrade: { itemId: string; level: number }) => void) | null = null;

  function upgradeLevelsFor(identity: string) {
    return Object.fromEntries(upgradeLevelsByIdentity.get(identity)?.entries() ?? []);
  }

  function clearPending(identity = dependencies.localIdentity()) {
    if (identity === dependencies.localIdentity()) {
      pendingProgress = null;
      saveInFlightUntil = 0;
    }
    store.clear(identity);
  }

  function persistPending(progress: ProgressSave) {
    pendingProgress = copyProgress(progress);
    const identity = dependencies.localIdentity();
    if (identity) pendingProgress = store.write(identity, pendingProgress);
    // Local regular-enemy rewards are optimistic. Publish that snapshot now so
    // an open own-profile view does not wait for the throttled reducer and its
    // subscribed row to make the same progress visible.
    dependencies.notify();
  }

  function promoteConfirmedStats(identity: string, snapshot: ProgressSave) {
    if (identity !== dependencies.localIdentity() || !localProgress) return;
    // A successful save confirms the monotonic combat fields even if the SDK's
    // table update is delivered after the reducer promise. Keep server-owned
    // inventory/equipment fields untouched; their subscribed row remains the
    // authority for any normalization performed by the reducer.
    localProgress = {
      ...localProgress,
      maxHp: Math.max(localProgress.maxHp, snapshot.maxHp),
      damage: Math.max(localProgress.damage, snapshot.damage),
      attackRate: Math.min(localProgress.attackRate, snapshot.attackRate),
      projectileCount: Math.max(localProgress.projectileCount, snapshot.projectileCount),
      armor: Math.max(localProgress.armor, snapshot.armor),
      regen: Math.max(localProgress.regen, snapshot.regen),
      bootsCollected: localProgress.bootsCollected || snapshot.bootsCollected,
    };
    progressByIdentity.set(identity, localProgress);
  }

  function flushAsync(force = false): Promise<boolean> {
    if (savePromise) {
      return force
        ? savePromise.then(() => pendingProgress ? flushAsync(true) : true)
        : savePromise;
    }
    const connection = dependencies.reducers.connection();
    if (
      dependencies.reducers.protocolBlocked() ||
      dependencies.reducers.worldEntryBlocked() ||
      !connection ||
      !pendingProgress
    ) return Promise.resolve(!pendingProgress);
    if (!dependencies.worldEntryReady()) return Promise.resolve(false);
    if (!force && Date.now() < saveInFlightUntil) return Promise.resolve(false);
    const identity = dependencies.localIdentity();
    const snapshot = copyProgress(pendingProgress);
    saveInFlightUntil = Date.now() + 4_000;
    savePromise = dependencies.reducers.runWorldReducer(() => connection.reducers.savePlayerProgress(snapshot))
      .then(() => {
        if (
          identity === dependencies.localIdentity() &&
          pendingProgress &&
          sameProgressSave(pendingProgress, snapshot)
        ) {
          promoteConfirmedStats(identity, snapshot);
          clearPending(identity);
          dependencies.notify();
        }
        return true;
      })
      .catch((error) => {
        if (!dependencies.reducers.protocolBlocked()) saveInFlightUntil = 0;
        dependencies.reducers.handleFailure("progress save", error);
        return false;
      })
      .finally(() => {
        savePromise = null;
        if (
          force &&
          identity === dependencies.localIdentity() &&
          pendingProgress &&
          !sameProgressSave(pendingProgress, snapshot)
        ) {
          saveInFlightUntil = 0;
          flush(true);
        }
      });
    return savePromise;
  }

  function flush(force = false) {
    void flushAsync(force);
  }

  async function drain() {
    for (let attempt = 0; attempt < 3 && pendingProgress; attempt += 1) {
      if (!await flushAsync(true)) return false;
    }
    return !pendingProgress;
  }

  function upsertProgress(row: ProgressRow) {
    const identity = row.identity.toHexString();
    const progress: PlayerProgress = {
      maxHp: row.maxHp,
      damage: row.damage,
      attackRate: row.attackRate,
      projectileSpeed: row.projectileSpeed,
      projectileCount: row.projectileCount,
      attackRange: row.attackRange,
      armor: row.armor,
      regen: row.regen,
      speed: row.speed,
      speedOverride: Math.max(0, row.speedOverride ?? 0),
      bootsCollected: row.bootsCollected,
      inventoryJson: row.inventoryJson,
      equippedHead: row.equippedHead,
      equippedChest: row.equippedChest,
      equippedFeet: row.equippedFeet,
      equippedRightHand: row.equippedRightHand ?? "",
      equippedLeftHand: row.equippedLeftHand ?? "",
      cosmeticHead: row.cosmeticHead ?? "",
      cosmeticChest: row.cosmeticChest ?? "",
      cosmeticFeet: row.cosmeticFeet ?? "",
      cosmeticRightHand: row.cosmeticRightHand ?? "",
      cosmeticLeftHand: row.cosmeticLeftHand ?? "",
      introComplete: row.introComplete,
      desertUnlocked: row.desertUnlocked,
      snowlandsUnlocked: row.snowlandsUnlocked,
      lavaUnlocked: row.lavaUnlocked ?? false,
      infernalUnlocked: row.infernalUnlocked ?? false,
      waterUnlocked: row.waterUnlocked ?? false,
      samuraiUnlocked: row.samuraiUnlocked ?? false,
      cloudspireUnlocked: row.cloudspireUnlocked ?? false,
      bowCount: Math.max(0, Math.floor(row.bowCount ?? 0)),
      woodenArmorCount: Math.max(0, Math.floor(row.woodenArmorCount ?? 0)),
    };
    progressByIdentity.set(identity, progress);
    if (identity !== dependencies.localIdentity()) {
      if (identity === dependencies.activeProfileIdentity()) dependencies.notify();
      return;
    }
    localProgress = progress;
    dependencies.completeAccountReturn();
    if (pendingProgress && progressCovers(localProgress, pendingProgress)) clearPending();
    else flush();
    dependencies.notify();
  }

  function upsertResearch(row: { identity: Identity } & Partial<PlayerResearch>) {
    const identity = row.identity.toHexString();
    const research: PlayerResearch = {
      warcraft: row.warcraft ?? 0,
      moveSpeed: row.moveSpeed ?? 0,
      foraging: row.foraging ?? 0,
      prosperity: row.prosperity ?? 0,
      vitality: row.vitality ?? 0,
      precision: row.precision ?? 0,
      regeneration: row.regeneration ?? 0,
      criticalChance: row.criticalChance ?? 0,
      criticalDamage: row.criticalDamage ?? 0,
    };
    researchByIdentity.set(identity, research);
    if (identity !== dependencies.localIdentity()) {
      if (identity === dependencies.activeProfileIdentity()) dependencies.notify();
      return;
    }
    localResearch = research;
    dependencies.notify();
  }

  function removeResearch(row: { identity: Identity }) {
    const identity = row.identity.toHexString();
    researchByIdentity.delete(identity);
    if (identity !== dependencies.localIdentity()) return;
    localResearch = createEmptyResearchRanks();
    dependencies.notify();
  }

  function upsertActiveResearch(row: {
    identity: Identity;
    researchId: string;
    targetRank: number;
    startedAt: { microsSinceUnixEpoch: bigint };
    completesAt: { microsSinceUnixEpoch: bigint };
  }) {
    if (row.identity.toHexString() !== dependencies.localIdentity() || !isResearchId(row.researchId)) return;
    activeResearch = {
      researchId: row.researchId,
      targetRank: row.targetRank,
      startedAtMs: Number(row.startedAt.microsSinceUnixEpoch / 1_000n),
      completesAtMs: Number(row.completesAt.microsSinceUnixEpoch / 1_000n),
    };
    dependencies.notify();
  }

  function removeActiveResearch(row: { identity: Identity }) {
    if (row.identity.toHexString() !== dependencies.localIdentity()) return;
    activeResearch = null;
    dependencies.notify();
  }

  function upsertItemUpgrade(row: { identity: Identity; itemId: string; level: number }) {
    const identity = row.identity.toHexString();
    let levels = upgradeLevelsByIdentity.get(identity);
    if (!levels) {
      levels = new Map();
      upgradeLevelsByIdentity.set(identity, levels);
    }
    const previousLevel = levels.get(row.itemId) ?? 0;
    const level = normalizeItemUpgradeLevel(row.level);
    levels.set(row.itemId, level);
    if (identity === dependencies.localIdentity() && dependencies.hydrationReady() && level > previousLevel) {
      itemUpgradeListener?.({ itemId: row.itemId, level });
    }
    if (identity === dependencies.localIdentity() || identity === dependencies.activeProfileIdentity()) dependencies.notify();
  }

  function removeItemUpgrade(row: { identity: Identity; itemId: string }) {
    const identity = row.identity.toHexString();
    const levels = upgradeLevelsByIdentity.get(identity);
    levels?.delete(row.itemId);
    if (levels?.size === 0) upgradeLevelsByIdentity.delete(identity);
    if (identity === dependencies.localIdentity() || identity === dependencies.activeProfileIdentity()) dependencies.notify();
  }

  function upsertActiveItemUpgrade(row: {
    identity: Identity;
    itemId: string;
    currentLevel: number;
    targetLevel: number;
    startedAt: { microsSinceUnixEpoch: bigint };
    completesAt: { microsSinceUnixEpoch: bigint };
    paused: boolean;
    remainingMicros: bigint;
  }, slot: UpgradeBenchSlot) {
    if (row.identity.toHexString() !== dependencies.localIdentity()) return;
    activeItemUpgrades.set(slot, {
      slot,
      itemId: row.itemId,
      currentLevel: normalizeItemUpgradeLevel(row.currentLevel),
      targetLevel: normalizeItemUpgradeLevel(row.targetLevel),
      startedAtMs: Number(row.startedAt.microsSinceUnixEpoch / 1_000n),
      completesAtMs: Number(row.completesAt.microsSinceUnixEpoch / 1_000n),
      paused: row.paused,
      remainingMs: Number(row.remainingMicros / 1_000n),
    });
    dependencies.notify();
  }

  function removeActiveItemUpgrade(row: { identity: Identity }, slot: UpgradeBenchSlot) {
    if (row.identity.toHexString() !== dependencies.localIdentity()) return;
    activeItemUpgrades.delete(slot);
    dependencies.notify();
  }

  function upsertLifetime(row: LifetimeRow) {
    lifetimeByIdentity.set(row.identity.toHexString(), {
      joinedAtMs: Number(row.joinedAt.microsSinceUnixEpoch / 1_000n),
      playedSeconds: Number(row.playedMicros) / 1_000_000,
      sessionStartedAtMs: Number(row.sessionStartedAt.microsSinceUnixEpoch / 1_000n),
      enemyKills: Number(row.enemyKills),
      deathCount: Number(row.deathCount),
    });
    dependencies.notify();
  }

  function reducerResult(action: string, operation: (connection: NonNullable<ReturnType<ReducerPort["connection"]>>) => unknown) {
    return async () => {
      if (dependencies.reducers.protocolBlocked()) return { ok: false, error: "UPDATE REQUIRED" };
      const connection = dependencies.reducers.connection();
      if (!connection) return { ok: false, error: "NOT CONNECTED" };
      try {
        await dependencies.reducers.runWorldReducer(() => operation(connection));
        return { ok: true };
      } catch (error) {
        const message = dependencies.reducers.errorMessage(error);
        dependencies.reducers.handleFailure(action, error);
        return { ok: false, error: message };
      }
    };
  }

  const pageHide = () => flush(true);
  const flushTimer = window.setInterval(() => flush(), 2_500);
  window.addEventListener("pagehide", pageHide);

  return {
    tables: {
      upsertProgress,
      upsertResearch,
      removeResearch,
      upsertActiveResearch,
      removeActiveResearch,
      upsertItemUpgrade,
      removeItemUpgrade,
      upsertActiveItemUpgrade,
      removeActiveItemUpgrade,
      upsertLifetime,
      upsertGemWallet(row: { identity: Identity; balance: bigint }) {
        if (row.identity.toHexString() !== dependencies.localIdentity()) return;
        gemBalance = row.balance;
        dependencies.notify();
      },
      removeGemWallet(row: { identity: Identity }) {
        if (row.identity.toHexString() !== dependencies.localIdentity()) return;
        gemBalance = 0n;
        dependencies.notify();
      },
      upsertDailyGemBonus(row: { identity: Identity; claimableDayKey: string }) {
        if (row.identity.toHexString() !== dependencies.localIdentity()) return;
        dailyGemBonusClaimable = Boolean(row.claimableDayKey);
        dependencies.notify();
      },
      removeDailyGemBonus(row: { identity: Identity }) {
        if (row.identity.toHexString() !== dependencies.localIdentity()) return;
        dailyGemBonusClaimable = false;
        dependencies.notify();
      },
      upsertBalanceApologyNotice(row: { identity: Identity; amount: bigint }) {
        if (row.identity.toHexString() !== dependencies.localIdentity()) return;
        balanceApologyGiftAmount = row.amount;
        dependencies.notify();
      },
      removeBalanceApologyNotice(row: { identity: Identity }) {
        if (row.identity.toHexString() !== dependencies.localIdentity()) return;
        balanceApologyGiftAmount = 0n;
        dependencies.notify();
      },
      upsertUpgradeBench(row: { identity: Identity; secondSlotUnlocked: boolean }) {
        if (row.identity.toHexString() !== dependencies.localIdentity()) return;
        secondUpgradeSlotUnlocked = row.secondSlotUnlocked;
        dependencies.notify();
      },
      removeUpgradeBench(row: { identity: Identity }) {
        if (row.identity.toHexString() !== dependencies.localIdentity()) return;
        secondUpgradeSlotUnlocked = false;
        dependencies.notify();
      },
      upsertInventoryCapacity(row: { identity: Identity; slotsUnlocked: number }) {
        if (row.identity.toHexString() !== dependencies.localIdentity()) return;
        inventorySlotsUnlocked = normalizedInventorySlotsUnlocked(row.slotsUnlocked);
        dependencies.notify();
      },
      removeInventoryCapacity(row: { identity: Identity }) {
        if (row.identity.toHexString() !== dependencies.localIdentity()) return;
        inventorySlotsUnlocked = 0;
        dependencies.notify();
      },
      upsertItemDrop(row: { identity: Identity; itemId: string; alreadyOwned: boolean }) {
        if (row.identity.toHexString() !== dependencies.localIdentity() || !dependencies.hydrationReady()) return;
        itemDropListener?.({ itemId: row.itemId, alreadyOwned: row.alreadyOwned });
      },
    },
    api: {
      setOnItemDrop(callback: ((drop: { itemId: string; alreadyOwned: boolean }) => void) | null) {
        itemDropListener = callback;
      },
      setOnItemUpgrade(callback: ((upgrade: { itemId: string; level: number }) => void) | null) {
        itemUpgradeListener = callback;
      },
      gemBalance: () => gemBalance,
      dailyGemBonusClaimable: () => dailyGemBonusClaimable,
      claimDailyGemBonus: reducerResult("daily Gem claim", (connection) => connection.reducers.claimDailyGemBonus({})),
      balanceApologyGiftAmount: () => balanceApologyGiftAmount,
      acknowledgeBalanceApologyGift: reducerResult("balance apology acknowledgement", (connection) => connection.reducers.acknowledgeBalanceApologyGift({})),
      savedProgress() {
        if (!localProgress) return null;
        const progress = pendingProgress ? mergeProgress(localProgress, pendingProgress) : localProgress;
        return { ...progress };
      },
      research: () => ({ ...localResearch }),
      activeResearch: () => activeResearch ? { ...activeResearch } : null,
      itemUpgradeLevel(itemId: string, identity = dependencies.localIdentity()) {
        return upgradeLevelsByIdentity.get(identity)?.get(itemId) ?? 0;
      },
      itemUpgradeLevels(identity = dependencies.localIdentity()) {
        return upgradeLevelsFor(identity);
      },
      activeItemUpgrade(slot: UpgradeBenchSlot = 1) {
        const active = activeItemUpgrades.get(slot);
        return active ? { ...active } : null;
      },
      activeItemUpgrades() {
        return [...activeItemUpgrades.values()]
          .sort((left, right) => left.slot - right.slot)
          .map((active) => ({ ...active }));
      },
      secondUpgradeSlotUnlocked: () => secondUpgradeSlotUnlocked,
      inventorySlotsUnlocked: () => inventorySlotsUnlocked,
      async unlockInventorySlot() {
        if (dependencies.reducers.protocolBlocked()) return { ok: false, error: "UPDATE REQUIRED" };
        const connection = dependencies.reducers.connection();
        if (!connection) return { ok: false, error: "NOT CONNECTED" };
        const previous = inventorySlotsUnlocked;
        try {
          await dependencies.reducers.runWorldReducer(() => connection.reducers.unlockInventorySlot({}));
          if (inventorySlotsUnlocked === previous) {
            inventorySlotsUnlocked = normalizedInventorySlotsUnlocked(previous + 1);
            dependencies.notify();
          }
          return { ok: true };
        } catch (error) {
          const message = dependencies.reducers.errorMessage(error);
          dependencies.reducers.handleFailure("inventory slot unlock", error);
          return { ok: false, error: message };
        }
      },
      async unlockSecondUpgradeSlot() {
        const result = await reducerResult("second upgrade slot unlock", (connection) => connection.reducers.unlockSecondUpgradeSlot({}))();
        if (result.ok) {
          secondUpgradeSlotUnlocked = true;
          dependencies.notify();
        }
        return result;
      },
      startResearch(researchId: ResearchId) {
        return reducerResult("research start", (connection) => connection.reducers.startResearch({ researchId }))();
      },
      speedUpResearchWithGems: reducerResult("research speed-up", (connection) => connection.reducers.speedUpResearchWithGems({})),
      async startItemUpgrade(slot: UpgradeBenchSlot, itemId: string, position?: { x: number; y: number }) {
        if (dependencies.reducers.protocolBlocked()) return { ok: false, error: "UPDATE REQUIRED" };
        const connection = dependencies.reducers.connection();
        if (!connection) return { ok: false, error: "NOT CONNECTED" };
        try {
          if (position && ![position.x, position.y].every(Number.isFinite)) {
            return { ok: false, error: "INVALID BENCH POSITION" };
          }
          const stoppedMotion = position ? dependencies.reserveStoppedMotion() : null;
          await dependencies.reducers.runWorldReducer(async () => {
            if (dependencies.reducers.connection() !== connection) throw new Error("CONNECTION CHANGED");
            if (position && stoppedMotion) {
              await connection.reducers.updateMovementState({
                x: position.x,
                y: position.y,
                vx: 0,
                vy: 0,
                simulationTick: stoppedMotion.simulationTick,
                motionEpoch: stoppedMotion.motionEpoch,
                sequence: stoppedMotion.sequence,
              });
            }
            if (dependencies.reducers.connection() !== connection) throw new Error("CONNECTION CHANGED");
            await connection.reducers.startItemUpgrade({ slot, itemId });
          });
          if (position && stoppedMotion) dependencies.commitStoppedPosition(position, stoppedMotion.sequence);
          const currentLevel = upgradeLevelsByIdentity.get(dependencies.localIdentity())?.get(itemId) ?? 0;
          const remainingMs = itemUpgradeDurationMs(currentLevel);
          const startedAtMs = Date.now();
          activeItemUpgrades.set(slot, {
            slot,
            itemId,
            currentLevel,
            targetLevel: currentLevel + 1,
            startedAtMs,
            completesAtMs: startedAtMs + remainingMs,
            paused: false,
            remainingMs,
          });
          dependencies.notify();
          return { ok: true };
        } catch (error) {
          const message = dependencies.reducers.errorMessage(error);
          dependencies.reducers.handleFailure("item upgrade start", error);
          return { ok: false, error: message };
        }
      },
      async cancelItemUpgrade(slot: UpgradeBenchSlot = 1) {
        const result = await reducerResult("item upgrade cancel", (connection) => connection.reducers.cancelItemUpgrade({ slot }))();
        if (result.ok) {
          activeItemUpgrades.delete(slot);
          dependencies.notify();
        }
        return result;
      },
      async speedUpItemUpgradeWithGems(slot: UpgradeBenchSlot) {
        const result = await reducerResult("item upgrade speed-up", (connection) => connection.reducers.speedUpItemUpgradeWithGems({ slot }))();
        if (result.ok) {
          activeItemUpgrades.delete(slot);
          dependencies.notify();
        }
        return result;
      },
      async recordPlayerDeath() {
        if (dependencies.reducers.protocolBlocked() || !dependencies.reducers.connection()) return;
        try {
          const connection = dependencies.reducers.connection();
          if (connection) await dependencies.reducers.runWorldReducer(() => connection.reducers.recordPlayerDeath({}));
        } catch (error) {
          dependencies.reducers.handleFailure("death tracking", error);
        }
      },
      recordForestEnemyDefeat() {
        if (dependencies.reducers.protocolBlocked() || !dependencies.reducers.connection()) return;
        dependencies.reducers.sendReducer("forest enemy defeat", (connection) => connection.reducers.recordForestEnemyDefeat({}));
      },
      recordDesertEnemyDefeat() {
        if (dependencies.reducers.protocolBlocked() || !dependencies.reducers.connection()) return;
        dependencies.reducers.sendReducer("desert enemy defeat", (connection) => connection.reducers.recordDesertEnemyDefeat({}));
      },
      recordSnowEnemyDefeat() {
        if (dependencies.reducers.protocolBlocked() || !dependencies.reducers.connection()) return;
        dependencies.reducers.sendReducer("snow enemy defeat", (connection) => connection.reducers.recordSnowEnemyDefeat({}));
      },
      recordLavaEnemyDefeat() {
        if (dependencies.reducers.protocolBlocked() || !dependencies.reducers.connection()) return;
        dependencies.reducers.sendReducer("lava enemy defeat", (connection) => connection.reducers.recordLavaEnemyDefeat({}));
      },
      saveProgress(progress: ProgressSave, immediate = false) {
        persistPending(progress);
        if (immediate) {
          saveInFlightUntil = 0;
          flush(true);
        }
      },
      resetProgress() {
        if (dependencies.reducers.protocolBlocked()) return;
        clearPending();
        if (!dependencies.reducers.connection()) return;
        dependencies.reducers.sendReducer("progress reset", (connection) => connection.reducers.resetPlayerProgress({}));
      },
      beginAdventure() {
        if (dependencies.reducers.protocolBlocked() || !dependencies.reducers.connection()) return;
        dependencies.reducers.sendReducer("adventure start", (connection) => connection.reducers.beginAdventure({}));
      },
    },
    localProgress: () => localProgress,
    progressFor(identity: string) {
      const progress = progressByIdentity.get(identity);
      if (!progress || identity !== dependencies.localIdentity() || !pendingProgress) return progress;
      return mergeProgress(progress, pendingProgress);
    },
    researchFor: (identity: string) => researchByIdentity.get(identity),
    lifetimeFor: (identity: string) => lifetimeByIdentity.get(identity),
    upgradeLevelsFor,
    drainPendingProgress: drain,
    flushPendingProgress: flush,
    clearPendingProgress: clearPending,
    blockSaves() {
      saveInFlightUntil = Number.POSITIVE_INFINITY;
    },
    beginSession(identityChanged: boolean) {
      pendingProgress = store.read(dependencies.localIdentity());
      saveInFlightUntil = 0;
      if (!identityChanged) return;
      localProgress = null;
      localResearch = createEmptyResearchRanks();
      activeResearch = null;
      activeItemUpgrades.clear();
      balanceApologyGiftAmount = 0n;
      secondUpgradeSlotUnlocked = false;
      inventorySlotsUnlocked = 0;
    },
    clearProfile(identity: string) {
      progressByIdentity.delete(identity);
      researchByIdentity.delete(identity);
      upgradeLevelsByIdentity.delete(identity);
      lifetimeByIdentity.delete(identity);
    },
    clearSession() {
      gemBalance = 0n;
      dailyGemBonusClaimable = false;
      balanceApologyGiftAmount = 0n;
      secondUpgradeSlotUnlocked = false;
      inventorySlotsUnlocked = 0;
      progressByIdentity.clear();
      researchByIdentity.clear();
      upgradeLevelsByIdentity.clear();
      activeItemUpgrades.clear();
      lifetimeByIdentity.clear();
    },
    markDisconnected() {
      localResearch = createEmptyResearchRanks();
      activeResearch = null;
      activeItemUpgrades.clear();
      balanceApologyGiftAmount = 0n;
      secondUpgradeSlotUnlocked = false;
      inventorySlotsUnlocked = 0;
    },
    dispose() {
      window.clearInterval(flushTimer);
      window.removeEventListener("pagehide", pageHide);
    },
  };
}

export type ProgressionService = ReturnType<typeof createProgressionService>;
