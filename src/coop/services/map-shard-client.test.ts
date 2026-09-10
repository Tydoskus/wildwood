import { afterEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ connections: [] as any[] }));
vi.mock("../../module_bindings", () => ({
  tables: new Proxy({}, { get: () => ({ where: () => ({}) }) }),
  DbConnection: { builder() {
    const db = new Proxy({} as any, { get(target, key) {
      return target[key] ??= { rows: [], onInsert(fn: any) { this.insert = fn; }, onUpdate(fn: any) { this.update = fn; },
        onDelete(fn: any) { this.remove = fn; }, iter() { return this.rows; } };
    } });
    const connection: any = { isActive: true, identity: { equals: (other: unknown) => Boolean(other) }, queries: [], db,
      reducers: new Proxy({}, { get(target: any, key) { return target[key] ??= vi.fn(async () => {}); } }),
      disconnect: vi.fn(),
      subscriptionBuilder() { const query: any = {
        onApplied(fn: any) { query.apply = fn; return query; },
        onError(fn: any) { query.error = fn; return query; },
        subscribe() { connection.queries.push(query); return query; },
      }; return query; },
    };
    const builder: any = { withUri: () => builder, withToken(token: string) { connection.token = token; return builder; },
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
  const root: any = { isActive: true, token: "authenticated-root-token", identity: {}, reducers: { changeMap: vi.fn(async () => {}), setSpeed: vi.fn() }, db: rootTables,
    subscriptionBuilder() { const q: any = { onApplied(fn: any) { apply = fn; return q; }, onError: () => q, subscribe() {} }; return q; } };
  const handlers: any = new Proxy({}, { get(target: any, key) { return target[key] ??= vi.fn(); }, ownKeys: () => ["player", "dragonBoss", "progress"], getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });
  const recoverSession = vi.fn();
  const ready = vi.fn();
  const resetWorld = vi.fn();
  const client = createMapShardClient({ root: () => root, host: "wss://test", tabId: () => "tab",
    recoverSession, handlers, worldReady: ready, changed: vi.fn(), resetWorld,
    port: { handleFailure: vi.fn(), sendReducer: (_action: any, fn: any) => fn(root) } as any });
  client.attach(root, {} as any);
  return { client, root, handlers, ready, resetWorld, recoverSession, apply: () => apply(),
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
  await failed.connect(); failed.queries[0].error({ event: new Error("subscription interrupted") });
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

it("waits for a fresh forest admission when reset begins in the forest", async () => {
  const s = setup(); s.apply(); s.route(forest); await Promise.resolve();
  const previous = await hydrateLatest();
  const completeReset = s.client.prepareResetRoute();
  let complete = false;
  const waiting = completeReset().then(() => { complete = true; });
  await Promise.resolve();
  expect(complete).toBe(false);
  previous.queries[0].apply(); await Promise.resolve();
  expect(complete).toBe(false);
  s.route({ ...forest, generation: 4n }); await Promise.resolve();
  expect(complete).toBe(false);
  await hydrateLatest(); await waiting;
  expect(complete).toBe(true);
  s.client.clear();
});

it("waits for tutorial hydration after resetting from a later map", async () => {
  const s = setup(); s.apply(); s.route(desert); await Promise.resolve(); await hydrateLatest();
  const completeReset = s.client.prepareResetRoute();
  let complete = false;
  const waiting = completeReset().then(() => { complete = true; });
  s.route({ ...forest, generation: 5n, ready: false }); await Promise.resolve();
  expect(complete).toBe(false);
  s.route({ ...forest, generation: 5n }); await Promise.resolve();
  expect(complete).toBe(false);
  await hydrateLatest(); await waiting;
  expect(complete).toBe(true);
  s.client.clear();
});

it("rejects a reset route wait when its connection is discarded", async () => {
  const s = setup(); s.apply(); s.route(forest); await Promise.resolve(); await hydrateLatest();
  const waiting = s.client.prepareResetRoute()();
  s.client.clear();
  await expect(waiting).rejects.toThrow("Map connection closed");
});

it("hands a regional player back to the root for Home and replays the arrival", async () => {
  const s = setup(); s.apply();
  s.route(forest); await Promise.resolve(); await hydrateLatest();
  const homePlayer = { mapId: "home_exterior", x: 500, y: 700 };
  s.root.db.player.iter = () => [homePlayer];
  const move = s.client.port.connection()!.reducers.changeMap({ mapId: "home_exterior", x: 2000, y: 2500 });
  await Promise.resolve();
  s.route(null); await Promise.resolve();
  await move;
  expect(s.client.port.connection()).toBe(s.root);
  expect(s.handlers.player).toHaveBeenCalledWith(homePlayer);
  expect(s.client.ready()).toBe(true);
  s.client.clear();
});


it("uses the active account token for every portal connection", async () => {
  const s = setup(); s.apply(); s.route(forest); await Promise.resolve();
  expect(mock.connections[0].token).toBe(s.root.token);
  await hydrateLatest(); s.route(desert); await Promise.resolve();
  expect(mock.connections[1].token).toBe(s.root.token);
  s.client.clear();
});

it("does not send enter-world on a closed route after protocol registration resolves", async () => {
  const s = setup(); s.apply(); s.route(forest); await Promise.resolve();
  const previous = mock.connections[0];
  let finish!: () => void;
  previous.reducers.registerProtocol.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  const connecting = previous.connect();
  s.route(desert); await Promise.resolve();
  finish(); await connecting;
  expect(previous.reducers.enterWorld).not.toHaveBeenCalled();
  s.client.clear();
});

it("stops a mismatched account immediately and bounds repeated admission failures", async () => {
  vi.useFakeTimers();
  const s = setup(); s.apply(); s.route(forest); await Promise.resolve();
  mock.connections[0].identity.equals = () => false;
  await mock.connections[0].connect();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(mock.connections).toHaveLength(1);
  expect(mock.connections[0].reducers.enterWorld).not.toHaveBeenCalled();
  s.route(desert); await Promise.resolve();
  for (let attempt = 1; attempt <= 5; attempt++) {
    const conn = mock.connections[mock.connections.length - 1];
    conn.reducers.enterWorld.mockRejectedValue(new Error("Map admission unavailable"));
    await conn.connect();
    await vi.advanceTimersByTimeAsync(attempt * 1_000);
  }
  await vi.advanceTimersByTimeAsync(60_000);
  expect(mock.connections).toHaveLength(6);
  expect(s.recoverSession).toHaveBeenCalledTimes(2);
  expect(s.client.ready()).toBe(false);
  s.client.clear();
});


it("rejects home arrival if the account was cleared before reducer acknowledgement", async () => {
  const s = setup(); s.apply(); s.route(forest); await Promise.resolve(); await hydrateLatest();
  let acknowledge!: () => void;
  s.root.reducers.changeMap.mockImplementationOnce(() => new Promise<void>(resolve => { acknowledge = resolve; }));
  const move = s.client.port.connection()!.reducers.changeMap({ mapId: "home_exterior", x: 2000, y: 2500 });
  s.client.clear();
  acknowledge();
  await expect(move).rejects.toThrow("Map connection changed");
});

it("restores regional presence after repeated home visits and ignores departed connections", async () => {
  const s = setup(); s.apply(); s.route(forest); await Promise.resolve();
  let previous = await hydrateLatest();
  for (let visit = 0; visit < 3; visit++) {
    const home = { mapId: "home_exterior", x: 500, y: 700 };
    s.root.db.player.iter = () => [home];
    const move = s.client.port.connection()!.reducers.changeMap({ mapId: "home_exterior", x: 2000, y: 2500 });
    await Promise.resolve(); s.route(null); await Promise.resolve(); await move;
    expect(s.handlers.player).toHaveBeenLastCalledWith(home);
    const back = s.client.port.connection()!.reducers.changeMap({ mapId: "home_exterior", x: 500, y: 700 });
    await back;
    s.route({ ...forest, generation: BigInt(visit + 2) }); await Promise.resolve();
    expect(s.client.ready()).toBe(false);
    s.handlers.player.mockClear();
    previous.db.player.insert({}, { mapId: "stale" });
    s.client.rootHandlers.player(home);
    expect(s.handlers.player).not.toHaveBeenCalled();
    const next = mock.connections[mock.connections.length - 1];
    next.db.player.rows = [{ mapId: forest.mapId, x: 2000, y: 2500 }];
    await hydrateLatest();
    expect(s.handlers.player).toHaveBeenLastCalledWith({ mapId: forest.mapId, x: 2000, y: 2500 });
    expect(s.client.ready()).toBe(true);
    previous = next;
  }
  s.client.clear();
});
