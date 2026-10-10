import type { InferSchema, ReducerCtx } from "spacetimedb/server";
import type schema from "./index";
import { deleteDuelWide, writeDuelWide, writeDuelWideAfterInsert, writeWideStats } from "./wide-stats";
import { DUEL_WIDE_FIELDS, narrowStat } from "../../shared/wide-stats";

/** Writes to the rows that make up a player's account state. These helpers used
 * to bump a replication revision for map shards; with sharding gone they are
 * plain table writes, kept so the many call sites address tables one way.
 */
type SnapshotTable = "player" | "playerProgress" | "playerProfile" | "playerResearch"
  | "playerAccountStatus" | "playerItemUpgrade" | "duel";
type Database = ReducerCtx<InferSchema<typeof schema>>["db"];
type Context = { db: Pick<Database, SnapshotTable> & Partial<Pick<Database, "playerWideStats" | "playerCombatRating" | "duelWideStats">> };
type Row<T extends SnapshotTable> = Parameters<Database[T]["insert"]>[0];
const primaryKey = (table: SnapshotTable) => table === "duel" ? "id" : table === "playerItemUpgrade" ? "key" : "identity";

// f32 stat columns elsewhere: clamped so a value past f32's range stores as the limit, never Infinity.
const NARROWED: Partial<Record<SnapshotTable, readonly string[]>> = { player: ["hp", "maxHp"] };
// Progress and duel stats past f32 go to their companion rows; the tables keep them clamped (wide-stats.ts).
const stored = <T extends SnapshotTable>(ctx: Context, table: T, row: Row<T>) => {
  if (table === "playerProgress") return writeWideStats(ctx, row as any) as Row<T>;
  if (table === "duel") return writeDuelWide(ctx, row as any) as Row<T>;
  const fields = NARROWED[table];
  if (!fields) return row;
  const next: any = { ...row };
  for (const field of fields) if (typeof next[field] === "number") next[field] = narrowStat(next[field]);
  return next as Row<T>;
};

const pickStats = (row: Record<string, any>) => Object.fromEntries(DUEL_WIDE_FIELDS.map(field => [field, row[field]]));

/**
 * Returns the stored row (with any auto-assigned id); for progress, the row
 * with its wide stats, so a caller keeps the full values rather than the clamp.
 */
export function insertSnapshotRow<T extends SnapshotTable>(ctx: Context, table: T, row: Row<T>): Row<T> {
  const inserted = ctx.db[table].insert(stored(ctx, table, row) as never) as Row<T>;
  // A new duel's id exists only now; its companion row follows it.
  if (table === "duel") { writeDuelWideAfterInsert(ctx, inserted as any, row as any); return { ...row, ...inserted, ...pickStats(row) } as Row<T>; }
  return table === "playerProgress" ? { ...inserted, ...row } : inserted;
}
export function updateSnapshotRow<T extends SnapshotTable>(ctx: Context, table: T, row: Row<T>) {
  const updated = (ctx.db[table] as any)[primaryKey(table)].update(stored(ctx, table, row));
  return table === "playerProgress" || table === "duel" ? row : updated;
}
export function deleteSnapshotRow(ctx: Context, table: SnapshotTable, key: any) {
  if (table === "playerProgress" && ctx.db.playerWideStats?.identity.find(key)) ctx.db.playerWideStats.identity.delete(key);
  if (table === "playerProgress" && ctx.db.playerCombatRating?.identity.find(key)) ctx.db.playerCombatRating.identity.delete(key);
  if (table === "duel") deleteDuelWide(ctx, key);
  return (ctx.db[table] as any)[primaryKey(table)].delete(key);
}
