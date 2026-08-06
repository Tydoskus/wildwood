import { DbConnection, tables, type ErrorContext } from "./module_bindings";
import type { Identity } from "spacetimedb";

type WildwoodRuntime = Window & {
  WILDWOOD_SPACETIMEDB_HOST?: string;
  WILDWOOD_SPACETIMEDB_DB_NAME?: string;
  wildwoodCoop?: typeof wildwoodCoop;
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
  hp: number;
  maxHp: number;
  feetItem: string;
};

export type LocalPlayerState = {
  x: number;
  y: number;
  facing: number;
  speed: number;
  moving: boolean;
  lastInputSequence: number;
};

export type ChatMessage = {
  id: bigint;
  sender: string;
  senderName: string;
  message: string;
  replayId: bigint;
  sentAtMs: number;
};

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
  bootsCollected: boolean;
  inventoryJson: string;
  equippedFeet: string;
  introComplete: boolean;
};

export type PlayerLifetime = {
  joinedAtMs: number;
  playedSeconds: number;
  sessionStartedAtMs: number;
  enemyKills: number;
};

export type PlayerProfileData = {
  identity: string;
  name: string;
  progress: PlayerProgress;
  lifetime: PlayerLifetime;
};

export type DragonBossState = {
  encounter: bigint;
  hp: number;
  maxHp: number;
  alive: boolean;
  respawnAtMs: number;
};

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

type ProgressSave = Omit<PlayerProgress, "introComplete"> & { enemyKills: number };

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
  challengerAttacks: number;
  opponentHp: number;
  opponentMaxHp: number;
  opponentAttacks: number;
};

export type DuelReplay = {
  id: bigint;
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
};

type RemotePlayerTarget = RemotePlayer & {
  samples: RemotePlayerSample[];
};

type RemotePlayerSample = {
  receivedAt: number;
  x: number;
  y: number;
  facing: number;
  moving: boolean;
};

const MOVEMENT_HZ = 24;
const MOVEMENT_INTERVAL_MS = 1000 / MOVEMENT_HZ;
const REMOTE_INTERPOLATION_DELAY_MS = 100;
const REMOTE_SAMPLE_LIMIT = 8;
const PROTOCOL_VERSION = 14;
const DEFAULT_ATTACK_RANGE = 200;
const DEFAULT_ATTACK_INTERVAL = 1.56;
const MIN_ATTACK_INTERVAL = .32;
const ATTACK_BALANCE_VERSION = 1;
const MIN_PROJECTILE_SPEED = 390;
const MAX_PROJECTILE_SPEED = 2730;
const NAME_ADJECTIVES = ["Mossy", "Bright", "Quiet", "Brave", "Dusky", "Lucky", "Wild", "Clever"];
const NAME_CREATURES = ["Fox", "Owl", "Badger", "Hare", "Raven", "Wolf", "Deer", "Moth"];

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
const knownAccountKey = `${tokenKey}/spacetimeauth_known_account_v1`;
const knownAccountCharacterKey = `${tokenKey}/spacetimeauth_character_name_v1`;
const knownGuestCharacterKey = `${tokenKey}/guest_character_name_v1`;
const silentAuthAttemptKey = `${tokenKey}/spacetimeauth_silent_attempt_v1`;
const authReturnUiKey = `${tokenKey}/spacetimeauth_return_ui_v1`;
const pendingProgressKey = `${tokenKey}/pending_progress_v1`;
const SPACETIME_AUTH_CLIENT_ID = "client_03426HMgkAEmdC23XTZRKZ";
const SPACETIME_AUTH_ISSUER = "https://auth.spacetimedb.com/oidc";
const SPACETIME_AUTHORIZATION_ENDPOINT = `${SPACETIME_AUTH_ISSUER}/auth`;
const SPACETIME_AUTH_TOKEN_ENDPOINT = `${SPACETIME_AUTH_ISSUER}/token`;
const SPACETIME_AUTH_SCOPE = "openid profile email";
const players = new Map<string, RemotePlayerTarget>();
const profiles = new Map<string, string>();
const profileIdentities = new Map<string, Identity>();
const profileProgress = new Map<string, PlayerProgress>();
const playerLifetimes = new Map<string, PlayerLifetime>();
const playerProfileLoads = new Map<string, Promise<PlayerProfileData | null>>();
let activePlayerProfileIdentity = "";
let activePlayerProfileSubscription: { unsubscribe: () => void } | null = null;
const chatMessages: ChatMessage[] = [];
const duels = new Map<bigint, DuelState>();
const duelReplays = new Map<bigint, DuelReplay>();
const replayLoads = new Map<bigint, Promise<DuelReplay | null>>();
let sharedDragon: DragonBossState | null = null;
let latestDragonResult: DragonResult | null = null;

let connection: DbConnection | null = null;
let localIdentity = "";
let lastPositionSentAt = 0;
let lastPositionMoving = false;
let nextPositionSequence = 0;
let reconnectTimer: number | null = null;
let connecting = false;
let connectionGeneration = 0;
let sessionGeneration = 0;
let hydrationReady = false;
let connectedSignedIn = false;
let guestSessionExplicit = false;
let pageWasHidden = false;
let pageHiddenAt = 0;
let lastServerActivityAt = performance.now();
let localState: LocalPlayerState | null = null;
let localDisplayName = "";
let localProfileReady = false;
let localProgress: PlayerProgress | null = null;
let lastSpeedSent: number | null = null;
let lastDuelPulseAt = 0;
let onChange: (() => void) | null = null;
let pendingProgress: ProgressSave | null = null;
let progressSaveInFlightUntil = 0;
let progressSavePromise: Promise<boolean> | null = null;
let authNotice = "";
let protocolBlocked = false;
let protocolRefreshScheduled = false;
let accountLinkClaiming = false;
let resumeProbePromise: Promise<void> | null = null;
let worldEntryPromise: Promise<boolean> | null = null;
let worldEntryGeneration = 0;
let accountCallbackPending = new URL(window.location.href).searchParams.has("code") ||
  new URL(window.location.href).searchParams.has("error");
let accountReturnPending = accountCallbackPending && (() => {
  try {
    return sessionStorage.getItem(authReturnUiKey) === "true";
  } catch {
    return false;
  }
})();

function reducerErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function touchServerActivity() {
  lastServerActivityAt = performance.now();
}

function handleReducerFailure(action: string, error: unknown) {
  const message = reducerErrorMessage(error);
  if (!/wildwood updated\. refresh to continue\./i.test(message)) {
    console.warn(`Wildwood ${action} rejected:`, message);
    return;
  }

  // Do not let an old tab keep retrying saves or movement after Maincloud has
  // moved to a new protocol. Pending progress stays in local storage so the
  // freshly loaded client can submit it safely.
  protocolBlocked = true;
  progressSaveInFlightUntil = Number.POSITIVE_INFINITY;
  authNotice = "UPDATE REQUIRED · REFRESHING";
  onChange?.();
  if (protocolRefreshScheduled) return;
  protocolRefreshScheduled = true;
  window.setTimeout(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("v", `refresh-${Date.now()}`);
    window.location.replace(url.toString());
  }, 250);
}

function sendReducer(action: string, reducer: () => unknown, onRejected?: () => void) {
  if (protocolBlocked) return;
  try {
    void Promise.resolve(reducer()).catch((error) => {
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
  worldEntryPromise = Promise.resolve(conn.reducers.enterWorld({}))
    .then(() => {
      if (connection !== conn || generation !== connectionGeneration) return false;
      worldEntryGeneration = generation;
      flushPendingProgress(true);
      onChange?.();
      return true;
    })
    .catch((error) => {
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
    return localStorage.getItem(accountTokenKey);
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
  const key = `${accountMigrationPendingKey}/tab_id`;
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const created = randomUrlSafe(12);
    sessionStorage.setItem(key, created);
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

function silentAuthAlreadyAttempted() {
  try {
    return sessionStorage.getItem(silentAuthAttemptKey) === "true";
  } catch {
    return true;
  }
}

function markSilentAuthAttempted() {
  try {
    sessionStorage.setItem(silentAuthAttemptKey, "true");
  } catch {}
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

async function startAccountSignIn(silent = false) {
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
  if (silent) parameters.set("prompt", "none");
  url.search = parameters.toString();
  window.location.assign(url.toString());
}

async function restoreKnownAccount() {
  await completeAccountCallback();
  if (!accountToken() && hasKnownAccount()) {
    if (!silentAuthAlreadyAttempted()) {
      markSilentAuthAttempted();
      authNotice = "RESTORING SIGN-IN";
      onChange?.();
      await startAccountSignIn(true);
      return;
    }
    authNotice = "SIGN-IN REQUIRED";
    onChange?.();
    return;
  }
  wildwoodCoop.connect();
}

function bounded(value: number, min: number, max: number, fallback: number) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function copyProgress(progress: ProgressSave): ProgressSave {
  return {
    maxHp: bounded(progress.maxHp, 1, 1_000_000, 100),
    damage: bounded(progress.damage, 1, 1_000_000, 4),
    attackRate: bounded(progress.attackRate, MIN_ATTACK_INTERVAL, 10, DEFAULT_ATTACK_INTERVAL),
    projectileSpeed: bounded(progress.projectileSpeed, MIN_PROJECTILE_SPEED, MAX_PROJECTILE_SPEED, MIN_PROJECTILE_SPEED),
    projectileCount: Number.isInteger(progress.projectileCount)
      ? Math.max(1, Math.min(20, progress.projectileCount))
      : 1,
    attackRange: DEFAULT_ATTACK_RANGE,
    armor: bounded(progress.armor, 0, 1_000_000, 0),
    regen: bounded(progress.regen, 0, 1_000_000, 0),
    speed: bounded(progress.speed, 1, 2_000, 180),
    bootsCollected: progress.bootsCollected,
    inventoryJson: typeof progress.inventoryJson === "string" ? progress.inventoryJson : "[]",
    equippedFeet: typeof progress.equippedFeet === "string" ? progress.equippedFeet : "",
    enemyKills: Number.isInteger(progress.enemyKills)
      ? Math.max(0, Math.min(4_294_967_295, progress.enemyKills))
      : 0,
  };
}

function isProgressSave(value: unknown): value is ProgressSave {
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
    typeof progress.equippedFeet === "string" &&
    (progress.enemyKills === undefined || Number.isInteger(progress.enemyKills));
}

function pendingProgressStorageKey(identity: string) {
  return `${pendingProgressKey}/${identity}`;
}

function readPendingProgress(identity: string): ProgressSave | null {
  try {
    const scopedKey = pendingProgressStorageKey(identity);
    let serialized = localStorage.getItem(scopedKey);
    if (!serialized) {
      const legacy = localStorage.getItem(pendingProgressKey);
      if (legacy) {
        const legacyCandidate = JSON.parse(legacy) as { identity?: unknown } | null;
        if (legacyCandidate?.identity === identity) {
          serialized = legacy;
          localStorage.setItem(scopedKey, legacy);
          localStorage.removeItem(pendingProgressKey);
        }
      }
    }
    const candidate = JSON.parse(serialized || "null");
    if (!candidate || typeof candidate !== "object") return null;
    const pending = candidate as { identity?: unknown; balanceVersion?: unknown; progress?: unknown };
    if (pending.identity !== identity || !isProgressSave(pending.progress)) return null;
    const rawProgress = pending.progress as ProgressSave;
    const progress = pending.balanceVersion === ATTACK_BALANCE_VERSION
      ? copyProgress(rawProgress)
      : copyProgress({
          ...rawProgress,
          attackRate: bounded(rawProgress.attackRate * 2, MIN_ATTACK_INTERVAL, DEFAULT_ATTACK_INTERVAL, DEFAULT_ATTACK_INTERVAL),
        });
    if (pending.balanceVersion !== ATTACK_BALANCE_VERSION) {
      localStorage.setItem(scopedKey, JSON.stringify({ identity, balanceVersion: ATTACK_BALANCE_VERSION, progress }));
    }
    return progress;
  } catch {
    return null;
  }
}

function persistPendingProgress(progress: ProgressSave) {
  pendingProgress = copyProgress(progress);
  if (!localIdentity) return;
  try {
    localStorage.setItem(pendingProgressStorageKey(localIdentity), JSON.stringify({
      identity: localIdentity,
      balanceVersion: ATTACK_BALANCE_VERSION,
      progress: pendingProgress,
    }));
  } catch {}
}

function clearPendingProgress(identity = localIdentity) {
  if (identity === localIdentity) {
    pendingProgress = null;
    progressSaveInFlightUntil = 0;
  }
  try {
    if (identity) localStorage.removeItem(pendingProgressStorageKey(identity));
    const candidate = JSON.parse(localStorage.getItem(pendingProgressKey) || "null");
    if (!candidate || candidate.identity === identity) localStorage.removeItem(pendingProgressKey);
  } catch {}
}

function progressCovers(saved: PlayerProgress, pending: ProgressSave) {
  const epsilon = 0.0001;
  return saved.maxHp >= pending.maxHp &&
    saved.damage >= pending.damage &&
    saved.attackRate <= pending.attackRate + epsilon &&
    saved.projectileSpeed >= pending.projectileSpeed &&
    saved.projectileCount >= pending.projectileCount &&
    Math.abs(saved.attackRange - pending.attackRange) <= epsilon &&
    saved.armor >= pending.armor &&
    saved.regen >= pending.regen &&
    saved.speed >= pending.speed &&
    (!pending.bootsCollected || saved.bootsCollected) &&
    saved.inventoryJson === pending.inventoryJson && saved.equippedFeet === pending.equippedFeet;
}

function mergeProgress(saved: PlayerProgress, pending: ProgressSave): PlayerProgress {
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
    equippedFeet: pending.equippedFeet,
  };
}

function sameProgressSave(a: ProgressSave, b: ProgressSave) {
  return JSON.stringify(copyProgress(a)) === JSON.stringify(copyProgress(b));
}

function flushPendingProgressAsync(force = false): Promise<boolean> {
  if (progressSavePromise) return progressSavePromise;
  if (protocolBlocked || !connection || !pendingProgress) return Promise.resolve(!pendingProgress);
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

function upsertPlayer(row: {
  identity: Identity;
  x: number;
  y: number;
  facing: number;
  moving: boolean;
  hp: number;
  maxHp: number;
  power: number;
  speed: number;
  feetItem: string;
  lastInputSequence: number;
}) {
  const id = row.identity.toHexString();
  if (id === localIdentity) {
    localState = {
      x: row.x,
      y: row.y,
      facing: row.facing,
      speed: row.speed,
      moving: row.moving,
      lastInputSequence: row.lastInputSequence,
    };
    onChange?.();
    return;
  }

  const existing = players.get(id);
  if (existing) {
    existing.samples.push({
      receivedAt: performance.now(),
      x: row.x,
      y: row.y,
      facing: row.facing,
      moving: row.moving,
    });
    while (existing.samples.length > REMOTE_SAMPLE_LIMIT) existing.samples.shift();
    existing.speed = row.speed;
    existing.moving = row.moving;
    existing.hp = row.hp;
    existing.maxHp = row.maxHp;
    existing.power = row.power;
    existing.feetItem = row.feetItem;
  } else {
    players.set(id, {
      id,
      name: profiles.get(id) ?? generatedDisplayName(id),
      power: row.power,
      x: row.x,
      y: row.y,
      speed: row.speed,
      facing: row.facing,
      moving: row.moving,
      hp: row.hp,
      maxHp: row.maxHp,
      feetItem: row.feetItem,
      samples: [{ receivedAt: performance.now(), x: row.x, y: row.y, facing: row.facing, moving: row.moving }],
    });
  }
  onChange?.();
}

function upsertProfile(row: { identity: Identity; displayName: string }) {
  const id = row.identity.toHexString();
  profiles.set(id, row.displayName);
  profileIdentities.set(id, row.identity);
  if (id === localIdentity) {
    localDisplayName = row.displayName;
    localProfileReady = true;
    rememberConfirmedCharacter(row.displayName);
    completeAccountReturnWhenReady();
  }
  const player = players.get(id);
  if (player) player.name = row.displayName;
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
    equippedFeet: row.equippedFeet,
    introComplete: row.introComplete,
  };
  profileProgress.set(id, progress);
  if (id !== localIdentity) return;
  localProgress = progress;
  completeAccountReturnWhenReady();
  if (pendingProgress && progressCovers(localProgress, pendingProgress)) clearPendingProgress();
  else flushPendingProgress();
  onChange?.();
}

function upsertPlayerLifetime(row: {
  identity: Identity;
  joinedAt: { microsSinceUnixEpoch: bigint };
  playedMicros: bigint;
  sessionStartedAt: { microsSinceUnixEpoch: bigint };
  enemyKills: bigint;
}) {
  playerLifetimes.set(row.identity.toHexString(), {
    joinedAtMs: Number(row.joinedAt.microsSinceUnixEpoch / 1_000n),
    playedSeconds: Number(row.playedMicros) / 1_000_000,
    sessionStartedAtMs: Number(row.sessionStartedAt.microsSinceUnixEpoch / 1_000n),
    enemyKills: Number(row.enemyKills),
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

function upsertChatMessage(row: {
  id: bigint;
  sender: Identity;
  senderName: string;
  message: string;
  replayId: bigint;
  sentAt: { microsSinceUnixEpoch: bigint };
}) {
  if (chatMessages.some((message) => message.id === row.id)) return;
  chatMessages.push({
    id: row.id,
    sender: row.sender.toHexString(),
    senderName: row.senderName,
    message: row.message,
    replayId: row.replayId,
    sentAtMs: Number(row.sentAt.microsSinceUnixEpoch / 1000n),
  });
  chatMessages.sort((a, b) => (a.id < b.id ? -1 : 1));
  while (chatMessages.length > 100) chatMessages.shift();
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
  challengerAttacks: number;
  opponentHp: number;
  opponentMaxHp: number;
  opponentAttacks: number;
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
    challengerAttacks: row.challengerAttacks,
    opponentHp: row.opponentHp,
    opponentMaxHp: row.opponentMaxHp,
    opponentAttacks: row.opponentAttacks,
  });
  onChange?.();
}

function upsertDuelReplay(row: any) {
  duelReplays.set(row.id, {
    id: row.id,
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

  const request = new Promise<DuelReplay | null>((resolve) => {
    conn
      .subscriptionBuilder()
      .onApplied(() => {
        const row = [...conn.db.duelReplay.iter()].find((replay) => replay.id === id);
        if (row) upsertDuelReplay(row);
        replayLoads.delete(id);
        const replay = duelReplays.get(id);
        resolve(replay ? { ...replay } : null);
      })
      .onError(() => {
        replayLoads.delete(id);
        resolve(null);
      })
      .subscribe([tables.duelReplay.where((replay) => replay.id.eq(id))]);
  });
  replayLoads.set(id, request);
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
    lifetime: { ...lifetime },
  };
}

function loadPlayerProfile(identity: string): Promise<PlayerProfileData | null> {
  const existing = cachedPlayerProfile(identity);
  if (existing && (identity === localIdentity || identity === activePlayerProfileIdentity)) return Promise.resolve(existing);
  const loading = playerProfileLoads.get(identity);
  if (loading) return loading;
  const conn = connection;
  const dbIdentity = profileIdentities.get(identity);
  if (!conn || !dbIdentity) return Promise.resolve(null);

  releasePlayerProfile();
  activePlayerProfileIdentity = identity;

  const request = new Promise<PlayerProfileData | null>((resolve) => {
    activePlayerProfileSubscription = conn
      .subscriptionBuilder()
      .onApplied(() => {
        for (const row of conn.db.playerProgress.iter()) {
          if (row.identity.toHexString() === identity) upsertProgress(row);
        }
        for (const row of conn.db.playerLifetime.iter()) {
          if (row.identity.toHexString() === identity) upsertPlayerLifetime(row);
        }
        playerProfileLoads.delete(identity);
        resolve(cachedPlayerProfile(identity));
      })
      .onError(() => {
        playerProfileLoads.delete(identity);
        resolve(null);
      })
      .subscribe([
        tables.playerProgress.where((progress) => progress.identity.eq(dbIdentity)),
        tables.playerLifetime.where((lifetime) => lifetime.identity.eq(dbIdentity)),
      ]);
  });
  playerProfileLoads.set(identity, request);
  return request;
}

function releasePlayerProfile() {
  if (activePlayerProfileSubscription) activePlayerProfileSubscription.unsubscribe();
  if (activePlayerProfileIdentity && activePlayerProfileIdentity !== localIdentity) {
    profileProgress.delete(activePlayerProfileIdentity);
    playerLifetimes.delete(activePlayerProfileIdentity);
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
  players.delete(row.identity.toHexString());
  onChange?.();
}

function clearRealtimeCaches() {
  releasePlayerProfile();
  players.clear();
  profiles.clear();
  profileIdentities.clear();
  profileProgress.clear();
  playerLifetimes.clear();
  playerProfileLoads.clear();
  chatMessages.length = 0;
  duels.clear();
  duelReplays.clear();
  replayLoads.clear();
  sharedDragon = null;
  latestDragonResult = null;
}

function scheduleReconnect(delay = 500) {
  if (document.hidden || reconnectTimer !== null || connection?.isActive || connecting) return;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function reconnectAfterWake(force = false) {
  if (document.hidden || connecting || resumeProbePromise) return;
  const conn = connection;
  if (force || !conn?.isActive) {
    if (conn?.isActive) conn.disconnect();
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
        onChange?.();
      }
    })
    .catch(() => {
      if (connection === conn && generation === connectionGeneration) {
        conn.disconnect();
        scheduleReconnect(200);
      }
    })
    .finally(() => {
      resumeProbePromise = null;
    });
}

function connect() {
  if (connection?.isActive || connecting) return;
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
      hydrationReady = false;
      connectedSignedIn = signedIn;
      touchServerActivity();
      protocolBlocked = false;
      protocolRefreshScheduled = false;
      accountLinkClaiming = false;
      worldEntryPromise = null;
      worldEntryGeneration = 0;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
      const connectedIdentity = identity.toHexString();
      const identityChanged = Boolean(localIdentity && localIdentity !== connectedIdentity);
      localIdentity = connectedIdentity;
      localProfileReady = false;
      localDisplayName = signedIn ? rememberedAccountCharacter() : rememberedGuestCharacter();
      pendingProgress = readPendingProgress(localIdentity);
      progressSaveInFlightUntil = 0;
      lastPositionSentAt = 0;
      lastPositionMoving = false;
      nextPositionSequence = 0;
      if (identityChanged) {
        localState = null;
        localProgress = null;
      }
      lastSpeedSent = null;
      lastDuelPulseAt = 0;
      clearRealtimeCaches();
      if (!signedIn) {
        try {
          localStorage.setItem(guestTokenKey, token);
        } catch {}
      }
      void conn.reducers.registerProtocol({ protocolVersion: PROTOCOL_VERSION }).then(async () => {
        if (generation !== connectionGeneration || connection !== conn) return;
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

        if ((signedIn || guestSessionExplicit) && !await requestWorldEntry()) {
          if (isCurrentConnection()) conn.disconnect();
          return;
        }

        conn.db.player.onInsert((_ctx, row) => { if (isCurrentConnection()) upsertPlayer(row); });
        conn.db.player.onUpdate((_ctx, _oldRow, row) => { if (isCurrentConnection()) upsertPlayer(row); });
        conn.db.player.onDelete((_ctx, row) => { if (isCurrentConnection()) removePlayer(row); });
        conn.db.playerProfile.onInsert((_ctx, row) => { if (isCurrentConnection()) upsertProfile(row); });
        conn.db.playerProfile.onUpdate((_ctx, _oldRow, row) => { if (isCurrentConnection()) upsertProfile(row); });
        conn.db.playerProgress.onInsert((_ctx, row) => { if (isCurrentConnection()) upsertProgress(row); });
        conn.db.playerProgress.onUpdate((_ctx, _oldRow, row) => { if (isCurrentConnection()) upsertProgress(row); });
        conn.db.playerLifetime.onInsert((_ctx, row) => { if (isCurrentConnection()) upsertPlayerLifetime(row); });
        conn.db.playerLifetime.onUpdate((_ctx, _oldRow, row) => { if (isCurrentConnection()) upsertPlayerLifetime(row); });
        conn.db.dragonBoss.onInsert((_ctx, row) => { if (isCurrentConnection()) upsertDragonBoss(row); });
        conn.db.dragonBoss.onUpdate((_ctx, _oldRow, row) => { if (isCurrentConnection()) upsertDragonBoss(row); });
        conn.db.dragonResult.onInsert((_ctx, row) => { if (isCurrentConnection()) upsertDragonResult(row); });
        conn.db.dragonResult.onUpdate((_ctx, _oldRow, row) => { if (isCurrentConnection()) upsertDragonResult(row); });
        conn.db.chatMessage.onInsert((_ctx, row) => { if (isCurrentConnection()) upsertChatMessage(row); });
        conn.db.duel.onInsert((_ctx, row) => { if (isCurrentConnection()) upsertDuel(row); });
        conn.db.duel.onUpdate((_ctx, _oldRow, row) => { if (isCurrentConnection()) upsertDuel(row); });
        conn.db.duel.onDelete((_ctx, row) => { if (isCurrentConnection()) removeDuel(row); });

        conn
        .subscriptionBuilder()
        .onApplied(() => {
          if (!isCurrentConnection()) return;
          for (const row of conn.db.playerProfile.iter()) upsertProfile(row);
          for (const row of conn.db.playerProgress.iter()) upsertProgress(row);
          for (const row of conn.db.playerLifetime.iter()) upsertPlayerLifetime(row);
          for (const row of conn.db.player.iter()) upsertPlayer(row);
          for (const row of conn.db.dragonBoss.iter()) upsertDragonBoss(row);
          for (const row of conn.db.dragonResult.iter()) upsertDragonResult(row);
          for (const row of conn.db.chatMessage.iter()) upsertChatMessage(row);
          for (const row of conn.db.duel.iter()) upsertDuel(row);
          hydrationReady = true;
          sessionGeneration += 1;
          flushPendingProgress();
          onChange?.();
        })
        .onError((ctx) => {
          if (!isCurrentConnection()) return;
          console.error("Wildwood SpacetimeDB subscription error:", ctx.event);
        })
        .subscribe([
          tables.player,
          tables.playerProfile,
          tables.playerProgress.where((progress) => progress.identity.eq(identity)),
          tables.playerLifetime.where((lifetime) => lifetime.identity.eq(identity)),
          tables.dragonBoss,
          tables.dragonResult,
          tables.chatMessage,
          tables.duel,
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
      connecting = false;
      connection = null;
      hydrationReady = false;
      connectedSignedIn = false;
      lastPositionSentAt = 0;
      lastPositionMoving = false;
      nextPositionSequence = 0;
      lastSpeedSent = null;
      lastDuelPulseAt = 0;
      worldEntryPromise = null;
      worldEntryGeneration = 0;
      localProfileReady = false;
      clearRealtimeCaches();
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
      lastPositionSentAt = 0;
      lastPositionMoving = false;
      nextPositionSequence = 0;
      lastSpeedSent = null;
      lastDuelPulseAt = 0;
      worldEntryPromise = null;
      worldEntryGeneration = 0;
      const rejectedToken = /401|unauthorized|verify token/i.test(String(error?.message || error));
      if (rejectedToken) {
        clearStoredToken(signedIn ? accountTokenKey : guestTokenKey);
        if (signedIn && hasKnownAccount() && !silentAuthAlreadyAttempted()) {
          markSilentAuthAttempted();
          authNotice = "RESTORING SIGN-IN";
          onChange?.();
          void startAccountSignIn(true);
          return;
        }
        if (signedIn && hasKnownAccount()) {
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
    onChange = callback;
  },
  isConnected() {
    return Boolean(connection?.isActive && hydrationReady);
  },
  accountState() {
    const signedIn = connection?.isActive ? connectedSignedIn : Boolean(accountToken());
    return {
      signedIn,
      knownAccount: hasKnownAccount(),
      signInRequired: hasKnownAccount() && !signedIn && !guestSessionExplicit,
      authInProgress: accountCallbackPending || authNotice === "RESTORING SIGN-IN",
      returningFromSignIn: accountReturnPending,
      hydrated: hydrationReady,
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
    if (connection?.isActive ? connectedSignedIn : Boolean(accountToken())) return { ok: true };
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
  signOut() {
    try {
      localStorage.removeItem(accountTokenKey);
      localStorage.removeItem(knownAccountKey);
      localStorage.removeItem(accountMigrationPendingKey);
      sessionStorage.removeItem(silentAuthAttemptKey);
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
  localProfileReady() {
    return localProfileReady;
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
  savedProgress() {
    if (!localProgress) return null;
    const progress = pendingProgress ? mergeProgress(localProgress, pendingProgress) : localProgress;
    return { ...progress };
  },
  dragonBoss() {
    return sharedDragon ? { ...sharedDragon } : null;
  },
  dragonResult() {
    return latestDragonResult
      ? { ...latestDragonResult, contributors: latestDragonResult.contributors.map((entry) => ({ ...entry })) }
      : null;
  },
  playerProfile(identity = localIdentity) {
    const profile = cachedPlayerProfile(identity);
    return profile
      ? { ...profile, progress: { ...profile.progress }, lifetime: { ...profile.lifetime } }
      : null;
  },
  loadPlayerProfile,
  releasePlayerProfile,
  damageDragon(hits = 1) {
    if (protocolBlocked || !connection) return;
    sendReducer("dragon damage", () => connection?.reducers.damageDragonBatch({ hits }));
  },
  saveProgress(progress: ProgressSave) {
    persistPendingProgress(progress);
    progressSaveInFlightUntil = 0;
    flushPendingProgress();
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
  sendChatMessage(message: string) {
    if (protocolBlocked || !connection) return;
    sendReducer("chat message", () => connection?.reducers.sendChatMessage({ message }));
  },
  localDuel() {
    for (const duel of duels.values()) {
      if (duel.challenger === localIdentity || duel.opponent === localIdentity) return { ...duel };
    }
    return null;
  },
  duelReplay(id: bigint) {
    const replay = duelReplays.get(id);
    return replay ? { ...replay } : null;
  },
  loadDuelReplay,
  async requestDuel() {
    if (protocolBlocked) return { ok: false, error: "UPDATE REQUIRED" };
    if (!connection) return { ok: false, error: "NOT CONNECTED" };
    try {
      await connection.reducers.requestDuel({});
      return { ok: true };
    } catch (error) {
      const message = reducerErrorMessage(error);
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
  syncPosition(x: number, y: number, facing: number, moving = false, force = false) {
    if (protocolBlocked || !connection || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(facing)) return;
    const now = performance.now();
    const movingChanged = moving !== lastPositionMoving;
    if (!force && !movingChanged && !moving) return;
    if (!force && !movingChanged && now - lastPositionSentAt < MOVEMENT_INTERVAL_MS) return;

    lastPositionSentAt = now;
    lastPositionMoving = moving;
    const sequence = ++nextPositionSequence;
    sendReducer("position sync", () => connection?.reducers.syncPosition({ x, y, facing, moving, sequence }));
  },
  remotePlayers(dt = 1 / 60) {
    const result: RemotePlayer[] = [];
    const renderAt = performance.now() - REMOTE_INTERPOLATION_DELAY_MS;

    for (const player of players.values()) {
      if (player.id === localIdentity) continue;
      const samples = player.samples;
      let before = samples[0];
      let after = samples[samples.length - 1];
      for (let index = 1; index < samples.length; index += 1) {
        if (samples[index].receivedAt >= renderAt) {
          before = samples[index - 1];
          after = samples[index];
          break;
        }
      }
      const span = Math.max(1, after.receivedAt - before.receivedAt);
      const alpha = Math.max(0, Math.min(1, (renderAt - before.receivedAt) / span));
      player.x = before.x + (after.x - before.x) * alpha;
      player.y = before.y + (after.y - before.y) * alpha;
      player.facing = before.facing + Math.atan2(
        Math.sin(after.facing - before.facing),
        Math.cos(after.facing - before.facing),
      ) * alpha;
      player.moving = alpha < 1 ? before.moving : after.moving;
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
};

runtime.wildwoodCoop = wildwoodCoop;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pageWasHidden = true;
    pageHiddenAt = Date.now();
    return;
  }
  if (pageWasHidden) {
    pageWasHidden = false;
    reconnectAfterWake();
  }
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) reconnectAfterWake(true);
});
window.addEventListener("online", () => reconnectAfterWake());
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
