import { DEFAULT_ATTACK_INTERVAL, MIN_ATTACK_INTERVAL } from "./rules";

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
