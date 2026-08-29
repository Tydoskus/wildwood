import "./ui/game-shell";
import { DbConnection, type ErrorContext } from "./module_bindings";
import type { Identity } from "spacetimedb";
import { isDeveloperIdentity } from "./app/developer";
import { recentReleaseNotes } from "./app/changelog";
import { GAME_VERSION, SEEN_VERSION_KEY } from "./game/runtime/game-settings";
import { createVirtualPlayerLoadTest } from "./coop/services/virtual-player-load-test";
import { createReconnectWatchdog } from "./coop/services/reconnect-watchdog";
import { createReconnectScheduler } from "./coop/services/reconnect-scheduler";
import { createPageWakeTracker } from "./coop/services/page-wake-tracker";
import { connectionGateState } from "./coop/services/connection-gate-state";
import { retryAfterMissingWorldPresence } from "./coop/services/world-presence-recovery";
import { shouldRetainProfilePresentation } from "./coop/services/profile-presence";
import {
  createUpdateResumeStore,
  inferLegacyUpdateResumeMode,
  type UpdateResumeMode,
} from "./coop/services/update-resume-store";
import {
  PLAYER_SPAWN,
  PROTOCOL_VERSION,
  TUTORIAL_FOREST_MAP_ID,
} from "../shared/rules";
import { createBossService } from "./coop/services/boss-service";
import { createChatService, type ChatService } from "./coop/services/chat-service";
import { createDuelService } from "./coop/services/duel-service";
import { createDeveloperService } from "./coop/services/developer-service";
import { createProfileDirectory } from "./coop/services/profile-directory";
import { createProgressionService } from "./coop/services/progression-service";
import {
  createPlayerProfileService,
  type PlayerProfileService,
} from "./coop/services/player-profile-service";
import { createPresenceService, type PresenceService } from "./coop/services/presence-service";
import { createRemoteCombatStatsService } from "./coop/services/remote-combat-stats-service";
import { defaultRealtimeHost } from "./coop/services/realtime-host";
import {
  startBaseSubscription,
  type BaseSubscriptionHandlers,
} from "./coop/services/base-subscription";
import { createAccountService, type AccountService } from "./coop/services/account-service";
import { createStartupAuthGate, loadDeferredGameBundle } from "./coop/startup-auth-gate";
import { createStartupReleaseNotes } from "./coop/startup-release-notes";
import type { ReducerPort } from "./coop/ports";
export type {
  AccessAuditEntry,
  ActiveItemUpgrade,
  ActiveResearch,
  BugReportEntry,
  ChatMessage,
  DragonBossState,
  DragonContributor,
  DragonResult,
  DuelReplay,
  DuelState,
  FrostclawBossState,
  FrostclawResult,
  LeaderboardEntry,
  LocalPlayerState,
  MagmaliskBossState,
  MagmaliskResult,
  GloomrootBossState,
  GloomrootResult,
  MapPlayerMarker,
  PlayerLifetime,
  PlayerProfileData,
  PlayerProgress,
  PlayerResearch,
  RemotePlayer,
  RemotePlayerDeath,
  RemoteCombatStats,
  RemoteRegularEnemyCombatVisual,
  SpiderBossState,
  SpiderResult,
  TidewyrmBossState,
  TidewyrmResult,
  UpgradeBenchSlot,
} from "./coop/contracts";

type WildwoodRuntime = Window & {
  WILDWOOD_SPACETIMEDB_HOST?: string;
  WILDWOOD_SPACETIMEDB_DB_NAME?: string;
};

const LATENCY_SAMPLE_INTERVAL_MS = 1_000;
const LATENCY_SMOOTHING = .25;
const WAKE_RECONNECT_WATCHDOG_MS = 10_000;

const runtime = window as WildwoodRuntime;
const defaultHost = defaultRealtimeHost(window.location.hostname);
const host = runtime.WILDWOOD_SPACETIMEDB_HOST ?? defaultHost;
const databaseName = runtime.WILDWOOD_SPACETIMEDB_DB_NAME ?? "wildwood-coop";
const tokenKey = `${host}/${databaseName}/auth_token`;
const guestTokenKey = `${tokenKey}/guest_v1`;
const accountTokenKey = `${tokenKey}/spacetimeauth_id_token_v1`;
const accountLinkKey = `${tokenKey}/spacetimeauth_link_v1`;
const accountMigrationPendingKey = `${tokenKey}/spacetimeauth_migration_pending_v1`;
const authStateKey = `${tokenKey}/spacetimeauth_state_v1`;
const authVerifierKey = `${tokenKey}/spacetimeauth_verifier_v1`;
const authRetryKey = `${tokenKey}/spacetimeauth_401_retry_v1`;
const knownAccountKey = `${tokenKey}/spacetimeauth_known_account_v1`;
const knownAccountCharacterKey = `${tokenKey}/spacetimeauth_character_name_v1`;
const knownAccountGenderKey = `${tokenKey}/spacetimeauth_character_gender_v1`;
const knownGuestCharacterKey = `${tokenKey}/guest_character_name_v1`;
const authReturnUiKey = `${tokenKey}/spacetimeauth_return_ui_v1`;
const updateResumeKey = `${tokenKey}/forced_update_resume_v1`;
const updateResumeConsumedKey = `${updateResumeKey}/consumed_version`;
const authTabKey = `${accountMigrationPendingKey}/tab_id`;
const pendingProgressKey = `${tokenKey}/pending_progress_v1`;
const updateResumeStore = createUpdateResumeStore(sessionStorage, updateResumeKey);

function consumeUpdateResumeMode(): UpdateResumeMode | null {
  const requestedVersion = new URL(window.location.href).searchParams.get("v") ?? "";
  const explicitMode = updateResumeStore.consume(requestedVersion);
  if (requestedVersion !== GAME_VERSION) return null;

  try {
    const consumedVersion = sessionStorage.getItem(updateResumeConsumedKey) ?? "";
    if (explicitMode) {
      sessionStorage.setItem(updateResumeConsumedKey, requestedVersion);
      return explicitMode;
    }

    // Clients predating the explicit handoff still leave a per-tab world ID.
    // Consume it once so the first deployment of this feature also resumes.
    const legacyMode = inferLegacyUpdateResumeMode({
      requestedVersion,
      currentVersion: GAME_VERSION,
      hadPlayableTab: Boolean(sessionStorage.getItem(authTabKey)),
      hasAccountToken: Boolean(localStorage.getItem(accountTokenKey)),
      consumedVersion,
    });
    if (legacyMode) sessionStorage.setItem(updateResumeConsumedKey, requestedVersion);
    return legacyMode;
  } catch {
    return explicitMode;
  }
}

const updateResumeMode = consumeUpdateResumeMode();
let connection: DbConnection | null = null;
let localIdentity = "";
let localDbIdentity: Identity | null = null;
let latencyMs: number | null = null;
let lastLatencyProbeStartedAt = 0;
let connecting = false;
let connectionGeneration = 0;
let sessionGeneration = 0;
let hydrationReady = false;
let connectedSignedIn = false;
let lastServerActivityAt = performance.now();
let changeListener: (() => void) | null = null;
let startupChangeListener: (() => void) | null = null;
let changeBatchDepth = 0;
let batchedChangePending = false;
let protocolBlocked = false;
let resumeProbePromise: Promise<void> | null = null;
let resumeProbeGeneration = 0;
let wakeReconnectVisible = false;
let networkReconnectVisible = false;
let worldEntryPromise: Promise<boolean> | null = null;
let worldEntryGeneration = 0;
let worldEntryBlocked = false;
let accountService!: AccountService;

/** Coalesces table hydration into one UI refresh instead of one per row. */
function onChange() {
  if (changeBatchDepth > 0) {
    batchedChangePending = true;
    return;
  }
  changeListener?.();
  startupChangeListener?.();
}

const reconnectWatchdog = createReconnectWatchdog({
  delayMs: WAKE_RECONNECT_WATCHDOG_MS,
  shouldWatch: () => (wakeReconnectVisible || networkReconnectVisible) &&
    !document.hidden && !protocolBlocked && !worldEntryBlocked,
  onTimeout: restartStalledWakeConnection,
  schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
  cancel: (timer) => window.clearTimeout(timer),
});

const reconnectScheduler = createReconnectScheduler({
  canAttempt: () => !protocolBlocked && !worldEntryBlocked && !document.hidden &&
    !connection?.isActive && !connecting,
  onlineHint: () => navigator.onLine,
  connect,
  scheduleTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
  cancelTimer: (timer) => window.clearTimeout(timer),
});

const pageWakeTracker = createPageWakeTracker({
  longWakeMs: 10_000,
  nowMs: () => Date.now(),
  onLongWake: () => setWakeReconnectVisible(true),
  onResume: (force, hiddenForMs) => reconnectAfterWake(force, hiddenForMs),
});

function batchChanges(action: () => void) {
  changeBatchDepth += 1;
  try {
    action();
  } finally {
    changeBatchDepth -= 1;
    if (changeBatchDepth === 0 && batchedChangePending) {
      batchedChangePending = false;
      changeListener?.();
      startupChangeListener?.();
    }
  }
}

let presenceService!: PresenceService;
const virtualPlayerLoadTest = createVirtualPlayerLoadTest({
  host,
  databaseName,
  spawnContext: () => ({
    mapId: presenceService?.currentMapId() ?? TUTORIAL_FOREST_MAP_ID,
    x: presenceService?.localState()?.x ?? PLAYER_SPAWN.x,
    y: presenceService?.localState()?.y ?? PLAYER_SPAWN.y,
  }),
  ownerIdentity: () => connection?.identity,
  beginServerRun: async (ticket, maxCount) => {
    const conn = connection;
    if (!conn?.isActive || !isDeveloperIdentity(localIdentity)) throw new Error("DEVELOPER CONNECTION REQUIRED");
    await runWorldReducer(() => conn.reducers.devBeginVirtualPlayerLoadTest({ ticket, maxCount }));
  },
  clearServerPlayers: async () => {
    const conn = connection;
    if (!conn?.isActive || !isDeveloperIdentity(localIdentity)) throw new Error("DEVELOPER CONNECTION REQUIRED");
    await runWorldReducer(() => conn.reducers.devClearVirtualPlayers({}));
  },
  onProtocolMismatch: (error) => handleReducerFailure("virtual-player protocol", error),
  onStateChange: onChange,
});

function reducerErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function touchServerActivity() {
  lastServerActivityAt = performance.now();
}

function recordLatency(startedAt: number) {
  const sample = Math.max(0, performance.now() - startedAt);
  latencyMs = latencyMs === null
    ? sample
    : latencyMs + (sample - latencyMs) * LATENCY_SMOOTHING;
}

function handleReducerFailure(action: string, error: unknown) {
  const message = reducerErrorMessage(error);
  if (/active in another tab/i.test(message)) {
    worldEntryBlocked = true;
    accountService.setNotice("SIGNED OUT · ACCOUNT OPENED IN ANOTHER TAB");
    setWakeReconnectVisible(false);
    setNetworkReconnectVisible(false);
    onChange?.();
    return;
  }
  if (!/wildwood updated\. refresh to continue\./i.test(message)) {
    console.warn(`Wildwood ${action} rejected:`, message);
    return;
  }

  // Do not let an old tab keep retrying saves or movement after Maincloud has
  // moved to a new protocol. Pending progress stays in local storage so the
  // freshly loaded client can submit it safely.
  protocolBlocked = true;
  progressionService.blockSaves();
  virtualPlayerLoadTest.disconnectLocal();
  accountService.setNotice("GAME UPDATING · WAITING FOR DEPLOY");
  setWakeReconnectVisible(false);
  setNetworkReconnectVisible(false);
  onChange?.();
}

function sendReducer(action: string, reducer: () => unknown, onRejected?: () => void, onAccepted?: () => void) {
  if (protocolBlocked || worldEntryBlocked) return;
  try {
    const startedAt = performance.now();
    const measureLatency = startedAt - lastLatencyProbeStartedAt >= LATENCY_SAMPLE_INTERVAL_MS;
    if (measureLatency) lastLatencyProbeStartedAt = startedAt;
    void runWorldReducer(() => Promise.resolve(reducer()))
      .then(() => {
        onAccepted?.();
        if (measureLatency) recordLatency(startedAt);
      })
      .catch((error) => {
        onRejected?.();
        handleReducerFailure(action, error);
      });
  } catch (error) {
    onRejected?.();
    handleReducerFailure(action, error);
  }
}

function requestWorldEntry(): Promise<boolean> {
  if (protocolBlocked || !connection) return Promise.resolve(false);
  if (worldEntryGeneration === connectionGeneration) return Promise.resolve(true);
  if (worldEntryPromise) return worldEntryPromise;
  const conn = connection;
  const generation = connectionGeneration;
  worldEntryPromise = Promise.resolve(conn.reducers.enterWorld({ tabId: accountService.tabId() }))
    .then(() => {
      if (connection !== conn || generation !== connectionGeneration) return false;
      worldEntryBlocked = false;
      worldEntryGeneration = generation;
      accountService.markPlayable(connectedSignedIn);
      progressionService.flushPendingProgress(true);
      onChange?.();
      return true;
    })
    .catch((error) => {
      if (/active in another tab/i.test(reducerErrorMessage(error))) {
        worldEntryBlocked = true;
        accountService.setNotice("LOGGED IN ON ANOTHER TAB");
        onChange?.();
        return false;
      }
      handleReducerFailure("world entry", error);
      return false;
    })
    .finally(() => {
      worldEntryPromise = null;
    });
  return worldEntryPromise;
}

async function recoverMissingWorldPresence() {
  if (protocolBlocked || worldEntryBlocked || !connection) return false;
  const generation = connectionGeneration;
  worldEntryGeneration = 0;
  accountService.setNotice("REJOINING WILDWOOD");
  setNetworkReconnectVisible(true);
  const recovered = await requestWorldEntry();
  if (generation !== connectionGeneration) return false;
  setNetworkReconnectVisible(false);
  if (recovered) accountService.setNotice("");
  onChange?.();
  return recovered;
}

function runWorldReducer<T>(reducer: () => T | PromiseLike<T>) {
  return retryAfterMissingWorldPresence(reducer, recoverMissingWorldPresence);
}

const reducerPort: ReducerPort = {
  connection: () => connection,
  protocolBlocked: () => protocolBlocked,
  worldEntryBlocked: () => worldEntryBlocked,
  runWorldReducer,
  sendReducer: (action, reducer, onRejected, onAccepted) => sendReducer(
    action,
    () => connection ? reducer(connection) : undefined,
    onRejected,
    onAccepted,
  ),
  errorMessage: reducerErrorMessage,
  handleFailure: handleReducerFailure,
};

const bossService = createBossService({
  reducers: reducerPort,
  notify: onChange,
  localPosition: () => presenceService?.localState() ?? null,
});
const {
  upsertDragon: upsertDragonBoss,
  upsertDragonResult,
  upsertSpider: upsertSpiderBoss,
  upsertSpiderResult,
  upsertFrostclaw: upsertFrostclawBoss,
  upsertFrostclawResult,
  upsertMagmalisk: upsertMagmaliskBoss,
  upsertMagmaliskResult,
  upsertGloomroot: upsertGloomrootBoss,
  upsertGloomrootResult,
  upsertTidewyrm: upsertTidewyrmBoss,
  upsertTidewyrmResult,
} = bossService.tables;

let chatService!: ChatService;
let playerProfileService!: PlayerProfileService;
const profileDirectory = createProfileDirectory({
  reducers: reducerPort,
  notify: onChange,
  localIdentity: () => localIdentity,
  localIsGuestFallback: () => connection?.isActive ? !connectedSignedIn : !accountService.accountToken(),
  shouldRetain: (identity) => shouldRetainProfilePresentation(
    identity,
    {
      has: (candidate) =>
        (presenceService?.hasActiveMotion(candidate) ?? false) ||
        playerProfileService?.activeIdentity() === candidate,
    },
    { has: (candidate) => playerProfileService?.hasLeaderboard(candidate) ?? false },
    chatService.presentationRows(),
  ),
  renameRemotePlayer: (identity, displayName) => {
    presenceService?.renameRemotePlayer(identity, displayName);
  },
  rememberCharacter: (displayName) => accountService.rememberConfirmedCharacter(displayName),
  rememberGender: (gender) => accountService.rememberConfirmedGender(gender),
  completeAccountReturn: () => accountService.completeAccountReturnWhenReady(),
  markChatPresentationChanged: () => chatService.markPresentationChanged(),
});
const {
  upsertProfile,
  removeProfile,
  upsertAccountStatus: upsertPlayerAccountStatus,
  removeAccountStatus: removePlayerAccountStatus,
} = profileDirectory.tables;

const developerService = createDeveloperService({
  reducers: reducerPort,
  notify: onChange,
  localIdentity: () => localIdentity,
  localDbIdentity: () => localDbIdentity,
  profileIdentityFor: profileDirectory.identityFor,
});
const {
  upsertAccessAudit,
  removeAccessAudit,
  upsertBugReport,
  removeBugReport,
} = developerService.tables;

chatService = createChatService({
  reducers: reducerPort,
  notify: onChange,
  rememberSender: profileDirectory.rememberChatSender,
});
const { upsert: upsertChatMessage } = chatService.tables;

const progressionService = createProgressionService({
  reducers: reducerPort,
  notify: onChange,
  localIdentity: () => localIdentity,
  worldEntryReady: () => worldEntryGeneration === connectionGeneration,
  hydrationReady: () => hydrationReady,
  activeProfileIdentity: () => playerProfileService?.activeIdentity() ?? "",
  completeAccountReturn: () => accountService.completeAccountReturnWhenReady(),
  reserveStoppedMotion: () => presenceService.reserveStoppedMotion(),
  commitStoppedPosition: (position, sequence) => presenceService.commitStoppedPosition(position, sequence),
  storage: localStorage,
  pendingProgressKey,
});
const {
  upsertProgress,
  upsertResearch,
  removeResearch,
  upsertActiveResearch,
  removeActiveResearch,
  upsertItemUpgrade,
  removeItemUpgrade,
  upsertActiveItemUpgrade,
  removeActiveItemUpgrade,
  upsertLifetime: upsertPlayerLifetime,
  upsertGemWallet,
  removeGemWallet,
  upsertDailyGemBonus,
  removeDailyGemBonus,
  upsertBalanceApologyNotice,
  removeBalanceApologyNotice,
  upsertUpgradeBench,
  removeUpgradeBench,
  upsertInventoryCapacity,
  removeInventoryCapacity,
  upsertItemDrop,
} = progressionService.tables;

playerProfileService = createPlayerProfileService({
  connection: () => connection,
  notify: onChange,
  localIdentity: () => localIdentity,
  localMapId: () => presenceService?.localState()?.mapId,
  nearbyMapFor: (identity) => presenceService?.mapFor(identity),
  directory: profileDirectory,
  progression: progressionService,
  developerIdentityFor: developerService.identityFor,
});

const remoteCombatStatsService = createRemoteCombatStatsService({
  connection: () => connection,
  identityFor: profileDirectory.identityFor,
});

presenceService = createPresenceService({
  reducers: reducerPort,
  changes: { notify: onChange, batch: batchChanges },
  localIdentity: () => localIdentity,
  localDbIdentity: () => localDbIdentity,
  hydrationReady: () => hydrationReady,
  worldEntryReady: () => worldEntryGeneration === connectionGeneration,
  sessionConflict: () => worldEntryBlocked,
  authTabId: () => accountService.tabId(),
  onControllerConflict: () => {
    worldEntryBlocked = true;
    accountService.setNotice("SIGNED OUT · ACCOUNT OPENED IN ANOTHER TAB");
  },
  directory: profileDirectory,
  developer: developerService,
  latencyMs: () => latencyMs,
});
const {
  upsertPlayer,
  removePlayer,
  upsertMotionIdentity,
  removeMotionIdentity,
  upsertPlayerMotionFrame,
  upsertPlayerMapFrame,
  upsertPlayerDeathFrame,
  upsertWorldStatus,
} = presenceService.tables;

accountService = createAccountService({
  keys: {
    tokenKey,
    guestTokenKey,
    accountTokenKey,
    accountLinkKey,
    accountMigrationPendingKey,
    authStateKey,
    authVerifierKey,
    authRetryKey,
    knownAccountKey,
    knownAccountCharacterKey,
    knownAccountGenderKey,
    knownGuestCharacterKey,
    authReturnUiKey,
    authTabKey,
  },
  updateResumeMode,
  updateResumeStore,
  notify: onChange,
  connection: () => connection,
  connectedSignedIn: () => connectedSignedIn,
  hydrationReady: () => hydrationReady,
  protocolBlocked: () => protocolBlocked,
  updating: () => connectionGateState(protocolBlocked, wakeReconnectVisible, networkReconnectVisible).updating,
  worldEntryBlocked: () => worldEntryBlocked,
  setWorldEntryBlocked: (blocked) => { worldEntryBlocked = blocked; },
  resetWorldEntryGeneration: () => { worldEntryGeneration = 0; },
  requestWorldEntry,
  connect,
  restartConnectionForIdentityChange,
  scheduleReconnect,
  runWorldReducer,
  handleFailure: handleReducerFailure,
  errorMessage: reducerErrorMessage,
  localIdentity: () => localIdentity,
  localProfileReady: () => profileDirectory.api.localProfileReady(),
  localDisplayName: () => profileDirectory.api.localDisplayName(),
  localGender: () => profileDirectory.genderFor(localIdentity),
  localProgress: () => progressionService.localProgress(),
  drainPendingProgress: progressionService.drainPendingProgress,
  clearPendingProgress: progressionService.clearPendingProgress,
  disconnectVirtualPlayers: virtualPlayerLoadTest.disconnectLocal,
});

const duelService = createDuelService({
  reducers: reducerPort,
  notify: onChange,
  localIdentity: () => localIdentity,
  identityFor: profileDirectory.identityFor,
  drainPendingProgress: progressionService.drainPendingProgress,
  storage: localStorage,
});
const { upsert: upsertDuel, remove: removeDuel } = duelService.tables;

const baseSubscriptionHandlers = {
  player: upsertPlayer,
  removePlayer,
  motionFrame: upsertPlayerMotionFrame,
  mapFrame: upsertPlayerMapFrame,
  deathFrame: upsertPlayerDeathFrame,
  motionIdentity: upsertMotionIdentity,
  removeMotionIdentity,
  profile: upsertProfile,
  removeProfile,
  gemWallet: upsertGemWallet,
  removeGemWallet,
  dailyGemBonus: upsertDailyGemBonus,
  removeDailyGemBonus,
  balanceApologyNotice: upsertBalanceApologyNotice,
  removeBalanceApologyNotice,
  upgradeBench: upsertUpgradeBench,
  removeUpgradeBench,
  inventoryCapacity: upsertInventoryCapacity,
  removeInventoryCapacity,
  accessAudit: upsertAccessAudit,
  removeAccessAudit,
  bugReport: upsertBugReport,
  removeBugReport,
  accountStatus: upsertPlayerAccountStatus,
  removeAccountStatus: removePlayerAccountStatus,
  worldStatus: upsertWorldStatus,
  progress: upsertProgress,
  research: upsertResearch,
  removeResearch,
  activeResearch: upsertActiveResearch,
  removeActiveResearch,
  itemUpgrade: upsertItemUpgrade,
  removeItemUpgrade,
  activeItemUpgrade: upsertActiveItemUpgrade,
  removeActiveItemUpgrade,
  itemDrop: upsertItemDrop,
  lifetime: upsertPlayerLifetime,
  dragonBoss: upsertDragonBoss,
  dragonResult: upsertDragonResult,
  spiderBoss: upsertSpiderBoss,
  spiderResult: upsertSpiderResult,
  frostclawBoss: upsertFrostclawBoss,
  frostclawResult: upsertFrostclawResult,
  magmaliskBoss: upsertMagmaliskBoss,
  magmaliskResult: upsertMagmaliskResult,
  gloomrootBoss: upsertGloomrootBoss,
  gloomrootResult: upsertGloomrootResult,
  tidewyrmBoss: upsertTidewyrmBoss,
  tidewyrmResult: upsertTidewyrmResult,
  chatMessage: upsertChatMessage,
  duel: upsertDuel,
  removeDuel,
} satisfies BaseSubscriptionHandlers;

function clearRealtimeCaches() {
  remoteCombatStatsService.clearSession();
  playerProfileService.clearSession();
  presenceService.clearSession();
  profileDirectory.clearSession();
  progressionService.clearSession();
  developerService.clearSession();
  chatService.resetSession();
  duelService.resetSession();
  bossService.resetSession();
}

function restartConnectionForIdentityChange() {
  const staleConnection = connection;
  connection = null;
  connecting = false;
  hydrationReady = false;
  connectedSignedIn = false;
  localDbIdentity = null;
  resumeProbePromise = null;
  resumeProbeGeneration += 1;
  worldEntryPromise = null;
  worldEntryGeneration = 0;
  worldEntryBlocked = false;
  latencyMs = null;
  lastLatencyProbeStartedAt = 0;
  connectionGeneration += 1;
  presenceService.markDisconnected();
  progressionService.markDisconnected();
  clearRealtimeCaches();
  setWakeReconnectVisible(false);
  setNetworkReconnectVisible(false);
  try { staleConnection?.disconnect(); } catch {}
  onChange();
  scheduleReconnect(100);
}

function scheduleReconnect(delay = 500, bypassOnlineHint = false) {
  reconnectScheduler.schedule(delay, bypassOnlineHint);
}

function restartStalledWakeConnection() {
  const staleConnection = connection;
  reconnectScheduler.clear();
  connection = null;
  connecting = false;
  hydrationReady = false;
  connectedSignedIn = false;
  localDbIdentity = null;
  resumeProbePromise = null;
  resumeProbeGeneration += 1;
  worldEntryPromise = null;
  worldEntryGeneration = 0;
  presenceService.markDisconnected();
  connectionGeneration += 1;
  try { staleConnection?.disconnect(); } catch {}
  onChange();
  scheduleReconnect(100, true);
}

function setWakeReconnectVisible(visible: boolean) {
  if (wakeReconnectVisible === visible) return;
  wakeReconnectVisible = visible;
  reconnectWatchdog.refresh();
  onChange?.();
}

function setNetworkReconnectVisible(visible: boolean) {
  if (networkReconnectVisible === visible) return;
  networkReconnectVisible = visible;
  reconnectWatchdog.refresh();
  onChange?.();
}

function reconnectAfterWake(force = false, hiddenForMs = 0) {
  if (protocolBlocked || worldEntryBlocked) {
    setWakeReconnectVisible(false);
    setNetworkReconnectVisible(false);
    return;
  }
  if (document.hidden) return;
  reconnectWatchdog.refresh();
  if (force && (connecting || resumeProbePromise)) {
    restartStalledWakeConnection();
    return;
  }
  if (connecting || resumeProbePromise) return;
  const conn = connection;
  if (force || !conn?.isActive) {
    restartStalledWakeConnection();
    return;
  }

  const activityAge = performance.now() - lastServerActivityAt;
  if (hiddenForMs < 10_000 && activityAge < 30_000) {
    onChange?.();
    return;
  }

  const generation = connectionGeneration;
  const probeGeneration = ++resumeProbeGeneration;
  resumeProbePromise = Promise.race([
    conn.reducers.resumeSession({}),
    new Promise<never>((_resolve, reject) => window.setTimeout(() => reject(new Error("Resume check timed out")), 2_500)),
  ])
    .then(() => {
      if (connection === conn && generation === connectionGeneration) {
        touchServerActivity();
        setWakeReconnectVisible(false);
        onChange?.();
      }
    })
    .catch((error) => {
      if (connection === conn && generation === connectionGeneration) {
        if (/active in another tab/i.test(reducerErrorMessage(error))) {
          handleReducerFailure("session resume", error);
          setWakeReconnectVisible(false);
          return;
        }
        restartStalledWakeConnection();
      }
    })
    .finally(() => {
      if (probeGeneration === resumeProbeGeneration) resumeProbePromise = null;
    });
}

function connect() {
  if (protocolBlocked || connection?.isActive || connecting) return;
  if (!accountService.canConnect()) return;
  connecting = true;
  const generation = ++connectionGeneration;
  const signedIn = Boolean(accountService.accountToken());
  connection = DbConnection.builder()
    .withUri(host)
    .withDatabaseName(databaseName)
    .withToken(accountService.accountToken() || accountService.guestToken() || undefined)
    .onConnect((conn: DbConnection, identity: Identity, token: string) => {
      if (generation !== connectionGeneration) {
        conn.disconnect();
        return;
      }
      connection = conn;
      connecting = false;
      hydrationReady = false;
      connectedSignedIn = signedIn;
      touchServerActivity();
      protocolBlocked = false;
      worldEntryPromise = null;
      worldEntryGeneration = 0;
      worldEntryBlocked = false;
      reconnectScheduler.clear();
      const connectedIdentity = identity.toHexString();
      const identityChanged = Boolean(localIdentity && localIdentity !== connectedIdentity);
      localIdentity = connectedIdentity;
      localDbIdentity = identity;
      duelService.restoreCooldown();
      profileDirectory.prepareSession(accountService.rememberedCharacter(signedIn));
      progressionService.beginSession(identityChanged);
      presenceService.beginSession(identityChanged);
      latencyMs = null;
      lastLatencyProbeStartedAt = 0;
      clearRealtimeCaches();
      if (!signedIn) accountService.storeGuestToken(token);
      const protocolStartedAt = performance.now();
      void conn.reducers.registerProtocol({ protocolVersion: PROTOCOL_VERSION }).then(async () => {
        if (generation !== connectionGeneration || connection !== conn) return;
        accountService.clearRetry();
        recordLatency(protocolStartedAt);
        const isCurrentConnection = () => {
          const current = generation === connectionGeneration && connection === conn;
          if (current) touchServerActivity();
          return current;
        };

        if (!await accountService.claimAccountLink(conn, signedIn, isCurrentConnection)) return;
        if (!await accountService.handlePendingTakeover(conn, isCurrentConnection)) return;

        if (accountService.shouldEnterWorld(signedIn) && !await requestWorldEntry()) {
          if (isCurrentConnection() && !worldEntryBlocked) conn.disconnect();
          return;
        }

        startBaseSubscription({
          connection: conn,
          identity,
          includeDeveloperTables: isDeveloperIdentity(connectedIdentity),
          isCurrent: isCurrentConnection,
          isPresenceSubscriptionTransitioning: presenceService.isSubscriptionTransitioning,
          batch: batchChanges,
          handlers: baseSubscriptionHandlers,
          onHydrated: () => {
            hydrationReady = true;
            accountService.finishHydration();
            setWakeReconnectVisible(false);
            setNetworkReconnectVisible(false);
            presenceService.activateSubscriptions();
            sessionGeneration += 1;
            onChange();
          },
          onError: (event) => console.error("Wildwood SpacetimeDB subscription error:", event),
          afterHydrated: () => {
            void playerProfileService.loadLeaderboardSnapshot();
            progressionService.flushPendingProgress();
          },
        });
        onChange?.();
      }).catch((error) => {
        if (generation !== connectionGeneration) return;
        handleReducerFailure("protocol registration", error);
        conn.disconnect();
      });
    })
    .onDisconnect((_ctx, error) => {
      if (generation !== connectionGeneration) return;
      virtualPlayerLoadTest.disconnectLocal();
      const hadActiveGame = hydrationReady;
      connecting = false;
      connection = null;
      localDbIdentity = null;
      hydrationReady = false;
      connectedSignedIn = false;
      presenceService.markDisconnected();
      latencyMs = null;
      lastLatencyProbeStartedAt = 0;
      worldEntryPromise = null;
      worldEntryGeneration = 0;
      progressionService.markDisconnected();
      clearRealtimeCaches();
      if (hadActiveGame && !protocolBlocked) setNetworkReconnectVisible(true);
      else setNetworkReconnectVisible(false);
      if (error) console.warn("Wildwood SpacetimeDB disconnected:", error);
      onChange?.();
      scheduleReconnect();
    })
    .onConnectError((_ctx: ErrorContext, error: Error) => {
      if (generation !== connectionGeneration) return;
      connecting = false;
      connection = null;
      localDbIdentity = null;
      hydrationReady = false;
      connectedSignedIn = false;
      presenceService.markDisconnected();
      latencyMs = null;
      lastLatencyProbeStartedAt = 0;
      worldEntryPromise = null;
      worldEntryGeneration = 0;
      if (accountService.onConnectError(signedIn, error)) return;
      console.warn("Wildwood SpacetimeDB unavailable:", error.message);
      onChange?.();
      scheduleReconnect(1_000);
    })
    .build();
}

export const wildwoodCoop = {
  host,
  databaseName,
  connect,
  setOnChange(callback: (() => void) | null) {
    changeListener = callback;
  },
  ...progressionService.api,
  isConnected() {
    return Boolean(connection?.isActive && hydrationReady);
  },
  isReconnectingAfterWake() {
    return connectionGateState(protocolBlocked, wakeReconnectVisible, networkReconnectVisible).reconnecting;
  },
  latencyMs() {
    return latencyMs;
  },
  prepareUpdateReload(version: string) {
    accountService.prepareUpdateReload(version);
  },
  virtualPlayerLoadTestState() {
    return virtualPlayerLoadTest.state();
  },
  async startVirtualPlayers(count: number) {
    if (protocolBlocked || !connection?.isActive || !isDeveloperIdentity(localIdentity)) {
      return { ok: false, error: "DEVELOPER CONNECTION REQUIRED" };
    }
    return virtualPlayerLoadTest.start(count);
  },
  async stopVirtualPlayers() {
    return virtualPlayerLoadTest.stop(Boolean(connection?.isActive && isDeveloperIdentity(localIdentity)));
  },
  ...accountService.api,
  localIdentity() {
    return localIdentity;
  },
  sessionGeneration() {
    return sessionGeneration;
  },
  ...presenceService.api,
  ...profileDirectory.api,
  ...developerService.api,
  ...playerProfileService.api,
  ...remoteCombatStatsService.api,
  ...bossService.api,
  ...chatService.api,
  ...duelService.api,
  subscriptionCount() {
    if (!connection?.isActive) return 0;
    return 1 + presenceService.activeSubscriptionCount() + playerProfileService.activeSubscriptionCount() + remoteCombatStatsService.activeSubscriptionCount() + duelService.activeReplayLoadCount();
  },
};

runtime.wildwoodCoop = wildwoodCoop;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pageWakeTracker.hide();
    reconnectWatchdog.clear();
    return;
  }
  pageWakeTracker.show();
});
window.addEventListener("pageshow", (event) => {
  pageWakeTracker.show(event.persisted);
});
window.addEventListener("pagehide", () => {
  pageWakeTracker.hide();
  reconnectWatchdog.clear();
  virtualPlayerLoadTest.disconnectLocal();
});
window.addEventListener("online", () => reconnectAfterWake());
window.addEventListener("focus", () => reconnectAfterWake());
window.setInterval(() => {
  if (!document.hidden && navigator.onLine && !connection?.isActive && !connecting) scheduleReconnect(100);
}, 5_000);
window.addEventListener("storage", (event) => {
  accountService.handleStorageEvent(event);
});
void accountService.restoreKnownAccount().then(() => {
  const releaseNotes = createStartupReleaseNotes({
    version: GAME_VERSION,
    releases: () => recentReleaseNotes(2),
    seenVersion: () => {
      try { return localStorage.getItem(SEEN_VERSION_KEY) || ""; }
      catch { return ""; }
    },
    markSeen: () => {
      try { localStorage.setItem(SEEN_VERSION_KEY, GAME_VERSION); }
      catch {}
    },
  });
  const authGate = createStartupAuthGate({
    accountState: wildwoodCoop.accountState,
    knownCharacter: wildwoodCoop.knownCharacter,
    signIn: wildwoodCoop.signIn,
    continueAsGuest: wildwoodCoop.continueAsGuest,
    subscribe(listener) {
      startupChangeListener = listener;
      return () => {
        if (startupChangeListener === listener) startupChangeListener = null;
      };
    },
    loadGame: () => loadDeferredGameBundle(),
    releaseNotes,
  });
  authGate.start();
}).catch((error) => {
  console.error("Wildwood account startup failed:", error);
  const loadingDetail = document.getElementById("loadingDetail");
  if (loadingDetail) loadingDetail.textContent = "ACCOUNT STARTUP FAILED · REFRESH TO TRY AGAIN";
});

export default wildwoodCoop;
