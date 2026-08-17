import { DbConnection, tables, type ErrorContext } from "./module_bindings";
import type { Identity } from "spacetimedb";
import { isDeveloperIdentity } from "./app/developer";
import { GAME_VERSION } from "./game/runtime/game-settings";
import { isResearchId, type ResearchId } from "../shared/research";
import { createDuelCooldownStore } from "./coop/services/duel-cooldown-store";
import {
  copyProgress,
  mergeProgress,
  progressCovers,
  sameProgressSave,
  type PlayerProgress,
  type ProgressSave,
} from "./coop/services/progress";
import { createProgressStore } from "./coop/services/progress-store";
import { createVirtualPlayerLoadTest } from "./coop/services/virtual-player-load-test";
import { resolvePlayerPresenceMap } from "./coop/services/profile-presence";
import {
  createUpdateResumeStore,
  inferLegacyUpdateResumeMode,
  type UpdateResumeMode,
} from "./coop/services/update-resume-store";
import {
  adaptiveRemoteRenderAt,
  appendRemoteTimelineSample,
  createRemoteInterpolationClock,
  createRestartRemoteInterpolationClock,
  observeRemoteSample,
  remoteMotionAt,
  type RemoteInterpolationClock,
} from "./coop/services/remote-interpolation";
import {
  decodePlayerMotionFrame,
} from "../shared/player-motion-frame";
import {
  movementUpdateReason,
  normalizeMovementVector,
  type MovementInputKind,
  type SentMovementState,
} from "./coop/services/sparse-movement";
import {
  BEGINNER_DESERT_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  NAME_ADJECTIVES,
  NAME_CREATURES,
  PLAYER_SPAWN,
  PROTOCOL_VERSION,
  SPACETIME_AUTH_CLIENT_ID,
  SPACETIME_AUTH_ISSUER,
  TUTORIAL_FOREST_MAP_ID,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "../shared/rules";

type WildwoodRuntime = Window & {
  WILDWOOD_SPACETIMEDB_HOST?: string;
  WILDWOOD_SPACETIMEDB_DB_NAME?: string;
};

export type RemotePlayer = {
  id: string;
  name: string;
  power: number;
  x: number;
  y: number;
  speed: number;
  facing: number;
  moving: boolean;
  feetItem: string;
  headItem: string;
  chestItem: string;
};

export type MapPlayerMarker = {
  id: string;
  x: number;
  y: number;
};

export type LocalPlayerState = {
  x: number;
  y: number;
  facing: number;
  speed: number;
  moving: boolean;
  lastInputSequence: number;
  mapId: string;
};

export type ChatMessage = {
  id: bigint;
  sender: string;
  senderName: string;
  message: string;
  replayId: bigint;
  powerLevel: number;
  sentAtMs: number;
};

export type { PlayerProgress } from "./coop/services/progress";

export type PlayerResearch = Record<ResearchId, number>;
export type ActiveResearch = { researchId: ResearchId; targetRank: number; startedAtMs: number; completesAtMs: number };

export type PlayerLifetime = {
  joinedAtMs: number;
  playedSeconds: number;
  sessionStartedAtMs: number;
  enemyKills: number;
  deathCount: number;
};

export type PlayerProfileData = {
  identity: string;
  name: string;
  progress: PlayerProgress;
  research: PlayerResearch;
  lifetime: PlayerLifetime;
  mapId?: string;
};

export type LeaderboardEntry = {
  identity: string;
  name: string;
  power: number;
  damage: number;
  maxHp: number;
  armor: number;
  regen: number;
  playedSeconds: number;
  isGuest: boolean;
};

export type AccessAuditEntry = {
  identity: string;
  displayName: string;
  firstSeenAtMs: number;
  lastSeenAtMs: number;
  accountType: string;
  lastProtocolVersion: number;
  label: string;
};

export type BugReportEntry = {
  id: bigint;
  reporter: string;
  reporterName: string;
  message: string;
  protocolVersion: number;
  reportedAtMs: number;
};

export type DragonBossState = {
  encounter: bigint;
  hp: number;
  maxHp: number;
  alive: boolean;
  respawnAtMs: number;
};

export type SpiderBossState = DragonBossState;
export type SpiderResult = DragonResult;
export type FrostclawBossState = DragonBossState;
export type FrostclawResult = DragonResult;

export type DragonContributor = {
  identity: string;
  name: string;
  damage: number;
  percentage: number;
};

export type DragonResult = {
  encounter: bigint;
  totalDamage: number;
  contributors: DragonContributor[];
  createdAtMs: number;
};

export type DuelState = {
  id: bigint;
  challenger: string;
  opponent: string;
  status: string;
  createdAtMs: number;
  startsAtMs: number;
  startedAtMs: number;
  endsAtMs: number;
  challengerHp: number;
  challengerMaxHp: number;
  challengerDamage: number;
  challengerArmor: number;
  challengerAttackRate: number;
  challengerRegen: number;
  challengerAttacks: number;
  opponentHp: number;
  opponentMaxHp: number;
  opponentDamage: number;
  opponentArmor: number;
  opponentAttackRate: number;
  opponentRegen: number;
  opponentAttacks: number;
  challengerHeadItem: string;
  challengerChestItem: string;
  challengerFeetItem: string;
  challengerRightHandItem: string;
  challengerLeftHandItem: string;
  opponentHeadItem: string;
  opponentChestItem: string;
  opponentFeetItem: string;
  opponentRightHandItem: string;
  opponentLeftHandItem: string;
};

export type DuelReplay = {
  id: bigint;
  challengerIdentity: string;
  opponentIdentity: string;
  challengerName: string;
  opponentName: string;
  winnerName: string;
  durationSeconds: number;
  challengerMaxHp: number;
  challengerDamage: number;
  challengerArmor: number;
  challengerAttackRate: number;
  challengerRegen: number;
  challengerFinalHp: number;
  challengerAttacks: number;
  challengerDamageDealt: number;
  challengerRegened: number;
  challengerBlocked: number;
  opponentMaxHp: number;
  opponentDamage: number;
  opponentArmor: number;
  opponentAttackRate: number;
  opponentRegen: number;
  opponentFinalHp: number;
  opponentAttacks: number;
  opponentDamageDealt: number;
  opponentRegened: number;
  opponentBlocked: number;
  challengerHeadItem: string;
  challengerChestItem: string;
  challengerFeetItem: string;
  challengerRightHandItem: string;
  challengerLeftHandItem: string;
  opponentHeadItem: string;
  opponentChestItem: string;
  opponentFeetItem: string;
  opponentRightHandItem: string;
  opponentLeftHandItem: string;
};

type RemotePlayerTarget = RemotePlayer & {
  samples: RemotePlayerSample[];
  interpolationClock: RemoteInterpolationClock;
  lastInputSequence: number;
};

type RemotePlayerSample = {
  timelineAt: number;
  serverAtMs: number;
  receivedAt: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  facing: number;
  moving: boolean;
};

type PlayerInterestArea = { left: number; top: number; right: number; bottom: number };
type MapZoneBounds = { mapId: string; minZoneX: number; maxZoneX: number; minZoneY: number; maxZoneY: number };

// Detailed-player subscriptions follow actual camera bounds. This radius is
// only the startup fallback before the first rendered frame supplies them.
const MAP_PLAYER_ZONE_SIZE = 1_000;
const MAP_PLAYER_ZONE_RADIUS = 2;
const MAP_PLAYER_PREFETCH_ZONES = 1;
const MAX_MAP_ZONE_X = Math.floor((WORLD_WIDTH - 1) / MAP_PLAYER_ZONE_SIZE);
const MAX_MAP_ZONE_Y = Math.floor((WORLD_HEIGHT - 1) / MAP_PLAYER_ZONE_SIZE);
const LATENCY_SAMPLE_INTERVAL_MS = 1_000;
const LATENCY_SMOOTHING = .25;
const REMOTE_SNAP_DISTANCE = 260;
const REMOTE_SAMPLE_LIMIT = 8;
const SUBSCRIPTION_LOAD_TIMEOUT_MS = 10_000;
const DUEL_COOLDOWN_MS = 120_000;
const DUEL_COOLDOWN_KEY_PREFIX = "wildwood-duel-cooldown-v1:";

const runtime = window as WildwoodRuntime;
const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
const defaultHost = isLocalHost ? "ws://localhost:3000" : "wss://maincloud.spacetimedb.com";
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
const knownGuestCharacterKey = `${tokenKey}/guest_character_name_v1`;
const authReturnUiKey = `${tokenKey}/spacetimeauth_return_ui_v1`;
const updateResumeKey = `${tokenKey}/forced_update_resume_v1`;
const updateResumeConsumedKey = `${updateResumeKey}/consumed_version`;
const authTabKey = `${accountMigrationPendingKey}/tab_id`;
const pendingProgressKey = `${tokenKey}/pending_progress_v1`;
const SPACETIME_AUTHORIZATION_ENDPOINT = `${SPACETIME_AUTH_ISSUER}/auth`;
const SPACETIME_AUTH_TOKEN_ENDPOINT = `${SPACETIME_AUTH_ISSUER}/token`;
const SPACETIME_AUTH_SCOPE = "openid profile email";
const duelCooldownStore = createDuelCooldownStore(localStorage, DUEL_COOLDOWN_KEY_PREFIX);
const progressStore = createProgressStore(localStorage, pendingProgressKey);
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
const players = new Map<string, RemotePlayerTarget>();
const profiles = new Map<string, string>();
const profileIcons = new Map<string, number>();
const playerSprites = new Map<string, number>();
const skinTones = new Map<string, number>();
const profileIdentities = new Map<string, Identity>();
const motionIdentities = new Map<number, string>();
const activeMotionIdentities = new Set<string>();
const leaderboardEntries = new Map<string, LeaderboardEntry>();
const accessAuditEntries = new Map<string, AccessAuditEntry & { identityValue: Identity }>();
const bugReportEntries = new Map<string, BugReportEntry>();
const guestAccounts = new Map<string, boolean>();
let onlinePlayerCount = 0;
let localPresenceVisible = true;
const profileProgress = new Map<string, PlayerProgress>();
const profileResearch = new Map<string, PlayerResearch>();
const playerLifetimes = new Map<string, PlayerLifetime>();
const playerMaps = new Map<string, string>();
// Full player rows subscribed for an open profile must stay independent from
// current-map motion membership. Leaving our render zone is not going offline.
const profilePlayerMaps = new Map<string, string>();
const playerProfileLoads = new Map<string, Promise<PlayerProfileData | null>>();
let leaderboardSnapshotSubscription: { unsubscribe: () => void } | null = null;
let leaderboardSnapshotLoad: Promise<LeaderboardEntry[]> | null = null;
let cancelLeaderboardSnapshotLoad: (() => void) | null = null;
let activePlayerProfileIdentity = "";
let activePlayerProfileSubscription: { unsubscribe: () => void } | null = null;
let cancelActivePlayerProfileLoad: (() => void) | null = null;
let mapPlayerSubscription: { unsubscribe: () => void } | null = null;
let mapSubscriptionGeneration = 0;
let mapSubscriptionAreaKey = "";
let mapPlayerInterestBounds: MapZoneBounds | null = null;
let mapMarkerSubscription: { unsubscribe: () => void } | null = null;
let mapMarkerSubscriptionGeneration = 0;
let currentMapId = TUTORIAL_FOREST_MAP_ID;
const chatMessages: ChatMessage[] = [];
let chatPresentationRevision = 0;
const remotePlayerRenderBuffer: RemotePlayer[] = [];
const mapPlayerMarkers = new Map<string, MapPlayerMarker>();
const duels = new Map<bigint, DuelState>();
const duelReplays = new Map<bigint, DuelReplay>();
const replayLoads = new Map<bigint, Promise<DuelReplay | null>>();
const cancelReplayLoads = new Map<bigint, () => void>();
let sharedDragon: DragonBossState | null = null;
let sharedSpider: SpiderBossState | null = null;
let latestSpiderResult: SpiderResult | null = null;
let latestDragonResult: DragonResult | null = null;
let sharedFrostclaw: FrostclawBossState | null = null;
let latestFrostclawResult: FrostclawResult | null = null;

let connection: DbConnection | null = null;
let localIdentity = "";
let localMotionNetworkId: number | null = null;
let lastSentMovement: SentMovementState | null = null;
let nextPositionSequence = 0;
let latencyMs: number | null = null;
let lastLatencyProbeStartedAt = 0;
let reconnectTimer: number | null = null;
let connecting = false;
let connectionGeneration = 0;
let sessionGeneration = 0;
let hydrationReady = false;
let connectedSignedIn = false;
let guestSessionExplicit = updateResumeMode === "guest";
let pageWasHidden = false;
let pageHiddenAt = 0;
let lastServerActivityAt = performance.now();
let localState: LocalPlayerState | null = null;
let localDisplayName = "";
let localProfileReady = false;
let localProgress: PlayerProgress | null = null;
let localResearch: PlayerResearch = { warcraft: 0, moveSpeed: 0, foraging: 0, vitality: 0, precision: 0, criticalChance: 0, criticalDamage: 0, prosperity: 0 };
let localActiveResearch: ActiveResearch | null = null;
let lastSpeedSent: number | null = null;
let lastDuelPulseAt = 0;
let duelCooldownUntil = 0;
let changeListener: (() => void) | null = null;
let changeBatchDepth = 0;
let batchedChangePending = false;
let pendingProgress: ProgressSave | null = null;
let progressSaveInFlightUntil = 0;
let progressSavePromise: Promise<boolean> | null = null;
let authNotice = "";
let protocolBlocked = false;
let accountLinkClaiming = false;
let resumeProbePromise: Promise<void> | null = null;
let wakeReconnectVisible = false;
let serverUpdateVisible = false;
let reconnectAfterServerUpdateVisible = false;
let worldEntryPromise: Promise<boolean> | null = null;
let worldEntryGeneration = 0;
let worldEntryBlocked = false;
let takeoverRequested = false;
let accountCallbackPending = new URL(window.location.href).searchParams.has("code") ||
  new URL(window.location.href).searchParams.has("error");
let accountReturnPending = accountCallbackPending && (() => {
  try {
    return sessionStorage.getItem(authReturnUiKey) === "true";
  } catch {
    return false;
  }
})();
// Persisted credentials identify a known character, but entering that account
// always requires the player to press SIGN IN for this page session.
// One version-bound forced-update handoff is the only exception.
let accountSessionApproved = accountReturnPending || updateResumeMode === "account";
let updateResumePending = updateResumeMode !== null;
let lastPlayableSessionMode: UpdateResumeMode | null = null;

/** Coalesces table hydration into one UI refresh instead of one per row. */
function onChange() {
  if (changeBatchDepth > 0) {
    batchedChangePending = true;
    return;
  }
  changeListener?.();
}

function batchChanges(action: () => void) {
  changeBatchDepth += 1;
  try {
    action();
  } finally {
    changeBatchDepth -= 1;
    if (changeBatchDepth === 0 && batchedChangePending) {
      batchedChangePending = false;
      changeListener?.();
    }
  }
}

const virtualPlayerLoadTest = createVirtualPlayerLoadTest({
  host,
  databaseName,
  spawnContext: () => ({
    mapId: currentMapId,
    x: localState?.x ?? PLAYER_SPAWN.x,
    y: localState?.y ?? PLAYER_SPAWN.y,
  }),
  ownerIdentity: () => connection?.identity,
  beginServerRun: async (ticket, maxCount) => {
    const conn = connection;
    if (!conn?.isActive || !isDeveloperIdentity(localIdentity)) throw new Error("DEVELOPER CONNECTION REQUIRED");
    await conn.reducers.devBeginVirtualPlayerLoadTest({ ticket, maxCount });
  },
  clearServerPlayers: async () => {
    const conn = connection;
    if (!conn?.isActive || !isDeveloperIdentity(localIdentity)) throw new Error("DEVELOPER CONNECTION REQUIRED");
    await conn.reducers.devClearVirtualPlayers({});
  },
  onProtocolMismatch: (error) => handleReducerFailure("virtual-player protocol", error),
  onStateChange: onChange,
});

function reducerErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function rememberDuelCooldown(until: number) {
  duelCooldownUntil = until;
  duelCooldownStore.write(localIdentity, until);
}

function restoreDuelCooldown() {
  duelCooldownUntil = duelCooldownStore.read(localIdentity);
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

function storeUpdateResumeIntent(version: string) {
  if (!lastPlayableSessionMode) return;
  updateResumeStore.write(version, lastPlayableSessionMode);
}

function handleReducerFailure(action: string, error: unknown) {
  const message = reducerErrorMessage(error);
  if (/active in another tab/i.test(message)) {
    worldEntryBlocked = true;
    authNotice = "SIGNED OUT · ACCOUNT OPENED IN ANOTHER TAB";
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
  progressSaveInFlightUntil = Number.POSITIVE_INFINITY;
  virtualPlayerLoadTest.disconnectLocal();
  authNotice = "GAME UPDATING · WAITING FOR DEPLOY";
  onChange?.();
}

function sendReducer(action: string, reducer: () => unknown, onRejected?: () => void) {
  if (protocolBlocked || worldEntryBlocked) return;
  try {
    const startedAt = performance.now();
    const measureLatency = startedAt - lastLatencyProbeStartedAt >= LATENCY_SAMPLE_INTERVAL_MS;
    if (measureLatency) lastLatencyProbeStartedAt = startedAt;
    void Promise.resolve(reducer())
      .then(() => {
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
  worldEntryPromise = Promise.resolve(conn.reducers.enterWorld({ tabId: authTabId() }))
    .then(() => {
      if (connection !== conn || generation !== connectionGeneration) return false;
      worldEntryBlocked = false;
      worldEntryGeneration = generation;
      lastPlayableSessionMode = connectedSignedIn ? "account" : "guest";
      flushPendingProgress(true);
      onChange?.();
      return true;
    })
    .catch((error) => {
      if (/active in another tab/i.test(reducerErrorMessage(error))) {
        worldEntryBlocked = true;
        authNotice = "LOGGED IN ON ANOTHER TAB";
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

function accountToken() {
  try {
    const token = localStorage.getItem(accountTokenKey);
    if (!token) return null;

    // SpacetimeAuth ID tokens are JWTs. Avoid trying a token that is already
    // expired (or about to expire), which otherwise produces a visible 401
    // before the browser is sent back through sign-in.
    const payloadPart = token.split(".")[1];
    if (payloadPart) {
      try {
        const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
        const payload = JSON.parse(atob(padded)) as { exp?: unknown };
        if (typeof payload.exp === "number" && payload.exp * 1_000 <= Date.now() + 30_000) {
          localStorage.removeItem(accountTokenKey);
          return null;
        }
      } catch {
        // Let SpacetimeDB validate unfamiliar token formats.
      }
    }
    return token;
  } catch {
    return null;
  }
}

type AccountLinkTransaction = {
  code: string;
  guestIdentity: string;
};

function readTabValue(key: string) {
  try {
    const current = sessionStorage.getItem(key);
    if (current !== null) return current;
    const legacy = localStorage.getItem(key);
    if (legacy !== null) {
      sessionStorage.setItem(key, legacy);
      localStorage.removeItem(key);
    }
    return legacy;
  } catch {
    return null;
  }
}

function writeTabValue(key: string, value: string) {
  sessionStorage.setItem(key, value);
  try {
    localStorage.removeItem(key);
  } catch {}
}

function clearTabValue(key: string) {
  try {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  } catch {}
}

function readAccountLinkTransaction(): AccountLinkTransaction | null {
  const stored = readTabValue(accountLinkKey);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as Partial<AccountLinkTransaction>;
    if (typeof parsed.code === "string" && typeof parsed.guestIdentity === "string") {
      return { code: parsed.code, guestIdentity: parsed.guestIdentity };
    }
  } catch {
    // Legacy releases stored only the link code. Identity is unavailable, but
    // server-side claim still remains safe and authoritative.
    if (/^[A-Za-z0-9_-]{32,128}$/.test(stored)) return { code: stored, guestIdentity: "" };
  }
  clearTabValue(accountLinkKey);
  return null;
}

function writeAccountLinkTransaction(transaction: AccountLinkTransaction) {
  writeTabValue(accountLinkKey, JSON.stringify(transaction));
}

function clearStoredToken(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

function hasKnownAccount() {
  try {
    return localStorage.getItem(knownAccountKey) === "true";
  } catch {
    return false;
  }
}

function rememberAccount() {
  try {
    localStorage.setItem(knownAccountKey, "true");
  } catch {}
}

function rememberedAccountCharacter() {
  try {
    const displayName = localStorage.getItem(knownAccountCharacterKey)?.trim() || "";
    return isGeneratedDisplayName(displayName) ? "" : displayName;
  } catch {
    return "";
  }
}

function rememberAccountCharacter(displayName: string) {
  if (!displayName) return;
  try {
    localStorage.setItem(knownAccountCharacterKey, displayName);
  } catch {}
}

function rememberedGuestCharacter() {
  try {
    const displayName = localStorage.getItem(knownGuestCharacterKey)?.trim() || "";
    return isGeneratedDisplayName(displayName) ? "" : displayName;
  } catch {
    return "";
  }
}

function rememberConfirmedCharacter(displayName: string) {
  if (!displayName || isGeneratedDisplayName(displayName)) return;
  if (connection?.isActive ? connectedSignedIn : Boolean(accountToken())) {
    rememberAccountCharacter(displayName);
    return;
  }
  try {
    localStorage.setItem(knownGuestCharacterKey, displayName);
  } catch {}
}

function clearAccountReturnPending() {
  accountReturnPending = false;
  try {
    sessionStorage.removeItem(authReturnUiKey);
  } catch {}
}

function authTabId() {
  try {
    const existing = sessionStorage.getItem(authTabKey);
    if (existing) return existing;
    const created = randomUrlSafe(12);
    sessionStorage.setItem(authTabKey, created);
    return created;
  } catch {
    return "current-tab";
  }
}

function readMigrationBarriers() {
  try {
    const stored = localStorage.getItem(accountMigrationPendingKey);
    if (!stored) return {} as Record<string, number>;
    const legacyTimestamp = Number(stored);
    if (Number.isFinite(legacyTimestamp) && legacyTimestamp > 0) return { legacy: legacyTimestamp };
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    const barriers: Record<string, number> = {};
    for (const [tab, startedAt] of Object.entries(parsed)) {
      if (Number.isFinite(startedAt) && Date.now() - Number(startedAt) < 15 * 60_000) {
        barriers[tab] = Number(startedAt);
      }
    }
    return barriers;
  } catch {
    return {} as Record<string, number>;
  }
}

function markAccountMigrationPending() {
  try {
    const barriers = readMigrationBarriers();
    barriers[authTabId()] = Date.now();
    localStorage.setItem(accountMigrationPendingKey, JSON.stringify(barriers));
  } catch {}
}

function accountMigrationPending() {
  return Object.keys(readMigrationBarriers()).length > 0;
}

function clearAccountMigrationPending() {
  try {
    const barriers = readMigrationBarriers();
    delete barriers[authTabId()];
    delete barriers.legacy;
    if (Object.keys(barriers).length) localStorage.setItem(accountMigrationPendingKey, JSON.stringify(barriers));
    else localStorage.removeItem(accountMigrationPendingKey);
  } catch {}
}

function completeAccountReturnWhenReady() {
  if (!accountReturnPending || !accountToken() || !localProfileReady || !localProgress) return;
  clearAccountReturnPending();
}

function guestToken() {
  try {
    const saved = localStorage.getItem(guestTokenKey);
    if (saved) return saved;
    const legacy = localStorage.getItem(tokenKey);
    if (legacy) {
      localStorage.setItem(guestTokenKey, legacy);
      localStorage.removeItem(tokenKey);
      return legacy;
    }
  } catch {}
  return null;
}

function randomUrlSafe(bytes = 32) {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return btoa(String.fromCharCode(...values)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256UrlSafe(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function redirectUri() {
  return `${window.location.origin}${window.location.pathname}`;
}

async function completeAccountCallback() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const authError = url.searchParams.get("error");
  if (!code && !authError) return;
  const state = url.searchParams.get("state");
  const expectedState = readTabValue(authStateKey);
  const verifier = readTabValue(authVerifierKey);
  const cleanUrl = `${url.pathname}${url.hash}`;
  if (!state || state !== expectedState || !verifier) {
    accountCallbackPending = false;
    clearAccountReturnPending();
    authNotice = "SIGN-IN CHECK FAILED";
    if (readAccountLinkTransaction()) clearAccountMigrationPending();
    clearTabValue(authStateKey);
    clearTabValue(authVerifierKey);
    history.replaceState({}, "", cleanUrl);
    return;
  }

  if (authError) {
    accountCallbackPending = false;
    clearAccountReturnPending();
    authNotice = authError === "login_required" ? "AUTO SIGN-IN UNAVAILABLE" : "SIGN-IN FAILED";
    if (readAccountLinkTransaction()) clearAccountMigrationPending();
    clearTabValue(authStateKey);
    clearTabValue(authVerifierKey);
    history.replaceState({}, "", cleanUrl);
    return;
  }
  if (!code) return;

  try {
    const response = await fetch(SPACETIME_AUTH_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: SPACETIME_AUTH_CLIENT_ID,
        code,
        redirect_uri: redirectUri(),
        code_verifier: verifier,
      }),
    });
    const result = await response.json();
    if (!response.ok || typeof result.id_token !== "string") {
      throw new Error(result.error_description || result.error || "Token exchange failed");
    }
    localStorage.setItem(accountTokenKey, result.id_token);
    rememberAccount();
    authNotice = "SIGNED IN";
  } catch (error) {
    authNotice = "SIGN-IN FAILED";
    if (readAccountLinkTransaction()) clearAccountMigrationPending();
    clearAccountReturnPending();
    console.warn("Wildwood account sign-in failed:", error);
  } finally {
    accountCallbackPending = false;
    clearTabValue(authStateKey);
    clearTabValue(authVerifierKey);
    history.replaceState({}, "", cleanUrl);
  }
}

async function startAccountSignIn() {
  try {
    sessionStorage.setItem(authReturnUiKey, "true");
    accountReturnPending = true;
  } catch {}
  const verifier = randomUrlSafe(48);
  const state = randomUrlSafe(24);
  const challenge = await sha256UrlSafe(verifier);
  writeTabValue(authStateKey, state);
  writeTabValue(authVerifierKey, verifier);
  const url = new URL(SPACETIME_AUTHORIZATION_ENDPOINT);
  const parameters = new URLSearchParams({
    client_id: SPACETIME_AUTH_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SPACETIME_AUTH_SCOPE,
    state,
    nonce: randomUrlSafe(24),
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  url.search = parameters.toString();
  window.location.assign(url.toString());
}

async function restoreKnownAccount() {
  await completeAccountCallback();
  const token = accountToken();
  if (!token && hasKnownAccount() && !guestSessionExplicit) {
    if (updateResumeMode === "account") {
      authNotice = "REOPENING SIGN-IN";
      onChange?.();
      try {
        await startAccountSignIn();
      } catch (error) {
        updateResumePending = false;
        accountSessionApproved = false;
        clearAccountReturnPending();
        authNotice = "SIGN-IN FAILED · TRY AGAIN";
        console.warn("Wildwood update sign-in failed:", error);
        onChange?.();
      }
      return;
    }
    authNotice = "SIGN-IN REQUIRED";
    onChange?.();
    return;
  }
  if (token && hasKnownAccount() && !accountSessionApproved) {
    authNotice = "SIGN-IN REQUIRED";
    onChange?.();
    return;
  }
  wildwoodCoop.connect();
}

function readPendingProgress(identity: string): ProgressSave | null {
  return progressStore.read(identity);
}

function persistPendingProgress(progress: ProgressSave) {
  pendingProgress = copyProgress(progress);
  if (!localIdentity) return;
  pendingProgress = progressStore.write(localIdentity, pendingProgress);
}

function clearPendingProgress(identity = localIdentity) {
  if (identity === localIdentity) {
    pendingProgress = null;
    progressSaveInFlightUntil = 0;
  }
  progressStore.clear(identity);
}

function flushPendingProgressAsync(force = false): Promise<boolean> {
  if (progressSavePromise) {
    // A forced equipment save must run after the older snapshot, even when a
    // normal throttled save is already awaiting its server acknowledgement.
    return force
      ? progressSavePromise.then(() => pendingProgress ? flushPendingProgressAsync(true) : true)
      : progressSavePromise;
  }
  if (protocolBlocked || worldEntryBlocked || !connection || !pendingProgress) return Promise.resolve(!pendingProgress);
  if (worldEntryGeneration !== connectionGeneration) return Promise.resolve(false);
  if (!force && Date.now() < progressSaveInFlightUntil) return Promise.resolve(false);
  const conn = connection;
  const identity = localIdentity;
  const snapshot = copyProgress(pendingProgress);
  progressSaveInFlightUntil = Date.now() + 4_000;
  progressSavePromise = Promise.resolve(conn.reducers.savePlayerProgress(snapshot))
    .then(() => {
      if (identity === localIdentity && pendingProgress && sameProgressSave(pendingProgress, snapshot)) {
        clearPendingProgress(identity);
      }
      return true;
    })
    .catch((error) => {
      if (!protocolBlocked) progressSaveInFlightUntil = 0;
      handleReducerFailure("progress save", error);
      return false;
    })
    .finally(() => {
      progressSavePromise = null;
      // Equipment changes must reach nearby players without waiting for the
      // normal progress-save throttle or an earlier in-flight stat snapshot.
      if (force && identity === localIdentity && pendingProgress && !sameProgressSave(pendingProgress, snapshot)) {
        progressSaveInFlightUntil = 0;
        flushPendingProgress(true);
      }
    });
  return progressSavePromise;
}

function flushPendingProgress(force = false) {
  void flushPendingProgressAsync(force);
}

async function drainPendingProgress() {
  for (let attempt = 0; attempt < 3 && pendingProgress; attempt += 1) {
    if (!await flushPendingProgressAsync(true)) return false;
  }
  return !pendingProgress;
}

window.setInterval(() => flushPendingProgress(), 2_500);
window.addEventListener("pagehide", () => flushPendingProgress(true));

function generatedDisplayName(identity: string) {
  let hash = 2166136261;
  for (const character of identity) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const adjective = NAME_ADJECTIVES[(hash >>> 0) % NAME_ADJECTIVES.length];
  const creature = NAME_CREATURES[((hash >>> 8) >>> 0) % NAME_CREATURES.length];
  const number = String((hash >>> 16) % 1000).padStart(3, "0");
  return `${adjective} ${creature} ${number}`;
}

function isGeneratedDisplayName(displayName: string) {
  const [adjective, creature, suffix, ...extra] = displayName.split(" ");
  return extra.length === 0 &&
    NAME_ADJECTIVES.includes(adjective) &&
    NAME_CREATURES.includes(creature) &&
    /^\d{3}$/.test(suffix ?? "");
}

function serverTimestampMs(timestamp: { microsSinceUnixEpoch: bigint }) {
  return Number(timestamp.microsSinceUnixEpoch) / 1_000;
}

function appendRemoteMotionSample(existing: RemotePlayerTarget, sample: Omit<RemotePlayerSample, "timelineAt">) {
  const latest = existing.samples[existing.samples.length - 1];
  if (!latest || sample.serverAtMs <= latest.serverAtMs) return;

  const movementRestarted = !latest.moving && sample.moving;
  if (!movementRestarted) {
    observeRemoteSample(
      existing.interpolationClock,
      sample.serverAtMs - latest.serverAtMs,
      sample.receivedAt - latest.receivedAt,
    );
  }
  const distance = Math.hypot(sample.x - latest.x, sample.y - latest.y);
  if (movementRestarted) {
    existing.samples.length = 0;
    existing.samples.push({ ...sample, timelineAt: sample.receivedAt });
    existing.interpolationClock = createRestartRemoteInterpolationClock(sample.receivedAt);
  } else if (distance > REMOTE_SNAP_DISTANCE) {
    existing.samples.length = 0;
    existing.samples.push({ ...sample, timelineAt: sample.receivedAt });
    existing.interpolationClock = createRemoteInterpolationClock(sample.receivedAt);
  } else {
    appendRemoteTimelineSample(existing.samples, sample);
  }
  while (existing.samples.length > REMOTE_SAMPLE_LIMIT) existing.samples.shift();
  existing.moving = sample.moving;
}

function upsertPlayer(row: {
  identity: Identity;
  x: number;
  y: number;
  facing: number;
  dx: number;
  dy: number;
  moving: boolean;
  power: number;
  powerLevel: number;
  speed: number;
  feetItem: string;
  headItem: string;
  chestItem: string;
  isVisible: boolean;
  lastInputAt: { microsSinceUnixEpoch: bigint };
  lastInputSequence: number;
  controllerTabId: string;
  mapId: string;
}) {
  const id = row.identity.toHexString();
  if (id === localIdentity) {
    const nextMapId = row.mapId || TUTORIAL_FOREST_MAP_ID;
    const firstLocalState = localState === null;
    const presenceChanged = localPresenceVisible !== row.isVisible;
    const conflictBefore = worldEntryBlocked;
    playerMaps.set(id, nextMapId);
    localPresenceVisible = row.isVisible;
    if (worldEntryGeneration === connectionGeneration && row.controllerTabId && row.controllerTabId !== authTabId()) {
      worldEntryBlocked = true;
      authNotice = "SIGNED OUT · ACCOUNT OPENED IN ANOTHER TAB";
    }
    const mapChanged = currentMapId !== nextMapId;
    currentMapId = nextMapId;
    const acceptServerPosition = firstLocalState || mapChanged || row.lastInputSequence >= (localState?.lastInputSequence ?? 0);
    localState = {
      x: acceptServerPosition ? row.x : localState?.x ?? row.x,
      y: acceptServerPosition ? row.y : localState?.y ?? row.y,
      facing: acceptServerPosition ? row.facing : localState?.facing ?? row.facing,
      speed: row.speed,
      moving: acceptServerPosition ? row.moving : localState?.moving ?? row.moving,
      lastInputSequence: Math.max(row.lastInputSequence, localState?.lastInputSequence ?? 0),
      mapId: currentMapId,
    };
    if (mapChanged) {
      players.clear();
      mapPlayerMarkers.clear();
      motionIdentities.clear();
      activeMotionIdentities.clear();
    }
    refreshMapPlayerSubscription(mapChanged);
    refreshMapMarkerSubscription(mapChanged);
    // Position acknowledgements are hot data consumed directly by gameplay.
    // Only control-plane changes need the expensive application/UI fanout.
    if (firstLocalState || mapChanged || presenceChanged || conflictBefore !== worldEntryBlocked) onChange();
    return;
  }

  if (!row.isVisible) {
    profilePlayerMaps.delete(id);
    const mapRemoved = playerMaps.delete(id);
    const playerRemoved = players.delete(id);
    if (mapRemoved || playerRemoved || activePlayerProfileIdentity === id) onChange();
    return;
  }

  const nextMapId = row.mapId || TUTORIAL_FOREST_MAP_ID;
  if (activePlayerProfileIdentity === id) profilePlayerMaps.set(id, nextMapId);
  const previousMapId = playerMaps.get(id);
  playerMaps.set(id, nextMapId);

  if (nextMapId !== currentMapId) {
    const removed = players.delete(id);
    if (removed || (previousMapId !== nextMapId && activePlayerProfileIdentity === id)) onChange();
    return;
  }

  const receivedAt = performance.now();
  const serverAtMs = serverTimestampMs(row.lastInputAt);
  const existing = players.get(id);
  if (existing) {
    // Equipment and profile updates re-send the player row without a
    // movement sequence change. They refresh display data without injecting a
    // stale coordinate into interpolation.
    if (row.lastInputSequence > existing.lastInputSequence) {
      // A moving->moving static update is only a zone-membership checkpoint;
      // its coordinate will arrive in the next aggregate frame. Adding both
      // would create a zero-distance sample and visible micro-pause.
      if (!row.moving || row.moving !== existing.moving) {
        appendRemoteMotionSample(existing, {
          serverAtMs,
          receivedAt,
          x: row.x,
          y: row.y,
          dx: row.dx,
          dy: row.dy,
          facing: row.facing,
          moving: row.moving,
        });
      }
      existing.lastInputSequence = row.lastInputSequence;
    }
    existing.speed = row.speed;
    existing.power = row.powerLevel;
    existing.feetItem = row.feetItem;
    existing.headItem = row.headItem;
    existing.chestItem = row.chestItem;
  } else {
    players.set(id, {
      id,
      name: profiles.get(id) ?? generatedDisplayName(id),
      power: row.powerLevel,
      x: row.x,
      y: row.y,
      speed: row.speed,
      facing: row.facing,
      moving: row.moving,
      feetItem: row.feetItem,
      headItem: row.headItem,
      chestItem: row.chestItem,
      samples: [{ timelineAt: receivedAt, serverAtMs, receivedAt, x: row.x, y: row.y, dx: row.dx, dy: row.dy, facing: row.facing, moving: row.moving }],
      interpolationClock: createRemoteInterpolationClock(receivedAt),
      lastInputSequence: row.lastInputSequence,
    });
    onChange();
  }
}

function upsertProfile(row: { identity: Identity; displayName: string; profileIcon: number; playerSprite?: number; skinTone?: number }) {
  const id = row.identity.toHexString();
  profiles.set(id, row.displayName);
  profileIcons.set(id, Math.max(0, Math.min(63, Number(row.profileIcon) || 0)));
  playerSprites.set(id, Math.max(0, Math.min(3, Number(row.playerSprite) || 0)));
  const requestedSkinTone = Number(row.skinTone);
  skinTones.set(id, Number.isFinite(requestedSkinTone) ? Math.max(0, Math.min(19, Math.floor(requestedSkinTone))) : 3);
  profileIdentities.set(id, row.identity);
  if (id === localIdentity) {
    localDisplayName = row.displayName;
    localProfileReady = true;
    rememberConfirmedCharacter(row.displayName);
    completeAccountReturnWhenReady();
  }
  const player = players.get(id);
  if (player) player.name = row.displayName;
  chatPresentationRevision += 1;
  onChange?.();
}

function removeProfile(row: { identity: Identity }) {
  const id = row.identity.toHexString();
  // Active-map presence carries the same presentation fields. Releasing a
  // temporary profile subscription must not erase an actor still on screen.
  if (activeMotionIdentities.has(id)) return;
  profiles.delete(id);
  profileIcons.delete(id);
  playerSprites.delete(id);
  skinTones.delete(id);
  // Keep the SDK Identity handle for later identity-filtered profile reloads.
  // It is session-bounded and cleared with every realtime cache reset.
  if (id === localIdentity) {
    localDisplayName = "";
    localProfileReady = false;
  }
  chatPresentationRevision += 1;
  onChange?.();
}

function leaderboardEntryFromRow(row: {
  identity: Identity;
  displayName: string;
  profileIcon: number;
  power: number;
  powerLevel: number;
  damage: number;
  maxHp: number;
  armor: number;
  regen: number;
  playedMicros: bigint;
  isGuest: boolean;
}): LeaderboardEntry {
  const identity = row.identity.toHexString();
  return {
    identity,
    name: row.displayName,
    power: row.powerLevel,
    damage: row.damage,
    maxHp: row.maxHp,
    armor: row.armor,
    regen: row.regen,
    playedSeconds: Number(row.playedMicros) / 1_000_000,
    isGuest: row.isGuest,
  };
}

function upsertAccessAudit(row: {
  identity: Identity;
  displayName: string;
  firstSeenAt: { microsSinceUnixEpoch: bigint };
  lastSeenAt: { microsSinceUnixEpoch: bigint };
  accountType: string;
  lastProtocolVersion: number;
  label: string;
}) {
  const identity = row.identity.toHexString();
  accessAuditEntries.set(identity, {
    identity,
    identityValue: row.identity,
    displayName: row.displayName,
    firstSeenAtMs: Number(row.firstSeenAt.microsSinceUnixEpoch / 1000n),
    lastSeenAtMs: Number(row.lastSeenAt.microsSinceUnixEpoch / 1000n),
    accountType: row.accountType,
    lastProtocolVersion: row.lastProtocolVersion,
    label: row.label,
  });
  onChange?.();
}

function removeAccessAudit(row: { identity: Identity }) {
  accessAuditEntries.delete(row.identity.toHexString());
  onChange?.();
}

function upsertBugReport(row: { id: bigint; reporter: Identity; reporterName: string; message: string; protocolVersion: number; reportedAt: { microsSinceUnixEpoch: bigint } }) {
  bugReportEntries.set(row.id.toString(), {
    id: row.id,
    reporter: row.reporter.toHexString(),
    reporterName: row.reporterName,
    message: row.message,
    protocolVersion: row.protocolVersion,
    reportedAtMs: Number(row.reportedAt.microsSinceUnixEpoch / 1000n),
  });
  onChange?.();
}

function removeBugReport(row: { id: bigint }) {
  bugReportEntries.delete(row.id.toString());
  onChange?.();
}

function upsertPlayerAccountStatus(row: { identity: Identity; isGuest: boolean }) {
  guestAccounts.set(row.identity.toHexString(), row.isGuest);
  chatPresentationRevision += 1;
  onChange?.();
}

function removePlayerAccountStatus(row: { identity: Identity }) {
  const identity = row.identity.toHexString();
  if (activeMotionIdentities.has(identity)) return;
  guestAccounts.delete(identity);
  chatPresentationRevision += 1;
  onChange?.();
}

function upsertMotionIdentity(row: {
  networkId: number;
  identity: Identity;
  mapId: string;
  isVisible: boolean;
  zoneX: number;
  zoneY: number;
  displayName: string;
  profileIcon: number;
  playerSprite: number;
  skinTone: number;
  isGuest: boolean;
}) {
  const identity = row.identity.toHexString();
  if (identity === localIdentity) localMotionNetworkId = row.networkId;
  if (identity !== localIdentity && (!row.isVisible || row.mapId !== currentMapId)) {
    removeMotionIdentity(row);
    return;
  }
  for (const [networkId, mappedIdentity] of motionIdentities) {
    if (mappedIdentity === identity && networkId !== row.networkId) motionIdentities.delete(networkId);
  }
  motionIdentities.set(row.networkId, identity);
  activeMotionIdentities.add(identity);
  batchChanges(() => {
    upsertProfile(row);
    upsertPlayerAccountStatus(row);
    if (row.isVisible && row.mapId === currentMapId) playerMaps.set(identity, row.mapId);
    else playerMaps.delete(identity);
  });
}

function removeMotionIdentity(row: { networkId: number; identity: Identity }) {
  const identity = row.identity.toHexString();
  if (identity === localIdentity && localMotionNetworkId === row.networkId) localMotionNetworkId = null;
  if (motionIdentities.get(row.networkId) === identity) motionIdentities.delete(row.networkId);
  activeMotionIdentities.delete(identity);
  const playerRemoved = players.delete(identity);
  const markerRemoved = mapPlayerMarkers.delete(identity) || mapPlayerMarkers.delete(`network:${row.networkId}`);
  const mapRemoved = playerMaps.delete(identity);
  if (playerRemoved || markerRemoved || mapRemoved) onChange?.();
}

function upsertPlayerMotionFrame(row: {
  mapId: string;
  emittedAt: { microsSinceUnixEpoch: bigint };
  playerCount: number;
  payload: Uint8Array;
}) {
  if (row.mapId !== currentMapId) return;
  let samples;
  try {
    samples = decodePlayerMotionFrame(row.payload, row.playerCount);
  } catch (error) {
    console.warn("Ignored malformed Wildwood movement frame:", error);
    return;
  }
  const receivedAt = performance.now();
  const serverAtMs = serverTimestampMs(row.emittedAt);
  for (const sample of samples) {
    const identity = motionIdentities.get(sample.networkId);
    if (!identity || identity === localIdentity) continue;
    const existing = players.get(identity);
    if (!existing) continue;
    appendRemoteMotionSample(existing, {
      serverAtMs,
      receivedAt,
      x: sample.x,
      y: sample.y,
      dx: sample.dx,
      dy: sample.dy,
      facing: sample.dx < 0 ? Math.PI : sample.dx > 0 ? 0 : existing.facing,
      moving: sample.moving,
    });
  }
}

function upsertPlayerMapFrame(row: {
  mapId: string;
  playerCount: number;
  payload: Uint8Array;
}) {
  if (row.mapId !== currentMapId) return;
  let samples;
  try {
    samples = decodePlayerMotionFrame(row.payload, row.playerCount);
  } catch (error) {
    console.warn("Ignored malformed Wildwood minimap frame:", error);
    return;
  }
  mapPlayerMarkers.clear();
  for (const sample of samples) {
    if (sample.networkId === localMotionNetworkId) continue;
    const markerId = motionIdentities.get(sample.networkId) ?? `network:${sample.networkId}`;
    mapPlayerMarkers.set(markerId, { id: markerId, x: sample.x, y: sample.y });
  }
}

function upsertWorldStatus(row: { id: number; onlinePlayers: number }) {
  if (row.id !== 0) return;
  onlinePlayerCount = Math.max(0, row.onlinePlayers);
  onChange?.();
}

function upsertProgress(row: { identity: Identity } & PlayerProgress) {
  const id = row.identity.toHexString();
  const progress = {
    maxHp: row.maxHp,
    damage: row.damage,
    attackRate: row.attackRate,
    projectileSpeed: row.projectileSpeed,
    projectileCount: row.projectileCount,
    attackRange: row.attackRange,
    armor: row.armor,
    regen: row.regen,
    speed: row.speed,
    bootsCollected: row.bootsCollected,
    inventoryJson: row.inventoryJson,
    equippedHead: row.equippedHead,
    equippedChest: row.equippedChest,
    equippedFeet: row.equippedFeet,
    equippedRightHand: row.equippedRightHand ?? "",
    equippedLeftHand: row.equippedLeftHand ?? "",
    introComplete: row.introComplete,
    desertUnlocked: row.desertUnlocked,
    snowlandsUnlocked: row.snowlandsUnlocked,
  };
  profileProgress.set(id, progress);
  if (id !== localIdentity) {
    if (id === activePlayerProfileIdentity) onChange();
    return;
  }
  localProgress = progress;
  completeAccountReturnWhenReady();
  if (pendingProgress && progressCovers(localProgress, pendingProgress)) clearPendingProgress();
  else flushPendingProgress();
  onChange?.();
}

function upsertResearch(row: { identity: Identity } & Partial<PlayerResearch>) {
  const identity = row.identity.toHexString();
  const research = {
    warcraft: row.warcraft ?? 0,
    moveSpeed: row.moveSpeed ?? 0,
    foraging: row.foraging ?? 0,
    prosperity: row.prosperity ?? 0,
    vitality: row.vitality ?? 0,
    precision: row.precision ?? 0,
    criticalChance: row.criticalChance ?? 0,
    criticalDamage: row.criticalDamage ?? 0,
  };
  profileResearch.set(identity, research);
  if (identity !== localIdentity) {
    if (identity === activePlayerProfileIdentity) onChange();
    return;
  }
  localResearch = research;
  onChange?.();
}

function removeResearch(row: { identity: Identity }) {
  const identity = row.identity.toHexString();
  profileResearch.delete(identity);
  if (identity !== localIdentity) return;
  localResearch = { warcraft: 0, moveSpeed: 0, foraging: 0, vitality: 0, precision: 0, criticalChance: 0, criticalDamage: 0, prosperity: 0 };
  onChange?.();
}

function upsertActiveResearch(row: { identity: Identity; researchId: string; targetRank: number; startedAt: { microsSinceUnixEpoch: bigint }; completesAt: { microsSinceUnixEpoch: bigint } }) {
  if (row.identity.toHexString() !== localIdentity || !isResearchId(row.researchId)) return;
  localActiveResearch = {
    researchId: row.researchId,
    targetRank: row.targetRank,
    startedAtMs: Number(row.startedAt.microsSinceUnixEpoch / 1_000n),
    completesAtMs: Number(row.completesAt.microsSinceUnixEpoch / 1_000n),
  };
  onChange?.();
}

function removeActiveResearch(row: { identity: Identity }) {
  if (row.identity.toHexString() !== localIdentity) return;
  localActiveResearch = null;
  onChange?.();
}

function upsertPlayerLifetime(row: {
  identity: Identity;
  joinedAt: { microsSinceUnixEpoch: bigint };
  playedMicros: bigint;
  sessionStartedAt: { microsSinceUnixEpoch: bigint };
  enemyKills: bigint;
  deathCount: bigint;
}) {
  playerLifetimes.set(row.identity.toHexString(), {
    joinedAtMs: Number(row.joinedAt.microsSinceUnixEpoch / 1_000n),
    playedSeconds: Number(row.playedMicros) / 1_000_000,
    sessionStartedAtMs: Number(row.sessionStartedAt.microsSinceUnixEpoch / 1_000n),
    enemyKills: Number(row.enemyKills),
    deathCount: Number(row.deathCount),
  });
  onChange?.();
}

function upsertDragonBoss(row: {
  encounter: bigint;
  hp: number;
  maxHp: number;
  alive: boolean;
  respawnAtMicros: bigint;
}) {
  sharedDragon = {
    encounter: row.encounter,
    hp: row.hp,
    maxHp: row.maxHp,
    alive: row.alive,
    respawnAtMs: Number(row.respawnAtMicros / 1000n),
  };
}

function upsertSpiderBoss(row: {
  encounter: bigint;
  hp: number;
  maxHp: number;
  alive: boolean;
  respawnAtMicros: bigint;
}) {
  sharedSpider = {
    encounter: row.encounter,
    hp: row.hp,
    maxHp: row.maxHp,
    alive: row.alive,
    respawnAtMs: Number(row.respawnAtMicros / 1000n),
  };
}

function upsertFrostclawBoss(row: {
  encounter: bigint;
  hp: number;
  maxHp: number;
  alive: boolean;
  respawnAtMicros: bigint;
}) {
  sharedFrostclaw = {
    encounter: row.encounter,
    hp: row.hp,
    maxHp: row.maxHp,
    alive: row.alive,
    respawnAtMs: Number(row.respawnAtMicros / 1000n),
  };
}

function upsertDragonResult(row: {
  encounter: bigint;
  totalDamage: number;
  contributorsJson: string;
  createdAt: { microsSinceUnixEpoch: bigint };
}) {
  let contributors: DragonContributor[] = [];
  try {
    const parsed = JSON.parse(row.contributorsJson);
    if (Array.isArray(parsed)) {
      contributors = parsed
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => ({
          identity: typeof entry.identity === "string" ? entry.identity : "",
          name: typeof entry.name === "string" ? entry.name : "PLAYER",
          damage: Number.isFinite(entry.damage) ? entry.damage : 0,
          percentage: Number.isFinite(entry.percentage) ? entry.percentage : 0,
        }));
    }
  } catch {}
  latestDragonResult = {
    encounter: row.encounter,
    totalDamage: row.totalDamage,
    contributors,
    createdAtMs: Number(row.createdAt.microsSinceUnixEpoch / 1000n),
  };
  onChange?.();
}

function upsertSpiderResult(row: {
  encounter: bigint;
  totalDamage: number;
  contributorsJson: string;
  createdAt: { microsSinceUnixEpoch: bigint };
}) {
  let contributors: DragonContributor[] = [];
  try {
    const parsed = JSON.parse(row.contributorsJson);
    if (Array.isArray(parsed)) {
      contributors = parsed
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => ({
          identity: typeof entry.identity === "string" ? entry.identity : "",
          name: typeof entry.name === "string" ? entry.name : "PLAYER",
          damage: Number(entry.damage) || 0,
          percentage: Number(entry.percentage) || 0,
        }));
    }
  } catch {}
  latestSpiderResult = {
    encounter: row.encounter,
    totalDamage: row.totalDamage,
    contributors,
    createdAtMs: Number(row.createdAt.microsSinceUnixEpoch / 1_000n),
  };
  onChange?.();
}

function upsertFrostclawResult(row: {
  encounter: bigint;
  totalDamage: number;
  contributorsJson: string;
  createdAt: { microsSinceUnixEpoch: bigint };
}) {
  let contributors: DragonContributor[] = [];
  try {
    const parsed = JSON.parse(row.contributorsJson);
    if (Array.isArray(parsed)) {
      contributors = parsed
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => ({
          identity: typeof entry.identity === "string" ? entry.identity : "",
          name: typeof entry.name === "string" ? entry.name : "PLAYER",
          damage: Number(entry.damage) || 0,
          percentage: Number(entry.percentage) || 0,
        }));
    }
  } catch {}
  latestFrostclawResult = {
    encounter: row.encounter,
    totalDamage: row.totalDamage,
    contributors,
    createdAtMs: Number(row.createdAt.microsSinceUnixEpoch / 1_000n),
  };
  onChange?.();
}

function upsertChatMessage(row: {
  id: bigint;
  sender: Identity;
  senderName: string;
  senderIsGuest: boolean;
  message: string;
  replayId: bigint;
  powerLevel: number;
  sentAt: { microsSinceUnixEpoch: bigint };
}) {
  if (chatMessages.some((message) => message.id === row.id)) return;
  const sender = row.sender.toHexString();
  profileIdentities.set(sender, row.sender);
  if (!profiles.has(sender)) profiles.set(sender, row.senderName);
  if (!guestAccounts.has(sender)) guestAccounts.set(sender, row.senderIsGuest);
  chatMessages.push({
    id: row.id,
    sender,
    senderName: row.senderName,
    message: row.message,
    replayId: row.replayId,
    powerLevel: Number(row.powerLevel) || 0,
    sentAtMs: Number(row.sentAt.microsSinceUnixEpoch / 1000n),
  });
  chatMessages.sort((a, b) => (a.id < b.id ? -1 : 1));
  while (chatMessages.length > 100) chatMessages.shift();
  chatPresentationRevision += 1;
  onChange?.();
}

function upsertDuel(row: {
  id: bigint;
  challenger: Identity;
  opponent: Identity;
  status: string;
  createdAt: { microsSinceUnixEpoch: bigint };
  startedAt: { microsSinceUnixEpoch: bigint };
  startsAtMicros: bigint;
  endsAtMicros: bigint;
  challengerHp: number;
  challengerMaxHp: number;
  challengerDamage: number;
  challengerArmor: number;
  challengerAttackRate: number;
  challengerRegen: number;
  challengerAttacks: number;
  opponentHp: number;
  opponentMaxHp: number;
  opponentDamage: number;
  opponentArmor: number;
  opponentAttackRate: number;
  opponentRegen: number;
  opponentAttacks: number;
  challengerHeadItem: string;
  challengerChestItem: string;
  challengerFeetItem: string;
  challengerRightHandItem: string;
  challengerLeftHandItem: string;
  opponentHeadItem: string;
  opponentChestItem: string;
  opponentFeetItem: string;
  opponentRightHandItem: string;
  opponentLeftHandItem: string;
}) {
  duels.set(row.id, {
    id: row.id,
    challenger: row.challenger.toHexString(),
    opponent: row.opponent.toHexString(),
    status: row.status,
    createdAtMs: Number(row.createdAt.microsSinceUnixEpoch / 1000n),
    startsAtMs: Number(row.startsAtMicros / 1000n),
    startedAtMs: Number(row.startedAt.microsSinceUnixEpoch / 1000n),
    endsAtMs: Number(row.endsAtMicros / 1000n),
    challengerHp: row.challengerHp,
    challengerMaxHp: row.challengerMaxHp,
    challengerDamage: row.challengerDamage,
    challengerArmor: row.challengerArmor,
    challengerAttackRate: row.challengerAttackRate,
    challengerRegen: row.challengerRegen,
    challengerAttacks: row.challengerAttacks,
    opponentHp: row.opponentHp,
    opponentMaxHp: row.opponentMaxHp,
    opponentDamage: row.opponentDamage,
    opponentArmor: row.opponentArmor,
    opponentAttackRate: row.opponentAttackRate,
    opponentRegen: row.opponentRegen,
    opponentAttacks: row.opponentAttacks,
    challengerHeadItem: row.challengerHeadItem,
    challengerChestItem: row.challengerChestItem,
    challengerFeetItem: row.challengerFeetItem,
    challengerRightHandItem: row.challengerRightHandItem,
    challengerLeftHandItem: row.challengerLeftHandItem,
    opponentHeadItem: row.opponentHeadItem,
    opponentChestItem: row.opponentChestItem,
    opponentFeetItem: row.opponentFeetItem,
    opponentRightHandItem: row.opponentRightHandItem,
    opponentLeftHandItem: row.opponentLeftHandItem,
  });
  onChange?.();
}

function upsertDuelReplay(row: any) {
  duelReplays.set(row.id, {
    id: row.id,
    challengerIdentity: row.challengerIdentity,
    opponentIdentity: row.opponentIdentity,
    challengerName: row.challengerName,
    opponentName: row.opponentName,
    winnerName: row.winnerName,
    durationSeconds: row.durationSeconds,
    challengerMaxHp: row.challengerMaxHp,
    challengerDamage: row.challengerDamage,
    challengerArmor: row.challengerArmor,
    challengerAttackRate: row.challengerAttackRate,
    challengerRegen: row.challengerRegen,
    challengerFinalHp: row.challengerFinalHp,
    challengerAttacks: row.challengerAttacks,
    challengerDamageDealt: row.challengerDamageDealt,
    challengerRegened: row.challengerRegened,
    challengerBlocked: row.challengerBlocked,
    opponentMaxHp: row.opponentMaxHp,
    opponentDamage: row.opponentDamage,
    opponentArmor: row.opponentArmor,
    opponentAttackRate: row.opponentAttackRate,
    opponentRegen: row.opponentRegen,
    opponentFinalHp: row.opponentFinalHp,
    opponentAttacks: row.opponentAttacks,
    opponentDamageDealt: row.opponentDamageDealt,
    opponentRegened: row.opponentRegened,
    opponentBlocked: row.opponentBlocked,
    challengerHeadItem: row.challengerHeadItem,
    challengerChestItem: row.challengerChestItem,
    challengerFeetItem: row.challengerFeetItem,
    challengerRightHandItem: row.challengerRightHandItem,
    challengerLeftHandItem: row.challengerLeftHandItem,
    opponentHeadItem: row.opponentHeadItem,
    opponentChestItem: row.opponentChestItem,
    opponentFeetItem: row.opponentFeetItem,
    opponentRightHandItem: row.opponentRightHandItem,
    opponentLeftHandItem: row.opponentLeftHandItem,
  });
  onChange?.();
}

function loadDuelReplay(id: bigint): Promise<DuelReplay | null> {
  const existing = duelReplays.get(id);
  if (existing) return Promise.resolve({ ...existing });
  const loading = replayLoads.get(id);
  if (loading) return loading;
  const conn = connection;
  if (!conn) return Promise.resolve(null);

  let resolveRequest!: (replay: DuelReplay | null) => void;
  const request = new Promise<DuelReplay | null>((resolve) => {
    resolveRequest = resolve;
  });
  replayLoads.set(id, request);

  let subscription: { unsubscribe: () => void } | null = null;
  let settled = false;
  let unsubscribeAfterSubscribe = false;
  let timeoutId: number | null = null;
  const releaseSubscription = () => {
    if (subscription) {
      subscription.unsubscribe();
      subscription = null;
    } else {
      // Keep this safe if a synchronous subscription implementation calls a
      // callback before subscribe() returns its handle.
      unsubscribeAfterSubscribe = true;
    }
  };
  const finish = (replay: DuelReplay | null) => {
    if (settled) return;
    settled = true;
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    replayLoads.delete(id);
    cancelReplayLoads.delete(id);
    releaseSubscription();
    resolveRequest(replay);
  };
  cancelReplayLoads.set(id, () => finish(null));
  timeoutId = window.setTimeout(() => finish(null), SUBSCRIPTION_LOAD_TIMEOUT_MS);

  subscription = conn
    .subscriptionBuilder()
    .onApplied(() => {
      if (connection !== conn) return finish(null);
      const row = [...conn.db.duelReplay.iter()].find((replay) => replay.id === id);
      if (row) upsertDuelReplay(row);
      const replay = duelReplays.get(id);
      finish(replay ? { ...replay } : null);
    })
    .onError(() => {
      finish(null);
    })
    .subscribe([tables.duelReplay.where((replay) => replay.id.eq(id))]);
  if (unsubscribeAfterSubscribe) releaseSubscription();
  return request;
}

function loadLeaderboardSnapshot(): Promise<LeaderboardEntry[]> {
  if (leaderboardSnapshotLoad) return leaderboardSnapshotLoad;
  const conn = connection;
  if (!conn) return Promise.resolve([]);

  let settled = false;
  const request = new Promise<LeaderboardEntry[]>((resolve) => {
    let subscription: { unsubscribe: () => void } | null = null;
    let unsubscribeAfterSubscribe = false;
    let timeoutId: number | null = null;
    const release = () => {
      if (subscription) {
        const current = subscription;
        current.unsubscribe();
        subscription = null;
        if (leaderboardSnapshotSubscription === current) leaderboardSnapshotSubscription = null;
      } else {
        unsubscribeAfterSubscribe = true;
      }
    };
    const finish = (entries: LeaderboardEntry[]) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      leaderboardSnapshotLoad = null;
      cancelLeaderboardSnapshotLoad = null;
      release();
      resolve(entries);
    };
    cancelLeaderboardSnapshotLoad = () => finish([]);
    timeoutId = window.setTimeout(() => finish([]), SUBSCRIPTION_LOAD_TIMEOUT_MS);

    subscription = conn
      .subscriptionBuilder()
      .onApplied(() => {
        if (connection !== conn) return finish([]);
        leaderboardEntries.clear();
        for (const row of conn.db.leaderboardEntry.iter()) {
          const entry = leaderboardEntryFromRow(row);
          leaderboardEntries.set(entry.identity, entry);
          profileIdentities.set(entry.identity, row.identity);
          profiles.set(entry.identity, entry.name);
          profileIcons.set(entry.identity, Math.max(0, Math.min(63, Number(row.profileIcon) || 0)));
          guestAccounts.set(entry.identity, entry.isGuest);
        }
        onChange?.();
        finish([...leaderboardEntries.values()]);
      })
      .onError(() => finish([]))
      .subscribe([tables.leaderboardEntry]);
    leaderboardSnapshotSubscription = subscription;
    if (unsubscribeAfterSubscribe) release();
  });
  leaderboardSnapshotLoad = request;
  if (settled) leaderboardSnapshotLoad = null;
  return request;
}

function cachedPlayerProfile(identity: string): PlayerProfileData | null {
  const progress = profileProgress.get(identity);
  const lifetime = playerLifetimes.get(identity);
  if (!progress || !lifetime) return null;
  return {
    identity,
    name: profiles.get(identity) ?? "PLAYER",
    progress: { ...progress },
    research: { ...profileResearch.get(identity) ?? { warcraft: 0, moveSpeed: 0, foraging: 0, vitality: 0, precision: 0, criticalChance: 0, criticalDamage: 0, prosperity: 0 } },
    lifetime: { ...lifetime },
    mapId: resolvePlayerPresenceMap(identity, localIdentity, localState?.mapId, profilePlayerMaps, playerMaps) ?? undefined,
  };
}

function loadPlayerProfile(identity: string): Promise<PlayerProfileData | null> {
  const existing = cachedPlayerProfile(identity);
  if (existing && (identity === localIdentity || identity === activePlayerProfileIdentity)) return Promise.resolve(existing);
  const loading = playerProfileLoads.get(identity);
  if (loading) return loading;
  const conn = connection;
  const dbIdentity = profileIdentities.get(identity) ?? accessAuditEntries.get(identity)?.identityValue;
  if (!conn || !dbIdentity) return Promise.resolve(null);

  releasePlayerProfile();
  activePlayerProfileIdentity = identity;

  let settled = false;
  const request = new Promise<PlayerProfileData | null>((resolve) => {
    let timeoutId: number | null = null;
    const finish = (profile: PlayerProfileData | null) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      playerProfileLoads.delete(identity);
      if (cancelActivePlayerProfileLoad === cancel) cancelActivePlayerProfileLoad = null;
      resolve(profile);
    };
    const cancel = () => finish(null);
    cancelActivePlayerProfileLoad = cancel;
    activePlayerProfileSubscription = conn
      .subscriptionBuilder()
      .onApplied(() => {
        if (connection !== conn || activePlayerProfileIdentity !== identity) return finish(null);
        for (const row of conn.db.playerProgress.iter()) {
          if (row.identity.toHexString() === identity) upsertProgress(row);
        }
        for (const row of conn.db.playerLifetime.iter()) {
          if (row.identity.toHexString() === identity) upsertPlayerLifetime(row);
        }
        for (const row of conn.db.playerResearch.iter()) {
          if (row.identity.toHexString() === identity) upsertResearch(row);
        }
        for (const row of conn.db.playerProfile.iter()) {
          if (row.identity.toHexString() === identity) upsertProfile(row);
        }
        for (const row of conn.db.playerAccountStatus.iter()) {
          if (row.identity.toHexString() === identity) upsertPlayerAccountStatus(row);
        }
        for (const row of conn.db.player.iter()) {
          if (row.identity.toHexString() !== identity) continue;
          if (row.isVisible) profilePlayerMaps.set(identity, row.mapId);
          else profilePlayerMaps.delete(identity);
        }
        finish(cachedPlayerProfile(identity));
      })
      .onError(() => {
        finish(null);
      })
      .subscribe([
        tables.playerProfile.where((profile) => profile.identity.eq(dbIdentity)),
        tables.playerAccountStatus.where((status) => status.identity.eq(dbIdentity)),
        tables.playerProgress.where((progress) => progress.identity.eq(dbIdentity)),
        tables.playerLifetime.where((lifetime) => lifetime.identity.eq(dbIdentity)),
        tables.playerResearch.where((research) => research.identity.eq(dbIdentity)),
        tables.player.where((player) => player.identity.eq(dbIdentity)),
      ]);
    if (!settled) {
      timeoutId = window.setTimeout(() => {
        if (activePlayerProfileIdentity === identity) releasePlayerProfile();
        else finish(null);
      }, SUBSCRIPTION_LOAD_TIMEOUT_MS);
    }
  });
  playerProfileLoads.set(identity, request);
  if (settled) playerProfileLoads.delete(identity);
  return request;
}

function releasePlayerProfile() {
  if (activePlayerProfileSubscription) activePlayerProfileSubscription.unsubscribe();
  cancelActivePlayerProfileLoad?.();
  cancelActivePlayerProfileLoad = null;
  if (activePlayerProfileIdentity && activePlayerProfileIdentity !== localIdentity) {
    profileProgress.delete(activePlayerProfileIdentity);
    profileResearch.delete(activePlayerProfileIdentity);
    playerLifetimes.delete(activePlayerProfileIdentity);
    profilePlayerMaps.delete(activePlayerProfileIdentity);
    playerProfileLoads.delete(activePlayerProfileIdentity);
  }
  activePlayerProfileSubscription = null;
  activePlayerProfileIdentity = "";
}

function removeDuel(row: { id: bigint }) {
  duels.delete(row.id);
  onChange?.();
}

function removePlayer(row: { identity: Identity }) {
  const identity = row.identity.toHexString();
  const playerRemoved = players.delete(identity);
  const mapRemoved = playerMaps.delete(identity);
  const profileMapRemoved = profilePlayerMaps.delete(identity);
  if (playerRemoved || mapRemoved || profileMapRemoved || activePlayerProfileIdentity === identity) onChange();
}

function releaseMapPlayerSubscription() {
  mapSubscriptionGeneration += 1;
  mapPlayerSubscription?.unsubscribe();
  mapPlayerSubscription = null;
  mapSubscriptionAreaKey = "";
  mapPlayerInterestBounds = null;
}

function releaseMapMarkerSubscription() {
  mapMarkerSubscriptionGeneration += 1;
  mapMarkerSubscription?.unsubscribe();
  mapMarkerSubscription = null;
}

function refreshMapMarkerSubscription(force = false) {
  const conn = connection;
  if (!conn?.isActive || !hydrationReady) return;
  if (!force && mapMarkerSubscription) return;

  const previous = mapMarkerSubscription;
  const generation = ++mapMarkerSubscriptionGeneration;
  const mapId = currentMapId;
  const next = conn
    .subscriptionBuilder()
    .onApplied(() => {
      if (connection !== conn || generation !== mapMarkerSubscriptionGeneration) return;
      previous?.unsubscribe();
    })
    .onError((ctx) => {
      if (connection !== conn || generation !== mapMarkerSubscriptionGeneration) return;
      console.error("Wildwood map marker subscription error:", ctx.event);
      mapMarkerSubscription = previous;
    })
    .subscribe([
      tables.playerMapFrame.where((frame) => frame.mapId.eq(mapId)),
    ]);
  mapMarkerSubscription = next;
}

function refreshMapPlayerSubscription(force = false, interestArea?: PlayerInterestArea) {
  const conn = connection;
  if (!conn?.isActive || !hydrationReady) return;
  const centerX = Math.floor((localState?.x ?? 0) / MAP_PLAYER_ZONE_SIZE);
  const centerY = Math.floor((localState?.y ?? 0) / MAP_PLAYER_ZONE_SIZE);
  if (interestArea && [interestArea.left, interestArea.top, interestArea.right, interestArea.bottom].every(Number.isFinite)) {
    const left = Math.min(interestArea.left, interestArea.right);
    const right = Math.max(interestArea.left, interestArea.right);
    const top = Math.min(interestArea.top, interestArea.bottom);
    const bottom = Math.max(interestArea.top, interestArea.bottom);
    mapPlayerInterestBounds = {
      mapId: currentMapId,
      minZoneX: Math.max(0, Math.floor(left / MAP_PLAYER_ZONE_SIZE) - MAP_PLAYER_PREFETCH_ZONES),
      maxZoneX: Math.min(MAX_MAP_ZONE_X, Math.floor(right / MAP_PLAYER_ZONE_SIZE) + MAP_PLAYER_PREFETCH_ZONES),
      minZoneY: Math.max(0, Math.floor(top / MAP_PLAYER_ZONE_SIZE) - MAP_PLAYER_PREFETCH_ZONES),
      maxZoneY: Math.min(MAX_MAP_ZONE_Y, Math.floor(bottom / MAP_PLAYER_ZONE_SIZE) + MAP_PLAYER_PREFETCH_ZONES),
    };
  }
  const bounds = mapPlayerInterestBounds?.mapId === currentMapId
    ? mapPlayerInterestBounds
    : {
      mapId: currentMapId,
      minZoneX: Math.max(0, centerX - MAP_PLAYER_ZONE_RADIUS),
      maxZoneX: Math.min(MAX_MAP_ZONE_X, centerX + MAP_PLAYER_ZONE_RADIUS),
      minZoneY: Math.max(0, centerY - MAP_PLAYER_ZONE_RADIUS),
      maxZoneY: Math.min(MAX_MAP_ZONE_Y, centerY + MAP_PLAYER_ZONE_RADIUS),
    };
  const areaKey = `${bounds.mapId}:${bounds.minZoneX}:${bounds.maxZoneX}:${bounds.minZoneY}:${bounds.maxZoneY}`;
  if (!force && mapPlayerSubscription && mapSubscriptionAreaKey === areaKey) return;

  const previous = mapPlayerSubscription;
  const previousAreaKey = mapSubscriptionAreaKey;
  const generation = ++mapSubscriptionGeneration;
  mapSubscriptionAreaKey = areaKey;
  // One rectangular query replaces per-player/per-zone subscriptions. Server
  // index starts with map/visibility, then narrows camera-derived zone bounds.
  const nearbyPlayers = tables.player.where((row) => row
    .mapId.eq(currentMapId)
    .and(row.isVisible.eq(true))
    .and(row.zoneX.gte(bounds.minZoneX))
    .and(row.zoneX.lte(bounds.maxZoneX))
    .and(row.zoneY.gte(bounds.minZoneY))
    .and(row.zoneY.lte(bounds.maxZoneY)));
  const nearbyMotionFrames = tables.playerMotionFrame.where((row) => row
    .mapId.eq(currentMapId)
    .and(row.zoneX.gte(bounds.minZoneX))
    .and(row.zoneX.lte(bounds.maxZoneX))
    .and(row.zoneY.gte(bounds.minZoneY))
    .and(row.zoneY.lte(bounds.maxZoneY)));
  const nearbyMotionIdentities = tables.playerMotionIdentity.where((row) => row
    .mapId.eq(currentMapId)
    .and(row.isVisible.eq(true))
    .and(row.zoneX.gte(bounds.minZoneX))
    .and(row.zoneX.lte(bounds.maxZoneX))
    .and(row.zoneY.gte(bounds.minZoneY))
    .and(row.zoneY.lte(bounds.maxZoneY)));

  const next = conn
    .subscriptionBuilder()
    .onApplied(() => {
      if (connection !== conn || generation !== mapSubscriptionGeneration) return;
      previous?.unsubscribe();
      for (const row of conn.db.playerMotionIdentity.iter()) upsertMotionIdentity(row);
      for (const row of conn.db.player.iter()) upsertPlayer(row);
    })
    .onError((ctx) => {
      if (connection !== conn || generation !== mapSubscriptionGeneration) return;
      console.error("Wildwood map player subscription error:", ctx.event);
      mapPlayerSubscription = previous;
      mapSubscriptionAreaKey = previousAreaKey;
    })
    .subscribe([nearbyPlayers, nearbyMotionFrames, nearbyMotionIdentities]);
  mapPlayerSubscription = next;
}

function clearRealtimeCaches() {
  releasePlayerProfile();
  releaseMapPlayerSubscription();
  releaseMapMarkerSubscription();
  cancelLeaderboardSnapshotLoad?.();
  leaderboardSnapshotSubscription?.unsubscribe();
  leaderboardSnapshotSubscription = null;
  leaderboardSnapshotLoad = null;
  cancelLeaderboardSnapshotLoad = null;
  players.clear();
  mapPlayerMarkers.clear();
  profiles.clear();
  profileIcons.clear();
  playerSprites.clear();
  skinTones.clear();
  profileIdentities.clear();
  motionIdentities.clear();
  activeMotionIdentities.clear();
  localMotionNetworkId = null;
  leaderboardEntries.clear();
  accessAuditEntries.clear();
  guestAccounts.clear();
  onlinePlayerCount = 0;
  profileProgress.clear();
  playerLifetimes.clear();
  playerMaps.clear();
  profilePlayerMaps.clear();
  playerProfileLoads.clear();
  chatMessages.length = 0;
  chatPresentationRevision += 1;
  duels.clear();
  for (const cancel of [...cancelReplayLoads.values()]) cancel();
  cancelReplayLoads.clear();
  duelReplays.clear();
  replayLoads.clear();
  sharedDragon = null;
  latestDragonResult = null;
  sharedSpider = null;
  latestSpiderResult = null;
  sharedFrostclaw = null;
  latestFrostclawResult = null;
}

function scheduleReconnect(delay = 500) {
  if (protocolBlocked || worldEntryBlocked || document.hidden || reconnectTimer !== null || connection?.isActive || connecting) return;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function setWakeReconnectVisible(visible: boolean) {
  if (wakeReconnectVisible === visible) return;
  wakeReconnectVisible = visible;
  onChange?.();
}

function setServerUpdateVisible(visible: boolean) {
  if (serverUpdateVisible === visible) return;
  serverUpdateVisible = visible;
  onChange?.();
}

function setReconnectAfterServerUpdateVisible(visible: boolean) {
  if (reconnectAfterServerUpdateVisible === visible) return;
  reconnectAfterServerUpdateVisible = visible;
  onChange?.();
}

function reconnectAfterWake(force = false) {
  if (protocolBlocked || worldEntryBlocked || document.hidden || connecting || resumeProbePromise) return;
  const conn = connection;
  if (force || !conn?.isActive) {
    if (conn) {
      connection = null;
      connecting = false;
      conn.disconnect();
    }
    scheduleReconnect(200);
    return;
  }

  const hiddenFor = pageHiddenAt ? Date.now() - pageHiddenAt : 0;
  const activityAge = performance.now() - lastServerActivityAt;
  if (hiddenFor < 10_000 && activityAge < 30_000) {
    onChange?.();
    return;
  }

  const generation = connectionGeneration;
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
        connection = null;
        connecting = false;
        conn.disconnect();
        scheduleReconnect(200);
      }
    })
    .finally(() => {
      resumeProbePromise = null;
    });
}

function connect() {
  if (protocolBlocked || connection?.isActive || connecting) return;
  if (accountToken() && hasKnownAccount() && !accountSessionApproved) {
    authNotice = "SIGN-IN REQUIRED";
    onChange?.();
    return;
  }
  if (!accountToken() && hasKnownAccount() && !guestSessionExplicit) {
    authNotice = "SIGN-IN REQUIRED";
    onChange?.();
    return;
  }
  connecting = true;
  const generation = ++connectionGeneration;
  const signedIn = Boolean(accountToken());
  connection = DbConnection.builder()
    .withUri(host)
    .withDatabaseName(databaseName)
    .withToken(accountToken() || guestToken() || undefined)
    .onConnect((conn: DbConnection, identity: Identity, token: string) => {
      if (generation !== connectionGeneration) {
        conn.disconnect();
        return;
      }
      connection = conn;
      connecting = false;
      setServerUpdateVisible(false);
      hydrationReady = false;
      connectedSignedIn = signedIn;
      touchServerActivity();
      protocolBlocked = false;
      accountLinkClaiming = false;
      worldEntryPromise = null;
      worldEntryGeneration = 0;
      worldEntryBlocked = false;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
      const connectedIdentity = identity.toHexString();
      const identityChanged = Boolean(localIdentity && localIdentity !== connectedIdentity);
      localIdentity = connectedIdentity;
      restoreDuelCooldown();
      localProfileReady = false;
      localDisplayName = signedIn ? rememberedAccountCharacter() : rememberedGuestCharacter();
      pendingProgress = readPendingProgress(localIdentity);
      progressSaveInFlightUntil = 0;
      lastSentMovement = null;
      nextPositionSequence = 0;
      latencyMs = null;
      lastLatencyProbeStartedAt = 0;
      if (identityChanged) {
        localState = null;
        localProgress = null;
        localResearch = { warcraft: 0, moveSpeed: 0, foraging: 0, vitality: 0, precision: 0, criticalChance: 0, criticalDamage: 0, prosperity: 0 };
        localActiveResearch = null;
      }
      lastSpeedSent = null;
      lastDuelPulseAt = 0;
      clearRealtimeCaches();
      if (!signedIn) {
        try {
          localStorage.setItem(guestTokenKey, token);
        } catch {}
      }
      const protocolStartedAt = performance.now();
      void conn.reducers.registerProtocol({ protocolVersion: PROTOCOL_VERSION }).then(async () => {
        if (generation !== connectionGeneration || connection !== conn) return;
        clearTabValue(authRetryKey);
        recordLatency(protocolStartedAt);
        const isCurrentConnection = () => {
          const current = generation === connectionGeneration && connection === conn;
          if (current) touchServerActivity();
          return current;
        };

        const accountLink = signedIn ? readAccountLinkTransaction() : null;
        if (accountLink && !protocolBlocked) {
          accountLinkClaiming = true;
          authNotice = "LINKING ACCOUNT SAVE";
          onChange?.();
          try {
            await conn.reducers.claimGuestAccount({ code: accountLink.code });
            if (!isCurrentConnection()) return;
            accountLinkClaiming = false;
            clearTabValue(accountLinkKey);
            clearAccountMigrationPending();
            if (accountLink.guestIdentity) clearPendingProgress(accountLink.guestIdentity);
            clearStoredToken(guestTokenKey);
            authNotice = "ACCOUNT SAVE LINKED";
          } catch (error) {
            if (!isCurrentConnection()) return;
            accountLinkClaiming = false;
            const message = reducerErrorMessage(error);
            clearTabValue(accountLinkKey);
            if (/already has wildwood progress/i.test(message)) {
              clearAccountMigrationPending();
              authNotice = "ACCOUNT CHARACTER LOADED";
            } else {
              // Never hydrate a fresh account after a failed guest migration.
              // Return to the intact guest token instead of showing defaults.
              clearStoredToken(accountTokenKey);
              clearAccountMigrationPending();
              guestSessionExplicit = true;
              clearAccountReturnPending();
              authNotice = "GUEST SAVE NOT LINKED";
              handleReducerFailure("account migration", error);
              conn.disconnect();
              return;
            }
          }
        }

        if (takeoverRequested) {
          authNotice = "SIGNING OUT OTHER TAB…";
          onChange?.();
          try {
            await conn.reducers.takeOverSession({ tabId: authTabId() });
            if (!isCurrentConnection()) return;
            takeoverRequested = false;
            worldEntryBlocked = false;
          } catch (error) {
            if (!isCurrentConnection()) return;
            takeoverRequested = false;
            worldEntryBlocked = true;
            authNotice = "TAKEOVER FAILED · TRY AGAIN";
            handleReducerFailure("session takeover", error);
            onChange?.();
            return;
          }
        }

        if ((signedIn || guestSessionExplicit) && !await requestWorldEntry()) {
          if (isCurrentConnection() && !worldEntryBlocked) conn.disconnect();
          return;
        }

        // SpacetimeDB fires an initial subscription's row callbacks after its
        // onApplied callback. Hydrate once from the cache, then ignore that
        // duplicate callback batch before accepting live row events.
        let baseSubscriptionHydrating = true;
        const shouldHandleTableEvent = () => isCurrentConnection() && !baseSubscriptionHydrating;
        conn.db.player.onInsert((_ctx, row) => { if (shouldHandleTableEvent()) upsertPlayer(row); });
        conn.db.player.onUpdate((_ctx, _oldRow, row) => { if (shouldHandleTableEvent()) upsertPlayer(row); });
        conn.db.player.onDelete((_ctx, row) => { if (shouldHandleTableEvent()) removePlayer(row); });
        // Event tables never enter the SDK cache. Frame handlers update render
        // buffers directly and deliberately skip application-wide UI fanout.
        conn.db.playerMotionFrame.onInsert((_ctx, row) => { if (shouldHandleTableEvent()) upsertPlayerMotionFrame(row); });
        conn.db.playerMapFrame.onInsert((_ctx, row) => { if (shouldHandleTableEvent()) upsertPlayerMapFrame(row); });
        conn.db.playerMotionIdentity.onInsert((_ctx, row) => { if (shouldHandleTableEvent()) upsertMotionIdentity(row); });
        conn.db.playerMotionIdentity.onUpdate((_ctx, _oldRow, row) => { if (shouldHandleTableEvent()) upsertMotionIdentity(row); });
        conn.db.playerMotionIdentity.onDelete((_ctx, row) => { if (shouldHandleTableEvent()) removeMotionIdentity(row); });
        conn.db.playerProfile.onInsert((_ctx, row) => { if (shouldHandleTableEvent()) upsertProfile(row); });
        conn.db.playerProfile.onUpdate((_ctx, _oldRow, row) => { if (shouldHandleTableEvent()) upsertProfile(row); });
        conn.db.playerProfile.onDelete((_ctx, row) => { if (shouldHandleTableEvent()) removeProfile(row); });
        conn.db.devAccessAudit.onInsert((_ctx, row) => { if (shouldHandleTableEvent()) upsertAccessAudit(row); });
        conn.db.devAccessAudit.onUpdate((_ctx, _oldRow, row) => { if (shouldHandleTableEvent()) upsertAccessAudit(row); });
        conn.db.devAccessAudit.onDelete((_ctx, row) => { if (shouldHandleTableEvent()) removeAccessAudit(row); });
        conn.db.devBugReports.onInsert((_ctx, row) => { if (shouldHandleTableEvent()) upsertBugReport(row); });
        conn.db.devBugReports.onUpdate((_ctx, _oldRow, row) => { if (shouldHandleTableEvent()) upsertBugReport(row); });
        conn.db.devBugReports.onDelete((_ctx, row) => { if (shouldHandleTableEvent()) removeBugReport(row); });
        conn.db.playerAccountStatus.onInsert((_ctx, row) => { if (shouldHandleTableEvent()) upsertPlayerAccountStatus(row); });
        conn.db.playerAccountStatus.onUpdate((_ctx, _oldRow, row) => { if (shouldHandleTableEvent()) upsertPlayerAccountStatus(row); });
        conn.db.playerAccountStatus.onDelete((_ctx, row) => { if (shouldHandleTableEvent()) removePlayerAccountStatus(row); });
        conn.db.worldStatus.onInsert((_ctx, row) => { if (shouldHandleTableEvent()) upsertWorldStatus(row); });
        conn.db.worldStatus.onUpdate((_ctx, _oldRow, row) => { if (shouldHandleTableEvent()) upsertWorldStatus(row); });
        conn.db.playerProgress.onInsert((_ctx, row) => { if (shouldHandleTableEvent()) upsertProgress(row); });
        conn.db.playerProgress.onUpdate((_ctx, _oldRow, row) => { if (shouldHandleTableEvent()) upsertProgress(row); });
        conn.db.playerResearch.onInsert((_ctx, row) => { if (shouldHandleTableEvent()) upsertResearch(row); });
        conn.db.playerResearch.onUpdate((_ctx, _oldRow, row) => { if (shouldHandleTableEvent()) upsertResearch(row); });
        conn.db.playerResearch.onDelete((_ctx, row) => { if (shouldHandleTableEvent()) removeResearch(row); });
        conn.db.activeResearch.onInsert((_ctx, row) => { if (shouldHandleTableEvent()) upsertActiveResearch(row); });
        conn.db.activeResearch.onUpdate((_ctx, _oldRow, row) => { if (shouldHandleTableEvent()) upsertActiveResearch(row); });
        conn.db.activeResearch.onDelete((_ctx, row) => { if (shouldHandleTableEvent()) removeActiveResearch(row); });
        conn.db.playerLifetime.onInsert((_ctx, row) => { if (shouldHandleTableEvent()) upsertPlayerLifetime(row); });
        conn.db.playerLifetime.onUpdate((_ctx, _oldRow, row) => { if (shouldHandleTableEvent()) upsertPlayerLifetime(row); });
        conn.db.dragonBoss.onInsert((_ctx, row) => { if (shouldHandleTableEvent()) upsertDragonBoss(row); });
        conn.db.dragonBoss.onUpdate((_ctx, _oldRow, row) => { if (shouldHandleTableEvent()) upsertDragonBoss(row); });
        conn.db.dragonResult.onInsert((_ctx, row) => { if (shouldHandleTableEvent()) upsertDragonResult(row); });
        conn.db.dragonResult.onUpdate((_ctx, _oldRow, row) => { if (shouldHandleTableEvent()) upsertDragonResult(row); });
        conn.db.spiderBoss.onInsert((_ctx, row) => { if (shouldHandleTableEvent()) upsertSpiderBoss(row); });
        conn.db.spiderBoss.onUpdate((_ctx, _oldRow, row) => { if (shouldHandleTableEvent()) upsertSpiderBoss(row); });
        conn.db.spiderResult.onInsert((_ctx, row) => { if (shouldHandleTableEvent()) upsertSpiderResult(row); });
        conn.db.spiderResult.onUpdate((_ctx, _oldRow, row) => { if (shouldHandleTableEvent()) upsertSpiderResult(row); });
        conn.db.frostclawBoss.onInsert((_ctx, row) => { if (shouldHandleTableEvent()) upsertFrostclawBoss(row); });
        conn.db.frostclawBoss.onUpdate((_ctx, _oldRow, row) => { if (shouldHandleTableEvent()) upsertFrostclawBoss(row); });
        conn.db.frostclawResult.onInsert((_ctx, row) => { if (shouldHandleTableEvent()) upsertFrostclawResult(row); });
        conn.db.frostclawResult.onUpdate((_ctx, _oldRow, row) => { if (shouldHandleTableEvent()) upsertFrostclawResult(row); });
        conn.db.chatMessage.onInsert((_ctx, row) => { if (shouldHandleTableEvent()) upsertChatMessage(row); });
        conn.db.duel.onInsert((_ctx, row) => { if (shouldHandleTableEvent()) upsertDuel(row); });
        conn.db.duel.onUpdate((_ctx, _oldRow, row) => { if (shouldHandleTableEvent()) upsertDuel(row); });
        conn.db.duel.onDelete((_ctx, row) => { if (shouldHandleTableEvent()) removeDuel(row); });

        conn
        .subscriptionBuilder()
        .onApplied(() => {
          if (!isCurrentConnection()) return;
          batchChanges(() => {
            for (const row of conn.db.playerProfile.iter()) upsertProfile(row);
            for (const row of conn.db.devAccessAudit.iter()) upsertAccessAudit(row);
            for (const row of conn.db.devBugReports.iter()) upsertBugReport(row);
            for (const row of conn.db.playerAccountStatus.iter()) upsertPlayerAccountStatus(row);
            for (const row of conn.db.worldStatus.iter()) upsertWorldStatus(row);
            for (const row of conn.db.playerProgress.iter()) upsertProgress(row);
            for (const row of conn.db.playerResearch.iter()) upsertResearch(row);
            for (const row of conn.db.activeResearch.iter()) upsertActiveResearch(row);
            for (const row of conn.db.playerLifetime.iter()) upsertPlayerLifetime(row);
            for (const row of conn.db.playerMotionIdentity.iter()) upsertMotionIdentity(row);
            for (const row of conn.db.player.iter()) upsertPlayer(row);
            for (const row of conn.db.dragonBoss.iter()) upsertDragonBoss(row);
            for (const row of conn.db.dragonResult.iter()) upsertDragonResult(row);
            for (const row of conn.db.spiderBoss.iter()) upsertSpiderBoss(row);
            for (const row of conn.db.spiderResult.iter()) upsertSpiderResult(row);
            for (const row of conn.db.frostclawBoss.iter()) upsertFrostclawBoss(row);
            for (const row of conn.db.frostclawResult.iter()) upsertFrostclawResult(row);
            for (const row of conn.db.chatMessage.iter()) upsertChatMessage(row);
            for (const row of conn.db.duel.iter()) upsertDuel(row);
            hydrationReady = true;
            updateResumePending = false;
            setWakeReconnectVisible(false);
            setReconnectAfterServerUpdateVisible(false);
            refreshMapPlayerSubscription(true);
            refreshMapMarkerSubscription(true);
            sessionGeneration += 1;
            onChange();
          });
          queueMicrotask(() => { baseSubscriptionHydrating = false; });
          void loadLeaderboardSnapshot();
          flushPendingProgress();
        })
        .onError((ctx) => {
          if (!isCurrentConnection()) return;
          console.error("Wildwood SpacetimeDB subscription error:", ctx.event);
        })
        .subscribe([
          tables.player.where((player) => player.identity.eq(identity)),
          tables.playerMotionIdentity.where((presence) => presence.identity.eq(identity)),
          tables.playerProfile.where((profile) => profile.identity.eq(identity)),
          ...(isDeveloperIdentity(connectedIdentity) ? [tables.devAccessAudit, tables.devBugReports] : []),
          tables.playerAccountStatus.where((status) => status.identity.eq(identity)),
          tables.worldStatus,
          tables.playerProgress.where((progress) => progress.identity.eq(identity)),
          tables.playerResearch.where((research) => research.identity.eq(identity)),
          tables.activeResearch.where((research) => research.identity.eq(identity)),
          tables.playerLifetime.where((lifetime) => lifetime.identity.eq(identity)),
          tables.dragonBoss,
          tables.dragonResult,
          tables.spiderBoss,
          tables.spiderResult,
          tables.frostclawBoss,
          tables.frostclawResult,
          tables.chatMessage,
          tables.duel.where((duel) => duel.challenger.eq(identity)),
        ]);
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
      hydrationReady = false;
      connectedSignedIn = false;
      lastSentMovement = null;
      nextPositionSequence = 0;
      latencyMs = null;
      lastLatencyProbeStartedAt = 0;
      lastSpeedSent = null;
      lastDuelPulseAt = 0;
      worldEntryPromise = null;
      worldEntryGeneration = 0;
      localProfileReady = false;
        localResearch = { warcraft: 0, moveSpeed: 0, foraging: 0, vitality: 0, precision: 0, criticalChance: 0, criticalDamage: 0, prosperity: 0 };
      localActiveResearch = null;
      clearRealtimeCaches();
      if (hadActiveGame) {
        setServerUpdateVisible(true);
        setReconnectAfterServerUpdateVisible(true);
      }
      if (error) console.warn("Wildwood SpacetimeDB disconnected:", error);
      onChange?.();
      scheduleReconnect();
    })
    .onConnectError((_ctx: ErrorContext, error: Error) => {
      if (generation !== connectionGeneration) return;
      connecting = false;
      connection = null;
      hydrationReady = false;
      connectedSignedIn = false;
      lastSentMovement = null;
      nextPositionSequence = 0;
      latencyMs = null;
      lastLatencyProbeStartedAt = 0;
      lastSpeedSent = null;
      lastDuelPulseAt = 0;
      worldEntryPromise = null;
      worldEntryGeneration = 0;
      const rejectedToken = /401|unauthorized|verify token/i.test(String(error?.message || error));
      if (rejectedToken) {
        clearStoredToken(signedIn ? accountTokenKey : guestTokenKey);
        if (signedIn && hasKnownAccount()) {
          const alreadyRetried = readTabValue(authRetryKey) === "true";
          if (accountSessionApproved && !alreadyRetried) {
            writeTabValue(authRetryKey, "true");
            authNotice = "REOPENING SIGN-IN";
            void startAccountSignIn().catch((signInError) => {
              clearAccountReturnPending();
              accountSessionApproved = false;
              authNotice = "SIGN-IN FAILED · TRY AGAIN";
              console.warn("Wildwood account reauthentication failed:", signInError);
              onChange?.();
            });
            onChange?.();
            return;
          }
          accountSessionApproved = false;
          authNotice = "SIGN-IN REQUIRED";
          clearAccountReturnPending();
          onChange?.();
          return;
        }
        console.warn("Wildwood token rejected; reconnecting with a fresh guest session.");
        onChange?.();
        scheduleReconnect(100);
        return;
      }
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
  isConnected() {
    return Boolean(connection?.isActive && hydrationReady);
  },
  isReconnectingAfterWake() {
    return wakeReconnectVisible || reconnectAfterServerUpdateVisible;
  },
  latencyMs() {
    return latencyMs;
  },
  prepareUpdateReload(version: string) {
    storeUpdateResumeIntent(version);
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
  accountState() {
    const signedIn = Boolean(connection?.isActive && connectedSignedIn);
    return {
      signedIn,
      knownAccount: hasKnownAccount(),
      signInRequired: hasKnownAccount() && !signedIn && !guestSessionExplicit,
      guestSessionApproved: guestSessionExplicit,
      authInProgress: accountCallbackPending,
      returningFromSignIn: accountReturnPending || updateResumePending,
      hydrated: hydrationReady,
      updating: protocolBlocked || serverUpdateVisible,
      sessionConflict: worldEntryBlocked,
      notice: authNotice,
    };
  },
  knownCharacter() {
    const accountCharacter = rememberedAccountCharacter();
    const signedIn = connection?.isActive ? connectedSignedIn : Boolean(accountToken());
    if (!signedIn && (accountCharacter || hasKnownAccount())) return accountCharacter;
    const currentCharacter = localProfileReady && localProgress?.introComplete && !isGeneratedDisplayName(localDisplayName)
      ? localDisplayName.trim()
      : "";
    const rememberedCharacter = signedIn ? accountCharacter : rememberedGuestCharacter();
    return currentCharacter || rememberedCharacter;
  },
  async signIn() {
    if (protocolBlocked) return { ok: false, error: "UPDATE REQUIRED" };
    if (connection?.isActive && connectedSignedIn) return { ok: true };
    clearTabValue(authRetryKey);
    if (accountToken() && hasKnownAccount()) {
      accountSessionApproved = true;
      authNotice = "OPENING CHARACTER";
      onChange?.();
      connect();
      return { ok: true };
    }
    if (hasKnownAccount() && !connection) {
      authNotice = "OPENING SIGN-IN";
      onChange?.();
      await startAccountSignIn();
      return { ok: true };
    }
    if (!connection) {
      authNotice = "WAIT FOR SERVER";
      onChange?.();
      return { ok: false, error: "WAIT FOR SERVER" };
    }
    if (!await requestWorldEntry()) {
      authNotice = "PLAYER START FAILED · TRY AGAIN";
      onChange?.();
      return { ok: false, error: "PLAYER START FAILED" };
    }
    authNotice = "SAVING GUEST";
    onChange?.();
    if (!await drainPendingProgress()) {
      authNotice = "GUEST SAVE FAILED · TRY AGAIN";
      onChange?.();
      return { ok: false, error: "GUEST SAVE FAILED" };
    }
    const code = randomUrlSafe(40);
    writeAccountLinkTransaction({ code, guestIdentity: localIdentity });
    try {
      await connection.reducers.beginAccountLink({ code });
    } catch (error) {
      clearTabValue(accountLinkKey);
      authNotice = "SIGN-IN NOT READY";
      handleReducerFailure("sign-in preparation", error);
      onChange?.();
      return { ok: false, error: "SIGN-IN NOT READY" };
    }
    markAccountMigrationPending();
    authNotice = "PREPARING SIGN-IN";
    onChange?.();
    await startAccountSignIn();
    return { ok: true };
  },
  async takeOverSession() {
    if (protocolBlocked) return { ok: false, error: "UPDATE REQUIRED" };
    takeoverRequested = true;
    if (!connection?.isActive) {
      worldEntryBlocked = false;
      authNotice = "RECONNECTING TO SIGN OUT OTHER TAB…";
      connect();
      onChange?.();
      return { ok: true };
    }
    const conn = connection;
    authNotice = "SIGNING OUT OTHER TAB…";
    onChange?.();
    try {
      await conn.reducers.takeOverSession({ tabId: authTabId() });
      if (connection !== conn) return { ok: false, error: "CONNECTION CHANGED" };
      takeoverRequested = false;
      worldEntryBlocked = false;
      worldEntryGeneration = 0;
      authNotice = "OPENING CHARACTER";
      conn.disconnect();
      scheduleReconnect(100);
      onChange?.();
      return { ok: true };
    } catch (error) {
      takeoverRequested = false;
      const message = reducerErrorMessage(error);
      worldEntryBlocked = true;
      authNotice = "TAKEOVER FAILED · TRY AGAIN";
      handleReducerFailure("session takeover", error);
      onChange?.();
      return { ok: false, error: message };
    }
  },
  signOut() {
    virtualPlayerLoadTest.disconnectLocal();
    try {
      localStorage.removeItem(accountTokenKey);
      localStorage.removeItem(knownAccountKey);
      localStorage.removeItem(accountMigrationPendingKey);
    } catch {}
    clearTabValue(accountLinkKey);
    clearTabValue(authStateKey);
    clearTabValue(authVerifierKey);
    window.location.reload();
  },
  continueAsGuest() {
    guestSessionExplicit = true;
    authNotice = "GUEST SESSION";
    if (connection?.isActive) void requestWorldEntry();
    else connect();
    onChange?.();
  },
  localIdentity() {
    return localIdentity;
  },
  sessionGeneration() {
    return sessionGeneration;
  },
  localState() {
    return localState;
  },
  localDisplayName() {
    return localDisplayName;
  },
  playerDisplayName(identity: string) {
    return profiles.get(identity) ?? generatedDisplayName(identity);
  },
  isDisplayNameTaken(displayName: string) {
    const normalized = displayName.trim().replace(/\s+/g, " ").toLocaleLowerCase();
    return [...profiles].some(([identity, name]) => identity !== localIdentity && name.toLocaleLowerCase() === normalized);
  },
  profileIcon(identity = localIdentity) {
    return profileIcons.get(identity) ?? 0;
  },
  playerSprite(identity = localIdentity) {
    return playerSprites.get(identity) ?? 0;
  },
  skinTone(identity = localIdentity) {
    return skinTones.get(identity) ?? 3;
  },
  localProfileReady() {
    return localProfileReady;
  },
  leaderboardEntries() {
    return [...leaderboardEntries.values()].map((entry) => ({
      ...entry,
      isGuest: guestAccounts.get(entry.identity) ?? entry.isGuest,
    }));
  },
  loadLeaderboardSnapshot,
  isDeveloper(identity = localIdentity) {
    return isDeveloperIdentity(identity);
  },
  developerPresenceVisible() {
    return localPresenceVisible;
  },
  async setDeveloperPresence(visible: boolean) {
    if (protocolBlocked || !connection || !isDeveloperIdentity(localIdentity)) {
      return { ok: false, error: "DEVELOPER ACCESS REQUIRED" };
    }
    try {
      await connection.reducers.setDeveloperPresence({ visible });
      localPresenceVisible = visible;
      onChange?.();
      return { ok: true };
    } catch (error) {
      const message = reducerErrorMessage(error);
      handleReducerFailure("developer presence", error);
      return { ok: false, error: message };
    }
  },
  accessAuditEntries() {
    return [...accessAuditEntries.values()].map(({ identityValue: _identityValue, ...entry }) => ({ ...entry }));
  },
  bugReportEntries() {
    return [...bugReportEntries.values()].map((entry) => ({ ...entry }));
  },
  async deleteBugReport(id: bigint) {
    if (protocolBlocked || !connection || !isDeveloperIdentity(localIdentity)) {
      return { ok: false, error: "DEVELOPER ACCESS REQUIRED" };
    }
    if (!bugReportEntries.has(id.toString())) return { ok: false, error: "BUG REPORT NOT FOUND" };
    try {
      await connection.reducers.devDeleteBugReport({ id });
      return { ok: true };
    } catch (error) {
      const message = reducerErrorMessage(error);
      handleReducerFailure("bug report delete", error);
      return { ok: false, error: message };
    }
  },
  async setAccessAuditLabel(identity: string, label: string) {
    if (protocolBlocked || !connection || !isDeveloperIdentity(localIdentity)) {
      return { ok: false, error: "DEVELOPER ACCESS REQUIRED" };
    }
    const entry = accessAuditEntries.get(identity);
    if (!entry) return { ok: false, error: "AUDIT ROW NOT FOUND" };
    try {
      await connection.reducers.devSetAccessAuditLabel({ identity: entry.identityValue, label });
      return { ok: true };
    } catch (error) {
      const message = reducerErrorMessage(error);
      handleReducerFailure("audit label update", error);
      return { ok: false, error: message };
    }
  },
  async updatePlayerSave(identity: string, update: {
    displayName: string;
    maxHp: number;
    damage: number;
    attackRate: number;
    projectileSpeed: number;
    projectileCount: number;
    attackRange: number;
    armor: number;
    regen: number;
    speed: number;
  }) {
    if (protocolBlocked || !connection || !isDeveloperIdentity(localIdentity)) {
      return { ok: false, error: "DEVELOPER ACCESS REQUIRED" };
    }
    const targetIdentity = profileIdentities.get(identity) ?? accessAuditEntries.get(identity)?.identityValue;
    if (!targetIdentity) return { ok: false, error: "PLAYER IDENTITY NOT FOUND" };
    try {
      await connection.reducers.devUpdatePlayerSave({ identity: targetIdentity, ...update });
      return { ok: true };
    } catch (error) {
      const message = reducerErrorMessage(error);
      handleReducerFailure("developer save update", error);
      return { ok: false, error: message };
    }
  },
  isGuest(identity = localIdentity) {
    const knownStatus = guestAccounts.get(identity) ?? leaderboardEntries.get(identity)?.isGuest;
    if (knownStatus !== undefined) return knownStatus;
    if (identity === localIdentity) return connection?.isActive ? !connectedSignedIn : !accountToken();
    return false;
  },
  async setDisplayName(displayName: string) {
    if (protocolBlocked) return { ok: false, error: "UPDATE REQUIRED" };
    if (!connection) return { ok: false, error: "NOT CONNECTED" };
    try {
      await connection.reducers.setDisplayName({ displayName });
      return { ok: true };
    } catch (error) {
      const message = reducerErrorMessage(error);
      handleReducerFailure("display-name update", error);
      console.warn("Wildwood display-name update rejected:", message);
      return { ok: false, error: message };
    }
  },
  async setProfileIcon(profileIcon: number) {
    if (protocolBlocked) return { ok: false, error: "UPDATE REQUIRED" };
    if (!connection) return { ok: false, error: "NOT CONNECTED" };
    const normalized = Math.max(0, Math.min(63, Math.floor(profileIcon)));
    try {
      await connection.reducers.setProfileIcon({ profileIcon: normalized });
      return { ok: true };
    } catch (error) {
      const message = reducerErrorMessage(error);
      handleReducerFailure("profile icon update", error);
      return { ok: false, error: message };
    }
  },
  async setPlayerSprite(playerSprite: number) {
    if (protocolBlocked) return { ok: false, error: "UPDATE REQUIRED" };
    if (!connection) return { ok: false, error: "NOT CONNECTED" };
    const normalized = Math.max(0, Math.min(3, Math.floor(playerSprite)));
    try {
      await connection.reducers.setPlayerSprite({ playerSprite: normalized });
      return { ok: true };
    } catch (error) {
      const message = reducerErrorMessage(error);
      handleReducerFailure("player-sprite update", error);
      return { ok: false, error: message };
    }
  },
  async setSkinTone(skinTone: number) {
    if (protocolBlocked) return { ok: false, error: "UPDATE REQUIRED" };
    if (!connection) return { ok: false, error: "NOT CONNECTED" };
    const normalized = Math.max(0, Math.min(19, Math.floor(skinTone)));
    try {
      await connection.reducers.setSkinTone({ skinTone: normalized });
      return { ok: true };
    } catch (error) {
      const message = reducerErrorMessage(error);
      handleReducerFailure("skin-tone update", error);
      return { ok: false, error: message };
    }
  },
  savedProgress() {
    if (!localProgress) return null;
    const progress = pendingProgress ? mergeProgress(localProgress, pendingProgress) : localProgress;
    return { ...progress };
  },
  research() {
    return { ...localResearch };
  },
  activeResearch() {
    return localActiveResearch ? { ...localActiveResearch } : null;
  },
  async startResearch(researchId: ResearchId) {
    if (protocolBlocked) return { ok: false, error: "UPDATE REQUIRED" };
    if (!connection) return { ok: false, error: "NOT CONNECTED" };
    try {
      await connection.reducers.startResearch({ researchId });
      return { ok: true };
    } catch (error) {
      const message = reducerErrorMessage(error);
      handleReducerFailure("research start", error);
      return { ok: false, error: message };
    }
  },
  async recordPlayerDeath() {
    if (protocolBlocked || !connection) return;
    try {
      await connection.reducers.recordPlayerDeath({});
    } catch (error) {
      handleReducerFailure("death tracking", error);
    }
  },
  dragonBoss() {
    return sharedDragon ? { ...sharedDragon } : null;
  },
  dragonResult() {
    return latestDragonResult
      ? { ...latestDragonResult, contributors: latestDragonResult.contributors.map((entry) => ({ ...entry })) }
      : null;
  },
  spiderBoss() {
    return sharedSpider ? { ...sharedSpider } : null;
  },
  spiderResult() {
    return latestSpiderResult
      ? { ...latestSpiderResult, contributors: latestSpiderResult.contributors.map((entry) => ({ ...entry })) }
      : null;
  },
  frostclawBoss() {
    return sharedFrostclaw ? { ...sharedFrostclaw } : null;
  },
  frostclawResult() {
    return latestFrostclawResult
      ? { ...latestFrostclawResult, contributors: latestFrostclawResult.contributors.map((entry) => ({ ...entry })) }
      : null;
  },
  playerProfile(identity = localIdentity) {
    const profile = cachedPlayerProfile(identity);
    return profile
      ? { ...profile, progress: { ...profile.progress }, lifetime: { ...profile.lifetime } }
      : null;
  },
  activePlayerMap(identity = localIdentity) {
    return resolvePlayerPresenceMap(identity, localIdentity, localState?.mapId, profilePlayerMaps, playerMaps);
  },
  loadPlayerProfile,
  releasePlayerProfile,
  damageDragon(hits = 1, x = localState?.x ?? Number.NaN, y = localState?.y ?? Number.NaN) {
    if (protocolBlocked || !connection || !Number.isFinite(x) || !Number.isFinite(y)) return;
    sendReducer("dragon damage", () => connection?.reducers.damageDragonFromPosition({ hits, x, y }));
  },
  damageSpider(hits = 1, x = localState?.x ?? Number.NaN, y = localState?.y ?? Number.NaN) {
    if (protocolBlocked || !connection || !Number.isFinite(x) || !Number.isFinite(y)) return;
    sendReducer("spider damage", () => connection?.reducers.damageSpiderFromPosition({ hits, x, y }));
  },
  damageFrostclaw(hits = 1, x = localState?.x ?? Number.NaN, y = localState?.y ?? Number.NaN) {
    if (protocolBlocked || !connection || !Number.isFinite(x) || !Number.isFinite(y)) return;
    sendReducer("frostclaw damage", () => connection?.reducers.damageFrostclawFromPosition({ hits, x, y }));
  },
  saveProgress(progress: ProgressSave, immediate = false) {
    persistPendingProgress(progress);
    // Normal reward saves coalesce behind the periodic flush. Immediate saves
    // are reserved for equipment and lifecycle boundaries where ordering matters.
    if (immediate) {
      progressSaveInFlightUntil = 0;
      flushPendingProgress(true);
    }
  },
  resetProgress() {
    if (protocolBlocked) return;
    clearPendingProgress();
    if (!connection) return;
    sendReducer("progress reset", () => connection?.reducers.resetPlayerProgress({}));
  },
  beginAdventure() {
    if (protocolBlocked || !connection) return;
    sendReducer("adventure start", () => connection?.reducers.beginAdventure({}));
  },
  chatMessages() {
    return chatMessages.slice();
  },
  chatRevision() {
    return chatPresentationRevision;
  },
  async sendChatMessage(message: string) {
    if (protocolBlocked) return { ok: false, error: "UPDATE REQUIRED" };
    if (!connection) return { ok: false, error: "NOT CONNECTED" };
    try {
      await connection.reducers.sendChatMessage({ message });
      return { ok: true };
    } catch (error) {
      const rejected = reducerErrorMessage(error);
      handleReducerFailure("chat message", error);
      return { ok: false, error: rejected };
    }
  },
  localDuel() {
    for (const duel of duels.values()) {
      if (duel.challenger === localIdentity) return { ...duel };
    }
    return null;
  },
  duelCooldownRemainingMs() {
    return Math.max(0, duelCooldownUntil - Date.now());
  },
  duelReplay(id: bigint) {
    const replay = duelReplays.get(id);
    return replay ? { ...replay } : null;
  },
  loadDuelReplay,
  async requestDuel(opponentIdentity: string) {
    if (protocolBlocked) return { ok: false, error: "UPDATE REQUIRED" };
    if (!connection) return { ok: false, error: "NOT CONNECTED" };
    const opponent = profileIdentities.get(opponentIdentity);
    if (!opponent) return { ok: false, error: "PLAYER PROFILE UNAVAILABLE" };
    try {
      // Equipment/stat changes must commit before the server freezes a duel
      // snapshot, otherwise rapid equip -> duel can use the previous loadout.
      if (!await drainPendingProgress()) return { ok: false, error: "SAVE STILL SYNCING · TRY AGAIN" };
      const conn = connection;
      if (!conn) return { ok: false, error: "NOT CONNECTED" };
      await conn.reducers.requestDuel({ opponent });
      rememberDuelCooldown(Date.now() + DUEL_COOLDOWN_MS);
      return { ok: true };
    } catch (error) {
      const message = reducerErrorMessage(error);
      const cooldownSeconds = /duel cooldown:\s*(\d+) seconds/i.exec(message)?.[1];
      if (cooldownSeconds) rememberDuelCooldown(Date.now() + Number(cooldownSeconds) * 1_000);
      handleReducerFailure("duel request", error);
      console.warn("Wildwood duel request rejected:", message);
      return { ok: false, error: message };
    }
  },
  acceptDuel(id: bigint) {
    if (protocolBlocked || !connection) return;
    sendReducer("duel acceptance", () => connection?.reducers.acceptDuel({ id }));
  },
  pulseDuel() {
    if (protocolBlocked || !connection) return;
    const now = performance.now();
    if (now - lastDuelPulseAt < 500) return;
    lastDuelPulseAt = now;
    sendReducer("duel pulse", () => connection?.reducers.pulseDuel({}));
  },
  syncSpeed(speed: number) {
    if (protocolBlocked || !connection || !Number.isFinite(speed) || speed === lastSpeedSent) return;
    lastSpeedSent = speed;
    sendReducer("speed sync", () => connection?.reducers.setSpeed({ speed }));
  },
  syncMovementState(x: number, y: number, dx: number, dy: number, inputKind: MovementInputKind = "keyboard", force = false, interestArea?: PlayerInterestArea) {
    if (protocolBlocked || !connection || !Number.isFinite(x) || !Number.isFinite(y)) return;
    refreshMapPlayerSubscription(false, interestArea);
    const now = performance.now();
    const vector = normalizeMovementVector(dx, dy);
    if (!movementUpdateReason({ now, vector, inputKind, lastSent: lastSentMovement, force })) return;

    lastSentMovement = { ...vector, sentAt: now };
    const sequence = ++nextPositionSequence;
    if (localState) {
      localState.x = x;
      localState.y = y;
      if (vector.dx < 0) localState.facing = Math.PI;
      else if (vector.dx > 0) localState.facing = 0;
      localState.moving = vector.moving;
      localState.lastInputSequence = sequence;
    }
    sendReducer("movement state", () => connection?.reducers.updateMovementState({ x, y, dx: vector.dx, dy: vector.dy, sequence }));
  },
  correctMovementPosition(x: number, y: number, stop = false) {
    const vector = stop || !lastSentMovement
      ? { dx: 0, dy: 0 }
      : { dx: lastSentMovement.dx, dy: lastSentMovement.dy };
    wildwoodCoop.syncMovementState(x, y, vector.dx, vector.dy, "keyboard", true);
  },
  async changeMap(mapId: string, x: number, y: number) {
    if (
      protocolBlocked ||
      worldEntryBlocked ||
      !connection ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      ![TUTORIAL_FOREST_MAP_ID, BEGINNER_DESERT_MAP_ID, INTERMEDIATE_SNOWLANDS_MAP_ID].includes(mapId)
    ) return false;
    try {
      await connection.reducers.changeMap({ mapId, x, y });
      return true;
    } catch (error) {
      handleReducerFailure("map change", error);
      return false;
    }
  },
  remotePlayers() {
    const result = remotePlayerRenderBuffer;
    result.length = 0;
    const now = performance.now();

    for (const player of players.values()) {
      if (player.id === localIdentity) continue;
      const samples = player.samples;
      const renderAt = adaptiveRemoteRenderAt(player.interpolationClock, now);
      const motion = remoteMotionAt(samples, renderAt, player.speed);
      player.x = motion.x;
      player.y = motion.y;
      player.facing = motion.facing;
      player.moving = motion.moving;
      result.push(player);
    }

    return result;
  },
  remotePlayerCount() {
    let count = 0;
    for (const player of players.values()) {
      if (player.id !== localIdentity) count += 1;
    }
    return count;
  },
  mapPlayerMarkers() {
    return [...mapPlayerMarkers.values()];
  },
  subscriptionCount() {
    if (!connection?.isActive) return 0;
    return 1 + Number(Boolean(mapPlayerSubscription)) + Number(Boolean(mapMarkerSubscription)) + Number(Boolean(activePlayerProfileSubscription)) + replayLoads.size;
  },
  onlinePlayerCount() {
    return onlinePlayerCount;
  },
  hasRemotePlayerInArea(minX: number, minY: number, maxX: number, maxY: number) {
    for (const player of players.values()) {
      if (player.id === localIdentity) continue;
      const latest = player.samples[player.samples.length - 1];
      const x = latest?.x ?? player.x;
      const y = latest?.y ?? player.y;
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) return true;
    }
    return false;
  },
};

runtime.wildwoodCoop = wildwoodCoop;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pageWasHidden = true;
    pageHiddenAt = Date.now();
    return;
  }
  if (pageWasHidden) {
    const hiddenFor = pageHiddenAt ? Date.now() - pageHiddenAt : 0;
    pageWasHidden = false;
    if (hiddenFor >= 10_000) setWakeReconnectVisible(true);
    reconnectAfterWake();
  }
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) reconnectAfterWake(true);
});
window.addEventListener("pagehide", () => virtualPlayerLoadTest.disconnectLocal());
window.addEventListener("online", () => reconnectAfterWake());
window.addEventListener("focus", () => reconnectAfterWake());
window.setInterval(() => {
  if (!document.hidden && navigator.onLine && !connection?.isActive && !connecting) scheduleReconnect(100);
}, 5_000);
window.addEventListener("storage", (event) => {
  if (event.oldValue === event.newValue) return;
  if (event.key === accountTokenKey) {
    if (!accountMigrationPending()) window.location.reload();
    return;
  }
  if (event.key === accountMigrationPendingKey && event.newValue === null) {
    const shouldBeSignedIn = Boolean(accountToken());
    if (!connection?.isActive || shouldBeSignedIn !== connectedSignedIn) window.location.reload();
  }
});
void restoreKnownAccount();

export default wildwoodCoop;
