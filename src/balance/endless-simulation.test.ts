import { expect, it } from "vitest";
import { defaultBalanceSettings, resolveMapBalance } from "../../shared/map-balance";
import { createEmptyResearchRanks } from "../../shared/research";
import { runBalanceSimulation, simulateExistingPlayer, createMapDefinitions, type ExistingPlayerSimulation } from "./simulator";
import { DEFAULT_KILL_BUDGET } from "./kill-budget";

const ready: ExistingPlayerSimulation = {
  mapIndex: 14, ownedItems: [], bossRewardClaims: 0, stats: { damage: 1e20, maxHp: 1e20, armor: 1e20, regen: 0, attackRate: 1 },
  research: createEmptyResearchRanks(), equipped: { weapon: "", head: "", chest: "" },
  bootsEquipped: false, itemUpgradeLevel: 0, equipmentStrengthMultiplier: 1,
};
it("continues through Ion into Endless and stops only at the last selected boss", () => {
  const result = simulateExistingPlayer({ durationSeconds: 3600, endlessMaps: 2, requiredClears: 0,
    stopAfterCampaign: true, researchPlan: "off", steadyEquipmentUpgrades: false, strategy: "efficient" }, ready);
  expect(result.maps.map(m => m.mapId)).toEqual(["ion_citadel", "endless_1", "endless_2"]);
  expect(result.maps.every(m => m.exitedAtSeconds !== null)).toBe(true);
  const expected = createMapDefinitions(2).slice(14).reduce((sum, map) => sum + map.boss!.rewards.find(r => r.type === "damage")!.amount, ready.stats.damage);
  expect(result.finalState.stats.damage).toBe(expected);
  expect(result.maps.at(-1)!.repeatBossKills).toBe(0);
  expect(result.samples.at(-1)!.power).toBe(result.maps.at(-1)!.exitPower);
});
it("uses generated rewards for all four lanes even when they share the same sprite", () => {
  const result = runBalanceSimulation({ durationSeconds: 60, trials: 1, endlessMaps: 2, researchPlan: "off" });
  for (const n of [1, 2] as const) {
    const rows = result.enemyMetrics[`endless_${n}`];
    expect(rows).toHaveLength(5); // two damage roles plus health, armor, regen
    expect(rows.reduce((sum, row) => sum + row.spawnCount, 0)).toBe(31);
    for (const lane of ["Cindermaw", "Dread Warden", "Bramble", "Mossback", "Brood"] as const) {
      const expected = resolveMapBalance(`endless_${n}`, defaultBalanceSettings(), 0).lanes[lane];
      const row = rows.find(r => r.hp === expected.hp && r.rewardType === expected.reward.type)!;
      expect(row).toBeDefined(); expect(row.rewardAmount).toBeCloseTo(expected.reward.amount);
    }
    expect(result.maps.find(m => m.mapId === `endless_${n}`)!.targetDurationSeconds).toBeNull();
  }
});
it("farms generated sites instead of their sprite's Forest stats", () => {
  const result = simulateExistingPlayer({ durationSeconds: 3600, endlessMaps: 1, requiredClears: 1,
    stopAfterCampaign: true, researchPlan: "off", steadyEquipmentUpgrades: false, strategy: "efficient" }, { ...ready, mapIndex: 15 });
  expect(result.maps[0].regularKills).toBe(31);
  expect(result.maps[0].statInvestments.health.rewardEvents).toBe(7); // 6 enemies + boss
  const snapshot = resolveMapBalance("endless_1", defaultBalanceSettings(), 0);
  const expectedHealth = ready.stats.maxHp + 6 * snapshot.lanes.Bramble.reward.amount + snapshot.boss!.rewards.health;
  expect(result.finalState.stats.maxHp / expectedHealth).toBeCloseTo(1, 12);
});
it("shows a sandbox kill-budget proposal without changing the input or authored boss", () => {
  const config = { durationSeconds: 60, trials: 1, killBudget: { ...DEFAULT_KILL_BUDGET, enabled: true, curve: "custom" as const, damageKills: 3, healthKills: 4 } };
  const before = structuredClone(config);
  const hp = createMapDefinitions()[0].boss!.hp;
  const result = runBalanceSimulation(config);
  expect(result.bossReadiness.tutorial_forest!.proposed.totalKills).toBe(7);
  expect(config).toEqual(before); expect(createMapDefinitions()[0].boss!.hp).toBe(hp);
});
