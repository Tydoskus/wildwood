import { expect, it, vi } from "vitest";
import { Timestamp } from "spacetimedb";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { resolveMapBalance, defaultBalanceSettings } from "../../shared/map-balance";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

// Reducer compute on the host is paid per database call, not per line of
// JavaScript: change_map ran ~24 ms with 45-50 calls while movement updates
// with a handful ran in half a millisecond. These budgets hold the count.
// The route row costs one write per leg (three on portal travel: drop the old
// route, look up and insert the new one). It replaced a per-user view whose
// re-evaluation for every player on the shard was the real cost.
const HOME_TOGGLE_BUDGET = 38;
const PORTAL_TRAVEL_BUDGET = 45;

function countHostCalls(db: Record<string, any>) {
  let calls = 0;
  const wrap = (obj: any, method: string) => {
    const original = obj[method]; if (typeof original !== "function") return;
    obj[method] = (...args: any[]) => { calls += 1; return original(...args); };
  };
  for (const table of Object.values(db)) {
    for (const m of ["iter", "count", "insert", "delete"]) wrap(table, m);
    for (const index of Object.values(table)) if (index && typeof index === "object") for (const m of ["filter", "find", "update", "delete"]) wrap(index, m);
  }
  return { read: () => calls, reset: () => { calls = 0; } };
}

function shardedRoot() {
  const f = crystalFixture();
  f.seed("shardRuntime", { id: 0, role: "root", enabled: true, mapId: "", shardId: 0n });
  f.seed("mapShard", { id: 1n, mapId: "crystal_hollows", databaseName: "shard-1", state: "ready", occupants: 3 });
  f.seed("mapShard", { id: 2n, mapId: "clockwork_ruins", databaseName: "shard-2", state: "ready", occupants: 3 });
  f.seed("mapShardMember", { identity: f.ctx.sender, mapId: "crystal_hollows", shardId: 1n, generation: 1n, ready: true });
  const settings = defaultBalanceSettings();
  f.seed("mapBalanceHead", { id: 0, revision: 55 });
  f.seed("mapBalanceVersion", { revision: 55, settingsJson: JSON.stringify(settings), editor: f.ctx.sender, createdAt: new Timestamp(1n) });
  f.seed("playerMapBalance", { identity: f.ctx.sender, mapId: "crystal_hollows", snapshotJson: JSON.stringify(resolveMapBalance("crystal_hollows", settings, 55, 2)) });
  f.patch("playerProgress", { clockworkRuinsUnlocked: true, crystalHollowsUnlocked: true });
  // Production players already own motion and map-state rows; a fresh fixture
  // would insert them on the first call and count that against the budget.
  f.run(server.changeMap, { mapId: "home_exterior", x: 100, y: 100 });
  f.run(server.changeMap, { mapId: "home_exterior", x: 100, y: 100 });
  return f;
}

it("keeps a Home round trip within its host-call budget and leaves the map's balance pin alone", () => {
  const f = shardedRoot();
  const meter = countHostCalls(f.db);
  f.run(server.changeMap, { mapId: "home_exterior", x: 100, y: 100 });
  const toHome = meter.read();
  expect(f.db.player.identity.find(f.ctx.sender).mapId).toBe("home_exterior");
  // Home has no enemies: the pin still names the map the player left.
  expect(f.db.playerMapBalance.identity.find(f.ctx.sender).mapId).toBe("crystal_hollows");
  meter.reset();
  f.run(server.changeMap, { mapId: "home_exterior", x: 100, y: 100 });
  const back = meter.read();
  expect(f.db.player.identity.find(f.ctx.sender).mapId).toBe("crystal_hollows");
  expect(f.db.mapShardMember.identity.find(f.ctx.sender)?.shardId).toBe(1n);
  expect(f.db.mapShardRoute.identity.find(f.ctx.sender)).toMatchObject({ databaseName: "shard-1", mapId: "crystal_hollows", ready: false });
  expect(f.db.playerLastLocation.identity.find(f.ctx.sender)?.mapId).toBe("crystal_hollows");
  expect(toHome).toBeLessThanOrEqual(HOME_TOGGLE_BUDGET);
  expect(back).toBeLessThanOrEqual(HOME_TOGGLE_BUDGET);
});

it("keeps portal travel within its host-call budget and moves the shard seat", () => {
  const f = shardedRoot();
  f.patch("player", { x: 580, y: 617 });
  const meter = countHostCalls(f.db);
  f.run(server.changeMap, { mapId: "clockwork_ruins", x: 580, y: 617 });
  expect(meter.read()).toBeLessThanOrEqual(PORTAL_TRAVEL_BUDGET);
  expect(f.db.player.identity.find(f.ctx.sender).mapId).toBe("clockwork_ruins");
  expect(f.db.mapShardMember.identity.find(f.ctx.sender)?.shardId).toBe(2n);
  expect(f.db.mapShard.id.find(1n).occupants).toBe(2);
  expect(f.db.mapShard.id.find(2n).occupants).toBe(4);
  expect(f.db.mapShardRoute.identity.find(f.ctx.sender)).toMatchObject({ databaseName: "shard-2", mapId: "clockwork_ruins" });
  expect(f.db.playerMapBalance.identity.find(f.ctx.sender).mapId).toBe("clockwork_ruins");
});
