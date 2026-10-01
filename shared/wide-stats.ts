/**
 * Stats past f32's range (0.855). Several tables store combat stats as f32,
 * finite only to about 3.4e38; a value is clamped to F32_STAT_LIMIT there, and
 * player_progress's full value lives in player_wide_stats (spacetimedb/src/wide-stats.ts).
 * The client lays that row back over its progress the same way the server does.
 */
export const F32_STAT_LIMIT = 3e38;
export const WIDE_STAT_FIELDS = ["maxHp", "damage", "armor", "regen"] as const;
type Stats = { maxHp: number; damage: number; armor: number; regen: number };

/** A stat as an f32 column can hold it: finite and at most the limit. */
export function narrowStat(value: number) {
  if (!Number.isFinite(value)) return value > 0 ? F32_STAT_LIMIT : 0;
  return Math.max(-F32_STAT_LIMIT, Math.min(F32_STAT_LIMIT, value));
}

/** Whether any stat is past what f32 can hold. */
export function needsWideStats(row: Stats) {
  return WIDE_STAT_FIELDS.some(field => row[field] > F32_STAT_LIMIT);
}

/**
 * The progress row with the wide row's values, field by field, wherever the
 * wide value still agrees with the stored f32 one; anything written to the f32
 * column since wins.
 */
export function wideStatsApply<T extends Stats>(row: T, wide: Stats | null | undefined): T {
  if (!wide) return row;
  const next = { ...row };
  for (const field of WIDE_STAT_FIELDS) {
    if (Math.fround(narrowStat(wide[field])) === Math.fround(row[field])) next[field] = wide[field] as T[typeof field];
  }
  return next;
}
