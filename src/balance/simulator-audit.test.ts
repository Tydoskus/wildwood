import { expect, it } from "vitest";
import { createEmptyResearchRanks } from "../../shared/research";
import { createMapDefinitions, simulateExistingPlayer, type ExistingPlayerSimulation } from "./simulator";

function snapshot(): ExistingPlayerSimulation {
  return {
    stats: { damage: 100, maxHp: 100, armor: 5, regen: 1, attackRate: 1 },
    research: createEmptyResearchRanks(),
    equipped: { head: "", chest: "", weapon: "starter_bow" },
    ownedItems: ["starter_bow", "ion_bow"],
    bootsEquipped: false, itemUpgradeLevel: 0, equipmentStrengthMultiplier: 1,
    mapIndex: 0, bossRewardClaims: 0, highestUnlockedMapIndex: 0,
  };
}

it("audits an existing save without changing the input or granting access to higher maps", () => {
  const input = snapshot(), original = structuredClone(input);
  const result = simulateExistingPlayer({ durationSeconds: 60, trials: 1, steadyEquipmentUpgrades: false }, input);
  expect(input).toEqual(original);
  expect(result.maps).toHaveLength(1);
  expect(result.maps[0].mapId).toBe("tutorial_forest");
  expect(result.maps[0].entryPower).toBeGreaterThan(100);
  expect(result.finalState.stats.damage).toBeGreaterThanOrEqual(input.stats.damage);
  expect(result.finalState.equipped.weapon).toBe("starter_bow");
});

it("starts from the supplied campaign map and exposes the actual final stats", () => {
  const input = snapshot(); input.mapIndex = 8; input.highestUnlockedMapIndex = 8;
  input.stats.damage = 1_000_000;
  const config = { durationSeconds: 60, trials: 1, seed: 21 };
  const result = simulateExistingPlayer(config, input);
  expect(result.maps[0].mapId).toBe("moonfen");
  expect(result.finalState.stats.damage).toBeGreaterThanOrEqual(1_000_000);
  expect(result).toEqual(simulateExistingPlayer(config, input));
});

it("counts deaths, their time, and the fall back a map when a build cannot hold its camps", () => {
  const input = snapshot(); input.mapIndex = 2; input.highestUnlockedMapIndex = 2;
  const config = { durationSeconds: 3600, trials: 1, researchPlan: "off" as const, steadyEquipmentUpgrades: false, strategy: "natural" as const };
  const snow = simulateExistingPlayer(config, input).maps[0];
  expect(snow.mapId).toBe("intermediate_snowlands");
  expect(snow.farmDeaths).toBeGreaterThanOrEqual(5);
  // Five deaths inside three minutes send it back to the Desert, inside the Snowlands' own time.
  expect(snow.fallbacks).toBeGreaterThanOrEqual(1);
  expect(snow.fallbackSeconds).toBeGreaterThan(0);
  expect(snow.timeBudget.deathSeconds).toBeGreaterThan(snow.farmDeaths * 3.85);
  const accounted = Object.values(snow.timeBudget).reduce((sum, seconds) => sum + seconds, 0);
  expect(accounted).toBeCloseTo(3600, 5);
});

it("loses a boss fight the build cannot outlast, then farms until it can", () => {
  const input = snapshot();
  input.highestUnlockedMapIndex = 1;
  // Fast enough for the 90 s readiness target, but 1,650 health and no regeneration fall to the Dragon in about 26 s.
  input.stats = { damage: createMapDefinitions()[0].boss!.hp / 75, maxHp: 1_650, armor: 0, regen: 0, attackRate: 1 };
  const forest = simulateExistingPlayer({ durationSeconds: 3600, trials: 1, requiredClears: 0, researchPlan: "off", steadyEquipmentUpgrades: false, strategy: "natural" }, input).maps[0];
  expect(forest.bossDeaths).toBe(1);
  expect(forest.exitedAtSeconds).not.toBeNull();
  expect(forest.timeBudget.deathSeconds).toBeGreaterThan(3.85);
  expect(forest.regularKills).toBeGreaterThan(0);
});

it("never kills a build no camp can hurt", () => {
  const input = snapshot(); input.mapIndex = 8; input.highestUnlockedMapIndex = 8;
  input.stats = { damage: 1e30, maxHp: 1e30, armor: 1e30, regen: 1e30, attackRate: 1 };
  const moonfen = simulateExistingPlayer({ durationSeconds: 600, trials: 1, seed: 21 }, input).maps[0];
  expect(moonfen.regularKills).toBeGreaterThan(0);
  expect(moonfen.farmDeaths + moonfen.bossDeaths).toBe(0);
  expect(moonfen.timeBudget.deathSeconds).toBe(0);
});
