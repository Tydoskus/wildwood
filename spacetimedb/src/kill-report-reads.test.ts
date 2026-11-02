import { expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { fillDefeatBudget } from "../../tests/helpers/enemy-defeat";
import { STARTER_BOW } from "../../shared/items";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const MAP = "crystal_hollows", ENEMY = "Shard Hopper";

/** Counts calls to one table index's find while `run` runs. */
function counting(index: { find: (...args: any[]) => any }, run: () => void) {
  const find = index.find;
  let calls = 0;
  index.find = (...args: any[]) => { calls++; return find.apply(index, args); };
  try { run(); } finally { index.find = find; }
  return calls;
}

it("reads the save and the worn cards a few times per kill report, not once per helper", () => {
  // Each helper reading the save and the gear's cards again would cost about eight progress
  // reads and eighteen card-slot reads a report, on the busiest reducer the game has.
  const f = crystalFixture();
  f.patch("playerProgress", { equippedRightHand: STARTER_BOW, inventoryJson: '["starter_bow"]', damage: 1e15 });
  fillDefeatBudget(f, MAP, ENEMY);
  let progressReads = 0;
  const slotReads = counting(f.db.playerGearSlots.key, () => {
    progressReads = counting(f.db.playerProgress.identity, () => {
      f.run(server.reportEnemyDefeats, { streamId: "read-count-stream-01", sequence: 1n, mapId: MAP, simulatedMillis: 30_000, enemies: [{ enemy: ENEMY, count: 5 }] });
    });
  });
  expect(Number(f.db.playerLifetime.identity.find(f.ctx.sender)?.enemyKills ?? 0n)).toBeGreaterThan(0);
  expect(progressReads).toBeLessThanOrEqual(4);
  expect(slotReads).toBeLessThanOrEqual(3);
});

it("reads the account's clocks once per kill report and writes them once", () => {
  // The report limiter, simulation clock, combat clock and kill-rate watch share one row.
  const f = crystalFixture();
  f.patch("playerProgress", { equippedRightHand: STARTER_BOW, inventoryJson: '["starter_bow"]', damage: 1e15 });
  fillDefeatBudget(f, MAP, ENEMY);
  const clocks = f.db.playerDefeatClock;
  const update = vi.spyOn(clocks.identity, "update"), insert = vi.spyOn(clocks, "insert");
  const reads = counting(clocks.identity, () => {
    f.run(server.reportEnemyDefeats, { streamId: "read-count-stream-02", sequence: 1n, mapId: MAP, simulatedMillis: 30_000, enemies: [{ enemy: ENEMY, count: 5 }] });
  });
  expect(reads).toBe(1);
  expect(update.mock.calls.length + insert.mock.calls.length).toBe(1);
  expect(clocks.identity.find(f.ctx.sender)).toMatchObject({ reportAt: 10_000_000n, simAt: 10_000_000n, combatAt: 10_000_000n, rateAt: 10_000_000n });
});
