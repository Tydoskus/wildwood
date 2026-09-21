import type { InferSchema, ReducerCtx } from "spacetimedb/server";
import type schema from "./index";

/** Writes to the rows that make up a player's account state. These helpers used
 * to bump a replication revision for map shards; with sharding gone they are
 * plain table writes, kept so the many call sites address tables one way.
 */
type SnapshotTable = "player" | "playerProgress" | "playerProfile" | "playerResearch"
  | "playerAccountStatus" | "playerItemUpgrade" | "duel";
type Database = ReducerCtx<InferSchema<typeof schema>>["db"];
type Context = { db: Pick<Database, SnapshotTable> };
type Row<T extends SnapshotTable> = Parameters<Database[T]["insert"]>[0];
const primaryKey = (table: SnapshotTable) => table === "duel" ? "id" : table === "playerItemUpgrade" ? "key" : "identity";

export function insertSnapshotRow<T extends SnapshotTable>(ctx: Context, table: T, row: Row<T>): Row<T> {
  return ctx.db[table].insert(row as never) as Row<T>;
}
export function updateSnapshotRow<T extends SnapshotTable>(ctx: Context, table: T, row: Row<T>) {
  return (ctx.db[table] as any)[primaryKey(table)].update(row);
}
export function deleteSnapshotRow(ctx: Context, table: SnapshotTable, key: any) {
  return (ctx.db[table] as any)[primaryKey(table)].delete(key);
}
