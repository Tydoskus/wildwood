import { expect, it, vi } from "vitest";
import { Timestamp } from "spacetimedb";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { resolveMapBalance, defaultBalanceSettings } from "../../shared/map-balance";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

// Reducer compute on the host is paid per database call, not per line of
// JavaScript: change_map ran ~24 ms with 45-50 calls while movement updates
// with a handful ran in half a millisecond. These budgets hold the count.
const HOME_TOGGLE_BUDGET = 37;
const PORTAL_TRAVEL_BUDGET = 35;

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

function travellingPlayer() {
  const f = crystalFixture();
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
  const f = travellingPlayer();
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
  expect(f.db.playerLastLocation.identity.find(f.ctx.sender)?.mapId).toBe("crystal_hollows");
  expect(toHome).toBeLessThanOrEqual(HOME_TOGGLE_BUDGET);
  expect(back).toBeLessThanOrEqual(HOME_TOGGLE_BUDGET);
});

it("keeps portal travel within its host-call budget", () => {
  const f = travellingPlayer();
  f.patch("player", { x: 580, y: 617 });
  const meter = countHostCalls(f.db);
  f.run(server.changeMap, { mapId: "clockwork_ruins", x: 580, y: 617 });
  expect(meter.read()).toBeLessThanOrEqual(PORTAL_TRAVEL_BUDGET);
  expect(f.db.player.identity.find(f.ctx.sender).mapId).toBe("clockwork_ruins");
  expect(f.db.playerMapBalance.identity.find(f.ctx.sender).mapId).toBe("clockwork_ruins");
});
