import { accountStorageKeys } from "./coop/services/account-storage-keys";
import { createGuildService } from "./coop/services/guild-service";
import { createConnectionStatusApi } from "./coop/services/connection-status-api";
import { createMapShardClient } from "./coop/services/map-shard-client";
import "./ui/game-shell";
import { DbConnection, type ErrorContext } from "./module_bindings";
import type { Identity } from "spacetimedb";
import { isDeveloperIdentity } from "./app/developer";
import { GAME_VERSION } from "./game/runtime/game-settings";
import { createVirtualPlayerLoadTest } from "./coop/services/virtual-player-load-test";
import { createReconnectWatchdog } from "./coop/services/reconnect-watchdog";
import { createReconnectScheduler } from "./coop/services/reconnect-scheduler";
import {
  createConnectionLifecycle,
  type ConnectionIssueCode,
  type ConnectionPhase,
} from "./coop/services/connection-lifecycle";
import { createPageWakeTracker } from "./coop/services/page-wake-tracker";
import { connectionGateState } from "./coop/services/connection-gate-state";
import { retryAfterMissingWorldPresence } from "./coop/services/world-presence-recovery";
import { reducerErrorMessage } from "./coop/services/reducer-errors";
import { shouldRetainProfilePresentation } from "./coop/services/profile-presence";
import { createUpdateResumeStore, inferLegacyUpdateResumeMode, type UpdateResumeMode } from "./coop/services/update-resume-store";
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
import { createBaseSubscriptionHandlers, startBaseSubscription } from "./coop/services/base-subscription";
import { createAccountService, type AccountService } from "./coop/services/account-service";
import { validateSpacetimeIdToken } from "./coop/security/oidc-id-token";
import { createStartupTelemetryRuntime } from "./coop/services/startup-telemetry-runtime";
import { startStartupBootstrap } from "./coop/startup-bootstrap";
import type { ReducerPort } from "./coop/ports";
import type { StartupTelemetryStage } from "../shared/startup-telemetry";
export type * from "./coop/contracts";

type WildStatRuntime = Window & {
  WILDWOOD_SPACETIMEDB_HOST?: string;
  WILDWOOD_SPACETIMEDB_DB_NAME?: string;
};

const LATENCY_SAMPLE_INTERVAL_MS = 1_000;
const LATENCY_SMOOTHING = .25;
const WAKE_RECONNECT_WATCHDOG_MS = 10_000;
const WAKE_RECONNECT_FALLBACK_MS = 4_000;
const CONNECTION_OPEN_TIMEOUT_MS = 15_000;
const SESSION_PREPARE_TIMEOUT_MS = 20_000;
const SUBSCRIPTION_HYDRATION_TIMEOUT_MS = 20_000;

const runtime = window as WildStatRuntime;
const defaultHost = defaultRealtimeHost(window.location.hostname);
const host = runtime.WILDWOOD_SPACETIMEDB_HOST ?? defaultHost;
const databaseName = runtime.WILDWOOD_SPACETIMEDB_DB_NAME ?? "wildwood-coop";
const {
  tokenKey, guestTokenKey, accountTokenKey, accountLinkKey, accountMigrationPendingKey,
  authStateKey, authVerifierKey, authNonceKey, authRetryKey, knownAccountKey,
  knownAccountCharacterKey, knownAccountGenderKey, knownGuestCharacterKey, authReturnUiKey,
  updateResumeKey, updateResumeConsumedKey, authTabKey, pendingProgressKey, legalConsentKey,
} = accountStorageKeys(host, databaseName);
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
let mapShardClient: ReturnType<typeof createMapShardClient>;
let sessionSubscriptions: ReturnType<typeof startBaseSubscription> | null = null;
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
let protocolReadyGeneration = 0;
let accountService!: AccountService;
const startupTelemetryRuntime = createStartupTelemetryRuntime({
  clientVersion: GAME_VERSION,
  authStateKey,
  submit: () => {
    const activeConnection = connection;
    if (!hydrationReady || !activeConnection?.isActive) return null;
    return (samples) => activeConnection.reducers.recordStartupTelemetry({ samples });
  },
});
startupTelemetryRuntime.startPageLoadMeasurement();

/** Coalesces table hydration into one UI refresh instead of one per row. */
function onChange() {
  if (changeBatchDepth > 0) {
    batchedChangePending = true;
    return;
  }
  sessionSubscriptions?.refresh(worldEntryGeneration === connectionGeneration && worldEntryGeneration !== 0, presenceService.currentMapId(), !mapShardClient?.enabled());
  changeListener?.();
  startupChangeListener?.();
}

const reconnectWatchdog = createReconnectWatchdog({
  delayMs: WAKE_RECONNECT_WATCHDOG_MS,
  shouldWatch: () => wakeReconnectVisible && !document.hidden && !protocolBlocked && !worldEntryBlocked,
  onTimeout: restartStalledWakeConnection,
  deadlineMs: WAKE_RECONNECT_FALLBACK_MS,
  shouldUseDeadline: () => wakeReconnectVisible && !document.hidden && !protocolBlocked && !worldEntryBlocked,
  onDeadline: () => window.location.reload(),
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

const connectionLifecycle = createConnectionLifecycle({
  now: () => performance.now(),
  scheduleTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
  cancelTimer: (timer) => window.clearTimeout(timer),
  onTimeout: (phase) => handleConnectionTimeout(phase),
  onIssue: (issue) => console.warn("WildStat connection lifecycle failure:", issue),
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
    startupTelemetryRuntime.failConnection("session-error");
    worldEntryBlocked = true;
    connectionLifecycle.transition("blocked");
    accountService.setNotice("SIGNED OUT · ACCOUNT OPENED IN ANOTHER TAB");
    setWakeReconnectVisible(false);
    setNetworkReconnectVisible(false);
    onChange?.();
    return;
  }
  if (!/wildstat updated\. refresh to continue\./i.test(message)) {
    console.warn(`WildStat ${action} rejected:`, message);
    return;
  }

  // Do not let an old tab keep retrying saves or movement after Maincloud has
  // moved to a new protocol. Pending progress stays in local storage so the
  // freshly loaded client can submit it safely.
  protocolBlocked = true;
  startupTelemetryRuntime.failConnection("session-error");
  connectionLifecycle.transition("blocked");
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
        startupTelemetryRuntime.failConnection("session-error", generation);
        worldEntryBlocked = true;
        connectionLifecycle.transition("blocked");
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
  accountService.setNotice("REJOINING WILDSTAT");
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

const mapReducerPort: ReducerPort = {
  ...reducerPort,
  connection: () => mapShardClient ? mapShardClient.port.connection() : connection,
  sendReducer: (...args) => mapShardClient ? mapShardClient.port.sendReducer(...args) : reducerPort.sendReducer(...args),
};

const bossService = createBossService({
  reducers: mapReducerPort,
  notify: onChange,
  localPosition: () => presenceService?.localState() ?? null,
});

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

const developerService = createDeveloperService({
  reducers: reducerPort,
  notify: onChange,
  localIdentity: () => localIdentity,
  localDbIdentity: () => localDbIdentity,
  profileIdentityFor: profileDirectory.identityFor,
});

chatService = createChatService({
  reducers: reducerPort,
  notify: onChange,
  localIdentity: () => localIdentity,
  identityFor: profileDirectory.identityFor,
  nameFor: profileDirectory.nameFor,
  rememberSender: profileDirectory.rememberChatSender,
});

const progressionService = createProgressionService({
  reducers: reducerPort,
  notify: onChange,
  localIdentity: () => localIdentity,
  worldEntryReady: () => worldEntryGeneration === connectionGeneration,
  hydrationReady: () => hydrationReady,
  activeProfileIdentity: () => playerProfileService?.activeIdentity() ?? "",
  completeAccountReturn: () => accountService.completeAccountReturnWhenReady(),
  presentDeath: () => mapShardClient.presentDeath(),
  prepareResetRoute: () => mapShardClient.prepareResetRoute(),
  reserveStoppedMotion: () => presenceService.reserveStoppedMotion(),
  commitStoppedPosition: (position, sequence) => presenceService.commitStoppedPosition(position, sequence),
  storage: localStorage,
  pendingProgressKey,
});

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
  reducers: mapReducerPort,
  changes: { notify: onChange, batch: batchChanges },
  localIdentity: () => localIdentity,
  localDbIdentity: () => localDbIdentity,
  hydrationReady: () => hydrationReady,
  worldEntryReady: () => worldEntryGeneration === connectionGeneration,
  sessionConflict: () => worldEntryBlocked,
  authTabId: () => accountService.tabId(),
  onControllerConflict: () => {
    startupTelemetryRuntime.failConnection("session-error");
    worldEntryBlocked = true;
    connectionLifecycle.transition("blocked");
    accountService.setNotice("SIGNED OUT · ACCOUNT OPENED IN ANOTHER TAB");
  },
  directory: profileDirectory,
  developer: developerService,
  latencyMs: () => latencyMs,
});

accountService = createAccountService({
  keys: {
    tokenKey,
    guestTokenKey,
    accountTokenKey,
    accountLinkKey,
    accountMigrationPendingKey,
    authStateKey,
    authVerifierKey,
    authNonceKey,
    authRetryKey,
    knownAccountKey,
    knownAccountCharacterKey,
    knownAccountGenderKey,
    knownGuestCharacterKey,
    authReturnUiKey,
    authTabKey,
    legalConsentKey,
  },
  updateResumeMode,
  updateResumeStore,
  notify: onChange,
  connection: () => connection,
  connectedSignedIn: () => connectedSignedIn,
  hydrationReady: () => hydrationReady,
  protocolBlocked: () => protocolBlocked,
  protocolReady: () => protocolReadyGeneration === connectionGeneration,
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
  validateAccountIdToken: validateSpacetimeIdToken,
});

const duelService = createDuelService({
  reducers: reducerPort,
  notify: onChange,
  localIdentity: () => localIdentity,
  identityFor: profileDirectory.identityFor,
  drainPendingProgress: progressionService.drainPendingProgress,
  preparePosition: () => mapShardClient.prepareDuelPosition(presenceService.localState()),
  storage: localStorage,
});
const guildService = createGuildService({
  reducers: reducerPort, localIdentity: () => localIdentity,
  drainPendingProgress: progressionService.drainPendingProgress,
});
const baseSubscriptionHandlers = createBaseSubscriptionHandlers({
  presence: presenceService.tables,
  profile: profileDirectory.tables,
  progression: progressionService.tables,
  developer: developerService.tables,
  boss: bossService.tables,
  chat: chatService.tables,
  duel: duelService.tables,
});

mapShardClient = createMapShardClient({
  host, root: () => connection, port: reducerPort, handlers: baseSubscriptionHandlers,
  token: () => accountService.accountToken() || accountService.guestToken() || undefined,
  tabId: () => accountService.tabId(), changed: onChange,
  resetWorld: () => { presenceService.clearSession(true); presenceService.beginSession(false); bossService.resetSession(); },
  worldReady: () => presenceService.activateSubscriptions(),
});

function clearRealtimeCaches() {
  mapShardClient?.clear();
  sessionSubscriptions = null;
  remoteCombatStatsService.clearSession();
  playerProfileService.clearSession();
  presenceService.clearSession();
  profileDirectory.clearSession();
  progressionService.clearSession();
  developerService.clearSession();
  chatService.resetSession();
  duelService.resetSession();
  guildService.resetSession();
  bossService.resetSession();
}

function abandonConnection(disconnectTransport: boolean) {
  const staleConnection = connection;
  connection = null;
  connecting = false;
  hydrationReady = false;
  connectedSignedIn = false;
  protocolReadyGeneration = 0;
  localDbIdentity = null;
  resumeProbePromise = null;
  resumeProbeGeneration += 1;
  worldEntryPromise = null;
  worldEntryGeneration = 0;
  latencyMs = null;
  lastLatencyProbeStartedAt = 0;
  connectionGeneration += 1;
  virtualPlayerLoadTest.disconnectLocal();
  presenceService.markDisconnected();
  progressionService.markDisconnected();
  clearRealtimeCaches();
  if (disconnectTransport) {
    try { staleConnection?.disconnect(); } catch {}
  }
}

function restartConnectionForIdentityChange() {
  startupTelemetryRuntime.failConnection("connection-closed");
  reconnectScheduler.reset();
  connectionLifecycle.reset();
  worldEntryBlocked = false;
  abandonConnection(true);
  setWakeReconnectVisible(false);
  setNetworkReconnectVisible(false);
  onChange();
  scheduleReconnect(100);
}

function scheduleReconnect(delay?: number, bypassOnlineHint = false) {
  reconnectScheduler.schedule(delay, bypassOnlineHint);
}

function restartStalledWakeConnection() {
  startupTelemetryRuntime.failConnection("connection-closed");
  reconnectScheduler.clear();
  connectionLifecycle.transition("retrying");
  abandonConnection(true);
  onChange();
  scheduleReconnect(100, true);
}

function retryFailedConnection(code: ConnectionIssueCode, message: string) {
  startupTelemetryRuntime.failConnection(code);
  if (protocolBlocked || worldEntryBlocked) {
    connectionLifecycle.transition("blocked");
    return;
  }
  const hadPlayableSession = hydrationReady || sessionGeneration > 0;
  connectionLifecycle.fail(code, message);
  reconnectScheduler.clear();
  abandonConnection(true);
  if (hadPlayableSession) setNetworkReconnectVisible(true);
  onChange();
  scheduleReconnect();
}

function handleConnectionTimeout(phase: ConnectionPhase) {
  if (phase === "connecting") {
    retryFailedConnection("connection-timeout", "Server connection timed out");
    return;
  }
  if (phase === "preparing-session") {
    retryFailedConnection("session-timeout", "Session setup timed out");
    return;
  }
  if (phase === "hydrating") {
    retryFailedConnection("hydration-timeout", "World sync timed out");
  }
}

function retryConnection() {
  if (protocolBlocked || worldEntryBlocked || document.hidden) return false;
  const hadPlayableSession = hydrationReady || sessionGeneration > 0;
  reconnectScheduler.reset();
  if (connection || connecting) {
    startupTelemetryRuntime.failConnection("connection-closed");
    abandonConnection(true);
  }
  connectionLifecycle.transition("retrying");
  if (hadPlayableSession) setNetworkReconnectVisible(true);
  onChange();
  scheduleReconnect(0, true);
  return true;
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
  connectionLifecycle.beginAttempt(CONNECTION_OPEN_TIMEOUT_MS);
  startupTelemetryRuntime.beginConnectionAttempt(generation, connectionLifecycle.snapshot().attempt);
  onChange();
  try {
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
      protocolReadyGeneration = 0;
      touchServerActivity();
      protocolBlocked = false;
      worldEntryPromise = null;
      worldEntryGeneration = 0;
      worldEntryBlocked = false;
      reconnectScheduler.clear();
      startupTelemetryRuntime.advanceConnection("preparing-session", generation);
      connectionLifecycle.transition("preparing-session", SESSION_PREPARE_TIMEOUT_MS);
      onChange();
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
        protocolReadyGeneration = generation;
        accountService.clearRetry();
        recordLatency(protocolStartedAt);
        const isCurrentConnection = () => {
          const current = generation === connectionGeneration && connection === conn;
          if (current) touchServerActivity();
          return current;
        };

        await accountService.syncLegalConsent(conn);
        if (!isCurrentConnection()) return;
        if (!await accountService.claimAccountLink(conn, signedIn, isCurrentConnection)) return;
        if (!await accountService.handlePendingTakeover(conn, isCurrentConnection)) return;

        if (accountService.shouldEnterWorld(signedIn)) {
          if (!accountService.legalConsentAccepted()) {
            accountService.setNotice("AGE & TERMS REQUIRED");
          } else if (!await requestWorldEntry()) {
            if (isCurrentConnection() && !worldEntryBlocked) {
              startupTelemetryRuntime.failConnection("session-error", generation);
              connectionLifecycle.fail("session-error", "World entry failed");
              conn.disconnect();
            }
            return;
          }
        }

        startupTelemetryRuntime.advanceConnection("hydrating", generation);
        connectionLifecycle.transition("hydrating", SUBSCRIPTION_HYDRATION_TIMEOUT_MS);
        mapShardClient.attach(conn, identity);
        sessionSubscriptions = startBaseSubscription({
          connection: conn,
          identity,
          includeDeveloperTables: isDeveloperIdentity(connectedIdentity),
          onLoading: () => {
            hydrationReady = false;
            connectionLifecycle.transition("hydrating", SUBSCRIPTION_HYDRATION_TIMEOUT_MS);
          },
          isCurrent: isCurrentConnection,
          isPresenceSubscriptionTransitioning: presenceService.isSubscriptionTransitioning,
          batch: batchChanges,
          handlers: mapShardClient.rootHandlers,
          onHydrated: () => {
            hydrationReady = true;
            startupTelemetryRuntime.completeConnection(generation);
            connectionLifecycle.ready();
            reconnectScheduler.reset();
            accountService.finishHydration();
            setWakeReconnectVisible(false);
            setNetworkReconnectVisible(false);
            if (worldEntryGeneration === generation) presenceService.activateSubscriptions();
            sessionGeneration += 1;
            onChange();
            startupTelemetryRuntime.flush();
          },
          onError: (event) => {
            console.error("WildStat SpacetimeDB subscription error:", event);
            retryFailedConnection("subscription-error", "World sync failed");
          },
          afterHydrated: () => {
            if (worldEntryGeneration === generation) void playerProfileService.loadLeaderboardSnapshot();
            progressionService.flushPendingProgress();
          },
        });
        onChange?.();
      }).catch((error) => {
        if (generation !== connectionGeneration) return;
        handleReducerFailure("session preparation", error);
        startupTelemetryRuntime.failConnection("session-error", generation);
        if (protocolBlocked || worldEntryBlocked) connectionLifecycle.transition("blocked");
        else connectionLifecycle.fail("session-error", "Session setup failed");
        conn.disconnect();
      });
    })
    .onDisconnect((_ctx, error) => {
      if (generation !== connectionGeneration) return;
      const hadActiveGame = hydrationReady || sessionGeneration > 0;
      const diagnostics = connectionLifecycle.snapshot();
      if (protocolBlocked || worldEntryBlocked) connectionLifecycle.transition("blocked");
      else if (diagnostics.phase === "blocked") connectionLifecycle.transition("retrying");
      else if (diagnostics.phase !== "retrying") {
        startupTelemetryRuntime.failConnection("connection-closed", generation);
        connectionLifecycle.fail("connection-closed", "Connection closed");
      }
      abandonConnection(false);
      if (hadActiveGame && !protocolBlocked && !worldEntryBlocked) setNetworkReconnectVisible(true);
      else setNetworkReconnectVisible(false);
      if (error) console.warn("WildStat SpacetimeDB disconnected:", error);
      onChange?.();
      scheduleReconnect();
    })
    .onConnectError((_ctx: ErrorContext, error: Error) => {
      if (generation !== connectionGeneration) return;
      const hadPlayableSession = hydrationReady || sessionGeneration > 0;
      abandonConnection(false);
      if (accountService.onConnectError(signedIn, error)) {
        startupTelemetryRuntime.failConnection("connection-error", generation);
        connectionLifecycle.reset();
        onChange?.();
        return;
      }
      startupTelemetryRuntime.failConnection("connection-error", generation);
      connectionLifecycle.fail("connection-error", "Could not reach WildStat");
      if (hadPlayableSession) setNetworkReconnectVisible(true);
      console.warn("WildStat SpacetimeDB unavailable:", error.message);
      onChange?.();
      scheduleReconnect();
    })
    .build();
  } catch (error) {
    if (generation !== connectionGeneration) return;
    console.warn("WildStat SpacetimeDB connection setup failed:", error);
    retryFailedConnection("connection-error", "Connection setup failed");
  }
}

export const wildstatCoop = {
  host,
  databaseName,
  connect,
  setOnChange(callback: (() => void) | null) {
    changeListener = callback;
  },
  ...progressionService.api,
  ...createConnectionStatusApi({
    lifecycle: connectionLifecycle, reconnect: reconnectScheduler,
    connected: () => Boolean(connection?.isActive && hydrationReady && mapShardClient.ready()),
    flags: () => [protocolBlocked, wakeReconnectVisible, networkReconnectVisible],
    latency: () => latencyMs,
  }),
  beginStartupTelemetryStage(stage: StartupTelemetryStage) {
    return startupTelemetryRuntime.beginStage(stage);
  },
  retryConnection,
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
  accountState() {
    const diagnostics = connectionLifecycle.snapshot();
    return {
      ...accountService.api.accountState(),
      connectionPhase: diagnostics.phase,
      connectionIssue: diagnostics.phase === "retrying" ? diagnostics.issue : null,
    };
  },
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
  guild: guildService.api,
  subscriptionCount() {
    if (!connection?.isActive) return 0;
    return 1 + presenceService.activeSubscriptionCount() + playerProfileService.activeSubscriptionCount() + remoteCombatStatsService.activeSubscriptionCount() + duelService.activeReplayLoadCount();
  },
};

runtime.wildstatCoop = wildstatCoop;
runtime.wildwoodCoop = wildstatCoop; // Compatibility for existing browser integrations.
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
  if (event.persisted) {
    startupTelemetryRuntime.cancelAbandonedSignIn(accountService.cancelAbandonedSignIn());
  }
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
startStartupBootstrap({
  restoreKnownAccount: () => startupTelemetryRuntime.restoreKnownAccount(
    accountService.restoreKnownAccount,
    accountService.notice,
  ),
  accountState: wildstatCoop.accountState,
  knownCharacter: wildstatCoop.knownCharacter,
  signIn: () => startupTelemetryRuntime.signIn(accountService.api.signIn),
  continueAsGuest: wildstatCoop.continueAsGuest,
  legalConsentAccepted: wildstatCoop.legalConsentAccepted,
  acceptLegalTerms: wildstatCoop.acceptLegalTerms,
  subscribe(listener) {
    startupChangeListener = listener;
    return () => {
      if (startupChangeListener === listener) startupChangeListener = null;
    };
  },
  beginTelemetryStage: startupTelemetryRuntime.beginStage,
});

export default wildstatCoop;
