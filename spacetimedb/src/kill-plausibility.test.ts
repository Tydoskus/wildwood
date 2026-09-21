import { expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { STARTER_BOW } from "../../shared/items";
import { DEFEAT_BUDGET_WINDOW_SECONDS, enemyDefeatDefinition } from "../../shared/enemy-defeats";
import { REGULAR_ENEMY_LOOT_DELAY_MS } from "../../shared/regular-map-loot";
import { PLAUSIBLE_KILL_TOLERANCE, plausibleKillsPerSecond } from "./enemy-defeats";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const ENEMY = "Shard Hopper";
const claim = (count: number, sequence = 1n) => ({ streamId: "plausibility-stream-01", sequence, mapId: "crystal_hollows", enemies: [{ enemy: ENEMY, count }] });
const flags = (f: ReturnType<typeof crystalFixture>) => [...f.db.enemyDefeatReview.iter()].map(row => row.kind);
const restricted = (f: ReturnType<typeof crystalFixture>) => Boolean(f.db.defeatSessionRestriction.identity.find(f.ctx.sender));
const kills = (f: ReturnType<typeof crystalFixture>) => f.db.playerLifetime.identity.find(f.ctx.sender)?.enemyKills ?? 0n;

it("bounds kills per second by what the player's own combat can produce", () => {
  expect(plausibleKillsPerSecond(100, 2_000, 1, 2)).toBeCloseTo(2);
  expect(plausibleKillsPerSecond(2_500, 2_000, 1, 2)).toBeCloseTo(2 / 3);
  expect(plausibleKillsPerSecond(100, 0, 1, 1)).toBe(0);
});

it("banks at least one client report, so an honest report is never clipped for its size", () => {
  // Clients report every thirty seconds now, but the bank stays sized to the
  // five-minute report a client on the old cadence still sends. Shrinking it
  // below any live cadence pays that report at a fraction (see shared/enemy-defeats.ts).
  expect(DEFEAT_BUDGET_WINDOW_SECONDS * 1000).toBeGreaterThanOrEqual(REGULAR_ENEMY_LOOT_DELAY_MS);
  expect(DEFEAT_BUDGET_WINDOW_SECONDS).toBe(300);
});

it("pays a weak player only what they could have killed, flags it, and does not restrict them", () => {
  const f = crystalFixture();
  f.patch("playerProgress", { equippedRightHand: STARTER_BOW, damage: 1 });
  f.run(server.recordEnemyDefeats, claim(50));
  expect(kills(f)).toBeLessThan(50n);
  expect(flags(f)).toEqual(["damage"]);
  expect(restricted(f)).toBe(false);
});

it("pays a strong player in full with nothing to review", () => {
  const f = crystalFixture();
  f.patch("playerProgress", { equippedRightHand: STARTER_BOW, damage: 1e15 });
  f.run(server.recordEnemyDefeats, claim(6));
  expect(kills(f)).toBe(6n);
  expect(flags(f)).toEqual([]);
});

it("estimates with the stats the report itself grants, as the client had them by its last kill", () => {
  // Needles pay attack speed. One arrow every ten seconds one-shots them, so
  // before the report this player could clear thirty-odd in five minutes; the
  // speed those kills grant makes a hundred plausible, and the client was
  // firing at that pace by the end of the report.
  const CLAIM = 100, INTERVAL = 10;
  const needle = enemyDefeatDefinition("tutorial_forest", "Needle")!;
  expect(needle.reward.type).toBe("speed");
  const before = plausibleKillsPerSecond(needle.hp, 1e15 / INTERVAL, INTERVAL, 1) * PLAUSIBLE_KILL_TOLERANCE * DEFEAT_BUDGET_WINDOW_SECONDS;
  expect(before).toBeLessThan(CLAIM);
  const f = crystalFixture();
  f.patch("player", { mapId: "tutorial_forest" });
  f.patch("playerProgress", { equippedRightHand: STARTER_BOW, inventoryJson: '["starter_bow"]', damage: 1e15, attackRate: INTERVAL, projectileCount: 1 });
  f.run(server.recordEnemyDefeats, { streamId: "plausibility-stream-02", sequence: 1n, mapId: "tutorial_forest", enemies: [{ enemy: "Needle", count: CLAIM }] });
  expect(kills(f)).toBe(BigInt(CLAIM));
  expect(flags(f)).toEqual([]);
});
