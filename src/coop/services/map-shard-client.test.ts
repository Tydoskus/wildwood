import { afterEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ connections: [] as any[] }));
vi.mock("../../module_bindings", () => ({
  tables: new Proxy({}, { get: () => ({ where: () => ({}) }) }),
  DbConnection: { builder() {
    const db = new Proxy({} as any, { get(target, key) {
      return target[key] ??= { rows: [], onInsert(fn: any) { this.insert = fn; }, onUpdate(fn: any) { this.update = fn; },
        onDelete(fn: any) { this.remove = fn; }, iter() { return this.rows; } };
    } });
    const connection: any = { isActive: true, identity: {}, queries: [], db,
      reducers: new Proxy({}, { get(target: any, key) { return target[key] ??= vi.fn(async () => {}); } }),
      disconnect: vi.fn(),
      subscriptionBuilder() { const query: any = {
        onApplied(fn: any) { query.apply = fn; return query; },
        onError(fn: any) { query.error = fn; return query; },
        subscribe() { connection.queries.push(query); return query; },
      }; return query; },
    };
    const builder: any = { withUri: () => builder, withToken: () => builder,
      withDatabaseName(name: string) { connection.database = name; return builder; },
      onConnect(fn: any) { connection.connect = () => fn(connection); return builder; },
      onDisconnect(fn: any) { connection.disconnected = fn; return builder; },
      onConnectError(fn: any) { connection.failed = fn; return builder; },
      build() { mock.connections.push(connection); return connection; },
    };
    return builder;
  } },
}));
import { createMapShardClient } from "./map-shard-client";
function setup() {
  let route: any = null;
  let apply: any;
  let change: any;
  const rootTables = new Proxy({} as any, { get(target, key) { return target[key] ??= { iter: () => [] }; } });
  rootTables.myMapShardRoute = {
    identity: { find: () => route }, onInsert(fn: any) { change = fn; }, onUpdate() {}, onDelete() {},
  };
  const root: any = { isActive: true, reducers: { changeMap: vi.fn(async () => {}), setSpeed: vi.fn() }, db: rootTables,
    subscriptionBuilder() { const q: any = { onApplied(fn: any) { apply = fn; return q; }, onError: () => q, subscribe() {} }; return q; } };
  const handlers: any = new Proxy({}, { get(target: any, key) { return target[key] ??= vi.fn(); }, ownKeys: () => ["player", "dragonBoss", "progress"], getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });
  const ready = vi.fn();
  const resetWorld = vi.fn();
  const client = createMapShardClient({ root: () => root, host: "wss://test", token: () => "", tabId: () => "tab",
    handlers, worldReady: ready, changed: vi.fn(), resetWorld,
    port: { sendReducer: (_action: any, fn: any) => fn(root) } as any });
  client.attach(root, {} as any);
  return { client, root, handlers, ready, resetWorld, apply: () => apply(),
    route(value: any) { route = value; change(); },
  };
}
const forest = { databaseName: "map-forest", mapId: "tutorial_forest", generation: 1n, ready: true };
const desert = { databaseName: "map-desert", mapId: "beginner_desert", generation: 2n, ready: true };
async function hydrateLatest() {
  const conn = mock.connections[mock.connections.length - 1];
  await conn.connect();
  conn.queries[0].apply();
  return conn;
}
afterEach(() => { mock.connections.length = 0; vi.restoreAllMocks(); vi.useRealTimers(); });

it("holds movement and old root rows until routing is known, replaying unsharded hydration", async () => {
  const s = setup();
  s.root.db.player.iter = () => [{ mapId: "tutorial_forest" }];
  s.client.rootHandlers.player({ mapId: "wrong-map" });
  expect(s.handlers.player).not.toHaveBeenCalled();
  expect(s.client.port.connection()).toBeNull();
  expect(s.client.ready()).toBe(false);
  s.apply();
  expect(s.handlers.player).toHaveBeenCalledExactlyOnceWith({ mapId: "tutorial_forest" });
  expect(s.client.port.connection()).toBe(s.root);
  expect(s.client.ready()).toBe(true);
  s.route({ ...forest, databaseName: "", ready: false });
  await Promise.resolve();
  expect(s.client.port.connection()).toBeNull();
  expect(mock.connections).toHaveLength(0);
});

it("routes movement regionally, keeps account actions on the root, and ignores stale hydration", async () => {
  const s = setup(); s.apply();
  s.route(forest); await Promise.resolve();
  const first = await hydrateLatest();
  s.client.port.connection()!.reducers.updateMovementState({} as any);
  s.client.port.connection()!.reducers.setSpeed({ speed: 180 });
  expect(first.reducers.updateMovementState).toHaveBeenCalled();
  expect(s.root.reducers.setSpeed).toHaveBeenCalled();
  s.client.rootHandlers.player({}); s.client.rootHandlers.dragonBoss({}); s.client.rootHandlers.progress({});
  expect(s.handlers.player).not.toHaveBeenCalled();
  expect(s.handlers.dragonBoss).not.toHaveBeenCalled();
  expect(s.handlers.progress).toHaveBeenCalled();
  s.route(desert); await Promise.resolve();
  expect(first.disconnect).toHaveBeenCalledOnce();
  first.queries[0].apply();
  first.db.player.insert({}, { mapId: forest.mapId });
  expect(s.handlers.player).not.toHaveBeenCalled();
  expect(s.client.ready()).toBe(false);
  expect(s.client.port.connection()).toBeNull();
  s.client.clear();
});

it("does not finish a portal on root commit or stale hydration, and supports repeated round trips", async () => {
  const s = setup(); s.apply();
  s.route(forest); await Promise.resolve();
  let previous = await hydrateLatest();
  for (let index = 0; index < 6; index += 1) {
    const destination = { ...(index % 2 === 0 ? desert : forest), generation: BigInt(index + 2) };
    let finished = false;
    const move = s.client.port.connection()!.reducers.changeMap({ mapId: destination.mapId, x: 100, y: 100 }).then(() => { finished = true; });
    await Promise.resolve();
    expect(s.root.reducers.changeMap).toHaveBeenLastCalledWith({ mapId: destination.mapId, x: 100, y: 100 });
    expect(finished).toBe(false);
    s.route({ ...destination, ready: false }); await Promise.resolve();
    previous.queries[0].apply();
    expect(finished).toBe(false);
    s.route(destination); await Promise.resolve();
    const next = mock.connections[mock.connections.length - 1];
    await next.connect();
    expect(finished).toBe(false);
    next.db.player.rows = [{ mapId: destination.mapId }];
    next.queries[0].apply();
    await move;
    expect(finished).toBe(true);
    expect(s.handlers.player).toHaveBeenLastCalledWith({ mapId: destination.mapId });
    expect(s.client.ready()).toBe(true);
    previous = next;
  }
  s.client.clear();
});

it("coalesces route replacement so a temporary delete cannot expose the root world", async () => {
  const s = setup(); s.apply();
  s.route(forest); await Promise.resolve(); await hydrateLatest();
  s.resetWorld.mockClear();
  s.route(null);
  s.route(desert);
  await Promise.resolve();
  expect(s.resetWorld).toHaveBeenCalledTimes(1);
  expect(s.client.enabled()).toBe(true);
  expect(s.client.port.connection()).toBeNull();
  s.client.rootHandlers.player({ mapId: forest.mapId });
  expect(s.handlers.player).not.toHaveBeenCalled();
  s.client.clear();
});

it("retries a failed destination subscription and finishes the original portal after recovery", async () => {
  vi.useFakeTimers();
  const s = setup(); s.apply();
  s.route(forest); await Promise.resolve(); await hydrateLatest();
  const move = s.client.port.connection()!.reducers.changeMap({ mapId: desert.mapId, x: 100, y: 100 });
  await Promise.resolve(); s.route(desert); await Promise.resolve();
  const failed = mock.connections[mock.connections.length - 1];
  await failed.connect(); failed.queries[0].error();
  expect(s.client.ready()).toBe(false);
  await vi.advanceTimersByTimeAsync(1_000);
  await hydrateLatest();
  await expect(move).resolves.toBeUndefined();
  expect(s.client.ready()).toBe(true);
  s.client.clear();
});

it("settles an in-flight portal if the account disconnects", async () => {
  const s = setup(); s.apply();
  s.route(forest); await Promise.resolve(); await hydrateLatest();
  const move = s.client.port.connection()!.reducers.changeMap({ mapId: desert.mapId, x: 100, y: 100 });
  await Promise.resolve();
  s.client.clear();
  await expect(move).rejects.toThrow("Map connection closed");
});
