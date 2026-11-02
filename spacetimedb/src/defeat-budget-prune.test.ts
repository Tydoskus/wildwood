import { Timestamp } from "spacetimedb";
import { expect, it, vi } from "vitest";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { DEFEAT_BUDGET_IDLE_MICROS, DEFEAT_BUDGET_PRUNE_BATCH, pruneIdleDefeatBudgets } from "./enemy-defeats";
import { reportEnemy } from "../../tests/helpers/enemy-defeat";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const HOUR = 3_600_000_000n;
/** A fixture on a real clock: the fixture's own starts ten seconds after 1970, before any cutoff. */
function fixture() {
  const f = crystalFixture();
  f.ctx.timestamp = new Timestamp(1_790_000_000_000_000n);
  return f;
}

function seedBudget(f: ReturnType<typeof crystalFixture>, key: string, idleMicros: bigint) {
  f.seed("enemyDefeatBudget", { key, identity: identity("1"), tokens: 3, updatedAtMicros: f.ctx.timestamp.microsSinceUnixEpoch - idleMicros });
}
const keys = (f: ReturnType<typeof crystalFixture>) => [...f.db.enemyDefeatBudget.iter()].map((row: any) => row.key).sort();

it("drops budget rows idle past the cutoff and keeps recent ones", () => {
  const f = fixture();
  seedBudget(f, "a:tutorial_forest:Bramble", DEFEAT_BUDGET_IDLE_MICROS + HOUR);
  seedBudget(f, "a:endless_40:site:0", DEFEAT_BUDGET_IDLE_MICROS + 1n);
  seedBudget(f, "a:combat-time-v1", DEFEAT_BUDGET_IDLE_MICROS - HOUR);
  seedBudget(f, "b:beginner_desert:boss-time-v1", 0n);
  expect(pruneIdleDefeatBudgets(f.ctx as any)).toBe(2);
  expect(keys(f)).toEqual(["a:combat-time-v1", "b:beginner_desert:boss-time-v1"]);
});

it("drops at most one batch per sweep, oldest first", () => {
  const f = fixture();
  for (let index = 0; index < DEFEAT_BUDGET_PRUNE_BATCH + 3; index++) {
    seedBudget(f, `p${index}:tutorial_forest:Bramble`, DEFEAT_BUDGET_IDLE_MICROS + BigInt(index + 1) * HOUR);
  }
  expect(pruneIdleDefeatBudgets(f.ctx as any)).toBe(DEFEAT_BUDGET_PRUNE_BATCH);
  // The three freshest of the idle rows wait for the next sweep.
  expect(keys(f)).toEqual(["p0:tutorial_forest:Bramble", "p1:tutorial_forest:Bramble", "p2:tutorial_forest:Bramble"]);
  expect(pruneIdleDefeatBudgets(f.ctx as any)).toBe(3);
  expect(keys(f)).toEqual([]);
});

it("runs in the five-minute maintenance sweep", () => {
  const f = fixture();
  seedBudget(f, "a:tutorial_forest:Bramble", DEFEAT_BUDGET_IDLE_MICROS + HOUR);
  seedBudget(f, "b:tutorial_forest:Bramble", 0n);
  f.run(server.runMaintenanceSweep, { maintenance: {} });
  expect(keys(f)).toEqual(["b:tutorial_forest:Bramble"]);
});

it("carries a species' old budget row into the map's bank, spent as it was", () => {
  const f = crystalFixture();
  const mapId = f.db.player.identity.find(f.ctx.sender).mapId;
  const enemy = "Shard Hopper", old = `${f.ctx.sender.toHexString()}:${mapId}:${enemy}`;
  f.seed("enemyDefeatBudget", { key: old, identity: f.ctx.sender, tokens: 0, updatedAtMicros: f.ctx.timestamp.microsSinceUnixEpoch });
  reportEnemy(f, enemy, 5);
  // An empty bucket pays nothing; a fresh one would have paid the arrival bank.
  expect(f.db.playerLifetime.identity.find(f.ctx.sender)?.enemyKills ?? 0n).toBe(0n);
  expect(f.db.enemyDefeatBudget.key.find(old)).toBeFalsy();
  expect(f.db.enemyDefeatBank.key.find(`${f.ctx.sender.toHexString()}:${mapId}`)?.buckets.map((bucket: any) => bucket.enemy)).toEqual([enemy]);
});
