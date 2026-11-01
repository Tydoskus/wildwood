import { fillDefeatBudget, readDefeatClock, reportKills, seedDefeatClock } from "../../tests/helpers/enemy-defeat";
import { BOW_ATTACK_SPEED_BONUS } from "../../shared/bow-skills";
import { expect, it, vi } from "vitest";
import { crystalFixture } from "../../tests/helpers/crystal-hollows-fixture";
import { STARTER_BOW } from "../../shared/items";
import { DEFEAT_BUDGET_WINDOW_SECONDS, DEFEAT_MIN_RESPAWN_SECONDS, enemyDefeatDefinition, mapEnemyPopulation } from "../../shared/enemy-defeats";
import { REGULAR_ENEMY_LOOT_DELAY_MS } from "../../shared/regular-map-loot";
import { PLAUSIBLE_KILL_TOLERANCE, plausibleKillsPerSecond } from "./enemy-defeats";
import { ENEMY_TYPES } from "../../shared/enemy-definitions";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const ENEMY = "Shard Hopper";
const claim = (count: number, sequence = 1n) => ({ streamId: "plausibility-stream-01", sequence, mapId: "crystal_hollows", enemies: [{ enemy: ENEMY, count }] });
const restricted = (f: ReturnType<typeof crystalFixture>) => Boolean(f.db.defeatSessionRestriction.identity.find(f.ctx.sender));
const kills = (f: ReturnType<typeof crystalFixture>) => f.db.playerLifetime.identity.find(f.ctx.sender)?.enemyKills ?? 0n;

it("bounds kills per second by what the player's own combat can produce", () => {
  expect(plausibleKillsPerSecond(100, 2_000, 1, 2)).toBeCloseTo(2);
  expect(plausibleKillsPerSecond(2_500, 2_000, 1, 2)).toBeCloseTo(2 / 3);
  expect(plausibleKillsPerSecond(100, 0, 1, 1)).toBe(0);
});

it("banks at least one client report, so an honest report is never clipped for its size", () => {
  // The bank stays generous: a report can carry a hundred kills after a
  // dropped socket, and a bank below that pays it at a fraction. What bounds a
  // script is the refill rate, not this (see shared/enemy-defeats.ts).
  expect(DEFEAT_BUDGET_WINDOW_SECONDS * 1000).toBeGreaterThanOrEqual(REGULAR_ENEMY_LOOT_DELAY_MS);
  expect(DEFEAT_BUDGET_WINDOW_SECONDS).toBe(300);
  // A whole map is thirty enemies and the fastest respawn is ten seconds, so
  // nobody sustains more than three kills a second however they claim to move.
  expect(30 / DEFEAT_MIN_RESPAWN_SECONDS).toBe(3);
});

it("pays a weak player only what they could have killed and does not restrict them", () => {
  const f = crystalFixture();
  f.patch("playerProgress", { equippedRightHand: STARTER_BOW, damage: 1 });
  reportKills(f, claim(50));
  expect(kills(f)).toBeLessThan(50n);
  expect(restricted(f)).toBe(false);
});

it("pays a strong player in full", () => {
  const f = crystalFixture();
  f.patch("playerProgress", { equippedRightHand: STARTER_BOW, damage: 1e15 });
  reportKills(f, claim(6));
  expect(kills(f)).toBe(6n);
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
  // The damage bound is what this test measures, so bank the spawn allowance a
  // player on the map would already have.
  fillDefeatBudget(f, "tutorial_forest", "Needle");
  reportKills(f, { streamId: "plausibility-stream-02", sequence: 1n, mapId: "tutorial_forest", enemies: [{ enemy: "Needle", count: CLAIM }] });
  expect(kills(f)).toBe(BigInt(CLAIM));
});

it("charges every kill at least the map's respawn over its whole population, so hopping maps earns no more", () => {
  // However strong the build, the whole map comes back once per respawn, so a
  // kill here is never worth less than 10 / 48 of a second of the account's
  // clock. Ten banked seconds buy forty-eight kills on this map, from whichever
  // map's refilled spawn bucket they are claimed.
  expect(mapEnemyPopulation("crystal_hollows")).toBe(48);
  const f = crystalFixture();
  f.patch("playerProgress", { equippedRightHand: STARTER_BOW, inventoryJson: '["starter_bow"]', damage: 1e15, projectileCount: 3, attackRate: .4 });
  fillDefeatBudget(f, "crystal_hollows", ENEMY);
  seedDefeatClock(f, "combat", 10);
  reportKills(f, claim(50));
  expect(kills(f)).toBe(BigInt(10 * 48 / DEFEAT_MIN_RESPAWN_SECONDS));
  expect(readDefeatClock(f, "combat")!.tokens).toBeCloseTo(0, 6);
  expect(restricted(f)).toBe(false);
});

it("shares one combat clock across species, so claiming several at once earns no more", () => {
  // A bow's quicker arrows, one-shotting: 1.25 kills an arrow of banked time,
  // whichever species they land on. Per-species banks paid each species that
  // rate separately, so a report naming every species multiplied it.
  const species = Object.keys(ENEMY_TYPES).filter(kind => enemyDefeatDefinition("crystal_hollows", kind)).slice(0, 2);
  expect(species).toHaveLength(2);
  const f = crystalFixture();
  f.patch("playerProgress", { equippedRightHand: STARTER_BOW, inventoryJson: '["starter_bow"]', damage: 1e15, attackRate: 1, projectileCount: 1 });
  for (const kind of species) fillDefeatBudget(f, "crystal_hollows", kind);
  seedDefeatClock(f, "combat", 10);
  reportKills(f, { streamId: "plausibility-stream-03", sequence: 1n, mapId: "crystal_hollows",
    enemies: species.map(enemy => ({ enemy, count: 10 })) });
  expect(kills(f)).toBe(BigInt(Math.floor(10 * (1 + BOW_ATTACK_SPEED_BONUS) * PLAUSIBLE_KILL_TOLERANCE)));
  expect(restricted(f)).toBe(false);
});
