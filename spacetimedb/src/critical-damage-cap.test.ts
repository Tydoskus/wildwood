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
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const soulRow = (f: any, critDamage: number, identity = f.ctx.sender) =>
  f.seed("playerSoulStats", { identity, damage: 0, maxHp: 0, armor: 0, regen: 0, attackSpeed: 0, critDamage, kills: 0n });
const research = (f: any, ranks: Record<string, number>) =>
  f.seed("playerResearch", { identity: f.ctx.sender, frontierMastery: 0, ...createEmptyResearchRanks(), ...ranks });

/** The kill bound's damage a second for a critting bow player with this much soul critical damage. */
function boundDps(critDamage: number, critCap = 0) {
  const f = crystalFixture();
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

it("bounds kills by the capped critical, never by stored critical damage above the cap", () => {
  const base = boundDps(0);
  expect(boundDps(200) / base).toBeCloseTo(50 / 1.05);
  expect(boundDps(48.95) / base).toBeCloseTo(50 / 1.05);
  expect(boundDps(10) / base).toBeCloseTo(11.05 / 1.05);
  expect(boundDps(200, 3) / base).toBeCloseTo(80 / 1.05);
  expect(boundDps(200, 5) / base).toBeCloseTo(100 / 1.05);
});

it("deals the capped critical in duels", () => {
  const { duelDamage } = createDuelRuntime({ researchedDamage: (_ctx: any, _identity: any, damage: number) => damage } as any);
  const duel = (critDamage: number, critCap = 0) => {
    const f = crystalFixture();
    research(f, { criticalChance: 100, critCap });
    soulRow(f, critDamage);
    return duelDamage(f.ctx, f.ctx.sender, 10);
  };
  expect(duel(0)).toBeCloseTo(10.5);
  expect(duel(500)).toBeCloseTo(500);
  expect(duel(500, 1)).toBeCloseTo(600);
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

it("trims stored soul critical damage above 100× once, and leaves the rest alone", () => {
  const f = crystalFixture();
  const other = identity("2");
  f.seed("moduleMigrationState", { id: 0, version: 52 });
  research(f, { criticalDamage: 20 });
  f.seed("playerPrestigePerk", { identity: f.ctx.sender, keenEdge: 5 });
  soulRow(f, 500);
  soulRow(f, 60, other);
  f.ctx.connectionId = null;
  f.run(server.onConnect);
  // 1.05 + 1.00 research + 0.60 Keen Edge leaves 97.35 for the soul.
  expect(f.db.playerSoulStats.identity.find(f.ctx.sender).critDamage).toBeCloseTo(97.35);
  expect(f.db.playerSoulStats.identity.find(other).critDamage).toBe(60);
  expect(f.db.moduleMigrationState.id.find(0).version).toBe(MODULE_MIGRATION_VERSION);
  f.patch("playerSoulStats", { critDamage: 500 });
  f.run(server.onConnect);
  expect(f.db.playerSoulStats.identity.find(f.ctx.sender).critDamage).toBe(500);
});

it("stops paying soul critical damage at 100×", () => {
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
  expect(row.critDamage).toBeCloseTo(98.95);
});
