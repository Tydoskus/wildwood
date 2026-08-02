import { DbConnection, tables, type ErrorContext } from "./module_bindings";
import type { Identity } from "spacetimedb";

type WildwoodRuntime = Window & {
  WILDWOOD_SPACETIMEDB_HOST?: string;
  WILDWOOD_SPACETIMEDB_DB_NAME?: string;
  wildwoodCoop?: typeof wildwoodCoop;
};

export type RemotePlayer = {
  id: string;
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

let connection: DbConnection | null = null;
let localIdentity = "";
let lastMovementSentAt = 0;
let lastInputX = 0;
let lastInputY = 0;
let nextInputSequence = 0;
const pendingInputs: PendingInput[] = [];
let heartbeatTimer: number | null = null;
let localState: LocalPlayerState | null = null;
let lastSpeedSent: number | null = null;
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
      lastSpeedSent = null;
      localStorage.setItem(tokenKey, token);

      if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
      heartbeatTimer = window.setInterval(() => {
        connection?.reducers.heartbeat({});
      }, 5_000);

      conn.db.player.onInsert((_ctx, row) => upsertPlayer(row));
      conn.db.player.onUpdate((_ctx, _oldRow, row) => upsertPlayer(row));
      conn.db.player.onDelete((_ctx, row) => removePlayer(row));

      conn
        .subscriptionBuilder()
        .onApplied(() => {
          for (const row of conn.db.player.iter()) upsertPlayer(row);
          onChange?.();
        })
        .onError((ctx) => {
          console.error("Wildwood SpacetimeDB subscription error:", ctx.event);
        })
        .subscribe(tables.player);
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
      lastSpeedSent = null;
      players.clear();
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
      lastSpeedSent = null;
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
  syncSpeed(speed: number) {
    if (!connection || !Number.isFinite(speed) || speed === lastSpeedSent) return;
    lastSpeedSent = speed;
    connection.reducers.setSpeed({ speed });
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
    if (!connection || !localState) return { x, y };

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
