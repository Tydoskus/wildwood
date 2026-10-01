import type { InferSchema, ReducerCtx } from "spacetimedb/server";
import type schema from "./index";
import { writeWideStats } from "./wide-stats";
import { narrowStat } from "../../shared/wide-stats";

/** Writes to the rows that make up a player's account state. These helpers used
 * to bump a replication revision for map shards; with sharding gone they are
 * plain table writes, kept so the many call sites address tables one way.
 */
type SnapshotTable = "player" | "playerProgress" | "playerProfile" | "playerResearch"
  | "playerAccountStatus" | "playerItemUpgrade" | "duel";
type Database = ReducerCtx<InferSchema<typeof schema>>["db"];
type Context = { db: Pick<Database, SnapshotTable> & Partial<Pick<Database, "playerWideStats">> };
type Row<T extends SnapshotTable> = Parameters<Database[T]["insert"]>[0];
const primaryKey = (table: SnapshotTable) => table === "duel" ? "id" : table === "playerItemUpgrade" ? "key" : "identity";

// f32 stat columns elsewhere: clamped so a value past f32's range stores as the limit, never Infinity.
const NARROWED: Partial<Record<SnapshotTable, readonly string[]>> = {
  player: ["hp", "maxHp"],
  duel: ["Hp", "MaxHp", "Damage", "Armor", "Regen", "DamageDealt", "Regened", "Blocked"].flatMap(stat => [`challenger${stat}`, `opponent${stat}`]),
};
// Progress stats past f32 go to player_wide_stats; player_progress keeps them clamped (wide-stats.ts).
const stored = <T extends SnapshotTable>(ctx: Context, table: T, row: Row<T>) => {
  if (table === "playerProgress") return writeWideStats(ctx, row as any) as Row<T>;
  const fields = NARROWED[table];
  if (!fields) return row;
  const next: any = { ...row };
  for (const field of fields) if (typeof next[field] === "number") next[field] = narrowStat(next[field]);
  return next as Row<T>;
};

/**
 * Returns the stored row (with any auto-assigned id); for progress, the row
 * with its wide stats, so a caller keeps the full values rather than the clamp.
 */
export function insertSnapshotRow<T extends SnapshotTable>(ctx: Context, table: T, row: Row<T>): Row<T> {
  const inserted = ctx.db[table].insert(stored(ctx, table, row) as never) as Row<T>;
  return table === "playerProgress" ? { ...inserted, ...row } : inserted;
}
export function updateSnapshotRow<T extends SnapshotTable>(ctx: Context, table: T, row: Row<T>) {
  const updated = (ctx.db[table] as any)[primaryKey(table)].update(stored(ctx, table, row));
  return table === "playerProgress" ? row : updated;
}
export function deleteSnapshotRow(ctx: Context, table: SnapshotTable, key: any) {
  if (table === "playerProgress" && ctx.db.playerWideStats?.identity.find(key)) ctx.db.playerWideStats.identity.delete(key);
  return (ctx.db[table] as any)[primaryKey(table)].delete(key);
}
