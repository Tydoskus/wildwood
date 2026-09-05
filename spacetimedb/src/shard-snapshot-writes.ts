import type { InferSchema, ReducerCtx } from "spacetimedb/server";
import type schema from "./index";

/** All mutations of snapshot source rows go through these helpers. The compact
 * revision exists only after a player is first replicated; offline accounts and
 * regional replicas do not acquire revision rows. No process-local cache is used.
 */
type SnapshotTable = "player" | "playerProgress" | "playerProfile" | "playerResearch"
  | "playerAccountStatus" | "playerItemUpgrade" | "duel";
type Database = ReducerCtx<InferSchema<typeof schema>>["db"];
type Context = { db: Pick<Database, SnapshotTable | "shardSnapshotState"> };
type Row<T extends SnapshotTable> = Parameters<Database[T]["insert"]>[0];
const primaryKey = (table: SnapshotTable) => table === "duel" ? "id" : table === "playerItemUpgrade" ? "key" : "identity";

function invalidate(ctx: Context, table: SnapshotTable, row: any) {
  if (!row) return;
  const identities = table === "duel" ? [row.challenger, row.opponent] : [row.identity];
  for (const identity of identities) {
    if (!identity) continue;
    const state = ctx.db.shardSnapshotState.identity.find(identity);
    if (state) ctx.db.shardSnapshotState.identity.update({ ...state, revision: state.revision + 1n });
  }
}

export function insertSnapshotRow<T extends SnapshotTable>(ctx: Context, table: T, row: Row<T>): Row<T> {
  const result = ctx.db[table].insert(row as never) as Row<T>;
  invalidate(ctx, table, result);
  return result;
}
export function updateSnapshotRow<T extends SnapshotTable>(ctx: Context, table: T, row: Row<T>) {
  const result = (ctx.db[table] as any)[primaryKey(table)].update(row);
  invalidate(ctx, table, row);
  return result;
}
export function deleteSnapshotRow(ctx: Context, table: SnapshotTable, key: any) {
  const index = (ctx.db[table] as any)[primaryKey(table)];
  const row = table === "duel" || table === "playerItemUpgrade" ? index.find(key) : { identity: key };
  const result = index.delete(key);
  if (result) invalidate(ctx, table, row);
  return result;
}
