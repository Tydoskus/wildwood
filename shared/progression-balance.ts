import { DEFAULT_ATTACK_INTERVAL, MIN_ATTACK_INTERVAL } from "./rules";
import { playerPowerForStats } from "./player-power";

export type ProgressionCurveStats = {
  maxHp: number;
  damage: number;
  armor: number;
  regen: number;
};

export type DamageHealthCurveStats = {
  damage: number;
  maxHp: number;
  attackRate: number;
};

export type LegacyLeaderboardCurveStats = ProgressionCurveStats & {
  attackRate: number;
};

// The authored late-game curve ends close to 1:1. Leave a little room for an
// offense-heavy account before converting excess damage budget into health.
export const MAX_PROGRESSION_DAMAGE_TO_HEALTH_RATIO = 1.25;
// Only repair legacy accounts far beyond the curve. Normal offensive builds,
// including the simulated P90, are intentionally left alone.
export const LEGACY_DAMAGE_TO_HEALTH_REBALANCE_TRIGGER_RATIO = 4;

// These sit above the measured P90 raw stats at the end of Night Forest.
// Normal and moderately advanced accounts remain byte-for-byte unchanged.
export const LEGACY_PROGRESSION_OUTLIER_THRESHOLDS: Readonly<ProgressionCurveStats> = {
  damage: 5_000_000_000_000,
  maxHp: 25_000_000_000,
  armor: 5_000_000,
  regen: 500_000_000,
};

export function isLegacyProgressionOutlier(progress: ProgressionCurveStats) {
  return progress.damage > LEGACY_PROGRESSION_OUTLIER_THRESHOLDS.damage ||
    progress.maxHp > LEGACY_PROGRESSION_OUTLIER_THRESHOLDS.maxHp ||
    progress.armor > LEGACY_PROGRESSION_OUTLIER_THRESHOLDS.armor ||
    progress.regen > LEGACY_PROGRESSION_OUTLIER_THRESHOLDS.regen;
}

/** Continuous, monotonic compression that preserves rank and veteran advantage. */
export function compressProgressionStat(value: number, threshold: number) {
  if (!Number.isFinite(value) || value <= threshold) return value;
  return threshold * (1 + Math.log(value / threshold));
}

/** Apply once through the versioned legacy migration; this is intentionally not idempotent. */
export function compressLegacyProgressionOutlier<T extends ProgressionCurveStats>(progress: T): T {
  if (!isLegacyProgressionOutlier(progress)) return progress;
  return {
    ...progress,
    damage: compressProgressionStat(progress.damage, LEGACY_PROGRESSION_OUTLIER_THRESHOLDS.damage),
    maxHp: compressProgressionStat(progress.maxHp, LEGACY_PROGRESSION_OUTLIER_THRESHOLDS.maxHp),
    armor: compressProgressionStat(progress.armor, LEGACY_PROGRESSION_OUTLIER_THRESHOLDS.armor),
    regen: compressProgressionStat(progress.regen, LEGACY_PROGRESSION_OUTLIER_THRESHOLDS.regen),
  };
}

// Release 0.552 left exactly five legacy accounts above 100m raw power while
// the next account remained below 150k. Use raw power for this one-time repair
// so the server and an offline pending client save can run the same transform
// without needing equipment, research, or item-upgrade context.
export const LEGACY_TOP_FIVE_RAW_POWER_THRESHOLD = 100_000_000;
export const LEGACY_TOP_FIVE_REFERENCE_RAW_POWER = 15_216_770_651_672_028;
export const LEGACY_TOP_FIVE_REFERENCE_TARGET_RAW_POWER = 9_617_422;
export const LEGACY_TOP_FIVE_FLOOR_RAW_POWER = 610_739_360;
export const LEGACY_TOP_FIVE_FLOOR_TARGET_RAW_POWER = 527_635;

const LEGACY_TOP_FIVE_LOG_EXPONENT = Math.log(
  LEGACY_TOP_FIVE_REFERENCE_TARGET_RAW_POWER / LEGACY_TOP_FIVE_FLOOR_TARGET_RAW_POWER,
) / Math.log(
  LEGACY_TOP_FIVE_REFERENCE_RAW_POWER / LEGACY_TOP_FIVE_FLOOR_RAW_POWER,
);

export function legacyTopFiveTargetRawPower(rawPower: number) {
  if (!Number.isFinite(rawPower) || rawPower <= LEGACY_TOP_FIVE_RAW_POWER_THRESHOLD) return rawPower;
  return LEGACY_TOP_FIVE_REFERENCE_TARGET_RAW_POWER * Math.pow(
    rawPower / LEGACY_TOP_FIVE_REFERENCE_RAW_POWER,
    LEGACY_TOP_FIVE_LOG_EXPONENT,
  );
}

export function isLegacyTopFiveProgressionOutlier(progress: LegacyLeaderboardCurveStats) {
  return playerPowerForStats(progress) > LEGACY_TOP_FIVE_RAW_POWER_THRESHOLD;
}

/**
 * One-time rank-preserving logarithmic compression for the measured top-five
 * cohort. Every core stat receives the same factor, preserving each build's
 * damage/health/armor/regen proportions and equipment value.
 */
export function compressLegacyTopFiveProgression<T extends LegacyLeaderboardCurveStats>(progress: T): T {
  const rawPower = playerPowerForStats(progress);
  const targetRawPower = legacyTopFiveTargetRawPower(rawPower);
  if (!Number.isFinite(targetRawPower) || targetRawPower >= rawPower) return progress;
  const scale = targetRawPower / rawPower;
  return {
    ...progress,
    damage: progress.damage * scale,
    maxHp: progress.maxHp * scale,
    armor: progress.armor * scale,
    regen: progress.regen * scale,
  };
}

/**
 * Reallocates only an account's excess damage into max health while preserving
 * its raw damage/health power budget at the account's current attack interval.
 * This is a one-time migration, not an ongoing stat cap.
 */
export function rebalanceLegacyDamageHealth<T extends DamageHealthCurveStats>(progress: T): T {
  const damage = Math.max(0, Number.isFinite(progress.damage) ? progress.damage : 0);
  const maxHp = Math.max(1, Number.isFinite(progress.maxHp) ? progress.maxHp : 1);
  if (damage / maxHp <= LEGACY_DAMAGE_TO_HEALTH_REBALANCE_TRIGGER_RATIO) return progress;

  const attackRate = Number.isFinite(progress.attackRate)
    ? Math.max(MIN_ATTACK_INTERVAL, Math.min(DEFAULT_ATTACK_INTERVAL, progress.attackRate))
    : DEFAULT_ATTACK_INTERVAL;
  const damagePowerWeight = DEFAULT_ATTACK_INTERVAL / attackRate;
  const damageHealthBudget = damage * damagePowerWeight + maxHp;
  const nextMaxHp = damageHealthBudget /
    (MAX_PROGRESSION_DAMAGE_TO_HEALTH_RATIO * damagePowerWeight + 1);
  return {
    ...progress,
    damage: nextMaxHp * MAX_PROGRESSION_DAMAGE_TO_HEALTH_RATIO,
    maxHp: nextMaxHp,
  };
}
