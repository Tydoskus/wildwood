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
  facing: number;
  moving: boolean;
  hp: number;
  maxHp: number;
};

type RemotePlayerTarget = RemotePlayer & {
  targetX: number;
  targetY: number;
  targetFacing: number;
};

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
let heartbeatTimer: number | null = null;
let onChange: (() => void) | null = null;

function upsertPlayer(row: {
  identity: Identity;
  x: number;
  y: number;
  facing: number;
  moving: boolean;
  hp: number;
  maxHp: number;
}) {
  const id = row.identity.toHexString();
  const existing = players.get(id);
  if (existing) {
    existing.targetX = row.x;
    existing.targetY = row.y;
    existing.targetFacing = row.facing;
    existing.moving = row.moving;
    existing.hp = row.hp;
    existing.maxHp = row.maxHp;
  } else {
    players.set(id, {
      id,
      x: row.x,
      y: row.y,
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
      players.clear();
      if (error) console.warn("Wildwood SpacetimeDB disconnected:", error);
      onChange?.();
    })
    .onConnectError((_ctx: ErrorContext, error: Error) => {
      if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      connection = null;
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
  sendMovement(inputX: number, inputY: number) {
    if (!connection) return;

    const now = performance.now();
    const changed = Math.abs(inputX - lastInputX) > 0.01 || Math.abs(inputY - lastInputY) > 0.01;
    if (!changed && now - lastMovementSentAt < 50) return;
    if (now - lastMovementSentAt < 45) return;

    lastMovementSentAt = now;
    lastInputX = inputX;
    lastInputY = inputY;
    connection.reducers.move({ inputX, inputY });
  },
  remotePlayers(dt = 1 / 60) {
    const smoothing = 1 - Math.pow(0.0001, Math.min(0.1, Math.max(0, dt)));
    const result: RemotePlayer[] = [];

    for (const player of players.values()) {
      if (player.id === localIdentity) continue;
      player.x += (player.targetX - player.x) * smoothing;
      player.y += (player.targetY - player.y) * smoothing;
      player.facing += Math.atan2(
        Math.sin(player.targetFacing - player.facing),
        Math.cos(player.targetFacing - player.facing),
      ) * smoothing;
      result.push(player);
    }

    return result;
  },
};

runtime.wildwoodCoop = wildwoodCoop;
wildwoodCoop.connect();

export default wildwoodCoop;
