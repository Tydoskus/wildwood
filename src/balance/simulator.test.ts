import { describe, expect, it } from "vitest";
import {
  BALANCE_LATE_BOSS_TARGET_MAX_SECONDS,
  BALANCE_TARGET_DESERT_DURATION_SECONDS,
  BALANCE_FIRST_SLOWDOWN_POWER,
  BALANCE_TARGET_MAP_DURATION_MULTIPLIER,
  BALANCE_TARGET_MAP_POWER_MULTIPLIER,
  BALANCE_TARGET_POWER_ARC_BLEND,
  GLOOMROOT_MAX_HP,
  INFERNAL_DEPTHS_BOSS_HEALTH_MULTIPLIER,
  MAP_IDS,
} from "../../shared/rules";
import { ADVANCED_LAVA_WASTES_MAP_ID, BEGINNER_DESERT_MAP_ID, CLOUDSPIRE_MAP_ID, INFERNAL_DEPTHS_MAP_ID, INTERMEDIATE_SNOWLANDS_MAP_ID, MOONFEN_MAP_ID, CRYSTAL_HOLLOWS_MAP_ID, SAMURAI_GARDEN_MAP_ID, TUTORIAL_FOREST_MAP_ID, WATER_REACH_MAP_ID } from "../game/world";
import { bossReadinessTargetSeconds, defaultBalanceSimulationConfig, runBalanceSimulation, runBalanceSimulationWithStrategyComparisons, targetCurveProgress, targetPowerAtMapProgress } from "./simulator";

const quickConfig = {
  durationSeconds: 60 * 60,
  trials: 2,
  strategy: "boss-rush" as const,
  seed: 7_331,
};

describe("balance simulator", () => {
  it("uses the intended campaign defaults when no overrides are supplied", () => {
    const defaults = defaultBalanceSimulationConfig();
    const targetedMapSeconds = MAP_IDS.slice(1).reduce((total, _map, index) =>
      total + BALANCE_TARGET_DESERT_DURATION_SECONDS * BALANCE_TARGET_MAP_DURATION_MULTIPLIER ** index, 0);
    expect(defaults.durationSeconds).toBeCloseTo(22.5 * 60 + targetedMapSeconds);
    expect(defaults.trials).toBe(100);
    expect(defaults.strategy).toBe("mixed");
    expect(defaults.targetDesertDurationSeconds).toBe(BALANCE_TARGET_DESERT_DURATION_SECONDS);
    expect(defaults.targetMapDurationMultiplier).toBe(BALANCE_TARGET_MAP_DURATION_MULTIPLIER);
    expect(defaults.targetMapPowerMultiplier).toBe(BALANCE_TARGET_MAP_POWER_MULTIPLIER);
    expect(defaults.targetPowerArcBlend).toBe(BALANCE_TARGET_POWER_ARC_BLEND);
    expect(defaults.futureSpeedupReserveMultiplier).toBe(1.25);
    expect(defaults.equipmentStrengthMultiplier).toBe(1);

    const result = runBalanceSimulation({ durationSeconds: 60, trials: 1 });
    expect(result.config.strategy).toBe("mixed");
    expect(result.config.researchPlan).toBe("balanced");
    const desert = result.maps.find((map) => map.mapId === BEGINNER_DESERT_MAP_ID);
    expect(desert?.targetDurationSeconds).toBe(BALANCE_TARGET_DESERT_DURATION_SECONDS);
    expect(desert?.targetPowerGrowthMultiplier).toBe(BALANCE_TARGET_MAP_POWER_MULTIPLIER);
    expect(result.maps.find((map) => map.mapId === INFERNAL_DEPTHS_MAP_ID)?.hasBoss).toBe(true);
    expect(result.maps.find((map) => map.mapId === WATER_REACH_MAP_ID)?.hasBoss).toBe(true);
    expect(result.maps.find((map) => map.mapId === SAMURAI_GARDEN_MAP_ID)?.hasBoss).toBe(true);
    expect(result.maps.find((map) => map.mapId === CLOUDSPIRE_MAP_ID)?.hasBoss).toBe(true);
    expect(result.maps.find((map) => map.mapId === MOONFEN_MAP_ID)?.hasBoss).toBe(true);
    expect(result.maps.find((map) => map.mapId === CRYSTAL_HOLLOWS_MAP_ID)?.hasBoss).toBe(true);
    expect(GLOOMROOT_MAX_HP).toBe(1_150_000_000_000_000 * INFERNAL_DEPTHS_BOSS_HEALTH_MULTIPLIER);
  });

  it("is deterministic for a fixed seed and configuration", () => {
    expect(runBalanceSimulation(quickConfig)).toEqual(runBalanceSimulation(quickConfig));
  });

  it("reports a timeline after each completed campaign", () => {
    const completed: number[] = [];
    const timelineLengths: number[] = [];
    const result = runBalanceSimulation({ durationSeconds: 60, trials: 3 }, (progress) => {
      completed.push(progress.completedTrials);
      timelineLengths.push(progress.timeline.length);
    });
    expect(completed).toEqual([1, 2, 3]);
    expect(timelineLengths.every((length) => length === result.timeline.length)).toBe(true);
  });

  it("mixes the normal player priorities in one seeded run without adding boss farming", () => {
    const config = { durationSeconds: 60, trials: 40, strategy: "mixed" as const, seed: 7_331 };
    const result = runBalanceSimulation(config);
    expect(result.strategyMix.natural).toBeGreaterThan(0);
    expect(result.strategyMix.efficient).toBeGreaterThan(0);
    expect(result.strategyMix["dps-first"]).toBeGreaterThan(0);
    expect(result.strategyMix["boss-rush"]).toBeGreaterThan(0);
    expect(result.strategyMix["boss-farm"]).toBe(0);
    expect(Object.values(result.strategyMix).reduce((total, count) => total + count, 0)).toBe(config.trials);
    expect(result).toEqual(runBalanceSimulation(config));
  });

  it("adds comparable traces for each guided player strategy", () => {
    const result = runBalanceSimulationWithStrategyComparisons({
      durationSeconds: 60 * 60,
      trials: 2,
      strategy: "mixed",
      seed: 7_331,
    });
    expect(result.strategyComparisonTrials).toBe(2);
    expect(result.strategyTimelines?.map((entry) => entry.strategy)).toEqual([
      "natural", "efficient", "dps-first", "boss-rush",
    ]);
    expect(result.strategyTimelines?.every((entry) => entry.timeline.length === result.timeline.length)).toBe(true);
    const finalStrategyPowers = result.strategyTimelines?.map((entry) => entry.timeline[entry.timeline.length - 1]?.powerMedian);
    expect(new Set(finalStrategyPowers).size).toBeGreaterThan(1);
  });

  it("keeps post-clear Boss-rush repeat power positive on every clear", () => {
    const result = runBalanceSimulationWithStrategyComparisons({
      durationSeconds: 80 * 60 * 60,
      trials: 1,
      strategy: "mixed",
      seed: 7_331,
    });
    const bossRush = result.strategyTimelines?.find((entry) => entry.strategy === "boss-rush");
    const finalPoint = bossRush?.timeline.at(-1);
    const previousPoint = bossRush?.timeline.at(-2);
    expect(finalPoint?.powerMedian).toBeGreaterThan(previousPoint?.powerMedian ?? 0);
  });

  it("keeps a DPS-first player moving through discrete boss-readiness ties", () => {
    const result = runBalanceSimulation({ durationSeconds: 6 * 60 * 60, trials: 1, strategy: "dps-first", seed: 7_331 });
    expect(result.maps.find((map) => map.mapId === BEGINNER_DESERT_MAP_ID)?.completedPercent).toBe(100);
    expect(result.maps.find((map) => map.mapId === INTERMEDIATE_SNOWLANDS_MAP_ID)?.completedPercent).toBe(100);
  });

  it("can run an explicit repeat-boss scenario and exposes its farming cost", () => {
    const result = runBalanceSimulation({ durationSeconds: 6 * 60 * 60, trials: 1, strategy: "boss-farm", seed: 7_331 });
    const forest = result.maps.find((map) => map.mapId === TUTORIAL_FOREST_MAP_ID)!;
    expect(forest.repeatBossKillsMedian).toBeGreaterThan(1);
    expect(forest.repeatBossPowerGainMedian).toBeGreaterThan(0);
    expect(forest.bossRepeatPermanentPowerPerMinuteMedian).toBeGreaterThan(0);
    expect(forest.bossRepeatEfficiencyRatioMedian).toBeGreaterThan(0);
    expect(forest.repeatTimeBudgetMedian?.respawnWaitSeconds).toBeGreaterThan(0);
    expect(result.diagnostics.some((diagnostic) => diagnostic.includes("full authored reward"))).toBe(true);
  });

  it("produces a monotonic power timeline", () => {
    const timeline = runBalanceSimulation(quickConfig).timeline;
    for (let index = 1; index < timeline.length; index += 1) {
      expect(timeline[index].powerP10).toBeGreaterThanOrEqual(timeline[index - 1].powerP10);
      expect(timeline[index].powerMedian).toBeGreaterThanOrEqual(timeline[index - 1].powerMedian);
      expect(timeline[index].powerP90).toBeGreaterThanOrEqual(timeline[index - 1].powerP90);
    }
  });

  it("places the target curve between a straight log ramp and a full logarithmic arc", () => {
    const straight = targetCurveProgress(200, 0);
    const blended = targetCurveProgress(200, BALANCE_TARGET_POWER_ARC_BLEND);
    const fullArc = targetCurveProgress(200, 1);
    expect(straight.p25).toBeCloseTo(.25);
    expect(straight.p50).toBeCloseTo(.5);
    expect(straight.p75).toBeCloseTo(.75);
    expect(blended.p25).toBeGreaterThan(straight.p25);
    expect(blended.p25).toBeLessThan(fullArc.p25);
    expect(blended.p50).toBeGreaterThan(straight.p50);
    expect(targetPowerAtMapProgress(100, 200, 0)).toBe(100);
    expect(targetPowerAtMapProgress(100, 200, 1)).toBe(20_000);
  });

  it("keeps early boss readiness familiar and scales late capstones with map time", () => {
    const config = defaultBalanceSimulationConfig();
    expect(bossReadinessTargetSeconds(TUTORIAL_FOREST_MAP_ID, config)).toBe(5 * 60);
    expect(bossReadinessTargetSeconds(BEGINNER_DESERT_MAP_ID, config)).toBe(5 * 60);
    expect(bossReadinessTargetSeconds(INTERMEDIATE_SNOWLANDS_MAP_ID, config)).toBe(5 * 60);
    expect(bossReadinessTargetSeconds(ADVANCED_LAVA_WASTES_MAP_ID, config)).toBeCloseTo(
      BALANCE_TARGET_DESERT_DURATION_SECONDS * BALANCE_TARGET_MAP_DURATION_MULTIPLIER ** 2 * .05,
    );
    expect(bossReadinessTargetSeconds(WATER_REACH_MAP_ID, config)).toBe(BALANCE_LATE_BOSS_TARGET_MAX_SECONDS);
  });

  it("keeps the default post-onboarding campaign measurable and surfaces balance drift", () => {
    const result = runBalanceSimulation();
    const progressionMaps = result.maps.slice(1);

    expect(progressionMaps.every((map) => map.reachedPercent >= 50)).toBe(true);
    for (const map of progressionMaps) {
      expect(map.durationVsTarget, `${map.mapId} duration`).toBeGreaterThan(0);
      expect(map.powerGrowthMultiplier).not.toBeNull();
      expect(map.exitEffectiveStatsMedian).not.toBeNull();
      const measuredTime = Object.values(map.timeBudgetMedian!).reduce((sum, seconds) => sum + seconds, 0);
      const travelShare = map.timeBudgetMedian!.travelSeconds / measuredTime;
      expect(travelShare, `${map.mapId} travel share`).toBeGreaterThanOrEqual(0);
      expect(travelShare, `${map.mapId} travel share`).toBeLessThanOrEqual(1);
      if (map.hasBoss) {
        expect(map.completedPercent, `${map.mapId} completion`).toBeGreaterThanOrEqual(50);
        expect(map.bossTtkAtExitMedianSeconds).not.toBeNull();
        const bossShare = map.bossFightMedianSeconds! / map.durationMedianSeconds!;
        expect(bossShare).toBeGreaterThan(0);
        expect(bossShare).toBeLessThanOrEqual(1);
        expect(map.futureHeadroom).not.toBeNull();
      } else {
        expect(map.futureHeadroom).toBeNull();
      }
      expect(map.momentum?.longestGainGapSeconds).toBeGreaterThanOrEqual(0);
      expect(map.momentum?.largestSingleJumpGrowthSharePercent).toBeGreaterThanOrEqual(0);
    }
    expect(result.diagnostics.some((diagnostic) => diagnostic.includes("Pacing curve:"))).toBe(true);
    const lateStatTracks = result.maps
      .filter((map) => map.mapId !== TUTORIAL_FOREST_MAP_ID)
      .flatMap((map) => map.statProgression)
      .filter((metric) =>
        metric.stat === "damage" ||
        metric.stat === "health" ||
        metric.stat === "armor" ||
        metric.stat === "regeneration");
    expect(lateStatTracks
      .filter((metric) => metric.stat === "damage")
      .every((metric) => metric.investmentSharePercent <= 50)).toBe(true);
    expect(result.diagnostics.some((diagnostic) => diagnostic.includes("Stat farming:"))).toBe(true);

    const nightEnemies = result.enemyMetrics[INFERNAL_DEPTHS_MAP_ID];
    expect(nightEnemies).toHaveLength(5);
    for (const enemy of nightEnemies) {
      expect(enemy.hitPercentOfHealth).toBeGreaterThan(0);
      expect(enemy.incomingDamagePerSecond).toBeGreaterThan(0);
      expect(enemy.survivalSeconds).toBeGreaterThan(0);
      expect(enemy.hitsToDefeatPlayer).toBeGreaterThan(0);
    }

    const waterEnemies = result.enemyMetrics[WATER_REACH_MAP_ID];
    expect(waterEnemies).toHaveLength(5);
    for (const enemy of waterEnemies) {
      expect(enemy.hitPercentOfHealth).toBeGreaterThan(0);
      expect(enemy.incomingDamagePerSecond).toBeGreaterThan(0);
      expect(enemy.survivalSeconds).toBeGreaterThan(0);
      expect(enemy.hitsToDefeatPlayer).toBeGreaterThan(0);
    }

    const lateEnemy = result.enemyMetrics[CRYSTAL_HOLLOWS_MAP_ID][0];
    expect(lateEnemy.referenceHitPercentOfHealth).not.toBeNull();
    expect(lateEnemy.incomingDamagePerSecond).toBeGreaterThan(0);
    expect(lateEnemy.survivalSeconds).not.toBeNull();

    const snow = result.maps.find((map) => map.mapId === "intermediate_snowlands")!;
    expect(snow.exitPowerMedian).toBeGreaterThanOrEqual(BALANCE_FIRST_SLOWDOWN_POWER * .75);
    expect(snow.exitPowerMedian).toBeLessThanOrEqual(BALANCE_FIRST_SLOWDOWN_POWER * 1.5);

    for (const map of progressionMaps.slice(0, 5)) {
      expect(map.curveProgress?.p25).toBeGreaterThanOrEqual(0);
      expect(map.curveProgress?.p25).toBeLessThanOrEqual(1);
    }
  }, 60_000);

  it("accounts for elapsed map time and exposes comparable enemy pressure", () => {
    const result = runBalanceSimulation(quickConfig);
    const forest = result.maps.find((map) => map.mapId === TUTORIAL_FOREST_MAP_ID)!;
    const budget = forest.timeBudgetMedian!;
    const accountedSeconds = Object.values(budget).reduce((total, seconds) => total + seconds, 0);
    expect(accountedSeconds).toBeCloseTo(forest.durationMedianSeconds!, 5);

    const trackedStatSeconds = forest.statProgression.reduce(
      (total, metric) => total + metric.investmentSecondsMedian,
      0,
    );
    expect(trackedStatSeconds).toBeCloseTo(accountedSeconds - budget.respawnWaitSeconds, 5);
    const activeStatShares = forest.statProgression
      .filter((metric) => metric.investmentSecondsMedian > 0)
      .reduce((total, metric) => total + metric.investmentSharePercent, 0);
    expect(activeStatShares).toBeCloseTo(100, 5);
    expect(forest.statProgression.find((metric) => metric.stat === "damage")?.secondsPerOnePercentPower).toBeGreaterThan(0);
    expect(forest.statProgression.find((metric) => metric.stat === "armor")?.investmentSecondsMedian).toBeGreaterThan(0);
    expect(forest.statProgression.find((metric) => metric.stat === "attackSpeed")?.rewardEventsMedian).toBeGreaterThan(0);
    expect(forest.momentum?.meaningfulGainPercent).toBeCloseTo(10);
    expect(forest.momentum?.longestGainGapSharePercent).toBeGreaterThanOrEqual(0);
    expect(forest.momentum?.longestGainGapSharePercent).toBeLessThanOrEqual(100);

    const enemyMetrics = result.enemyMetrics[TUTORIAL_FOREST_MAP_ID];
    expect(enemyMetrics.reduce((total, metric) => total + metric.fullClearCombatSharePercent, 0)).toBeCloseTo(100);
    expect(enemyMetrics.every((metric) => metric.ttkVsMapMedian > 0)).toBe(true);
    expect(enemyMetrics.every((metric) => metric.efficiencyVsMapMedian >= 0)).toBe(true);
  });

  it("can scale equipment bonuses as a sandbox-only scenario", () => {
    const baseline = runBalanceSimulation({ ...quickConfig, trials: 1 });
    const noEquipmentBonus = runBalanceSimulation({
      ...quickConfig,
      trials: 1,
      equipmentStrengthMultiplier: 0,
    });
    expect(noEquipmentBonus.finalPower.median).toBeLessThanOrEqual(baseline.finalPower.median);
    for (const map of noEquipmentBonus.maps.filter((entry) => entry.reachedPercent > 0)) {
      expect(map.exitPowerComponentsMedian?.equipmentSharePercent).toBe(0);
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
        [TUTORIAL_FOREST_MAP_ID]: {
          ...defaults.mapAdjustments[TUTORIAL_FOREST_MAP_ID],
          hp: 1,
          damage: 2,
          reward: 2,
        },
      },
    });
    const baselineSpitter = baseline.enemyMetrics[TUTORIAL_FOREST_MAP_ID].find((metric) => metric.enemy === "Spitter");
    const tunedSpitter = tuned.enemyMetrics[TUTORIAL_FOREST_MAP_ID].find((metric) => metric.enemy === "Spitter");
    expect(tunedSpitter?.rewardAmount).toBe((baselineSpitter?.rewardAmount ?? 0) * 2);
    expect(tunedSpitter?.damageAfterArmor).toBe((baselineSpitter?.damageAfterArmor ?? 0) * 2);
    expect(tunedSpitter?.combatPowerPerMinute).toBeGreaterThan(baselineSpitter?.combatPowerPerMinute ?? 0);
  });

  it("keeps tiny regular and boss HP sandbox values instead of snapping them to one", () => {
    const defaults = defaultBalanceSimulationConfig();
    const tiny = 5e-14;
    const result = runBalanceSimulation({
      durationSeconds: 60,
      trials: 1,
      mapAdjustments: {
        ...defaults.mapAdjustments,
        [BEGINNER_DESERT_MAP_ID]: {
          ...defaults.mapAdjustments[BEGINNER_DESERT_MAP_ID],
          hp: tiny,
          bossHp: tiny,
        },
      },
    });
    expect(result.config.mapAdjustments[BEGINNER_DESERT_MAP_ID].hp).toBe(tiny);
    expect(result.config.mapAdjustments[BEGINNER_DESERT_MAP_ID].bossHp).toBe(tiny);
  });

  it("keeps Night Forest elite damage rewards above ordinary raiders", () => {
    const result = runBalanceSimulation({ durationSeconds: 60, trials: 1 });
    const raider = result.enemyMetrics[INFERNAL_DEPTHS_MAP_ID].find((metric) => metric.enemy === "Depth Raider");
    const reaper = result.enemyMetrics[INFERNAL_DEPTHS_MAP_ID].find((metric) => metric.enemy === "Doom Reaper");
    expect(raider?.rewardType).toBe("damage");
    expect(reaper?.rewardType).toBe("damage");
    expect(reaper?.rewardAmount).toBeGreaterThan(raider?.rewardAmount ?? Number.POSITIVE_INFINITY);
  });
});
