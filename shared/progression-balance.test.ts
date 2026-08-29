import { describe, expect, it } from "vitest";
import {
  LEGACY_PROGRESSION_OUTLIER_THRESHOLDS,
  LEGACY_TOP_FIVE_FLOOR_TARGET_RAW_POWER,
  LEGACY_TOP_FIVE_REFERENCE_TARGET_RAW_POWER,
  MAX_PROGRESSION_DAMAGE_TO_HEALTH_RATIO,
  compressLegacyProgressionOutlier,
  compressLegacyTopFiveProgression,
  compressProgressionStat,
  correctLegacyTopFiveV5Progression,
  isLegacyTopFiveProgressionOutlier,
  isLegacyProgressionOutlier,
  legacyTopFiveTargetRawPower,
  rebalanceLegacyDamageHealth,
} from "./progression-balance";
import { DEFAULT_ATTACK_INTERVAL } from "./rules";
import { playerPowerForStats } from "./player-power";

describe("legacy progression outlier compression", () => {
  it("leaves the measured endgame envelope and nearby accounts untouched", () => {
    const progress = { damage: 4_900_000_000_000, maxHp: 24_000_000_000, armor: 4_900_000, regen: 490_000_000 };
    expect(isLegacyProgressionOutlier(progress)).toBe(false);
    expect(compressLegacyProgressionOutlier(progress)).toBe(progress);
  });

  it("soft-compresses only stats above their curve threshold", () => {
    const progress = { damage: 16_738_716_000_000, maxHp: 52_417_517_000_000, armor: 4_453_277_000, regen: 224_256_900_000 };
    const compressed = compressLegacyProgressionOutlier(progress);
    expect(compressed.damage).toBeLessThan(progress.damage);
    expect(compressed.maxHp).toBeLessThan(progress.maxHp);
    expect(compressed.armor).toBeLessThan(progress.armor);
    expect(compressed.regen).toBeLessThan(progress.regen);
    expect(compressed.damage).toBeGreaterThan(LEGACY_PROGRESSION_OUTLIER_THRESHOLDS.damage);
  });

  it("is continuous at the threshold and preserves rank above it", () => {
    const threshold = LEGACY_PROGRESSION_OUTLIER_THRESHOLDS.damage;
    expect(compressProgressionStat(threshold, threshold)).toBe(threshold);
    expect(compressProgressionStat(threshold * 10, threshold)).toBeGreaterThan(threshold);
    expect(compressProgressionStat(threshold * 100, threshold)).toBeGreaterThan(compressProgressionStat(threshold * 10, threshold));
  });

  it("selects only the three live legacy outliers from the measured cohort", () => {
    const cohort = [
      { damage: 818_299_700_000_000, maxHp: 230_319_720_000_000, armor: 25_827_113_000, regen: 6_086_152_000_000 },
      { damage: 16_738_716_000_000, maxHp: 52_417_517_000_000, armor: 4_453_277_000, regen: 224_256_900_000 },
      { damage: 2_002_852_800_000, maxHp: 9_454_434_000_000, armor: 884_503_300, regen: 51_614_580_000 },
      { damage: 4_053_667_800, maxHp: 6_480_782_300, armor: 3_557_915.5, regen: 139_314_620 },
      { damage: 76_563_496, maxHp: 310_817_380, armor: 125_715.49, regen: 56.47 },
    ];
    expect(cohort.filter(isLegacyProgressionOutlier)).toHaveLength(3);
  });
});

describe("legacy top-five curve correction", () => {
  const cohort = [
    { name: "rymel", maxHp: 9.093538e15, damage: 2.3402444e16, attackRate: .3809524, armor: 891_537_460_000, regen: 1.7235133e14 },
    { name: "Skittle", maxHp: 5.123745e15, damage: 2.3269255e15, attackRate: .3809524, armor: 268_711_870_000, regen: 5.6346007e13 },
    { name: "TacoMel", maxHp: 3.8437075e14, damage: 1.3900319e14, attackRate: .3809524, armor: 9_466_078_000, regen: 1.8550222e12 },
    { name: "Uncletaco", maxHp: 6_480_782_300, damage: 4_053_667_800, attackRate: .3809524, armor: 3_557_915.5, regen: 139_314_620 },
    { name: "Lucky Hare 942", maxHp: 310_817_380, damage: 76_563_496, attackRate: .3987359, armor: 125_715.49, regen: 56.472004 },
    { name: "ZebraFist", maxHp: 18_256, damage: 37_720, attackRate: .4692576, armor: 623, regen: 47.7 },
  ];

  it("selects exactly the measured top five without touching the next player", () => {
    expect(cohort.filter(isLegacyTopFiveProgressionOutlier).map(({ name }) => name)).toEqual([
      "rymel",
      "Skittle",
      "TacoMel",
      "Uncletaco",
      "Lucky Hare 942",
    ]);
  });

  it("anchors Skittle at the Water-entry reference and rank five at the Lava-entry floor", () => {
    const skittlePower = playerPowerForStats(cohort[1]);
    const floorPower = playerPowerForStats(cohort[4]);
    expect(legacyTopFiveTargetRawPower(skittlePower)).toBeCloseTo(LEGACY_TOP_FIVE_REFERENCE_TARGET_RAW_POWER, 0);
    expect(legacyTopFiveTargetRawPower(floorPower)).toBeCloseTo(LEGACY_TOP_FIVE_FLOOR_TARGET_RAW_POWER, 0);
  });

  it("preserves ordering and each account's internal stat proportions", () => {
    const migrated = cohort.slice(0, 5).map(compressLegacyTopFiveProgression);
    const migratedPowers = migrated.map(playerPowerForStats);
    expect(migratedPowers).toEqual([...migratedPowers].sort((a, b) => b - a));
    for (let index = 0; index < migrated.length; index += 1) {
      const before = cohort[index];
      const after = migrated[index];
      const damageScale = after.damage / before.damage;
      expect(after.maxHp / before.maxHp).toBeCloseTo(damageScale, 10);
      expect(after.armor / before.armor).toBeCloseTo(damageScale, 10);
      expect(after.regen / before.regen).toBeCloseTo(damageScale, 10);
      expect(compressLegacyTopFiveProgression(after)).toBe(after);
    }
  });

  it("corrects the short-lived v5 cohort to the current-equipment Water anchor", () => {
    const v5Cohort = [
      { maxHp: 1_142_773.6, damage: 2_940_956.2, attackRate: .3809524, armor: 112.038414, regen: 21_659.18 },
      { maxHp: 3_238_349.2, damage: 1_470_681.5, attackRate: .3809524, armor: 169.83337, regen: 35_612.242 },
      { maxHp: 2_379_315, damage: 860_451.5, attackRate: .3809524, armor: 58.596504, regen: 11_482.878 },
      { maxHp: 262_004.33, damage: 163_881.22, attackRate: .3809524, armor: 143.839, regen: 5_632.196 },
      { maxHp: 268_523.94, damage: 66_145.37, attackRate: .3987359, armor: 108.60917, regen: .04878776 },
    ];
    const corrected = v5Cohort.map(correctLegacyTopFiveV5Progression);
    const powers = corrected.map(playerPowerForStats);
    expect(powers).toEqual([...powers].sort((a, b) => b - a));
    expect(Math.abs(powers[1] - LEGACY_TOP_FIVE_REFERENCE_TARGET_RAW_POWER)).toBeLessThanOrEqual(2);
    expect(Math.abs(powers[4] - LEGACY_TOP_FIVE_FLOOR_TARGET_RAW_POWER)).toBeLessThanOrEqual(2);
    expect(corrected[1].damage / v5Cohort[1].damage).toBeCloseTo(corrected[1].maxHp / v5Cohort[1].maxHp, 10);
  });
});

describe("legacy damage and health curve correction", () => {
  it("leaves accounts already inside the authored ratio unchanged", () => {
    const progress = { damage: 100, maxHp: 100, attackRate: .5 };
    expect(rebalanceLegacyDamageHealth(progress)).toBe(progress);
  });

  it("preserves ordinary offense-heavy builds below the legacy repair threshold", () => {
    const progress = { damage: 300, maxHp: 100, attackRate: .5 };
    expect(rebalanceLegacyDamageHealth(progress)).toBe(progress);
  });

  it("moves excess damage budget into health without changing raw power", () => {
    const progress = { damage: 11_041_432_000_000, maxHp: 216_203_000_000, attackRate: .3809524 };
    const migrated = rebalanceLegacyDamageHealth(progress);
    const weight = DEFAULT_ATTACK_INTERVAL / progress.attackRate;
    expect(migrated.damage / migrated.maxHp).toBeCloseTo(MAX_PROGRESSION_DAMAGE_TO_HEALTH_RATIO, 10);
    expect(migrated.damage).toBeLessThan(progress.damage);
    expect(migrated.maxHp).toBeGreaterThan(progress.maxHp);
    const beforePower = progress.damage * weight + progress.maxHp;
    const afterPower = migrated.damage * weight + migrated.maxHp;
    expect(afterPower / beforePower).toBeCloseTo(1, 10);
  });

  it("preserves ordering for accounts with the same attack interval", () => {
    const lower = rebalanceLegacyDamageHealth({ damage: 10_000, maxHp: 100, attackRate: .5 });
    const higher = rebalanceLegacyDamageHealth({ damage: 20_000, maxHp: 100, attackRate: .5 });
    expect(higher.damage).toBeGreaterThan(lower.damage);
    expect(higher.maxHp).toBeGreaterThan(lower.maxHp);
  });
});
