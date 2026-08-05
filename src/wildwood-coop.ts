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
  introComplete: boolean;
};

type ProgressSave = Omit<PlayerProgress, "introComplete">;

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
const PROTOCOL_VERSION = 4;
const DEFAULT_ATTACK_RANGE = 200;
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
const authStateKey = `${tokenKey}/spacetimeauth_state_v1`;
const authVerifierKey = `${tokenKey}/spacetimeauth_verifier_v1`;
const pendingProgressKey = `${tokenKey}/pending_progress_v1`;
const SPACETIME_AUTH_CLIENT_ID = "client_03426HMgkAEmdC23XTZRKZ";
const SPACETIME_AUTH_ISSUER = "https://auth.spacetimedb.com/oidc";
const SPACETIME_AUTHORIZATION_ENDPOINT = `${SPACETIME_AUTH_ISSUER}/auth`;
const SPACETIME_AUTH_TOKEN_ENDPOINT = `${SPACETIME_AUTH_ISSUER}/token`;
const SPACETIME_AUTH_SCOPE = "openid profile email";
const players = new Map<string, RemotePlayerTarget>();
const profiles = new Map<string, string>();
const chatMessages: ChatMessage[] = [];
const duels = new Map<bigint, DuelState>();
const duelReplays = new Map<bigint, DuelReplay>();
const replayLoads = new Map<bigint, Promise<DuelReplay | null>>();

let connection: DbConnection | null = null;
let localIdentity = "";
let lastPositionSentAt = 0;
let lastPositionMoving = false;
let nextPositionSequence = 0;
let reconnectTimer: number | null = null;
let connecting = false;
let pageWasHidden = false;
let localState: LocalPlayerState | null = null;
let localDisplayName = "";
let localProgress: PlayerProgress | null = null;
let lastSpeedSent: number | null = null;
let lastDuelPulseAt = 0;
let onChange: (() => void) | null = null;
let pendingProgress = readPendingProgress();
let progressSaveInFlightUntil = 0;
let authNotice = "";

function accountToken() {
  try {
    return localStorage.getItem(accountTokenKey);
  } catch {
    return null;
  }
}

function clearStoredToken(key: string) {
  try {
    localStorage.removeItem(key);
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
  if (!code) return;
  const state = url.searchParams.get("state");
  const expectedState = localStorage.getItem(authStateKey);
  const verifier = localStorage.getItem(authVerifierKey);
  const cleanUrl = `${url.pathname}${url.hash}`;
  if (!state || state !== expectedState || !verifier) {
    authNotice = "SIGN-IN CHECK FAILED";
    history.replaceState({}, "", cleanUrl);
    return;
  }

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
    authNotice = "SIGNED IN";
  } catch (error) {
    authNotice = "SIGN-IN FAILED";
    console.warn("Wildwood account sign-in failed:", error);
  } finally {
    localStorage.removeItem(authStateKey);
    localStorage.removeItem(authVerifierKey);
    history.replaceState({}, "", cleanUrl);
  }
}

async function startAccountSignIn() {
  const verifier = randomUrlSafe(48);
  const state = randomUrlSafe(24);
  const challenge = await sha256UrlSafe(verifier);
  localStorage.setItem(authStateKey, state);
  localStorage.setItem(authVerifierKey, verifier);
  const url = new URL(SPACETIME_AUTHORIZATION_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: SPACETIME_AUTH_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SPACETIME_AUTH_SCOPE,
    state,
    nonce: randomUrlSafe(24),
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  window.location.assign(url.toString());
}

function bounded(value: number, min: number, max: number, fallback: number) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function copyProgress(progress: ProgressSave): ProgressSave {
  return {
    maxHp: bounded(progress.maxHp, 1, 1_000_000, 30),
    damage: bounded(progress.damage, 1, 1_000_000, 4),
    attackRate: bounded(progress.attackRate, .16, 10, .78),
    projectileSpeed: bounded(progress.projectileSpeed, MIN_PROJECTILE_SPEED, MAX_PROJECTILE_SPEED, MIN_PROJECTILE_SPEED),
    projectileCount: Number.isInteger(progress.projectileCount)
      ? Math.max(1, Math.min(20, progress.projectileCount))
      : 1,
    attackRange: DEFAULT_ATTACK_RANGE,
    armor: bounded(progress.armor, 0, 1_000_000, 0),
    regen: bounded(progress.regen, 0, 1_000_000, 0),
    speed: bounded(progress.speed, 1, 2_000, 175),
    bootsCollected: progress.bootsCollected,
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
  ].every(Number.isFinite) && Number.isInteger(progress.projectileCount) && typeof progress.bootsCollected === "boolean";
}

function readPendingProgress(): ProgressSave | null {
  try {
    const candidate = JSON.parse(localStorage.getItem(pendingProgressKey) || "null");
    return isProgressSave(candidate) ? copyProgress(candidate) : null;
  } catch {
    return null;
  }
}

function persistPendingProgress(progress: ProgressSave) {
  pendingProgress = copyProgress(progress);
  try {
    localStorage.setItem(pendingProgressKey, JSON.stringify(pendingProgress));
  } catch {}
}

function clearPendingProgress() {
  pendingProgress = null;
  progressSaveInFlightUntil = 0;
  try {
    localStorage.removeItem(pendingProgressKey);
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
    (!pending.bootsCollected || saved.bootsCollected);
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
  };
}

function flushPendingProgress(force = false) {
  if (!connection || !pendingProgress) return;
  if (!force && Date.now() < progressSaveInFlightUntil) return;
  progressSaveInFlightUntil = Date.now() + 4_000;
  try {
    connection.reducers.savePlayerProgress(copyProgress(pendingProgress));
  } catch {
    progressSaveInFlightUntil = 0;
  }
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
      samples: [{ receivedAt: performance.now(), x: row.x, y: row.y, facing: row.facing, moving: row.moving }],
    });
  }
  onChange?.();
}

function upsertProfile(row: { identity: Identity; displayName: string }) {
  const id = row.identity.toHexString();
  profiles.set(id, row.displayName);
  if (id === localIdentity) localDisplayName = row.displayName;
  const player = players.get(id);
  if (player) player.name = row.displayName;
  onChange?.();
}

function upsertProgress(row: { identity: Identity } & PlayerProgress) {
  const id = row.identity.toHexString();
  if (id !== localIdentity) return;
  localProgress = {
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
    introComplete: row.introComplete,
  };
  if (pendingProgress && progressCovers(localProgress, pendingProgress)) clearPendingProgress();
  else flushPendingProgress();
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

function removeDuel(row: { id: bigint }) {
  duels.delete(row.id);
  onChange?.();
}

function removePlayer(row: { identity: Identity }) {
  players.delete(row.identity.toHexString());
  onChange?.();
}

function scheduleReconnect(delay = 500) {
  if (document.hidden || reconnectTimer !== null || connection?.isActive || connecting) return;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function reconnectAfterWake() {
  if (document.hidden || connecting) return;
  // Mobile browsers can leave a dead WebSocket marked active after sleep.
  // Reopen it when the game becomes visible again instead of waiting forever.
  if (connection?.isActive) connection.disconnect();
  scheduleReconnect(200);
}

function connect() {
  if (connection?.isActive || connecting) return;
  connecting = true;
  const signedIn = Boolean(accountToken());
  connection = DbConnection.builder()
    .withUri(host)
    .withDatabaseName(databaseName)
    .withToken(accountToken() || guestToken() || undefined)
    .onConnect((conn: DbConnection, identity: Identity, token: string) => {
      connection = conn;
      connecting = false;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
      localIdentity = identity.toHexString();
      lastPositionSentAt = 0;
      lastPositionMoving = false;
      nextPositionSequence = 0;
      localDisplayName = "";
      localProgress = null;
      lastSpeedSent = null;
      lastDuelPulseAt = 0;
      if (!signedIn) {
        try {
          localStorage.setItem(guestTokenKey, token);
        } catch {}
      }
      conn.reducers.registerProtocol({ protocolVersion: PROTOCOL_VERSION });

      conn.db.player.onInsert((_ctx, row) => upsertPlayer(row));
      conn.db.player.onUpdate((_ctx, _oldRow, row) => upsertPlayer(row));
      conn.db.player.onDelete((_ctx, row) => removePlayer(row));
      conn.db.playerProfile.onInsert((_ctx, row) => upsertProfile(row));
      conn.db.playerProfile.onUpdate((_ctx, _oldRow, row) => upsertProfile(row));
      conn.db.playerProgress.onInsert((_ctx, row) => upsertProgress(row));
      conn.db.playerProgress.onUpdate((_ctx, _oldRow, row) => upsertProgress(row));
      conn.db.chatMessage.onInsert((_ctx, row) => upsertChatMessage(row));
      conn.db.duel.onInsert((_ctx, row) => upsertDuel(row));
      conn.db.duel.onUpdate((_ctx, _oldRow, row) => upsertDuel(row));
      conn.db.duel.onDelete((_ctx, row) => removeDuel(row));

      conn
        .subscriptionBuilder()
        .onApplied(() => {
          for (const row of conn.db.playerProfile.iter()) upsertProfile(row);
          for (const row of conn.db.playerProgress.iter()) upsertProgress(row);
          for (const row of conn.db.player.iter()) upsertPlayer(row);
          for (const row of conn.db.chatMessage.iter()) upsertChatMessage(row);
          for (const row of conn.db.duel.iter()) upsertDuel(row);
          flushPendingProgress();
          const accountLink = signedIn ? localStorage.getItem(accountLinkKey) : null;
          if (accountLink) {
            conn.reducers.claimGuestAccount({ code: accountLink });
            window.setTimeout(() => {
              try {
                localStorage.removeItem(accountLinkKey);
              } catch {}
              authNotice = "ACCOUNT SAVE LINKED";
              onChange?.();
            }, 750);
          }
          onChange?.();
        })
        .onError((ctx) => {
          console.error("Wildwood SpacetimeDB subscription error:", ctx.event);
        })
        .subscribe([
          tables.player,
          tables.playerProfile,
          tables.playerProgress.where((progress) => progress.identity.eq(identity)),
          tables.chatMessage,
          tables.duel,
        ]);
      onChange?.();
    })
    .onDisconnect((_ctx, error) => {
      connecting = false;
      connection = null;
      localIdentity = "";
      lastPositionSentAt = 0;
      lastPositionMoving = false;
      nextPositionSequence = 0;
      localState = null;
      localDisplayName = "";
      localProgress = null;
      lastSpeedSent = null;
      lastDuelPulseAt = 0;
      players.clear();
      profiles.clear();
      chatMessages.length = 0;
      duels.clear();
      duelReplays.clear();
      replayLoads.clear();
      if (error) console.warn("Wildwood SpacetimeDB disconnected:", error);
      onChange?.();
      scheduleReconnect();
    })
    .onConnectError((_ctx: ErrorContext, error: Error) => {
      connecting = false;
      connection = null;
      lastPositionSentAt = 0;
      lastPositionMoving = false;
      nextPositionSequence = 0;
      localState = null;
      localDisplayName = "";
      localProgress = null;
      lastSpeedSent = null;
      lastDuelPulseAt = 0;
      const rejectedToken = /401|unauthorized|verify token/i.test(String(error?.message || error));
      if (rejectedToken) {
        clearStoredToken(signedIn ? accountTokenKey : guestTokenKey);
        if (signedIn) authNotice = "SIGN-IN EXPIRED";
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
    return Boolean(connection?.isActive);
  },
  accountState() {
    return {
      signedIn: Boolean(accountToken()),
      notice: authNotice,
    };
  },
  async signIn() {
    if (accountToken()) return;
    if (!connection) {
      authNotice = "WAIT FOR SERVER";
      onChange?.();
      return;
    }
    const code = randomUrlSafe(40);
    localStorage.setItem(accountLinkKey, code);
    connection.reducers.beginAccountLink({ code });
    authNotice = "PREPARING SIGN-IN";
    onChange?.();
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    await startAccountSignIn();
  },
  signOut() {
    try {
      localStorage.removeItem(accountTokenKey);
      localStorage.removeItem(accountLinkKey);
      localStorage.removeItem(authStateKey);
      localStorage.removeItem(authVerifierKey);
    } catch {}
    window.location.reload();
  },
  localIdentity() {
    return localIdentity;
  },
  localState() {
    return localState;
  },
  localDisplayName() {
    return localDisplayName || (localIdentity ? generatedDisplayName(localIdentity) : "");
  },
  setDisplayName(displayName: string) {
    if (!connection) return;
    connection.reducers.setDisplayName({ displayName });
  },
  savedProgress() {
    if (!localProgress) return null;
    const progress = pendingProgress ? mergeProgress(localProgress, pendingProgress) : localProgress;
    return { ...progress };
  },
  saveProgress(progress: ProgressSave) {
    persistPendingProgress(progress);
    progressSaveInFlightUntil = 0;
    flushPendingProgress();
  },
  resetProgress() {
    clearPendingProgress();
    if (!connection) return;
    connection.reducers.resetPlayerProgress({});
  },
  beginAdventure() {
    if (!connection) return;
    connection.reducers.beginAdventure({});
  },
  chatMessages() {
    return chatMessages.slice();
  },
  sendChatMessage(message: string) {
    if (!connection) return;
    connection.reducers.sendChatMessage({ message });
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
  requestDuel() {
    if (!connection) return;
    connection.reducers.requestDuel({});
  },
  acceptDuel(id: bigint) {
    if (!connection) return;
    connection.reducers.acceptDuel({ id });
  },
  pulseDuel() {
    if (!connection) return;
    const now = performance.now();
    if (now - lastDuelPulseAt < 500) return;
    lastDuelPulseAt = now;
    connection.reducers.pulseDuel({});
  },
  syncSpeed(speed: number) {
    if (!connection || !Number.isFinite(speed) || speed === lastSpeedSent) return;
    lastSpeedSent = speed;
    connection.reducers.setSpeed({ speed });
  },
  syncPosition(x: number, y: number, facing: number, moving = false, force = false) {
    if (!connection || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(facing)) return;
    const now = performance.now();
    const movingChanged = moving !== lastPositionMoving;
    if (!force && !movingChanged && !moving) return;
    if (!force && !movingChanged && now - lastPositionSentAt < MOVEMENT_INTERVAL_MS) return;

    lastPositionSentAt = now;
    lastPositionMoving = moving;
    const sequence = ++nextPositionSequence;
    connection.reducers.syncPosition({ x, y, facing, moving, sequence });
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
    return;
  }
  if (pageWasHidden) {
    pageWasHidden = false;
    reconnectAfterWake();
  }
});
window.addEventListener("pageshow", () => reconnectAfterWake());
window.addEventListener("online", () => scheduleReconnect(100));
void completeAccountCallback().finally(() => wildwoodCoop.connect());

export default wildwoodCoop;
