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
};

type RemotePlayerTarget = RemotePlayer & {
  targetX: number;
  targetY: number;
  targetFacing: number;
};

const REMOTE_PREDICTION_SECONDS = 0.1;

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
let lastSentMoving = false;
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
}) {
  const id = row.identity.toHexString();
  if (id === localIdentity) {
    localState = { x: row.x, y: row.y, speed: row.speed };
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
      lastSentMoving = false;
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
      lastSentMoving = false;
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
      lastSentMoving = false;
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
  sendMovement(inputX: number, inputY: number, moving: boolean) {
    if (!connection) return;

    const sentInputX = moving ? inputX : lastInputX;
    const sentInputY = moving ? inputY : lastInputY;
    const now = performance.now();
    const changed = Math.abs(sentInputX - lastInputX) > 0.01 || Math.abs(sentInputY - lastInputY) > 0.01;
    if (!moving && !lastSentMoving) return;
    if (moving && !changed && now - lastMovementSentAt < 100) return;

    lastMovementSentAt = now;
    lastInputX = sentInputX;
    lastInputY = sentInputY;
    lastSentMoving = moving;
    connection.reducers.move({ inputX: sentInputX, inputY: sentInputY, moving });
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
