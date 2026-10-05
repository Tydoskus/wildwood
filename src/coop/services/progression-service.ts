import type { PrestigeChallenge } from "../../../shared/prestige-challenge";
import { prestigeBonusesOff, type AggroChallenge } from "../../../shared/aggro-challenge";
import { parseDailyQuests, type DailyQuest } from "../../../shared/daily-quests";

export type DailyQuestState = { day: number; quests: DailyQuest[]; bonus: number; guildPoints: number; guildName: string };
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
import { serverLoadoutChanges, withServerLoadout, type ServerLoadoutChange } from "./server-loadout";
import { cosmeticUnlocks } from "../../../shared/cosmetic-conversion";
import type { PendingItemGift } from "../../../shared/item-gifts";
import { createProceduralMapService } from "./procedural-map-service";
import { syncResearchNotification } from "../../app/native-research-notifications";
import type { Identity } from "spacetimedb";
import { normalizedInventorySlotsUnlocked } from "../../../shared/gems";
import { itemUpgradeDurationMs, type UpgradeSlot } from "../../../shared/items";
import { slotUpgradeDurationWithResearch } from "../../../shared/utility-research";
import { normalizeSlotTier, upgradeSlotForItem } from "../../../shared/slot-upgrades";
import { createEmptyResearchRanks, RESEARCH_DEFINITIONS, isResearchId, type ResearchId } from "../../../shared/research";
import type {
  ActiveItemUpgrade,
  ActiveResearch,
  PausedResearch,
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
import { recordConnectionDiagnostic } from "./connection-diagnostic-runtime";
import { createCutsceneHistory } from "./cutscene-history";
import { monotonicNowMs, nativeTimers } from "../../app/trusted-clock";

/** Slots the server changed by itself, the row they came in, and whether it is live rather than a reconnect's replay. */
export type ServerEquip = { changes: readonly ServerLoadoutChange[]; progress: PlayerProgress; live: boolean };

type ProgressionServiceDependencies = {
  reducers: ReducerPort;
  notify: () => void;
  localIdentity: () => string;
  lootTabId?: () => string;
  /** Whether the code claiming the game bridge is the game bundle itself (see game-script-gate.ts). */
  gameBridgeCaller?: () => boolean;
  worldEntryReady: () => boolean;
  hydrationReady: () => boolean;
  activeProfileIdentity: () => string;
  completeAccountReturn: () => void;
  reserveStoppedMotion: () => { sequence: number; simulationTick: number; motionEpoch: number };
  commitStoppedPosition: (position: { x: number; y: number }, sequence: number) => void;
  storage: Storage;
  pendingProgressKey: string;
};

/** What the game bundle gets from claimGameBridge: the only way to report a kill. */
export type GameBridge = {
  recordRegularEnemyDefeat(mapId: string, enemy: string, autoFarm?: boolean): void;
  /** The player attacked or was hit: the game time from here on is combat the next report claims. */
  engaged(): void;
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
/**
 * How long a kill's optimistic progress may wait before it is copied to local
 * storage. The loot queue already stores each kill as the durable claim; this
 * copy only restores the prediction after a reload, so it is written at most
 * this often, and at once when the page hides or the store is read back.
 */
export const PROGRESS_STORE_WRITE_DELAY_MS = 2_000;
/**
 * The periodic flush timer fires every REGULAR_ENEMY_LOOT_DELAY_MS, but no timer
 * lands on the millisecond. Without this slack a tick a hair early would find
 * the last report not quite thirty seconds old and skip a whole period.
 */
export const KILL_REPORT_CADENCE_SLACK_MS = 1_000;

export function createProgressionService(dependencies: ProgressionServiceDependencies) {
  const store = createProgressStore(dependencies.storage, dependencies.pendingProgressKey);
  const cutscenes = createCutsceneHistory({
    identity: dependencies.localIdentity,
    storage: dependencies.storage,
    canSave: cutscene => Boolean(unlockedPortalCutsceneMask(localProgress) & portalCutsceneBit(cutscene)),
    send: async (cutscene, generation) => (await reducerResult("cutscene history", (connection) => connection.reducers.markPortalCutsceneSeen({ cutscene, generation }))()).ok,
  });
  // The game session's simulated seconds, handed over once by claimGameBridge.
  let gameSimulatedSeconds: (() => number) | null = null;
  let gameBridgeClaimed = false;
  const enemyLoot = createRegularEnemyLootQueue({
    identity: dependencies.localIdentity,
    tabId: dependencies.lootTabId ?? (() => "current-tab"),
    storage: dependencies.storage,
    send: sendCombatBatch,
    simulatedSeconds: () => gameSimulatedSeconds?.() ?? 0,
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
  /** Research set aside with the time it still needs, by research id. */
  const pausedResearch = new Map<ResearchId, PausedResearch>();
  let localPrestige: PlayerPrestige | null = null;
  let localPrestigePerks: PlayerPrestigePerks | null = null;
  let expansionPerks = { bossSlayer: 0, secondWind: 0, longShot: 0, fleetFoot: 0 };
  let prestigeExpansionUnlocksAt: number | null = null;
  let prestigeChallenge: PrestigeChallenge = { active: false, completed: 0 };
  let challengeParked = false;
  let aggroChallenge: AggroChallenge = { active: false, completed: 0 };
  let aggroParked = false;
  let freeRespecUsed = false;
  let dailyQuest: DailyQuestState | null = null;
  const guildQuestWeeks = new Map<string, { week: number; guildId: string; guildName: string; points: number }>();
  let gemBalance = 0n;
  let dailyGemBonusClaimable = false;
  const mailboxMessages = new Map<string, MailboxMessage>();
  let balanceApologyGiftAmount = 0n;
  const itemGifts = new Map<string, PendingItemGift>();
  let secondUpgradeSlotUnlocked = false;
  let thirdUpgradeSlotUnlocked = false;
  let inventorySlotsUnlocked = 0;
  let onboardingStep = 0;
  let pendingProgress: ProgressSave | null = null;
  let deferredStoreWrite: { identity: string; progress: ProgressSave; timer: ReturnType<typeof setTimeout> } | null = null;
  let saveInFlightUntil = 0;
  let nextPeriodicSaveAt = monotonicNowMs() + PROGRESS_SAVE_INTERVAL_MS;
  // When the last kill report was sent. Ordinary reports go every thirty seconds
  // and no sooner; see flushEnemyLoot.
  let lastKillReportAt = monotonicNowMs();
  let savePromise: Promise<boolean> | null = null;
  let resetPending = false;
  let restoredSave = false;
  let itemDropListener: ((drop: { itemId: string; alreadyOwned: boolean }) => void) | null = null;
  let gemDropListener: ((drop: { amount: number }) => void) | null = null;
  // Hydration replays the standing row; only a sequence we have not seen is a new drop.
  let lastGemDropSequence = 0n;
  let itemUpgradeListener: ((upgrade: { itemId: string; level: number }) => void) | null = null;
  let serverEquipListener: ((equip: ServerEquip) => void) | null = null;

  function upgradeLevelsFor(identity: string) {
    return Object.fromEntries(upgradeLevelsByIdentity.get(identity)?.entries() ?? []);
  }

  function clearPending(identity = dependencies.localIdentity()) {
    if (identity === dependencies.localIdentity()) {
      pendingProgress = null;
      saveInFlightUntil = 0;
    }
    cancelStoreWrite(identity);
    store.clear(identity);
  }

  function cancelStoreWrite(identity?: string) {
    if (!deferredStoreWrite || (identity !== undefined && deferredStoreWrite.identity !== identity)) return;
    clearTimeout(deferredStoreWrite.timer);
    deferredStoreWrite = null;
  }

  function flushStoreWrite() {
    const write = deferredStoreWrite;
    if (!write) return;
    cancelStoreWrite();
    store.write(write.identity, write.progress);
  }

  /** Writes now, superseding a deferred write of the same identity's older snapshot. */
  function writeStore(identity: string, progress: ProgressSave) {
    cancelStoreWrite(identity);
    return store.write(identity, progress);
  }

  function deferStoreWrite(identity: string, progress: ProgressSave) {
    if (deferredStoreWrite && deferredStoreWrite.identity !== identity) flushStoreWrite();
    // Throttle, not debounce: continuous auto-farm kills must still land.
    if (deferredStoreWrite) deferredStoreWrite.progress = progress;
    else deferredStoreWrite = { identity, progress, timer: setTimeout(flushStoreWrite, PROGRESS_STORE_WRITE_DELAY_MS) };
  }

  function persistPending(progress: ProgressSave, immediate: boolean) {
    if (resetPending) return;
    // A game-frame save can still carry the loadout from before prestige or
    // reconnect hydration. Never put locked gear back into the retry queue.
    pendingProgress = copyProgress(localProgress ? withoutLockedEquipment(progress, localProgress, localProgress) : progress);
    const identity = dependencies.localIdentity();
    if (identity && immediate) pendingProgress = writeStore(identity, pendingProgress);
    else if (identity) deferStoreWrite(identity, pendingProgress);
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
    if (!dependencies.worldEntryReady() || !dependencies.hydrationReady()) return Promise.resolve(false);
    if (!force && monotonicNowMs() < Math.max(saveInFlightUntil, nextPeriodicSaveAt)) return Promise.resolve(false);
    // Equipment acknowledgements must not clear the prediction for a kill batch
    // that is still on its way to the server. Kills wait for their thirty-second
    // report, but a changed loadout does not wait behind them: while the kills
    // are held back, save it on its own.
    if (!loadoutOnly && enemyLoot.hasPending()) return flushEnemyLoot(force).then(ok => ok ? flushAsync(force) : force ? false : flushAsync(false, true));
    if (localProgress) pendingProgress = withoutLockedEquipment(pendingProgress, localProgress, localProgress);
    if (localProgress && LOADOUT_FIELDS.every(field => pendingProgress![field] === localProgress![field])) {
      if (!enemyLoot.hasPending()) clearPending();
      return Promise.resolve(true);
    }
    const identity = dependencies.localIdentity();
    const snapshot = copyProgress(pendingProgress);
    saveInFlightUntil = monotonicNowMs() + 30_000;
    nextPeriodicSaveAt = monotonicNowMs() + PROGRESS_SAVE_INTERVAL_MS;
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

  /**
   * Sends queued kills. A forced flush (portal drain, boss kill, page hide,
   * update drain, immediate save) goes at once. Anything else waits until the
   * last report is thirty seconds old. Every acknowledgement updates the
   * progress row, and the row's handler flushes again; nextPeriodicSaveAt only
   * moves when progress itself is saved, so after the first thirty seconds that
   * chain used to send a fresh report on every acknowledgement.
   */
  function flushEnemyLoot(force: boolean) {
    if (!force && monotonicNowMs() - lastKillReportAt < REGULAR_ENEMY_LOOT_DELAY_MS - KILL_REPORT_CADENCE_SLACK_MS) {
      return Promise.resolve(false);
    }
    return enemyLoot.flush(force);
  }

  async function sendCombatBatch(request: EnemyLootRequest): Promise<boolean | "discard" | "throttled"> {
    if (!dependencies.worldEntryReady() || !dependencies.hydrationReady() || dependencies.reducers.worldEntryBlocked() || resetPending) return false;
    // The cadence runs from reports that go out, so a flush that could not send
    // (a reconnect still hydrating) does not hold the kills back another thirty seconds.
    lastKillReportAt = monotonicNowMs();
    // Validate a boss against the loadout actually used, not a stale empty slot.
    // Saving equipment never trusts client stat totals or clears pending kills.
    if (request.enemies.some(entry => entry.enemy === "boss") && pendingProgress
      && (!localProgress || LOADOUT_FIELDS.some(field => pendingProgress![field] !== localProgress![field]))) {
      if (!await flushAsync(true, true)) return false;
    }
    // simulatedMillis is how much game time this tab ran since its previous
    // report; the server holds kills to what that much play could produce.
    const result = await reducerResult("enemy defeats", connection => withRequestDeadline(
      (request.autoFarm ? connection.reducers.reportAutoFarmEnemyDefeats : connection.reducers.reportEnemyDefeats)({
        streamId: request.streamId, sequence: request.sequence, mapId: request.mapId,
        simulatedMillis: request.simulatedMillis, enemies: request.enemies }), ENEMY_DEFEAT_ACK_TIMEOUT_MS))();
    if (!result.ok && /Enemy defeats belong to another map|Invalid enemy for this map/.test(result.error ?? "")) {
      // These kills are gone. Write down how many and where, so a loss that
      // used to be invisible can be counted and its cause found.
      recordConnectionDiagnostic("rewards-discarded", { detail: `${request.mapId}: ${request.count} kills: ${result.error}` });
      return "discard";
    }
    if (!result.ok && /Enemy rewards are catching up/.test(result.error ?? "")) return "throttled";
    return result.ok;
  }

  function flush(force = false) {
    flushStoreWrite();
    void flushEnemyLoot(force);
    void cutscenes.flush();
    void flushAsync(force);
  }

  async function drain() {
    flushStoreWrite();
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
      bossRewardClaims: row.bossRewardClaims ?? 0,
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
      cosmeticItemsJson: row.cosmeticItemsJson ?? "[]",
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
    // Gear the server put on by itself (auto equip, prestige) is taken into the
    // queued save and the bag here, before anything saves the old loadout back.
    const serverEquips = serverLoadoutChanges(localProgress, progress, pendingProgress);
    localProgress = progress;
    if (pendingProgress && serverEquips.length) pendingProgress = withServerLoadout(pendingProgress, serverEquips);
    if (serverEquips.length) serverEquipListener?.({ changes: serverEquips, progress, live: dependencies.hydrationReady() });
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
      researchSpeed: row.researchSpeed ?? 0,
      slotUpgradeSpeed: row.slotUpgradeSpeed ?? 0,
      enemyRespawn: row.enemyRespawn ?? 0,
      bossRespawn: row.bossRespawn ?? 0,
      offlineWindow: row.offlineWindow ?? 0,
      utilityMoveSpeed: row.utilityMoveSpeed ?? 0,
      utilityAttackRange: row.utilityAttackRange ?? 0,
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

  function upsertPausedResearch(row: { identity: Identity; researchId: string; targetRank: number; remainingMicros: bigint }) {
    if (row.identity.toHexString() !== dependencies.localIdentity() || !isResearchId(row.researchId)) return;
    pausedResearch.set(row.researchId, { researchId: row.researchId, targetRank: row.targetRank, remainingMs: Number(row.remainingMicros / 1_000n) });
    dependencies.notify();
  }

  function removePausedResearch(row: { identity: Identity; researchId: string }) {
    if (row.identity.toHexString() !== dependencies.localIdentity() || !isResearchId(row.researchId)) return;
    pausedResearch.delete(row.researchId);
    dependencies.notify();
  }

  function removeActiveResearch(row: { identity: Identity }) {
    if (row.identity.toHexString() !== dependencies.localIdentity()) return;
    void syncResearchNotification(null);
    activeResearch = null;
    dependencies.notify();
  }

  // Every prestiged player's level, so the badge beside a name resolves for
  // anyone on screen, not only for the local player whose full record we keep.
  const prestigeLevelByIdentity = new Map<string, number>();
  function upsertPrestige(row: {
    identity: Identity;
    level: number;
    perkPoints: number;
    peakPower: number;
    prestigedAt: { microsSinceUnixEpoch: bigint };
  }) {
    const identity = row.identity.toHexString();
    if (row.level > 0) prestigeLevelByIdentity.set(identity, row.level); else prestigeLevelByIdentity.delete(identity);
    if (identity !== dependencies.localIdentity()) { dependencies.notify(); return; }
    localPrestige = {
      level: row.level,
      perkPoints: row.perkPoints,
      peakPower: row.peakPower,
      prestigedAtMs: Number(row.prestigedAt.microsSinceUnixEpoch / 1_000n),
    };
    dependencies.notify();
  }

  function removePrestige(row: { identity: Identity }) {
    const identity = row.identity.toHexString();
    prestigeLevelByIdentity.delete(identity);
    if (identity !== dependencies.localIdentity()) { dependencies.notify(); return; }
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
    if (row.identity.toHexString() !== dependencies.localIdentity()) { dependencies.notify(); return; }
    localPrestigePerks = {
      keenEdge: row.keenEdge,
      doubleStrike: row.doubleStrike,
      splitShot: row.splitShot,
      riposte: row.riposte,
    };
    dependencies.notify();
  }

  function upsertPrestigeChallenge(row: PrestigeChallenge & { identity: Identity }) {
    if (row.identity.toHexString() !== dependencies.localIdentity()) return;
    prestigeChallenge = { active: row.active, completed: row.completed };
    dependencies.notify();
  }
  function removePrestigeChallenge(row: { identity: Identity }) {
    if (row.identity.toHexString() !== dependencies.localIdentity()) return;
    prestigeChallenge = { active: false, completed: 0 };
    dependencies.notify();
  }
  function upsertAggroChallenge(row: AggroChallenge & { identity: Identity }) {
    if (row.identity.toHexString() !== dependencies.localIdentity()) return;
    aggroChallenge = { active: row.active, completed: row.completed };
    dependencies.notify();
  }
  function removeAggroChallenge(row: { identity: Identity }) {
    if (row.identity.toHexString() !== dependencies.localIdentity()) return;
    aggroChallenge = { active: false, completed: 0 };
    dependencies.notify();
  }
  function upsertAggroChallengeParked(row: { identity: Identity }) {
    if (row.identity.toHexString() !== dependencies.localIdentity()) return;
    aggroParked = true;
    dependencies.notify();
  }
  function removeAggroChallengeParked(row: { identity: Identity }) {
    if (row.identity.toHexString() !== dependencies.localIdentity()) return;
    aggroParked = false;
    dependencies.notify();
  }
  function upsertDailyQuest(row: { identity: Identity; day: number; questsJson: string; bonus: number; guildPoints: number; guildName: string }) {
    if (row.identity.toHexString() !== dependencies.localIdentity()) return;
    dailyQuest = { day: row.day, quests: parseDailyQuests(row.questsJson), bonus: row.bonus, guildPoints: row.guildPoints, guildName: row.guildName };
    dependencies.notify();
  }
  function removeDailyQuest(row: { identity: Identity }) {
    if (row.identity.toHexString() !== dependencies.localIdentity()) return;
    dailyQuest = null;
    dependencies.notify();
  }
  function upsertGuildQuestWeek(row: { key: string; week: number; guildId: bigint; guildName: string; points: number }) {
    guildQuestWeeks.set(row.key, { week: row.week, guildId: String(row.guildId), guildName: row.guildName, points: row.points });
    dependencies.notify();
  }
  function removeGuildQuestWeek(row: { key: string }) {
    guildQuestWeeks.delete(row.key);
    dependencies.notify();
  }
  function upsertFreeRespec(row: { identity: Identity }) {
    if (row.identity.toHexString() !== dependencies.localIdentity()) return;
    freeRespecUsed = true;
    dependencies.notify();
  }
  function removeFreeRespec(row: { identity: Identity }) {
    if (row.identity.toHexString() !== dependencies.localIdentity()) return;
    freeRespecUsed = false;
    dependencies.notify();
  }
  function upsertPrestigeChallengeParked(row: { identity: Identity }) {
    if (row.identity.toHexString() !== dependencies.localIdentity()) return;
    challengeParked = true;
    dependencies.notify();
  }
  function removePrestigeChallengeParked(row: { identity: Identity }) {
    if (row.identity.toHexString() !== dependencies.localIdentity()) return;
    challengeParked = false;
    dependencies.notify();
  }

  function upsertPrestigeExpansion(row: { id: number; unlocksAt: { microsSinceUnixEpoch: bigint } }) {
    if (row.id !== 0) return;
    prestigeExpansionUnlocksAt = Number(row.unlocksAt.microsSinceUnixEpoch / 1000n);
    dependencies.notify();
  }

  function removePrestigeExpansion(row: { id: number }) {
    if (row.id === 0) prestigeExpansionUnlocksAt = null;
    dependencies.notify();
  }

  function upsertPrestigeExpansionPerk(row: { identity: Identity; bossSlayer: number; secondWind: number; longShot: number; fleetFoot: number }) {
    if (row.identity.toHexString() === dependencies.localIdentity()) {
      expansionPerks = { bossSlayer: row.bossSlayer, secondWind: row.secondWind, longShot: row.longShot, fleetFoot: row.fleetFoot };
    }
    dependencies.notify();
  }

  function removePrestigeExpansionPerk(row: { identity: Identity }) {
    if (row.identity.toHexString() === dependencies.localIdentity()) expansionPerks = { bossSlayer: 0, secondWind: 0, longShot: 0, fleetFoot: 0 };
    dependencies.notify();
  }

  function removePrestigePerk(row: { identity: Identity }) {
    if (row.identity.toHexString() !== dependencies.localIdentity()) { dependencies.notify(); return; }
    localPrestigePerks = null;
    dependencies.notify();
  }

  /**
   * Rows are keyed by upgrade slot now, not by item: `itemId` carries "HAND",
   * "HEAD" or "CHEST" and `level` is that slot's tier. The cache shape is
   * unchanged; only what the key means moved.
   */
  function upsertItemUpgrade(row: { identity: Identity; itemId: string; level: number }) {
    const identity = row.identity.toHexString();
    let levels = upgradeLevelsByIdentity.get(identity);
    if (!levels) {
      levels = new Map();
      upgradeLevelsByIdentity.set(identity, levels);
    }
    const previousLevel = levels.get(row.itemId) ?? 0;
    const level = normalizeSlotTier(row.level);
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
      currentLevel: normalizeSlotTier(row.currentLevel),
      targetLevel: normalizeSlotTier(row.targetLevel),
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
  // The captured timer: a hooked setInterval must not shorten the report period.
  const flushTimer = nativeTimers.setInterval(() => flush(), PROGRESS_SAVE_INTERVAL_MS);
  window.addEventListener("pagehide", pageHide);

  /** Queues one kill. Reached only through the bridge claimGameBridge hands out. */
  function recordRegularEnemyDefeat(mapId: string, enemy: string, autoFarm = false) {
    if (resetPending || dependencies.reducers.protocolBlocked() || dependencies.reducers.worldEntryBlocked()) return;
    enemyLoot.record(mapId, enemy, autoFarm);
    if (enemy === "boss") void flushEnemyLoot(true);
  }

  return {
    recordRegularEnemyDefeat,
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
      upsertPausedResearch,
      removePausedResearch,
      upsertPrestige,
      removePrestige,
      upsertPrestigePerk,
      upsertPrestigeChallenge, removePrestigeChallenge,
      upsertPrestigeChallengeParked, removePrestigeChallengeParked,
      upsertAggroChallenge, removeAggroChallenge,
      upsertAggroChallengeParked, removeAggroChallengeParked,
      upsertFreeRespec, removeFreeRespec,
      upsertDailyQuest, removeDailyQuest, upsertGuildQuestWeek, removeGuildQuestWeek,
      upsertPrestigeExpansion, removePrestigeExpansion,
      upsertPrestigeExpansionPerk, removePrestigeExpansionPerk,
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
        thirdUpgradeSlotUnlocked = false;
        dependencies.notify();
      },
      upsertUpgradeBenchThirdSlot(row: { identity: Identity }) {
        if (row.identity.toHexString() !== dependencies.localIdentity()) return;
        thirdUpgradeSlotUnlocked = true;
        dependencies.notify();
      },
      removeUpgradeBenchThirdSlot(row: { identity: Identity }) {
        if (row.identity.toHexString() !== dependencies.localIdentity()) return;
        thirdUpgradeSlotUnlocked = false;
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
      // Portal cutscenes introduce each map once. A prestiged player has
      // unlocked every one before, so a rerun of the campaign skips them.
      hasSeenPortalCutscene: (cutscene: string) => (localPrestige?.level ?? 0) > 0 || cutscenes.hasSeen(cutscene),
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
      /** Called when the server changes this player's equipped gear by itself, for the bag to follow. */
      setOnServerEquip(callback: ((equip: ServerEquip) => void) | null) {
        serverEquipListener = callback;
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
      pausedResearch: () => [...pausedResearch.values()].map(row => ({ ...row })),
      prestige: () => localPrestige ? { ...localPrestige } : null,
      prestigeLevelFor: (identity: string) => prestigeLevelByIdentity.get(identity) ?? 0,
      prestigeChallenge: () => ({ ...prestigeChallenge, parked: challengeParked }),
      aggroChallenge: () => ({ ...aggroChallenge, parked: aggroParked }),
      /** Every account has one respec that keeps its stats; false once it is spent. */
      freeRespecAvailable: () => !freeRespecUsed,
      /** Today's quests and the guild's standing; null until the server has drawn them. */
      dailyQuests: (): DailyQuestState | null => dailyQuest ? { ...dailyQuest, quests: dailyQuest.quests.map(quest => ({ ...quest })) } : null,
      /** Every guild's quest points in one week, best first. */
      guildQuestRanking: (week: number) => [...guildQuestWeeks.values()].filter(row => row.week === week).sort((a, b) => b.points - a.points || a.guildName.localeCompare(b.guildName)),
      refreshDailyQuests() {
        return reducerResult("daily quests", (active) => active.reducers.refreshDailyQuests({}))();
      },
      prestigeExpansionUnlocksAt: () => prestigeExpansionUnlocksAt,
      /** The ranks in play: none during an Aggro run, which plays without prestige bonuses. */
      prestigePerks: (): PlayerPrestigePerks => prestigeBonusesOff(aggroChallenge)
        ? { keenEdge: 0, doubleStrike: 0, splitShot: 0, riposte: 0, bossSlayer: 0, secondWind: 0, longShot: 0, fleetFoot: 0 }
        : { keenEdge: 0, doubleStrike: 0, splitShot: 0, riposte: 0, ...localPrestigePerks, ...expansionPerks },
      /** The ranks the player owns, for the Prestige window. */
      storedPrestigePerks: (): PlayerPrestigePerks => ({ keenEdge: 0, doubleStrike: 0, splitShot: 0, riposte: 0, ...localPrestigePerks, ...expansionPerks }),
      /** The tier that applies to an item: whatever its slot has earned. */
      itemUpgradeLevel(itemId: string, identity = dependencies.localIdentity()) {
        const slot = upgradeSlotForItem(itemId);
        return slot ? upgradeLevelsByIdentity.get(identity)?.get(slot) ?? 0 : 0;
      },
      slotUpgradeTier(slot: UpgradeSlot, identity = dependencies.localIdentity()) {
        return upgradeLevelsByIdentity.get(identity)?.get(slot) ?? 0;
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
      thirdUpgradeSlotUnlocked: () => thirdUpgradeSlotUnlocked,
      inventorySlotsUnlocked: () => inventorySlotsUnlocked,
      async destroyEquipment(itemId: string) {
        const identity = dependencies.localIdentity();
        const result = await reducerResult("destroy equipment", (connection) => connection.reducers.destroyEquipment({ itemId }))();
        if (result.ok && identity !== dependencies.localIdentity()) return { ok: false, error: "ACCOUNT CHANGED" };
        if (result.ok) {
          const keepCosmetic = cosmeticUnlocks(localProgress?.cosmeticItemsJson).includes(itemId);
          if (localProgress) {
            localProgress = withoutDestroyedEquipment(localProgress, itemId, keepCosmetic);
            progressByIdentity.set(identity, localProgress);
          }
          if (pendingProgress) pendingProgress = writeStore(identity, withoutDestroyedEquipment(pendingProgress, itemId, keepCosmetic));
          upgradeLevelsByIdentity.get(identity)?.delete(itemId);
          dependencies.notify();
        }
        return result;
      },
      async convertItemToCosmetic(itemId: string) {
        const identity = dependencies.localIdentity();
        const result = await reducerResult("cosmetic conversion", (connection) => connection.reducers.convertItemToCosmetic({ itemId }))();
        if (result.ok && identity !== dependencies.localIdentity()) return { ok: false, error: "ACCOUNT CHANGED" };
        if (result.ok) {
          if (localProgress) {
            const unlocked = cosmeticUnlocks(localProgress.cosmeticItemsJson);
            localProgress = { ...localProgress,
              cosmeticItemsJson: JSON.stringify([...new Set([...unlocked, itemId])]) };
            progressByIdentity.set(identity, localProgress);
          }
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
      async unlockThirdUpgradeSlot() {
        if (!secondUpgradeSlotUnlocked) return { ok: false, error: "UNLOCK SLOT 2 FIRST" };
        const result = await reducerResult("third upgrade slot unlock", (connection) => connection.reducers.unlockThirdUpgradeSlot({}))();
        if (result.ok) {
          thirdUpgradeSlotUnlocked = true;
          dependencies.notify();
        }
        return result;
      },
      startResearch(researchId: ResearchId) {
        return reducerResult("research start", (connection) => connection.reducers.startResearch({ researchId }))();
      },
      speedUpResearchWithGems: reducerResult("research speed-up", (connection) => connection.reducers.speedUpResearchWithGems({})),
      pauseResearch: reducerResult("research pause", (connection) => connection.reducers.pauseResearch({})),
      async startPrestigeChallenge() {
        if (!await enemyLoot.flush(true)) return { ok: false, error: "Rewards are still syncing. Try again in a moment." };
        const identity = dependencies.localIdentity();
        const connection = dependencies.reducers.connection();
        const result = await reducerResult("prestige challenge", active => active.reducers.startPrestigeChallenge({}))();
        if (result.ok && identity === dependencies.localIdentity() && connection === dependencies.reducers.connection()) { clearPending(identity); enemyLoot.reset(); dependencies.notify(); }
        return result;
      },
      async abandonPrestigeChallenge() {
        const identity = dependencies.localIdentity();
        const connection = dependencies.reducers.connection();
        const result = await reducerResult("abandon prestige challenge", active => active.reducers.abandonPrestigeChallenge({}))();
        if (result.ok && identity === dependencies.localIdentity() && connection === dependencies.reducers.connection()) { clearPending(identity); enemyLoot.reset(); dependencies.notify(); }
        return result;
      },
      async startAggroRun() {
        if (!await enemyLoot.flush(true)) return { ok: false, error: "Rewards are still syncing. Try again in a moment." };
        const identity = dependencies.localIdentity();
        const connection = dependencies.reducers.connection();
        const result = await reducerResult("Aggro challenge", active => active.reducers.startAggroRun({}))();
        if (result.ok && identity === dependencies.localIdentity() && connection === dependencies.reducers.connection()) { clearPending(identity); enemyLoot.reset(); dependencies.notify(); }
        return result;
      },
      async abandonAggroRun() {
        const identity = dependencies.localIdentity();
        const connection = dependencies.reducers.connection();
        const result = await reducerResult("drop out of Aggro", active => active.reducers.abandonAggroRun({}))();
        if (result.ok && identity === dependencies.localIdentity() && connection === dependencies.reducers.connection()) { clearPending(identity); enemyLoot.reset(); dependencies.notify(); }
        return result;
      },
      async prestigeAccount() {
        const wasChallenge = prestigeChallenge.active || aggroChallenge.active;
        const identity = dependencies.localIdentity();
        const connection = dependencies.reducers.connection();
        const result = await reducerResult("prestige", (active) => active.reducers.prestigeAccount({}))();
        if (result.ok && identity === dependencies.localIdentity() && connection === dependencies.reducers.connection()) {
          // SDK 2.9 applies the reset row before resolving the reducer promise.
          // A rejected prestige must retain its unsaved prediction.
          clearPending(identity);
          if (wasChallenge) enemyLoot.reset();
          dependencies.notify();
        }
        return result;
      },
      spendPrestigePerkPoint(perk: string) {
        return reducerResult("prestige perk point spend", (connection) => connection.reducers.spendPrestigePerkPoint({ perk }))();
      },
      async respecPrestigePerks() {
        const identity = dependencies.localIdentity();
        const connection = dependencies.reducers.connection();
        // Queued kills were earned at the old power. Paid after the reset they
        // would be judged against starting stats on another map, and dropped.
        if (!await enemyLoot.flush(true)) return { ok: false, error: "Rewards are still syncing. Try again in a moment." };
        const result = await reducerResult("prestige respec", (active) => active.reducers.respecPrestigePerks({}))();
        if (result.ok && identity === dependencies.localIdentity() && connection === dependencies.reducers.connection()) {
          clearPending(identity);   // as after a prestige: the reset row supersedes the unsaved prediction
          dependencies.notify();
        }
        return result;
      },
      /** The free respec keeps the run's stats, so queued kills and the unsaved prediction stay valid. */
      useFreePrestigeRespec() {
        return reducerResult("free prestige respec", (active) => active.reducers.useFreePrestigeRespec({}))();
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
          const remainingMs = slotUpgradeDurationWithResearch(itemUpgradeDurationMs(currentLevel), localResearch.slotUpgradeSpeed);
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
          // A death in an Aggro run starts it over on the server: drop what this run had not yet reported.
          const restart = aggroChallenge.active;
          const identity = dependencies.localIdentity();
          if (connection) await dependencies.reducers.runWorldReducer(() => connection.reducers.recordPlayerDeath({}));
          if (restart && identity === dependencies.localIdentity()) { clearPending(identity); enemyLoot.reset(); dependencies.notify(); }
        } catch (error) {
          dependencies.reducers.handleFailure("death tracking", error);
        }
      },
      /**
       * Kill reporting is not on the window API. The game claims this bridge
       * once, at boot, before any page script can, and every later call gets
       * null: a console one-liner has no kill function to call in a loop, and
       * the kills that are reported carry the game's own simulation clock.
       */
      claimGameBridge(simulatedSeconds: () => number): GameBridge | null {
        if (gameBridgeClaimed || typeof simulatedSeconds !== "function") return null;
        // game.js loads only after sign-in, so until then this sat unclaimed on
        // the window API for anyone at the console to take, and with it the
        // clock every report is measured by.
        if (dependencies.gameBridgeCaller && !dependencies.gameBridgeCaller()) return null;
        gameBridgeClaimed = true;
        gameSimulatedSeconds = simulatedSeconds;
        return Object.freeze({
          recordRegularEnemyDefeat: (mapId: string, enemy: string, autoFarm = false) => recordRegularEnemyDefeat(mapId, enemy, autoFarm),
          engaged: () => enemyLoot.engaged(),
        });
      },
      saveProgress(progress: ProgressSave, immediate = false) {
        persistPending(progress, immediate);
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
      flushStoreWrite();
      pendingProgress = store.read(dependencies.localIdentity());
      restoredSave = true;
      saveInFlightUntil = 0;
      if (!identityChanged) return;
      void syncResearchNotification(null);
      localProgress = null;
      localResearch = createEmptyResearchRanks();
      activeResearch = null;
      pausedResearch.clear();
      prestigeChallenge = { active: false, completed: 0 };
      challengeParked = false;
      aggroChallenge = { active: false, completed: 0 };
      aggroParked = false;
      freeRespecUsed = false;
      dailyQuest = null;
      guildQuestWeeks.clear();
      localPrestige = null;
      prestigeLevelByIdentity.clear();
      localPrestigePerks = null;
      expansionPerks = { bossSlayer: 0, secondWind: 0, longShot: 0, fleetFoot: 0 };
      activeItemUpgrades.clear();
      balanceApologyGiftAmount = 0n;
      itemGifts.clear();
      mailboxMessages.clear();
      onboardingStep = 0;
      secondUpgradeSlotUnlocked = false;
      thirdUpgradeSlotUnlocked = false;
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
      thirdUpgradeSlotUnlocked = false;
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
      pausedResearch.clear();
      prestigeChallenge = { active: false, completed: 0 };
      challengeParked = false;
      aggroChallenge = { active: false, completed: 0 };
      aggroParked = false;
      freeRespecUsed = false;
      dailyQuest = null;
      guildQuestWeeks.clear();
      localPrestige = null;
      prestigeLevelByIdentity.clear();
      localPrestigePerks = null;
      expansionPerks = { bossSlayer: 0, secondWind: 0, longShot: 0, fleetFoot: 0 };
      activeItemUpgrades.clear();
      balanceApologyGiftAmount = 0n;
      itemGifts.clear();
      mailboxMessages.clear();
      onboardingStep = 0;
      secondUpgradeSlotUnlocked = false;
      thirdUpgradeSlotUnlocked = false;
      inventorySlotsUnlocked = 0;
    },
    dispose() {
      flushStoreWrite();
      enemyLoot.clear();
      nativeTimers.clearInterval(flushTimer);
      window.removeEventListener("pagehide", pageHide);
    },
  };
}

export type ProgressionService = ReturnType<typeof createProgressionService>;
