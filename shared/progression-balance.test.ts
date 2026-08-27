import { describe, expect, it } from "vitest";
import {
  LEGACY_PROGRESSION_OUTLIER_THRESHOLDS,
  MAX_PROGRESSION_DAMAGE_TO_HEALTH_RATIO,
  compressLegacyProgressionOutlier,
  compressProgressionStat,
  isLegacyProgressionOutlier,
  rebalanceLegacyDamageHealth,
} from "./progression-balance";
import { DEFAULT_ATTACK_INTERVAL } from "./rules";

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
