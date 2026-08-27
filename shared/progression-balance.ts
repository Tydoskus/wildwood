export type ProgressionCurveStats = {
  maxHp: number;
  damage: number;
  armor: number;
  regen: number;
};

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
