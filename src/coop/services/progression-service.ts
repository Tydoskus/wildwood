import type { MailboxMessage } from "../../../shared/mailbox";
import { portalCutsceneBit, unlockedPortalCutsceneMask } from "../../../shared/portal-cutscenes";
import { withoutLockedEquipment } from "../../../shared/equipment-access";
import { LOADOUT_FIELDS } from "../../../shared/combat-progress";
import { withRequestDeadline } from "./request-deadline";
import type { EnemyLootRequest } from "./regular-enemy-loot-queue";
import { createRegularEnemyLootQueue, ENEMY_DEFEAT_ACK_TIMEOUT_MS } from "./regular-enemy-loot-queue";
import { REGULAR_ENEMY_LOOT_DELAY_MS } from "../../../shared/regular-map-loot";
import { ONBOARDING_DAMAGE_REWARD, ONBOARDING_REGEN_REWARD, ONBOARDING_STEP } from "../../../shared/onboarding";
import { withoutDestroyedEquipment } from "./destroyed-equipment";
import type { PendingItemGift } from "../../../shared/item-gifts";
import { createProceduralMapService } from "./procedural-map-service";
import { syncResearchNotification } from "../../app/native-research-notifications";
import type { Identity } from "spacetimedb";
import { normalizedInventorySlotsUnlocked } from "../../../shared/gems";
import { itemUpgradeDurationMs, normalizeItemUpgradeLevel } from "../../../shared/items";
import { createEmptyResearchRanks, RESEARCH_DEFINITIONS, isResearchId, type ResearchId } from "../../../shared/research";
import type {
  ActiveItemUpgrade,
  ActiveResearch,
  PlayerLifetime,
  PlayerPrestige,
  PlayerPrestigePerks,
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
import { createCutsceneHistory } from "./cutscene-history";

type ProgressionServiceDependencies = {
  reducers: ReducerPort;
  notify: () => void;
  localIdentity: () => string;
  lootTabId?: () => string;
  worldEntryReady: () => boolean;
  hydrationReady: () => boolean;
  activeProfileIdentity: () => string;
  completeAccountReturn: () => void;
  presentDeath?: () => void;
  prepareResetRoute?: () => () => Promise<void>;
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
  | "moonfenUnlocked"
  | "crystalHollowsUnlocked" | "clockworkRuinsUnlocked" | "duskfallOrchardUnlocked" | "neonBastionUnlocked" | "verdantCatacombsUnlocked" | "ionCitadelUnlocked"
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
  moonfenUnlocked?: boolean;
  crystalHollowsUnlocked?: boolean;
  clockworkRuinsUnlocked?: boolean;
  duskfallOrchardUnlocked?: boolean;
  neonBastionUnlocked?: boolean;
  verdantCatacombsUnlocked?: boolean;
  ionCitadelUnlocked?: boolean;
  bowCount?: number;
  woodenArmorCount?: number;
  cosmeticHead?: string;
  cosmeticChest?: string;
  cosmeticFeet?: string;
  cosmeticRightHand?: string;
  cosmeticLeftHand?: string;
};

type LifetimeRow = {
  chatHeartsReceived?: bigint;
  identity: Identity;
  joinedAt: { microsSinceUnixEpoch: bigint };
  playedMicros: bigint;
  sessionStartedAt: { microsSinceUnixEpoch: bigint };
  enemyKills: bigint;
  deathCount: bigint;
};
export const PROGRESS_SAVE_INTERVAL_MS = REGULAR_ENEMY_LOOT_DELAY_MS;

export function createProgressionService(dependencies: ProgressionServiceDependencies) {
  const store = createProgressStore(dependencies.storage, dependencies.pendingProgressKey);
  const cutscenes = createCutsceneHistory({
    identity: dependencies.localIdentity,
    storage: dependencies.storage,
    canSave: cutscene => Boolean(unlockedPortalCutsceneMask(localProgress) & portalCutsceneBit(cutscene)),
    send: async (cutscene, generation) => (await reducerResult("cutscene history", (connection) => connection.reducers.markPortalCutsceneSeen({ cutscene, generation }))()).ok,
  });
  const enemyLoot = createRegularEnemyLootQueue({
    identity: dependencies.localIdentity,
    tabId: dependencies.lootTabId ?? (() => "current-tab"),
    storage: dependencies.storage,
    send: sendCombatBatch,
  });
  const progressByIdentity = new Map<string, PlayerProgress>();
  const researchByIdentity = new Map<string, PlayerResearch>();
  const upgradeLevelsByIdentity = new Map<string, Map<string, number>>();
  const heartsByIdentity = new Map<string, number>();
  const lifetimeByIdentity = new Map<string, PlayerLifetime>();
  const activeItemUpgrades = new Map<UpgradeBenchSlot, ActiveItemUpgrade>();
  let localProgress: PlayerProgress | null = null;
  let localResearch: PlayerResearch = createEmptyResearchRanks();
  let activeResearch: ActiveResearch | null = null;
  let localPrestige: PlayerPrestige | null = null;
  let localPrestigePerks: PlayerPrestigePerks | null = null;
  let gemBalance = 0n;
  let dailyGemBonusClaimable = false;
  const mailboxMessages = new Map<string, MailboxMessage>();
  let balanceApologyGiftAmount = 0n;
  const itemGifts = new Map<string, PendingItemGift>();
  let secondUpgradeSlotUnlocked = false;
  let inventorySlotsUnlocked = 0;
  let onboardingStep = 0;
  let pendingProgress: ProgressSave | null = null;
  let saveInFlightUntil = 0;
  let nextPeriodicSaveAt = Date.now() + PROGRESS_SAVE_INTERVAL_MS;
  let savePromise: Promise<boolean> | null = null;
  let resetPending = false;
  let restoredSave = false;
  let itemDropListener: ((drop: { itemId: string; alreadyOwned: boolean }) => void) | null = null;
  let gemDropListener: ((drop: { amount: number }) => void) | null = null;
  // Hydration replays the standing row; only a sequence we have not seen is a new drop.
  let lastGemDropSequence = 0n;
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
    if (resetPending) return;
    pendingProgress = copyProgress(progress);
    const identity = dependencies.localIdentity();
    if (identity) pendingProgress = store.write(identity, pendingProgress);
    // Local regular-enemy rewards are optimistic. Publish that snapshot now so
    // an open own-profile view does not wait for the throttled reducer and its
    // subscribed row to make the same progress visible.
    dependencies.notify();
  }

  function flushAsync(force = false, loadoutOnly = false): Promise<boolean> {
    if (resetPending) return Promise.resolve(false);
    if (savePromise) {
      return force
        ? savePromise.then(() => pendingProgress ? flushAsync(true, loadoutOnly) : true)
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
    if (!force && Date.now() < Math.max(saveInFlightUntil, nextPeriodicSaveAt)) return Promise.resolve(false);
    // Equipment acknowledgements must not clear the prediction for a kill batch
    // that is still on its way to the server.
    if (!loadoutOnly && enemyLoot.hasPending()) return enemyLoot.flush(force).then(ok => ok ? flushAsync(force) : false);
    if (localProgress && LOADOUT_FIELDS.every(field => pendingProgress![field] === localProgress![field])) {
      if (!enemyLoot.hasPending()) clearPending();
      return Promise.resolve(true);
    }
    const identity = dependencies.localIdentity();
    const snapshot = copyProgress(pendingProgress);
    saveInFlightUntil = Date.now() + 30_000;
    nextPeriodicSaveAt = Date.now() + PROGRESS_SAVE_INTERVAL_MS;
    savePromise = dependencies.reducers.runWorldReducer(() => connection.reducers.savePlayerProgress(snapshot))
      .then(() => {
        if (
          identity === dependencies.localIdentity() &&
          pendingProgress &&
          sameProgressSave(pendingProgress, snapshot) && !enemyLoot.hasPending()
        ) {
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

  async function sendCombatBatch(request: EnemyLootRequest): Promise<boolean | "discard" | "throttled"> {
    if (!dependencies.worldEntryReady() || !dependencies.hydrationReady() || dependencies.reducers.worldEntryBlocked() || resetPending) return false;
    // Validate a boss against the loadout actually used, not a stale empty slot.
    // Saving equipment never trusts client stat totals or clears pending kills.
    if (request.enemies.some(entry => entry.enemy === "boss") && pendingProgress
      && (!localProgress || LOADOUT_FIELDS.some(field => pendingProgress![field] !== localProgress![field]))) {
      if (!await flushAsync(true, true)) return false;
    }
    const result = await reducerResult("enemy defeats", connection => withRequestDeadline(connection.reducers.recordEnemyDefeats({
      streamId: request.streamId, sequence: request.sequence, mapId: request.mapId, enemies: request.enemies,
    }), ENEMY_DEFEAT_ACK_TIMEOUT_MS))();
    if (!result.ok && /Enemy defeats belong to another map|Invalid enemy for this map/.test(result.error ?? "")) return "discard";
    if (!result.ok && /Enemy rewards are catching up/.test(result.error ?? "")) return "throttled";
    return result.ok;
  }

  function flush(force = false) {
    void enemyLoot.flush(force);
    void cutscenes.flush();
    void flushAsync(force);
  }

  async function drain() {
    if (!await enemyLoot.flush(true)) return false;
    if (!await cutscenes.flush()) return false;
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
      moonfenUnlocked: row.moonfenUnlocked ?? false,
      crystalHollowsUnlocked: row.crystalHollowsUnlocked ?? false, clockworkRuinsUnlocked: row.clockworkRuinsUnlocked ?? false, duskfallOrchardUnlocked: row.duskfallOrchardUnlocked ?? false, neonBastionUnlocked: row.neonBastionUnlocked ?? false, verdantCatacombsUnlocked: row.verdantCatacombsUnlocked ?? false, ionCitadelUnlocked: row.ionCitadelUnlocked ?? false,
      bowCount: Math.max(0, Math.floor(row.bowCount ?? 0)),
      woodenArmorCount: Math.max(0, Math.floor(row.woodenArmorCount ?? 0)),
    };
    progressByIdentity.set(identity, progress);
    if (identity !== dependencies.localIdentity()) {
      if (identity === dependencies.activeProfileIdentity()) dependencies.notify();
      return;
    }
    localProgress = progress;
    if (pendingProgress) pendingProgress = withoutLockedEquipment(pendingProgress, progress, progress);
    void cutscenes.flush();
    if (restoredSave && pendingProgress) {
      pendingProgress = { ...pendingProgress, maxHp: progress.maxHp, damage: progress.damage,
        attackRate: progress.attackRate, armor: progress.armor, regen: progress.regen,
        projectileCount: progress.projectileCount, bootsCollected: progress.bootsCollected };
    }
    restoredSave = false;
    dependencies.completeAccountReturn();
    if (pendingProgress && progressCovers(localProgress, pendingProgress)) clearPending();
    else void flushAsync();
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
    void syncResearchNotification({ owner: dependencies.localIdentity(), ...activeResearch, title: RESEARCH_DEFINITIONS[row.researchId].title });
    dependencies.notify();
  }

  function removeActiveResearch(row: { identity: Identity }) {
    if (row.identity.toHexString() !== dependencies.localIdentity()) return;
    void syncResearchNotification(null);
    activeResearch = null;
    dependencies.notify();
  }

  function upsertPrestige(row: {
    identity: Identity;
    level: number;
    perkPoints: number;
    peakPower: number;
    prestigedAt: { microsSinceUnixEpoch: bigint };
  }) {
    if (row.identity.toHexString() !== dependencies.localIdentity()) return;
    localPrestige = {
      level: row.level,
      perkPoints: row.perkPoints,
      peakPower: row.peakPower,
      prestigedAtMs: Number(row.prestigedAt.microsSinceUnixEpoch / 1_000n),
    };
    dependencies.notify();
  }

  function removePrestige(row: { identity: Identity }) {
    if (row.identity.toHexString() !== dependencies.localIdentity()) return;
    localPrestige = null;
    dependencies.notify();
  }

  function upsertPrestigePerk(row: {
    identity: Identity;
    keenEdge: number;
    doubleStrike: number;
    splitShot: number;
    riposte: number;
  }) {
    if (row.identity.toHexString() !== dependencies.localIdentity()) return;
    localPrestigePerks = {
      keenEdge: row.keenEdge,
      doubleStrike: row.doubleStrike,
      splitShot: row.splitShot,
      riposte: row.riposte,
    };
    dependencies.notify();
  }

  function removePrestigePerk(row: { identity: Identity }) {
    if (row.identity.toHexString() !== dependencies.localIdentity()) return;
    localPrestigePerks = null;
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
      chatHeartsReceived: heartsByIdentity.get(row.identity.toHexString()) ?? Number(row.chatHeartsReceived ?? 0n),
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
  const flushTimer = window.setInterval(() => flush(), PROGRESS_SAVE_INTERVAL_MS);
  window.addEventListener("pagehide", pageHide);

  return {
    tables: {
      upsertCutsceneHistory(row: { identity: Identity; seenMask: number; generation: number }) {
        cutscenes.upsert(row.identity.toHexString(), row.seenMask, row.generation);
        dependencies.notify();
      },
      removeCutsceneHistory(row: { identity: Identity }) {
        if (row.identity.toHexString() === dependencies.localIdentity()) cutscenes.clear();
      },
      upsertProgress,
      upsertResearch,
      removeResearch,
      upsertActiveResearch,
      removeActiveResearch,
      upsertPrestige,
      removePrestige,
      upsertPrestigePerk,
      removePrestigePerk,
      upsertItemUpgrade,
      removeItemUpgrade,
      upsertActiveItemUpgrade,
      removeActiveItemUpgrade,
      upsertLifetime,
      upsertChatHearts(row: { identity: Identity; chatHeartsReceived: bigint }) {
        const key = row.identity.toHexString(), count = Number(row.chatHeartsReceived);
        heartsByIdentity.set(key, count);
        const lifetime = lifetimeByIdentity.get(key);
        if (lifetime) lifetimeByIdentity.set(key, { ...lifetime, chatHeartsReceived: count });
        dependencies.notify();
      },
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
      upsertOnboarding(row: { identity: Identity; step: number }) {
        if (row.identity.toHexString() !== dependencies.localIdentity()) return;
        onboardingStep = row.step;
        dependencies.notify();
      },
      removeOnboarding(row: { identity: Identity }) {
        if (row.identity.toHexString() !== dependencies.localIdentity()) return;
        onboardingStep = 0;
        dependencies.notify();
      },
      upsertItemGift(row: PendingItemGift & { identity: Identity }) {
        if (row.identity.toHexString() !== dependencies.localIdentity()) return;
        itemGifts.set(row.key, { key: row.key, itemId: row.itemId });
        dependencies.notify();
      },
      removeItemGift(row: { key: string; identity: Identity }) {
        if (row.identity.toHexString() !== dependencies.localIdentity()) return;
        itemGifts.delete(row.key);
        dependencies.notify();
      },
      upsertMailbox(row: Omit<MailboxMessage, "createdAtMs"> & { createdAt: { microsSinceUnixEpoch: bigint } }) {
        mailboxMessages.set(row.id, { ...row, createdAtMs: Number(row.createdAt.microsSinceUnixEpoch / 1000n) });
        dependencies.notify();
      },
      removeMailbox(row: { id: string }) {
        mailboxMessages.delete(row.id);
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
      upsertGemDrop(row: { identity: Identity; amount: number; sequence: bigint }) {
        if (row.identity.toHexString() !== dependencies.localIdentity()) return;
        if (row.sequence <= lastGemDropSequence) return;
        lastGemDropSequence = row.sequence;
        if (!dependencies.hydrationReady()) return;
        gemDropListener?.({ amount: row.amount });
      },
    },
    api: {
      ...createProceduralMapService(dependencies.reducers),
      hasSeenPortalCutscene: cutscenes.hasSeen,
      markPortalCutsceneSeen: cutscenes.mark,
      setOnItemDrop(callback: ((drop: { itemId: string; alreadyOwned: boolean }) => void) | null) {
        itemDropListener = callback;
      },
      setOnGemDrop(callback: ((drop: { amount: number }) => void) | null) {
        gemDropListener = callback;
      },
      setOnItemUpgrade(callback: ((upgrade: { itemId: string; level: number }) => void) | null) {
        itemUpgradeListener = callback;
      },
      mailboxMessages: () => [...mailboxMessages.values()].sort((a, b) => b.createdAtMs - a.createdAtMs),
      readMailboxLetter: (id: string) => reducerResult("mail read", connection => connection.reducers.readMailboxLetter({ id }))(),
      requestAccountDeletion: () => reducerResult("account deletion", connection => connection.reducers.requestAccountDeletion({ confirmation: "DELETE" }))(),
      claimMailboxGift: (id: string) => reducerResult("mail gift", async connection => {
        if (!await drain()) throw new Error("Progress is still syncing. Try again shortly.");
        if (connection !== dependencies.reducers.connection() || !dependencies.worldEntryReady()) throw new Error("Reconnect to claim your gift.");
        await connection.reducers.claimMailboxGift({ id });
      })(),
      gemBalance: () => gemBalance,
      dailyGemBonusClaimable: () => dailyGemBonusClaimable,
      claimDailyGemBonus: reducerResult("daily Gem claim", (connection) => connection.reducers.claimDailyGemBonus({})),
      pendingItemGift: (): PendingItemGift | null => dependencies.worldEntryReady() && !dependencies.reducers.worldEntryBlocked()
        ? itemGifts.values().next().value ?? null : null,
      claimItemGift: (key: string) => reducerResult("item gift claim", async connection => {
        if (dependencies.reducers.worldEntryBlocked() || !dependencies.worldEntryReady()) throw new Error("Reconnect to claim your gift.");
        if (!await drain()) throw new Error("Progress is still syncing. Try again shortly.");
        if (connection !== dependencies.reducers.connection() || dependencies.reducers.worldEntryBlocked() || !dependencies.worldEntryReady()) throw new Error("Session changed. Try again.");
        await connection.reducers.claimDeveloperItemGift({ key });
      })(),
      balanceApologyGiftAmount: () => balanceApologyGiftAmount,
      acknowledgeBalanceApologyGift: reducerResult("balance apology acknowledgement", (connection) => connection.reducers.acknowledgeBalanceApologyGift({})),
      savedProgress() {
        if (!localProgress) return null;
        const progress = pendingProgress ? mergeProgress(localProgress, pendingProgress) : localProgress;
        return { ...progress };
      },
      research: () => ({ ...localResearch }),
      activeResearch: () => activeResearch ? { ...activeResearch } : null,
      prestige: () => localPrestige ? { ...localPrestige } : null,
      prestigePerks: (): PlayerPrestigePerks => localPrestigePerks
        ? { ...localPrestigePerks }
        : { keenEdge: 0, doubleStrike: 0, splitShot: 0, riposte: 0 },
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
      async destroyEquipment(itemId: string) {
        const identity = dependencies.localIdentity();
        const result = await reducerResult("destroy equipment", (connection) => connection.reducers.destroyEquipment({ itemId }))();
        if (result.ok && identity !== dependencies.localIdentity()) return { ok: false, error: "ACCOUNT CHANGED" };
        if (result.ok) {
          if (localProgress) {
            localProgress = withoutDestroyedEquipment(localProgress, itemId);
            progressByIdentity.set(identity, localProgress);
          }
          if (pendingProgress) pendingProgress = store.write(identity, withoutDestroyedEquipment(pendingProgress, itemId));
          upgradeLevelsByIdentity.get(identity)?.delete(itemId);
          dependencies.notify();
        }
        return result;
      },
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
      prestigeAccount: reducerResult("prestige", (connection) => connection.reducers.prestigeAccount({})),
      spendPrestigePerkPoint(perk: string) {
        return reducerResult("prestige perk point spend", (connection) => connection.reducers.spendPrestigePerkPoint({ perk }))();
      },
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
              await connection.reducers.prepareWorldActionPosition({
                x: position.x,
                y: position.y,
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
        dependencies.presentDeath?.();
        if (dependencies.reducers.protocolBlocked() || !dependencies.reducers.connection()) return;
        try {
          const connection = dependencies.reducers.connection();
          if (connection) await dependencies.reducers.runWorldReducer(() => connection.reducers.recordPlayerDeath({}));
        } catch (error) {
          dependencies.reducers.handleFailure("death tracking", error);
        }
      },
      recordRegularEnemyDefeat(mapId: string, enemy: string) {
        if (resetPending || dependencies.reducers.protocolBlocked() || dependencies.reducers.worldEntryBlocked()) return;
        enemyLoot.record(mapId, enemy);
        if (enemy === "boss") void enemyLoot.flush(true);
      },
      saveProgress(progress: ProgressSave, immediate = false) {
        persistPending(progress);
        if (immediate) {
          saveInFlightUntil = 0;
          flush(true);
        }
      },
      async resetProgress(): Promise<{ ok: boolean; error?: string; restartError?: string }> {
        if (dependencies.reducers.protocolBlocked()) return { ok: false, error: "UPDATE REQUIRED" };
        if (resetPending) return { ok: false, error: "A character reset is already pending." };
        const connection = dependencies.reducers.connection();
        if (!connection) return { ok: false, error: "NOT CONNECTED" };
        const identity = dependencies.localIdentity();
        resetPending = true;
        try {
          // A save dispatched before reset must finish first. Keep unsent rewards
          // recoverable until the server actually acknowledges the reset.
          if (savePromise) await savePromise;
          if (identity !== dependencies.localIdentity() || connection !== dependencies.reducers.connection()) {
            return { ok: false, error: "Your session changed. Reopen Settings to reset this character." };
          }
          const finishRoute = dependencies.prepareResetRoute?.();
          const result = await reducerResult("progress reset", (active) => active.reducers.resetPlayerProgress({}))();
          if (result.ok) clearPending(identity);
          if (identity !== dependencies.localIdentity()) {
            return { ok: false, error: "Your character changed. Reopen Settings before resetting again." };
          }
          if (connection !== dependencies.reducers.connection()) {
            return result.ok
              ? { ok: true, restartError: "Your connection changed. Reconnect to finish the reset." }
              : { ok: false, error: "Your connection changed. Reconnect to check the character reset." };
          }
          if (result.ok) {
            void syncResearchNotification(null);
            enemyLoot.reset();
            cutscenes.reset();
            let restartError: string | undefined;
            try { await finishRoute?.(); }
            catch (error) { restartError = dependencies.reducers.errorMessage(error); }
            if (identity !== dependencies.localIdentity()) return { ok: false, error: "Your character changed. Reopen Settings before resetting again." };
            if (restartError) return { ok: true, restartError };
          }
          return result;
        } finally { resetPending = false; }
      },
      onboardingStep: () => onboardingStep,
      async completeOnboardingStep(step: number) {
        const identity = dependencies.localIdentity();
        const before = localProgress;
        const previousStep = onboardingStep;
        const result = await reducerResult("tutorial", connection => connection.reducers.completeOnboardingStep({ step }))();
        if (result.ok && identity === dependencies.localIdentity()) {
          onboardingStep = Math.max(onboardingStep, step);
          if (before && localProgress && previousStep < step) {
            localProgress = { ...localProgress,
              damage: Math.max(localProgress.damage, before.damage + (step === ONBOARDING_STEP.regen ? ONBOARDING_DAMAGE_REWARD : 0)),
              regen: Math.max(localProgress.regen, before.regen + (step === ONBOARDING_STEP.death ? ONBOARDING_REGEN_REWARD : 0)),
            };
            progressByIdentity.set(identity, localProgress);
          }
          dependencies.notify();
        }
        return result;
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
    drainEnemyLoot: () => enemyLoot.flush(true),
    drainPendingProgress: drain,
    flushPendingProgress: flush,
    clearPendingProgress: clearPending,
    blockSaves() {
      saveInFlightUntil = Number.POSITIVE_INFINITY;
    },
    beginSession(identityChanged: boolean) {
      enemyLoot.begin();
      cutscenes.begin();
      pendingProgress = store.read(dependencies.localIdentity());
      restoredSave = true;
      saveInFlightUntil = 0;
      if (!identityChanged) return;
      void syncResearchNotification(null);
      localProgress = null;
      localResearch = createEmptyResearchRanks();
      activeResearch = null;
      localPrestige = null;
      localPrestigePerks = null;
      activeItemUpgrades.clear();
      balanceApologyGiftAmount = 0n;
      itemGifts.clear();
      mailboxMessages.clear();
      onboardingStep = 0;
      secondUpgradeSlotUnlocked = false;
      inventorySlotsUnlocked = 0;
    },
    clearProfile(identity: string) {
      progressByIdentity.delete(identity);
      researchByIdentity.delete(identity);
      upgradeLevelsByIdentity.delete(identity);
      lifetimeByIdentity.delete(identity); heartsByIdentity.delete(identity);
    },
    clearSession() {

      enemyLoot.clear();
      cutscenes.clear();
      gemBalance = 0n;
      dailyGemBonusClaimable = false;
      balanceApologyGiftAmount = 0n;
      itemGifts.clear();
      mailboxMessages.clear();
      onboardingStep = 0;
      secondUpgradeSlotUnlocked = false;
      inventorySlotsUnlocked = 0;
      progressByIdentity.clear();
      researchByIdentity.clear();
      upgradeLevelsByIdentity.clear();
      activeItemUpgrades.clear();
      lifetimeByIdentity.clear(); heartsByIdentity.clear();
    },
    markDisconnected() {
      localResearch = createEmptyResearchRanks();
      activeResearch = null;
      localPrestige = null;
      localPrestigePerks = null;
      activeItemUpgrades.clear();
      balanceApologyGiftAmount = 0n;
      itemGifts.clear();
      mailboxMessages.clear();
      onboardingStep = 0;
      secondUpgradeSlotUnlocked = false;
      inventorySlotsUnlocked = 0;
    },
    dispose() {

      enemyLoot.clear();
      window.clearInterval(flushTimer);
      window.removeEventListener("pagehide", pageHide);
    },
  };
}

export type ProgressionService = ReturnType<typeof createProgressionService>;
