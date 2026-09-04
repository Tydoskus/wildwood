import { afterEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ connections: [] as any[] }));
vi.mock("../../module_bindings", () => ({
  tables: new Proxy({}, { get: () => ({ where: () => ({}) }) }),
  DbConnection: { builder() {
    const connection: any = { isActive: true, identity: {}, queries: [],
      reducers: new Proxy({}, { get(target: any, key) { return target[key] ??= vi.fn(async () => {}); } }),
      disconnect: vi.fn(), db: new Proxy({}, { get: () => ({ onInsert() {}, onUpdate() {}, onDelete() {}, iter: () => [] }) }),
      subscriptionBuilder() { const query: any = { onApplied(fn: any) { query.apply = fn; return query; }, onError() { return query; }, subscribe() { connection.queries.push(query); } }; return query; },
    };
    const builder: any = { withUri: () => builder, withToken: () => builder,
      withDatabaseName(name: string) { connection.database = name; return builder; },
      onConnect(fn: any) { connection.connect = () => fn(connection); return builder; },
      onDisconnect: () => builder, onConnectError: () => builder,
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
  const root: any = { isActive: true, reducers: { changeMap: vi.fn() }, db: { myMapShardRoute: {
    identity: { find: () => route }, onInsert(fn: any) { change = fn; }, onUpdate() {}, onDelete() {},
  } }, subscriptionBuilder() { const q: any = { onApplied(fn: any) { apply = fn; return q; }, onError: () => q, subscribe() {} }; return q; } };
  const handlers: any = { player: vi.fn(), dragonBoss: vi.fn(), progress: vi.fn() };
  const ready = vi.fn();
  const client = createMapShardClient({ root: () => root, host: "wss://test", token: () => "", tabId: () => "tab",
    handlers, worldReady: ready, changed: vi.fn(), resetWorld: vi.fn(),
    port: { sendReducer: (_action: any, fn: any) => fn(root) } as any });
  client.attach(root, {} as any);
  return { client, root, handlers, ready, apply: () => apply(), route(value: any) { route = value; change(); } };
}
afterEach(() => { mock.connections.length = 0; vi.restoreAllMocks(); });
it("holds movement until its route is known, and keeps unsharded accounts working", () => {
  const s = setup();
  expect(s.client.port.connection()).toBeNull();
  expect(s.client.ready()).toBe(false);
  s.apply();
  expect(s.client.port.connection()).toBe(s.root);
  expect(s.client.ready()).toBe(true);
  s.route({ databaseName: "", mapId: "tutorial_forest", generation: 1n, ready: false });
  expect(s.client.port.connection()).toBeNull();
  expect(mock.connections).toHaveLength(0);
});
it("routes movement regionally, keeps portal actions on the root, and ignores stale hydration", async () => {
  const s = setup(); s.apply();
  s.route({ databaseName: "map-one", mapId: "tutorial_forest", generation: 1n, ready: true });
  const first = mock.connections[0];
  await first.connect();
  first.queries[0].apply();
  expect(s.client.ready()).toBe(true);
  s.client.port.connection()!.reducers.updateMovementState({} as any);
  s.client.port.connection()!.reducers.changeMap({} as any);
  expect(first.reducers.updateMovementState).toHaveBeenCalled();
  expect(s.root.reducers.changeMap).toHaveBeenCalled();
  s.client.rootHandlers.player({}); s.client.rootHandlers.dragonBoss({}); s.client.rootHandlers.progress({});
  expect(s.handlers.player).not.toHaveBeenCalled();
  expect(s.handlers.dragonBoss).not.toHaveBeenCalled();
  expect(s.handlers.progress).toHaveBeenCalled();
  s.route({ databaseName: "map-two", mapId: "tutorial_forest", generation: 2n, ready: true });
  expect(first.disconnect).toHaveBeenCalledOnce();
  first.queries[0].apply();
  expect(s.client.ready()).toBe(false);
  expect(s.client.port.connection()).toBeNull();
  s.client.clear();
});
