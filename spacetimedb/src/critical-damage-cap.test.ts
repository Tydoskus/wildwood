import { expect, it, vi } from "vitest";
import { Timestamp } from "spacetimedb";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { fillDefeatBudget, reportKills } from "../../tests/helpers/enemy-defeat";
import { STARTER_BOW } from "../../shared/items";
import { SOUL_ARRIVAL, SOUL_MAP_ID, soulTierKillsNeeded, SOUL_TIER_COUNT } from "../../shared/soul-dimension";
import { createEmptyResearchRanks } from "../../shared/research";
import { createCombatReport } from "./boss-combat";
import { createDuelRuntime } from "./duel-runtime";
import { MODULE_MIGRATION_VERSION } from "./module-migrations";
import { criticalDamage } from "../../shared/critical-damage";
import { RATING_MAX, attackIntervalForRating, critDamageForLevels, ratingForLevels, ratingLevels } from "../../shared/stat-rating";
import { withSoulStats } from "../../shared/soul-dimension";
import { DEFAULT_ATTACK_INTERVAL } from "../../shared/rules";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const soulRow = (f: any, critDamage: number, identity = f.ctx.sender) =>
  f.seed("playerSoulStats", { identity, damage: 0, maxHp: 0, armor: 0, regen: 0, attackSpeed: 0, critDamage, kills: 0n });
const research = (f: any, ranks: Record<string, number>) =>
  f.seed("playerResearch", { identity: f.ctx.sender, frontierMastery: 0, ...createEmptyResearchRanks(), ...ranks });

/** The kill bound's damage a second for a critting bow player with this much soul critical damage. */
function boundDps(critDamage: number, critCap = 0, runRating = 0) {
  const f = crystalFixture();
  if (runRating) f.seed("playerCombatRating", { identity: f.ctx.sender, critDamage: runRating });
  f.patch("playerProgress", { damage: 1_000, equippedRightHand: STARTER_BOW, inventoryJson: '["starter_bow"]' });
  research(f, { criticalChance: 1, critCap });
  soulRow(f, critDamage);
  const { combatBoundForReport } = createCombatReport({
    attackIntervalForProgress: progress => progress.attackRate,
    itemUpgradeLevelFor: () => 0,
    inventoryForProgress: progress => JSON.parse(progress.inventoryJson),
    equippedRightHandForProgress: progress => progress.equippedRightHand,
    equippedLeftHandForProgress: progress => progress.equippedLeftHand,
    equippedHeadForProgress: progress => progress.equippedHead,
    equippedChestForProgress: progress => progress.equippedChest,
  });
  return combatBoundForReport(f.ctx as any).preview({ type: "health", amount: 0, count: 0 }).dps;
}

it("bounds kills by the capped critical, the run's crit rating and the soul's together", () => {
  const base = boundDps(0);
  expect(boundDps(RATING_MAX) / base).toBeCloseTo(50 / 1.05);
  expect(boundDps(ratingForLevels(10)) / base).toBeCloseTo(critDamageForLevels(10) / 1.05);
  expect(boundDps(0, 0, ratingForLevels(10)) / base).toBeCloseTo(critDamageForLevels(10) / 1.05);
  expect(boundDps(RATING_MAX, 3) / base).toBeCloseTo(80 / 1.05);
  expect(boundDps(RATING_MAX, 5) / base).toBeCloseTo(100 / 1.05);
});

it("deals the capped critical in duels, the run's crit rating included", () => {
  const { duelDamage } = createDuelRuntime({ researchedDamage: (_ctx: any, _identity: any, damage: number) => damage } as any);
  const duel = (critDamage: number, critCap = 0, runRating = 0) => {
    const f = crystalFixture();
    research(f, { criticalChance: 100, critCap });
    soulRow(f, critDamage);
    if (runRating) f.seed("playerCombatRating", { identity: f.ctx.sender, critDamage: runRating });
    return duelDamage(f.ctx, f.ctx.sender, 10);
  };
  expect(duel(0)).toBeCloseTo(10.5);
  expect(duel(0, 0, 100)).toBeCloseTo(10 * critDamageForLevels(1));
  expect(duel(RATING_MAX)).toBeCloseTo(500);
  expect(duel(RATING_MAX, 1)).toBeCloseTo(600);
});

it("raises the cap when Crit Cap research completes", () => {
  const f = crystalFixture();
  research(f, { utilityAttackRange: 1 });
  f.run(server.startResearch, { researchId: "critCap" });
  const active = f.db.activeResearch.identity.find(f.ctx.sender);
  expect(active.completesAt.microsSinceUnixEpoch - active.startedAt.microsSinceUnixEpoch).toBe(180_000_000n);
  f.ctx.timestamp = active.completesAt;
  f.run(server.completeResearch, { schedule: [...f.db.researchCompletionSchedule.iter()][0] });
  expect(f.db.playerResearch.identity.find(f.ctx.sender).critCap).toBe(1);
});

it("refuses Crit Cap before Attack Range", () => {
  const f = crystalFixture();
  research(f, { offlineWindow: 1 });
  expect(() => f.run(server.startResearch, { researchId: "critCap" })).toThrow("Research prerequisites not met.");
});

it("migration 54 turns soul attack speed and crit damage into ratings, nobody weaker than before", () => {
  const f = crystalFixture();
  const other = identity("2");
  f.seed("moduleMigrationState", { id: 0, version: 52 });
  research(f, { criticalDamage: 20 });
  f.seed("playerPrestigePerk", { identity: f.ctx.sender, keenEdge: 5 });
  // Old units: soul crit damage added to the multiplier, soul attack speed added attacks a second.
  f.seed("playerSoulStats", { identity: f.ctx.sender, damage: 0, maxHp: 0, armor: 0, regen: 0, attackSpeed: 1, critDamage: 500, kills: 0n });
  f.patch("playerProgress", { attackRate: 1 / 1.5 });
  soulRow(f, 60, other);
  f.ctx.connectionId = null;
  f.run(server.onConnect);
  expect(f.db.moduleMigrationState.id.find(0).version).toBe(MODULE_MIGRATION_VERSION);
  const mine = f.db.playerSoulStats.identity.find(f.ctx.sender);
  // 53 trimmed it to 100x with research and Keen Edge; 54 keeps 100x: the rating's top.
  expect(mine.critDamage).toBe(RATING_MAX);
  // 1.05 + 60 was 61.05x (capped at 50 then as now): the rating gives exactly that.
  expect(criticalDamage({ soul: f.db.playerSoulStats.identity.find(other).critDamage }).uncapped).toBeCloseTo(61.05, 6);
  // A fresh run with this soul starts at 0.64 + 1 attacks a second, as it did.
  expect(1 / withSoulStats({ damage: 1, maxHp: 1, armor: 0, regen: 0, attackRate: DEFAULT_ATTACK_INTERVAL }, mine).attackRate).toBeCloseTo(1 / DEFAULT_ATTACK_INTERVAL + 1, 5);
  // This run at 1.5 a second plus the soul's 1 was 2.5: its interval is raised so the two still give 2.5.
  const progress = f.db.playerProgress.identity.find(f.ctx.sender);
  expect(1 / withSoulStats(progress, mine).attackRate).toBeCloseTo(2.5, 4);
  // Running it again changes nothing.
  f.run(server.onConnect);
  expect(f.db.playerSoulStats.identity.find(f.ctx.sender).attackSpeed).toBe(mine.attackSpeed);
  expect(attackIntervalForRating(0)).toBeCloseTo(DEFAULT_ATTACK_INTERVAL);
});

it("pays soul crit damage 0.002x a kill, as before 0.901.47", () => {
  const f = crystalFixture();
  f.patch("playerProgress", { equippedRightHand: STARTER_BOW, inventoryJson: '["starter_bow"]', damage: 1_000 });
  f.seed("playerPrestige", { identity: f.ctx.sender, level: 1, perkPoints: 0, peakPower: 0, prestigedAt: new Timestamp(0n) });
  const kills = BigInt(soulTierKillsNeeded(SOUL_TIER_COUNT));
  f.seed("playerRewardKills", { identity: f.ctx.sender, damage: kills, health: kills, armor: kills, regen: kills, speed: kills });
  soulRow(f, 98.9);
  f.patch("player", { mapId: SOUL_MAP_ID, x: SOUL_ARRIVAL.x, y: SOUL_ARRIVAL.y });
  fillDefeatBudget(f, SOUL_MAP_ID, "soul:critDamage");
  reportKills(f, { streamId: "soul-stream-000001", sequence: 1n, mapId: SOUL_MAP_ID, enemies: [{ enemy: "soul:critDamage", count: 50 }] });
  const row = f.db.playerSoulStats.identity.find(f.ctx.sender);
  expect(row.kills).toBe(50n);
  expect(critDamageForLevels(ratingLevels(row.critDamage))).toBeCloseTo(critDamageForLevels(ratingLevels(98.9)) + .1, 6);
});
