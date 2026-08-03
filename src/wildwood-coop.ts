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

type PendingInput = {
  sequence: number;
  inputX: number;
  inputY: number;
};

type RemotePlayerTarget = RemotePlayer & {
  targetX: number;
  targetY: number;
  targetFacing: number;
};

const MOVEMENT_HZ = 24;
const MOVEMENT_INTERVAL_MS = 1000 / MOVEMENT_HZ;
const MOVEMENT_STEP_SECONDS = 1 / MOVEMENT_HZ;
const REMOTE_PREDICTION_SECONDS = MOVEMENT_STEP_SECONDS;

const runtime = window as WildwoodRuntime;
const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
const defaultHost = isLocalHost ? "ws://localhost:3000" : "wss://maincloud.spacetimedb.com";
const host = runtime.WILDWOOD_SPACETIMEDB_HOST ?? defaultHost;
const databaseName = runtime.WILDWOOD_SPACETIMEDB_DB_NAME ?? "wildwood-coop";
const tokenKey = `${host}/${databaseName}/auth_token`;
const players = new Map<string, RemotePlayerTarget>();
const profiles = new Map<string, string>();
const chatMessages: ChatMessage[] = [];
const duels = new Map<bigint, DuelState>();
const duelReplays = new Map<bigint, DuelReplay>();

let connection: DbConnection | null = null;
let localIdentity = "";
let lastMovementSentAt = 0;
let lastInputX = 0;
let lastInputY = 0;
let nextInputSequence = 0;
const pendingInputs: PendingInput[] = [];
let heartbeatTimer: number | null = null;
let localState: LocalPlayerState | null = null;
let localDisplayName = "";
let localProgress: PlayerProgress | null = null;
let lastSpeedSent: number | null = null;
let positionSyncPendingSequence: number | null = null;
let lastDuelPulseAt = 0;
let onChange: (() => void) | null = null;

function upsertPlayer(row: {
  identity: Identity;
  x: number;
  y: number;
  facing: number;
  moving: boolean;
  hp: number;
  maxHp: number;
  speed: number;
  lastInputSequence: number;
}) {
  const id = row.identity.toHexString();
  if (id === localIdentity) {
    localState = {
      x: row.x,
      y: row.y,
      speed: row.speed,
      moving: row.moving,
      lastInputSequence: row.lastInputSequence,
    };
    if (
      positionSyncPendingSequence !== null &&
      row.lastInputSequence >= positionSyncPendingSequence
    ) {
      positionSyncPendingSequence = null;
    }
    onChange?.();
    return;
  }

  const existing = players.get(id);
  if (existing) {
    existing.targetX = row.x;
    existing.targetY = row.y;
    existing.targetFacing = row.facing;
    existing.speed = row.speed;
    existing.moving = row.moving;
    existing.hp = row.hp;
    existing.maxHp = row.maxHp;
  } else {
    players.set(id, {
      id,
      name: profiles.get(id) ?? "PLAYER",
      x: row.x,
      y: row.y,
      speed: row.speed,
      facing: row.facing,
      moving: row.moving,
      hp: row.hp,
      maxHp: row.maxHp,
      targetX: row.x,
      targetY: row.y,
      targetFacing: row.facing,
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
  if (row.identity.toHexString() !== localIdentity) return;
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

function removeDuel(row: { id: bigint }) {
  duels.delete(row.id);
  onChange?.();
}

function removePlayer(row: { identity: Identity }) {
  players.delete(row.identity.toHexString());
  onChange?.();
}

function connect() {
  connection = DbConnection.builder()
    .withUri(host)
    .withDatabaseName(databaseName)
    .withToken(localStorage.getItem(tokenKey) || undefined)
    .onConnect((conn: DbConnection, identity: Identity, token: string) => {
      connection = conn;
      localIdentity = identity.toHexString();
      lastInputX = 0;
      lastInputY = 0;
      nextInputSequence = 0;
      pendingInputs.length = 0;
      localDisplayName = "";
      localProgress = null;
      lastSpeedSent = null;
      positionSyncPendingSequence = null;
      lastDuelPulseAt = 0;
      localStorage.setItem(tokenKey, token);

      if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
      heartbeatTimer = window.setInterval(() => {
        connection?.reducers.heartbeat({});
      }, 5_000);

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
      conn.db.duelReplay.onInsert((_ctx, row) => upsertDuelReplay(row));

      conn
        .subscriptionBuilder()
        .onApplied(() => {
          for (const row of conn.db.playerProfile.iter()) upsertProfile(row);
          for (const row of conn.db.playerProgress.iter()) upsertProgress(row);
          for (const row of conn.db.player.iter()) upsertPlayer(row);
          for (const row of conn.db.chatMessage.iter()) upsertChatMessage(row);
          for (const row of conn.db.duel.iter()) upsertDuel(row);
          for (const row of conn.db.duelReplay.iter()) upsertDuelReplay(row);
          onChange?.();
        })
        .onError((ctx) => {
          console.error("Wildwood SpacetimeDB subscription error:", ctx.event);
        })
        .subscribe([tables.player, tables.playerProfile, tables.playerProgress, tables.chatMessage, tables.duel, tables.duelReplay]);
      onChange?.();
    })
    .onDisconnect((_ctx, error) => {
      if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      connection = null;
      localIdentity = "";
      lastInputX = 0;
      lastInputY = 0;
      nextInputSequence = 0;
      pendingInputs.length = 0;
      localState = null;
      localDisplayName = "";
      localProgress = null;
      lastSpeedSent = null;
      positionSyncPendingSequence = null;
      lastDuelPulseAt = 0;
      players.clear();
      profiles.clear();
      chatMessages.length = 0;
      duels.clear();
      duelReplays.clear();
      if (error) console.warn("Wildwood SpacetimeDB disconnected:", error);
      onChange?.();
    })
    .onConnectError((_ctx: ErrorContext, error: Error) => {
      if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      connection = null;
      lastInputX = 0;
      lastInputY = 0;
      nextInputSequence = 0;
      pendingInputs.length = 0;
      localState = null;
      localDisplayName = "";
      localProgress = null;
      lastSpeedSent = null;
      positionSyncPendingSequence = null;
      lastDuelPulseAt = 0;
      console.warn("Wildwood SpacetimeDB unavailable:", error.message);
      onChange?.();
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
    return connection !== null;
  },
  localIdentity() {
    return localIdentity;
  },
  localState() {
    return localState;
  },
  localDisplayName() {
    return localDisplayName;
  },
  setDisplayName(displayName: string) {
    if (!connection) return;
    connection.reducers.setDisplayName({ displayName });
  },
  savedProgress() {
    return localProgress ? { ...localProgress } : null;
  },
  saveProgress(progress: PlayerProgress) {
    if (!connection) return;
    connection.reducers.savePlayerProgress(progress);
  },
  resetProgress() {
    if (!connection) return;
    connection.reducers.resetPlayerProgress({});
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
  syncPosition(x: number, y: number, facing: number) {
    if (!connection || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(facing)) return;
    pendingInputs.length = 0;
    lastInputX = 0;
    lastInputY = 0;
    lastMovementSentAt = 0;
    const sequence = ++nextInputSequence;
    positionSyncPendingSequence = sequence;
    connection.reducers.syncPosition({ x, y, facing, sequence });
  },
  sendMovement(inputX: number, inputY: number) {
    if (!connection) return;

    const now = performance.now();
    const changed = Math.abs(inputX - lastInputX) > 0.01 || Math.abs(inputY - lastInputY) > 0.01;
    const hasInput = Math.abs(inputX) + Math.abs(inputY) > 0.01;
    if (!changed && !hasInput) return;
    if (now - lastMovementSentAt < MOVEMENT_INTERVAL_MS) return;

    lastMovementSentAt = now;
    lastInputX = inputX;
    lastInputY = inputY;
    const sequence = ++nextInputSequence;
    pendingInputs.push({ sequence, inputX, inputY });
    connection.reducers.moveV2({ inputX, inputY, sequence });
  },
  reconcileLocal(x: number, y: number, dt = 1 / 60) {
    if (!connection || !localState || positionSyncPendingSequence !== null) return { x, y };

    const firstPendingInput = pendingInputs[0];
    if (
      !localState.moving &&
      firstPendingInput &&
      Math.hypot(firstPendingInput.inputX, firstPendingInput.inputY) >= 0.01
    ) {
      return { x, y };
    }

    while (
      pendingInputs.length > 0 &&
      pendingInputs[0].sequence <= localState.lastInputSequence
    ) {
      pendingInputs.shift();
    }

    let targetX = localState.x;
    let targetY = localState.y;
    for (const input of pendingInputs) {
      const inputLength = Math.hypot(input.inputX, input.inputY);
      if (inputLength < 0.01) continue;
      targetX += input.inputX / inputLength * localState.speed * MOVEMENT_STEP_SECONDS;
      targetY += input.inputY / inputLength * localState.speed * MOVEMENT_STEP_SECONDS;
    }

    const errorX = targetX - x;
    const errorY = targetY - y;
    if (Math.hypot(errorX, errorY) > 100) return { x: targetX, y: targetY };

    const correction = 1 - Math.pow(0.000001, Math.min(0.1, Math.max(0, dt)));
    return {
      x: x + errorX * correction,
      y: y + errorY * correction,
    };
  },
  remotePlayers(dt = 1 / 60) {
    const smoothing = 1 - Math.pow(0.000001, Math.min(0.1, Math.max(0, dt)));
    const result: RemotePlayer[] = [];

    for (const player of players.values()) {
      if (player.id === localIdentity) continue;
      const prediction = player.moving ? player.speed * REMOTE_PREDICTION_SECONDS : 0;
      const desiredX = player.targetX + Math.cos(player.targetFacing) * prediction;
      const desiredY = player.targetY + Math.sin(player.targetFacing) * prediction;
      player.x += (desiredX - player.x) * smoothing;
      player.y += (desiredY - player.y) * smoothing;
      player.facing += Math.atan2(
        Math.sin(player.targetFacing - player.facing),
        Math.cos(player.targetFacing - player.facing),
      ) * smoothing;
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
wildwoodCoop.connect();

export default wildwoodCoop;
