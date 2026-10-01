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

/**
 * Duel and replay stats past f32 (0.856). The duel row's id is auto-assigned
 * and keys its replay, riposte and combat snapshot, so the row stays where it
 * is and its stats past the limit ride in a companion row as JSON, the same
 * way player_wide_stats extends player_progress.
 */
const sides = (stats: readonly string[]) => stats.flatMap(stat => [`challenger${stat}`, `opponent${stat}`]);
export const DUEL_WIDE_FIELDS = sides(["Hp", "MaxHp", "Damage", "Armor", "Regen", "DamageDealt", "Regened", "Blocked"]);
export const REPLAY_WIDE_FIELDS = sides(["MaxHp", "Damage", "Armor", "Regen", "FinalHp", "DamageDealt", "Regened", "Blocked"]);

/** A row's named stats split: the row clamped for its f32 columns, and the full values when any passes the limit. */
export function splitWideFields<T extends Record<string, any>>(row: T, fields: readonly string[]) {
  const wide = fields.some(field => typeof row[field] === "number" && Math.abs(row[field]) > F32_STAT_LIMIT);
  const narrowed: Record<string, any> = { ...row };
  for (const field of fields) if (typeof narrowed[field] === "number") narrowed[field] = narrowStat(narrowed[field]);
  return { narrowed: narrowed as T, wideJson: wide ? JSON.stringify(Object.fromEntries(fields.map(field => [field, row[field]]))) : "" };
}

/** The row with its stored full values laid back on, field by field, wherever they still agree with the clamp. */
export function applyWideFields<T extends Record<string, any>>(row: T, wideJson: string | null | undefined, fields: readonly string[]): T {
  if (!wideJson) return row;
  let wide: Record<string, unknown>;
  try { wide = JSON.parse(wideJson); } catch { return row; }
  const next: Record<string, any> = { ...row };
  for (const field of fields) {
    const value = wide[field];
    if (typeof value === "number" && typeof row[field] === "number" && Math.fround(narrowStat(value)) === Math.fround(row[field])) next[field] = value;
  }
  return next as T;
}

/** Whether any of the row's named stats sits at the clamp, so a stored full value could be behind it. */
export function atWideClamp(row: Record<string, any>, fields: readonly string[]) {
  return fields.some(field => typeof row[field] === "number" && Math.fround(row[field]) >= Math.fround(F32_STAT_LIMIT));
}
