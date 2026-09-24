import { readFileSync } from "node:fs";
import { Timestamp } from "spacetimedb";
import { expect, it, vi } from "vitest";
import { crystalFixture, identity } from "../../tests/helpers/crystal-hollows-fixture";
import { DEFEAT_BUDGET_IDLE_MICROS, DEFEAT_BUDGET_PRUNE_BATCH, pruneIdleDefeatBudgets } from "./enemy-defeats";
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
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const sweep = source.slice(source.indexOf("export const runMaintenanceSweep"), source.indexOf("export const cleanupStartupTelemetry"));
  expect(sweep).toContain("pruneIdleDefeatBudgets(ctx);");
});
