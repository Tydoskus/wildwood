import { expect, it, vi } from "vitest";
import { Identity } from "spacetimedb";
import { createPresenceService } from "./presence-service";
import { SPEED_SYNC_HOLD_MS } from "./speed-sync";

it("preserves the global online total through map handoffs and resets it on account disconnect", () => {
  const presence = createPresenceService({ changes: { notify() {} } } as any);
  presence.tables.upsertWorldStatus({ id: 0, onlinePlayers: 21 });
  presence.clearSession(true);
  presence.beginSession(false);
  expect(presence.api.onlinePlayerCount()).toBe(21);
  presence.tables.upsertWorldStatus({ id: 0, onlinePlayers: 22 });
  expect(presence.api.onlinePlayerCount()).toBe(22);
  presence.clearSession();
  expect(presence.api.onlinePlayerCount()).toBe(0);
});

it("continues the restored input sequence after each regional reconnect", () => {
  const identity = new Identity("1".repeat(64));
  const presence = createPresenceService({
    localIdentity: () => identity.toHexString(), hydrationReady: () => false,
    localDbIdentity: () => identity, worldEntryReady: () => false, sessionConflict: () => false,
    developer: { api: { developerPresenceVisible: () => true }, observePresence() {} },
    reducers: { connection: () => null },
    changes: { notify() {}, batch: (fn: () => void) => fn() },
  } as any);
  for (const lastInputSequence of [500, 1_000, 1_500]) {
    presence.beginSession(false);
    presence.tables.upsertPlayer({
      identity, mapId: "tutorial_forest", x: 100, y: 100, speed: 180,
      facing: 0, moving: false, motionEpoch: 1, lastInputSequence, isVisible: true, controllerTabId: "same-tab",
    });
    expect(presence.reserveStoppedMotion().sequence).toBe(lastInputSequence + 1);
  }
});

it("survives pending/disconnected marker cleanup and discards a late subscription application", () => {
  const subscriptions: any[] = [];
  const identity = new Identity("1".repeat(64));
  const connection = {
    isActive: true,
    subscriptionBuilder() {
      const handle: any = {
        active: false,
        isActive: () => handle.active, isEnded: () => false,
        unsubscribe: vi.fn(() => { throw new Error("Connection closed during handoff"); }),
        onApplied(fn: () => void) { handle.applied = fn; return handle; },
        onError() { return handle; },
        subscribe() { subscriptions.push(handle); return handle; },
      };
      return handle;
    },
  };
  const presence = createPresenceService({
    localIdentity: () => identity.toHexString(), localDbIdentity: () => identity,
    reducers: { connection: () => connection, protocolBlocked: () => false, worldEntryBlocked: () => false },
    hydrationReady: () => true, worldEntryReady: () => false,
    changes: { notify() {} },
  } as any);
  presence.tables.upsertWorldStatus({ id: 0, onlinePlayers: 2 });
  presence.api.setRemotePlayersVisible(true);
  expect(subscriptions).toHaveLength(2);
  expect(() => presence.clearSession(true)).not.toThrow();
  expect(presence.api.onlinePlayerCount()).toBe(2);
  const staleMarkers = subscriptions[1];
  staleMarkers.active = true;
  expect(() => staleMarkers.applied()).not.toThrow();
  expect(staleMarkers.unsubscribe).toHaveBeenCalledOnce();
  expect(() => presence.activateSubscriptions()).not.toThrow();
  expect(subscriptions).toHaveLength(4);
  for (const subscription of subscriptions) subscription.active = true;
  expect(() => presence.clearSession()).not.toThrow();
});

it("drains regular-enemy loot before a portal changes the authoritative map", async () => {
  let finish!: (value: boolean) => void;
  const changeMap = vi.fn(async () => {});
  const connection = { reducers: { changeMap } };
  const presence = createPresenceService({
    drainEnemyLoot: () => new Promise(resolve => { finish = resolve; }),
    reducers: { connection: () => connection, protocolBlocked: () => false, worldEntryBlocked: () => false,
      runWorldReducer: (action: () => unknown) => action(), handleFailure: vi.fn() },
  } as any);
  const travel = presence.api.changeMap("home_exterior", 100, 100);
  expect(changeMap).not.toHaveBeenCalled();
  finish(true); expect(await travel).toBe(true);
  expect(changeMap).toHaveBeenCalledOnce();
  const blocked = presence.api.changeMap("tutorial_forest", 100, 100);
  finish(false); expect(await blocked).toBe(false);
  expect(changeMap).toHaveBeenCalledOnce();
});

it("defaults to no remote subscriptions and fences late data when visibility is switched off", () => {
  const identity = new Identity("1".repeat(64));
  const subscriptions: any[] = [];
  const setPlayerMotionInterest = vi.fn();
  const connection = {
    isActive: true, reducers: { setPlayerMotionInterest },
    db: { playerMotionIdentity: { iter: () => [] } },
    subscriptionBuilder() {
      const handle: any = {
        active: false, isActive: () => handle.active, isEnded: () => false,
        unsubscribe: vi.fn(),
        onApplied(fn: () => void) { handle.applied = fn; return handle; },
        onError() { return handle; },
        subscribe() { subscriptions.push(handle); return handle; },
      };
      return handle;
    },
  };
  const presence = createPresenceService({
    localIdentity: () => identity.toHexString(), localDbIdentity: () => identity,
    hydrationReady: () => true, worldEntryReady: () => true,
    reducers: { connection: () => connection, protocolBlocked: () => false, worldEntryBlocked: () => false,
      sendReducer: (_name: string, run: any, _reject: any, accept: any) => { run(connection); accept?.(); } },
    changes: { notify() {}, batch: (run: () => void) => run() },
  } as any);
  presence.activateSubscriptions();
  expect(subscriptions).toHaveLength(0);
  expect(setPlayerMotionInterest).toHaveBeenLastCalledWith({ networkIds: [] });
  presence.api.setRemotePlayersVisible(true);
  expect(subscriptions).toHaveLength(2);
  presence.api.setRemotePlayersVisible(false);
  expect(presence.activeSubscriptionCount()).toBe(0);
  expect(setPlayerMotionInterest).toHaveBeenCalledTimes(2);
  for (const handle of subscriptions) { handle.active = true; handle.applied(); expect(handle.unsubscribe).toHaveBeenCalledOnce(); }
  expect(presence.api.remotePlayers()).toEqual([]);
  expect(presence.api.mapPlayerMarkers()).toEqual([]);
  expect(presence.api.remotePlayerCorpses()).toEqual([]);
  presence.markDisconnected();
  presence.activateSubscriptions();
  expect(subscriptions).toHaveLength(2);
  expect(setPlayerMotionInterest).toHaveBeenCalledTimes(3);
  presence.api.setRemotePlayersVisible(true);
  expect(subscriptions).toHaveLength(4);
});

it("holds speed changes off the wire while the eye is off and flushes once presence returns", () => {
  const identity = new Identity("1".repeat(64));
  const sent: string[] = [];
  let multiplayerEnabled = false;
  const presence = createPresenceService({
    localIdentity: () => identity.toHexString(), localDbIdentity: () => identity,
    multiplayerEnabled: () => multiplayerEnabled,
    reducers: {
      connection: () => ({ isActive: true, reducers: { setSpeed() {}, updateMovementState() {} } }),
      protocolBlocked: () => false, worldEntryBlocked: () => false,
      sendReducer: (label: string) => { sent.push(label); },
    },
    changes: { notify() {}, batch: (fn: () => void) => fn() },
  } as any);

  // An invisible farmer changing equipment must not pay for a reducer call.
  presence.api.syncSpeed(205);
  presence.api.syncSpeed(230);
  expect(sent).toEqual([]);

  // Turning the eye back on restores the server's stored speed once the value
  // has settled, and keeps offering it until then rather than dropping it.
  multiplayerEnabled = true;
  const start = performance.now();
  vi.spyOn(performance, "now").mockReturnValue(start);
  presence.api.syncMovementState(100, 100, 0, 0, "keyboard", true);
  expect(sent).not.toContain("speed sync");
  vi.spyOn(performance, "now").mockReturnValue(start + SPEED_SYNC_HOLD_MS);
  presence.api.syncMovementState(100, 100, 0, 0, "keyboard", true);
  expect(sent).toContain("speed sync");
  vi.restoreAllMocks();
});

/** The per-map world tables. Presence owns their map-scoped subscription; the base subscription holds our own player/motion-identity rows. */
const MAP_WORLD_QUERY_TABLES = ["player_motion_identity", "player_death_frame", "player_map_frame", "player_motion_detail_frame"];

function rootConnectionFixture() {
  const subscriptions: any[] = [];
  const connection = {
    isActive: true, reducers: { setPlayerMotionInterest: vi.fn() },
    db: { playerMotionIdentity: { iter: () => [] } },
    subscriptionBuilder() {
      const handle: any = {
        active: false, ended: false, isActive: () => handle.active, isEnded: () => handle.ended,
        unsubscribe: vi.fn(() => { handle.active = false; handle.ended = true; }),
        unsubscribeThen: vi.fn((next: () => void) => { handle.active = false; handle.ended = true; next(); }),
        onApplied(fn: () => void) { handle.applied = () => { handle.active = true; fn(); }; return handle; },
        onError() { return handle; },
        subscribe(queries: { toSql(): string }[]) { handle.sql = queries.map(query => query.toSql()); subscriptions.push(handle); return handle; },
      };
      return handle;
    },
  };
  return { connection, subscriptions };
}

it("swaps the map's world queries on the one root connection when the player changes map", () => {
  const identity = new Identity("1".repeat(64));
  const { connection, subscriptions } = rootConnectionFixture();
  const connectionLookups = vi.fn(() => connection);
  const presence = createPresenceService({
    localIdentity: () => identity.toHexString(), localDbIdentity: () => identity,
    hydrationReady: () => true, worldEntryReady: () => true, sessionConflict: () => false, authTabId: () => "tab",
    developer: { api: { developerPresenceVisible: () => true }, observePresence() {} },
    directory: { api: { playerDisplayName: () => "" }, tables: { upsertProfile() {}, removeProfile() {}, upsertAccountStatus() {}, removeAccountStatus() {} } },
    reducers: { connection: connectionLookups, protocolBlocked: () => false, worldEntryBlocked: () => false,
      sendReducer: (_name: string, run: any, _reject: any, accept: any) => { run(connection); accept?.(); } },
    changes: { notify() {}, batch: (run: () => void) => run() },
  } as any);
  const ownRow = (mapId: string) => ({
    identity, mapId, x: 100, y: 100, speed: 180, facing: 0, moving: false, motionEpoch: 1,
    lastInputSequence: 1, isVisible: true, controllerTabId: "tab",
  });
  presence.tables.upsertPlayer(ownRow("tutorial_forest"));
  presence.api.setRemotePlayersVisible(true);
  expect(subscriptions).toHaveLength(2);
  for (const handle of subscriptions) handle.applied();
  const forest = subscriptions.flatMap(handle => handle.sql);
  expect(forest.filter(sql => sql.includes("'tutorial_forest'"))).toHaveLength(3);

  // The server moved us: our own player row now names the destination map.
  presence.tables.upsertPlayer(ownRow("beginner_desert"));
  expect(subscriptions).toHaveLength(4);
  // Motion identities end the forest query set before the desert one starts
  // (cache reference counts); the frame tables overlap and drop forest once
  // the desert set is applied, so the minimap never goes dark.
  expect(subscriptions[0].unsubscribeThen).toHaveBeenCalledOnce();
  expect(subscriptions[1].unsubscribe).not.toHaveBeenCalled();
  subscriptions[2].applied();
  subscriptions[3].applied();
  expect(subscriptions[1].unsubscribe).toHaveBeenCalledOnce();
  const desert = subscriptions.slice(2).flatMap(handle => handle.sql);
  expect(desert.join("\n")).not.toContain("tutorial_forest");
  expect(desert.filter(sql => sql.includes(`"map_id" = 'beginner_desert'`))).toHaveLength(3);
  expect(desert.map(sql => sql.match(/FROM "([a-z_]+)"/)![1]).sort()).toEqual([...MAP_WORLD_QUERY_TABLES].sort());
  expect(presence.activeSubscriptionCount()).toBe(2);
  // Every subscription rode the connection we already had; nothing asked for another.
  expect(connectionLookups.mock.results.every(result => result.value === connection)).toBe(true);
});

it("never subscribes to world state without a map or recipient filter", () => {
  const identity = new Identity("2".repeat(64));
  const { connection, subscriptions } = rootConnectionFixture();
  const presence = createPresenceService({
    localIdentity: () => identity.toHexString(), localDbIdentity: () => identity,
    hydrationReady: () => true, worldEntryReady: () => true,
    reducers: { connection: () => connection, protocolBlocked: () => false, worldEntryBlocked: () => false,
      sendReducer: (_name: string, run: any, _reject: any, accept: any) => { run(connection); accept?.(); } },
    changes: { notify() {}, batch: (run: () => void) => run() },
  } as any);
  presence.api.setRemotePlayersVisible(true);
  const queries = subscriptions.flatMap(handle => handle.sql as string[]);
  expect(queries.map(sql => sql.match(/FROM "([a-z_]+)"/)![1]).sort()).toEqual([...MAP_WORLD_QUERY_TABLES].sort());
  for (const sql of queries) {
    // A query that scales with every player online, not the ones on our map,
    // is the egress bomb this guards against.
    expect(sql).toMatch(new RegExp(`WHERE .*("map_id" = 'tutorial_forest'|"recipient" = 0x${"2".repeat(64)})`));
  }
});
