import { describe, expect, it } from "vitest";
import { INFERNAL_DEPTHS_MAP_ID, TUTORIAL_FOREST_MAP_ID } from "../game/world";
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
    expect(defaults.durationSeconds).toBe(7 * 24 * 60 * 60);
    expect(defaults.trials).toBe(20);
    expect(defaults.strategy).toBe("boss-rush");
    expect(defaults.targetMapDurationMultiplier).toBe(1.35);

    const result = runBalanceSimulation({ durationSeconds: 60, trials: 1 });
    expect(result.config.strategy).toBe("boss-rush");
    expect(result.config.researchPlan).toBe("off");
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
    expect(tuned.finalPower.median).toBeGreaterThan(baseline.finalPower.median);
    expect(tunedSpitter?.rewardAmount).toBe((baselineSpitter?.rewardAmount ?? 0) * 2);
    expect(tunedSpitter?.damageAfterArmor).toBe((baselineSpitter?.damageAfterArmor ?? 0) * 2);
  });

  it("tracks the current 6x Depth Raider reward", () => {
    const result = runBalanceSimulation({ durationSeconds: 60, trials: 1 });
    const raider = result.enemyMetrics[INFERNAL_DEPTHS_MAP_ID].find((metric) => metric.enemy === "Depth Raider");
    expect(raider?.rewardType).toBe("damage");
    expect(raider?.rewardAmount).toBe(57_600_000_000);
  });
});
