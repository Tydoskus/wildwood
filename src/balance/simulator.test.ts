import { describe, expect, it } from "vitest";
import {
  BALANCE_TARGET_DESERT_DURATION_SECONDS,
  BALANCE_TARGET_MAP_DURATION_MULTIPLIER,
  BALANCE_TARGET_MAP_POWER_MULTIPLIER,
  INFERNAL_DEPTHS_REWARD_SCALE,
} from "../../shared/rules";
import { BEGINNER_DESERT_MAP_ID, INFERNAL_DEPTHS_MAP_ID, TUTORIAL_FOREST_MAP_ID } from "../game/world";
import { defaultBalanceSimulationConfig, runBalanceSimulation } from "./simulator";

const quickConfig = {
  durationSeconds: 60 * 60,
  trials: 2,
  strategy: "boss-rush" as const,
  seed: 7_331,
};

describe("balance simulator", () => {
  it("uses the intended campaign defaults when no overrides are supplied", () => {
    const defaults = defaultBalanceSimulationConfig();
    const targetedMapSeconds = BALANCE_TARGET_DESERT_DURATION_SECONDS * (1 + 1.35 + 1.35 ** 2 + 1.35 ** 3);
    expect(defaults.durationSeconds).toBeCloseTo(22.5 * 60 + targetedMapSeconds);
    expect(defaults.trials).toBe(100);
    expect(defaults.strategy).toBe("boss-rush");
    expect(defaults.targetDesertDurationSeconds).toBe(BALANCE_TARGET_DESERT_DURATION_SECONDS);
    expect(defaults.targetMapDurationMultiplier).toBe(BALANCE_TARGET_MAP_DURATION_MULTIPLIER);
    expect(defaults.targetMapPowerMultiplier).toBe(BALANCE_TARGET_MAP_POWER_MULTIPLIER);

    const result = runBalanceSimulation({ durationSeconds: 60, trials: 1 });
    expect(result.config.strategy).toBe("boss-rush");
    expect(result.config.researchPlan).toBe("off");
    const desert = result.maps.find((map) => map.mapId === BEGINNER_DESERT_MAP_ID);
    expect(desert?.targetDurationSeconds).toBe(BALANCE_TARGET_DESERT_DURATION_SECONDS);
    expect(desert?.targetPowerGrowthMultiplier).toBe(BALANCE_TARGET_MAP_POWER_MULTIPLIER);
  });

  it("is deterministic for a fixed seed and configuration", () => {
    expect(runBalanceSimulation(quickConfig)).toEqual(runBalanceSimulation(quickConfig));
  });

  it("produces a monotonic power timeline", () => {
    const timeline = runBalanceSimulation(quickConfig).timeline;
    for (let index = 1; index < timeline.length; index += 1) {
      expect(timeline[index].powerP10).toBeGreaterThanOrEqual(timeline[index - 1].powerP10);
      expect(timeline[index].powerMedian).toBeGreaterThanOrEqual(timeline[index - 1].powerMedian);
      expect(timeline[index].powerP90).toBeGreaterThanOrEqual(timeline[index - 1].powerP90);
    }
  });

  it("keeps the default post-onboarding campaign on its pacing and geometric power curve", () => {
    const result = runBalanceSimulation();
    const progressionMaps = result.maps.slice(1);

    expect(progressionMaps.every((map) => map.reachedPercent >= 50)).toBe(true);
    for (const map of progressionMaps) {
      expect(map.durationVsTarget).toBeGreaterThanOrEqual(.75);
      expect(map.durationVsTarget).toBeLessThanOrEqual(1.25);
      expect(map.powerGrowthMultiplier).not.toBeNull();
      const powerFit = map.powerGrowthMultiplier! / BALANCE_TARGET_MAP_POWER_MULTIPLIER;
      expect(powerFit).toBeGreaterThanOrEqual(.65);
      expect(powerFit).toBeLessThanOrEqual(1.5);
      const damageToHealth = map.exitEffectiveStatsMedian!.damage / map.exitEffectiveStatsMedian!.maxHp;
      expect(damageToHealth).toBeGreaterThanOrEqual(.6);
      expect(damageToHealth).toBeLessThanOrEqual(1.25);
    }

    const nightEnemies = result.enemyMetrics[INFERNAL_DEPTHS_MAP_ID];
    expect(nightEnemies).toHaveLength(5);
    for (const enemy of nightEnemies) {
      expect(enemy.hitPercentOfHealth).toBeGreaterThanOrEqual(3);
      expect(enemy.hitPercentOfHealth).toBeLessThanOrEqual(8);
      expect(enemy.hitsToDefeatPlayer).toBeGreaterThanOrEqual(13);
      expect(enemy.hitsToDefeatPlayer).toBeLessThanOrEqual(28);
    }
  }, 15_000);

  it("applies sandbox reward and damage multipliers independently", () => {
    const defaults = defaultBalanceSimulationConfig();
    const baseline = runBalanceSimulation({ ...quickConfig, trials: 1 });
    const tuned = runBalanceSimulation({
      ...quickConfig,
      trials: 1,
      mapAdjustments: {
        ...defaults.mapAdjustments,
        [TUTORIAL_FOREST_MAP_ID]: { hp: 1, damage: 2, reward: 2 },
      },
    });
    const baselineSpitter = baseline.enemyMetrics[TUTORIAL_FOREST_MAP_ID].find((metric) => metric.enemy === "Spitter");
    const tunedSpitter = tuned.enemyMetrics[TUTORIAL_FOREST_MAP_ID].find((metric) => metric.enemy === "Spitter");
    expect(tunedSpitter?.rewardAmount).toBe((baselineSpitter?.rewardAmount ?? 0) * 2);
    expect(tunedSpitter?.damageAfterArmor).toBe((baselineSpitter?.damageAfterArmor ?? 0) * 2);
    expect(tunedSpitter?.combatPowerPerMinute).toBeGreaterThan(baselineSpitter?.combatPowerPerMinute ?? 0);
  });

  it("tracks the current 6x Depth Raider reward", () => {
    const result = runBalanceSimulation({ durationSeconds: 60, trials: 1 });
    const raider = result.enemyMetrics[INFERNAL_DEPTHS_MAP_ID].find((metric) => metric.enemy === "Depth Raider");
    expect(raider?.rewardType).toBe("damage");
    expect(raider?.rewardAmount).toBe(57_600_000_000 * INFERNAL_DEPTHS_REWARD_SCALE);
  });
});
