import { watchDefeatSession } from "./coop/services/defeat-session-watch";
import { watchOfflineProgress, watchOfflineProgressPreference, type OfflineProgressSummary } from "./coop/services/offline-progress-watch";
import { consumeUpdateResumeMode } from "./coop/services/update-resume-browser";
import { configureConnectionDiagnostics, recordConnectionDiagnostic, flushConnectionDiagnostics } from "./coop/services/connection-diagnostic-runtime";
import { bindProgressFlushOnHide } from "./coop/services/flush-on-hide";
import { diagnosticWebSocket } from "./coop/services/diagnostic-websocket";
import { enterWorldAfterConsent } from "./coop/services/world-entry-consent";
import { accountStorageKeys } from "./coop/services/account-storage-keys";
import { createCommunityServices } from "./coop/services/community-services";
import { createConnectionStatusApi } from "./coop/services/connection-status-api";
import "./ui/game-shell";
import { DbConnection, type ErrorContext } from "./module_bindings";
import type { Identity } from "spacetimedb";
import { isDeveloperIdentity } from "./app/developer";
import { GAME_VERSION } from "./game/runtime/game-settings";
import { createVirtualPlayerLoadTest } from "./coop/services/virtual-player-load-test";
import { createReconnectWatchdog } from "./coop/services/reconnect-watchdog";
import { guardConnectionActivity } from "./coop/services/connection-activity";
import { createReconnectScheduler } from "./coop/services/reconnect-scheduler";
import {
  createConnectionLifecycle,
  type ConnectionIssueCode,
  type ConnectionPhase,
} from "./coop/services/connection-lifecycle";
import { createWakeRecovery, TAB_AWAY_GRACE_MS } from "./coop/services/wake-recovery";
import { createPageWakeTracker } from "./coop/services/page-wake-tracker";
import { connectionGateState } from "./coop/services/connection-gate-state";
import { retryAfterMissingWorldPresence } from "./coop/services/world-presence-recovery";
import { reducerErrorMessage } from "./coop/services/reducer-errors";
import { shouldRetainProfilePresentation } from "./coop/services/profile-presence";
import { createUpdateResumeStore } from "./coop/services/update-resume-store";
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
import { createMultiplayerSync } from "./coop/services/multiplayer-sync";
import { validSupporterNames } from "../shared/patreon-ticker";
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
// Allow normal connection/session deadlines to recover before restarting a stalled attempt.
const WAKE_RECONNECT_WATCHDOG_MS = 45_000;
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

const updateResumeMode = consumeUpdateResumeMode({ version: GAME_VERSION, store: updateResumeStore, consumedKey: updateResumeConsumedKey, tabKey: authTabKey, tokenKey: accountTokenKey });
let connection: DbConnection | null = null;
let localIdentity = "";
/** Held until the UI has shown it; the server keeps its own copy until then. */
let pendingOfflineProgress: OfflineProgressSummary | null = null;
/** The account setting, mirrored so settings can render before a row arrives. */
let offlineProgressEnabled = true;
let localDbIdentity: Identity | null = null;
let latencyMs: number | null = null;
let lastLatencyProbeStartedAt = 0;
let connecting = false;
let connectionGeneration = 0;
let sessionGeneration = 0;
let hydrationReady = false;
let sessionSubscriptions: ReturnType<typeof startBaseSubscription> | null = null;
let connectedSignedIn = false;
let lastServerActivityAt = performance.now();
let changeListener: (() => void) | null = null;
let startupChangeListener: (() => void) | null = null;
let changeBatchDepth = 0;
let batchedChangePending = false;
let protocolBlocked = false;
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
configureConnectionDiagnostics({ storageKey: `${authTabKey}:connection-diagnostics`,
  snapshot: () => ({ owner: localIdentity, mapId: presenceService.currentMapId(), database: databaseName,
    transport: "account", phase: connectionLifecycle.snapshot().phase, attempt: connectionLifecycle.snapshot().attempt,
    lastActivityAgeMs: performance.now() - lastServerActivityAt, latencyMs: latencyMs ?? 0 }),
  submit: () => connection?.isActive && connection.identity?.toHexString() === localIdentity
    ? payload => connection!.reducers.recordConnectionDiagnostic({ payload }) : null,
});

/** Coalesces table hydration into one UI refresh instead of one per row. */
function onChange() {
  if (changeBatchDepth > 0) {
    batchedChangePending = true;
    return;
  }
  sessionSubscriptions?.refresh(worldEntryGeneration === connectionGeneration && worldEntryGeneration !== 0, presenceService.currentMapId(), false);
  changeListener?.();
  startupChangeListener?.();
}

const reconnectWatchdog = createReconnectWatchdog({
  delayMs: WAKE_RECONNECT_WATCHDOG_MS,
  shouldWatch: () => wakeReconnectVisible && !document.hidden && !protocolBlocked && !worldEntryBlocked,
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

const connectionLifecycle = createConnectionLifecycle({
  now: () => performance.now(),
  scheduleTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
  cancelTimer: (timer) => window.clearTimeout(timer),
  onTimeout: (phase) => handleConnectionTimeout(phase),
  onIssue: (issue) => { recordConnectionDiagnostic("lifecycle-failure", { detail: `${issue.code}: ${issue.message}` }); console.warn("WildStat connection lifecycle failure:", issue); },
});

const pageWakeTracker = createPageWakeTracker({
  longWakeMs: TAB_AWAY_GRACE_MS,
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
  if (accountService.handleDefeatRestriction(message)) return;
  if (/active in another tab/i.test(message)) {
    recordConnectionDiagnostic("session-blocked", { detail: `${action}: ${message}` });
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
  recordConnectionDiagnostic("session-blocked", { detail: `${action}: ${message}` });
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
  if (protocolBlocked || worldEntryBlocked || !connection) return Promise.resolve(false);
  if (worldEntryGeneration === connectionGeneration) return Promise.resolve(true);
  if (worldEntryPromise) return worldEntryPromise;
  const conn = connection;
  const generation = connectionGeneration;
  worldEntryPromise = enterWorldAfterConsent(conn, accountService.tabId(), accountService.syncLegalConsent, () => connection === conn && generation === connectionGeneration)
    .then(() => {
      if (connection !== conn || generation !== connectionGeneration) return false;
      worldEntryBlocked = false;
      worldEntryGeneration = generation;
      multiplayerSync.sync();
      accountService.markPlayable(connectedSignedIn);
      progressionService.flushPendingProgress(true);
      onChange?.();
      return true;
    })
    .catch((error) => {
      if (connection !== conn || generation !== connectionGeneration) return false;
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
      if (connection === conn && generation === connectionGeneration) worldEntryPromise = null;
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

/**
 * Every reducer the client sends during play goes through here, and one that
 * resolves is proof the server answered. That is what the wake logic means by
 * activity, so this is where it is recorded: it used to be stamped only while
 * connecting, which left activityAge growing without bound and the grace check
 * that reads it dead after the first half minute of a session.
 */
function runWorldReducer<T>(reducer: () => T | PromiseLike<T>) {
  return retryAfterMissingWorldPresence(reducer, recoverMissingWorldPresence)
    .then(result => { touchServerActivity(); return result; });
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

const bossService = createBossService();

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

const multiplayerSync = createMultiplayerSync({
  session: () => connection?.isActive && hydrationReady && !protocolBlocked && !worldEntryBlocked
    && worldEntryGeneration === connectionGeneration ? connection : null,
  send: enabled => {
    const current = connection!;
    return reducerPort.runWorldReducer(() => current.reducers.setMultiplayerEnabled({ enabled }));
  },
});

const developerService = createDeveloperService({
  drainPendingProgress: () => progressionService.drainPendingProgress(),
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
  reserveStoppedMotion: () => presenceService.reserveStoppedMotion(),
  commitStoppedPosition: (position, sequence) => presenceService.commitStoppedPosition(position, sequence),
  storage: localStorage,
  pendingProgressKey,
  lootTabId: () => accountService.tabId(),
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
  multiplayerEnabled: multiplayerSync.enabled,
  drainEnemyLoot: progressionService.drainEnemyLoot,
  reducers: reducerPort,
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
  storage: localStorage,
});
const { guildService, socialService } = createCommunityServices({
  reducers: reducerPort, localIdentity: () => localIdentity, notify: onChange,
  rememberSender: profileDirectory.rememberChatSender,
  drainPendingProgress: progressionService.drainPendingProgress,
});
const baseSubscriptionHandlers = createBaseSubscriptionHandlers({
  presence: presenceService.tables,
  profile: profileDirectory.tables,
  progression: progressionService.tables,
  developer: developerService.tables,
  boss: bossService.tables,
  chat: chatService.tables,
  social: socialService.tables,
  duel: duelService.tables,
});

function clearRealtimeCaches() {
  multiplayerSync.reset();
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
  socialService.resetSession();
  bossService.resetSession();
}

function abandonConnection(disconnectTransport: boolean) {
  const staleConnection = connection;
  if (disconnectTransport && staleConnection) recordConnectionDiagnostic("connection-reset", { intentional: true, detail: connectionLifecycle.snapshot().issue?.code ?? "session-restart" });
  connection = null;
  connecting = false;
  hydrationReady = false;
  connectedSignedIn = false;
  protocolReadyGeneration = 0;
  localDbIdentity = null;
  wakeRecovery.cancel();
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

function restartConnectionForIdentityChange(bypassOnlineHint = false) {
  startupTelemetryRuntime.failConnection("connection-closed");
  reconnectScheduler.reset();
  connectionLifecycle.reset();
  worldEntryBlocked = false;
  abandonConnection(true);
  setWakeReconnectVisible(false);
  setNetworkReconnectVisible(false);
  onChange();
  scheduleReconnect(100, bypassOnlineHint);
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

const wakeRecovery = createWakeRecovery({
  now: () => Date.now(), hidden: () => document.hidden,
  blocked: () => protocolBlocked || worldEntryBlocked, connecting: () => connecting,
  connection: () => connection,
  activityAge: () => performance.now() - lastServerActivityAt,
  refreshWatchdog: () => reconnectWatchdog.refresh(), clearOverlay: () => setWakeReconnectVisible(false),
  clearNetworkOverlay: () => setNetworkReconnectVisible(false), changed: onChange,
  touchActivity: touchServerActivity, restart: restartStalledWakeConnection,
  failure: error => handleReducerFailure("session resume", error),
  diagnostic: (kind, detail, hiddenForMs) => recordConnectionDiagnostic(kind, { detail, hiddenForMs }),
  schedule: (callback, delay) => window.setTimeout(callback, delay), cancelTimer: timer => window.clearTimeout(timer),
});
function reconnectAfterWake(force = false, hiddenForMs = 0) {
  if (!force && pageWakeTracker.isHidden() && !document.hidden) { pageWakeTracker.show(); return; }
  wakeRecovery.resume(force, hiddenForMs);
}

function connect() {
  if (protocolBlocked || connection?.isActive || connecting) return;
  if (!accountService.canConnect()) return;
  connecting = true;
  const generation = ++connectionGeneration;
  const signedIn = Boolean(accountService.connectionCredential());
  connectionLifecycle.beginAttempt(CONNECTION_OPEN_TIMEOUT_MS);
  startupTelemetryRuntime.beginConnectionAttempt(generation, connectionLifecycle.snapshot().attempt);
  onChange();
  try {
    connection = guardConnectionActivity(DbConnection.builder()
    .withUri(host)
    .withDatabaseName(databaseName)
    .withWSFn(diagnosticWebSocket(recordConnectionDiagnostic, { transport: "account", database: databaseName, isCurrent: () => generation === connectionGeneration }, accountService.connectionToken))
    .withToken(accountService.connectionCredential() || accountService.guestToken() || undefined)
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
      accountService.watchLegalConsent(conn);
      watchDefeatSession(conn, accountService.connectionCredential(), () => generation === connectionGeneration && connection === conn, message => accountService.handleDefeatRestriction(message));
      watchOfflineProgress(conn, () => generation === connectionGeneration && connection === conn, summary => {
        pendingOfflineProgress = summary;
        onChange();
      });
      watchOfflineProgressPreference(conn, enabled => {
        if (generation !== connectionGeneration || connection !== conn) return;
        offlineProgressEnabled = enabled;
        onChange();
      });
      const protocolStartedAt = performance.now();
      void conn.reducers.registerProtocol({ protocolVersion: PROTOCOL_VERSION }).then(async () => {
        if (generation !== connectionGeneration || connection !== conn) return;
        await conn.reducers.registerClientVersion({ clientVersion: GAME_VERSION });
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
          handlers: baseSubscriptionHandlers,
          onHydrated: () => {
            recordConnectionDiagnostic("reconnected");
            hydrationReady = true;
            multiplayerSync.sync();
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
            void flushConnectionDiagnostics();
          },
          onError: (event) => {
            console.error("WildStat SpacetimeDB subscription error:", event);
            retryFailedConnection("subscription-error", "World sync failed");
          },
          afterHydrated: () => {
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
      recordConnectionDiagnostic("connect-error", { detail: reducerErrorMessage(error) });
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
    .build());
  } catch (error) {
    if (generation !== connectionGeneration) return;
    console.warn("WildStat SpacetimeDB connection setup failed:", error);
    retryFailedConnection("connection-error", "Connection setup failed");
  }
}

export const wildstatCoop = {
  patreonSupporterNames: () => validSupporterNames(connection?.db.patreonTickerSupporters.iter() ?? []),
  setMultiplayerEnabled: multiplayerSync.setEnabled,
  host,
  databaseName,
  connect,
  setOnChange(callback: (() => void) | null) {
    changeListener = callback;
  },
  ...progressionService.api,
  ...createConnectionStatusApi({
    lifecycle: connectionLifecycle, reconnect: reconnectScheduler,
    connected: () => Boolean(connection?.isActive && hydrationReady),
    flags: () => [protocolBlocked, wakeReconnectVisible, networkReconnectVisible],
    latency: () => latencyMs,
  }),
  beginStartupTelemetryStage(stage: StartupTelemetryStage) {
    return startupTelemetryRuntime.beginStage(stage);
  },
  retryConnection,
  drainForUpdate: () => progressionService.drainPendingProgress(),
  acknowledgeRelease: async (id: string) => {
    if (!connection?.isActive) throw new Error("Not connected");
    await connection.reducers.acknowledgeRelease({ id });
  },
  prepareUpdateReload(version: string) {
    return accountService.prepareUpdateReload(version);
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
  pendingOfflineProgress: () => pendingOfflineProgress,
  offlineProgressEnabled: () => offlineProgressEnabled,
  async setOfflineProgressEnabled(enabled: boolean) {
    if (!connection?.isActive) return false;
    // Shown immediately; the subscription corrects it if the server disagrees.
    offlineProgressEnabled = enabled;
    onChange();
    await connection.reducers.setOfflineProgressEnabled({ enabled });
    return true;
  },
  async acknowledgeOfflineProgress() {
    pendingOfflineProgress = null;
    if (!connection?.isActive) return;
    await connection.reducers.acknowledgeOfflineSummary({});
  },
  async simulateTimeAway(seconds: number) {
    if (!connection?.isActive || !isDeveloperIdentity(localIdentity)) return false;
    await connection.reducers.simulateTimeAway({ seconds });
    return true;
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
  social: socialService.api,
  subscriptionCount() {
    if (!connection?.isActive) return 0;
    return 1 + presenceService.activeSubscriptionCount() + playerProfileService.activeSubscriptionCount() + remoteCombatStatsService.activeSubscriptionCount() + duelService.activeReplayLoadCount();
  },
};

runtime.wildstatCoop = wildstatCoop;
runtime.wildwoodCoop = wildstatCoop; // Compatibility for existing browser integrations.
bindProgressFlushOnHide(document, window, force => progressionService.flushPendingProgress(force));
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
  multiplayerSync.sync();
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
