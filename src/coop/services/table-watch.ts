import type { RowTypedQuery } from "spacetimedb";
import type { DbConnection, EventContext, SubscriptionHandle } from "../../module_bindings";
import { recordConnectionDiagnostic } from "./connection-diagnostic-runtime";

/** A client table by its accessor name, and the row type the bindings give it. */
export type TableName = keyof DbConnection["db"];
export type TableRow<Name extends TableName> = DbConnection["db"][Name] extends { iter(): Iterator<infer Row> } ? Row : never;

export type TableChange = "insert" | "update" | "delete";
type Query = RowTypedQuery<any, any>;
/** Any client table: tables without a primary key have no update event, event tables no delete. */
type ChangingTable = {
  onInsert(callback: (ctx: EventContext, row: unknown) => void): void;
  onUpdate?(callback: (ctx: EventContext, oldRow: unknown, newRow: unknown) => void): void;
  onDelete?(callback: (ctx: EventContext, row: unknown) => void): void;
};
const EVERY_CHANGE: readonly TableChange[] = ["insert", "update", "delete"];

/** Runs onChange, while current, on each listed change to any of the tables. */
export function onTableChange(tables: readonly ChangingTable[], isCurrent: () => boolean,
  onChange: (ctx: EventContext) => void, changes: readonly TableChange[] = EVERY_CHANGE) {
  const changed = (ctx: EventContext) => { if (isCurrent()) onChange(ctx); };
  for (const table of tables) {
    if (changes.includes("insert")) table.onInsert(changed);
    if (changes.includes("update")) table.onUpdate?.(changed);
    if (changes.includes("delete")) table.onDelete?.(changed);
  }
}

/** Says, while current, that a subscription failed, so an empty value is not silent. */
export function reportSubscriptionError(what: string, isCurrent: () => boolean, error: unknown) {
  if (!isCurrent()) return;
  console.warn(`WildStat ${what} subscription failed:`, error);
  const message = error instanceof Error ? error.message : String(error ?? "");
  recordConnectionDiagnostic("subscription-error", { detail: `${what}: ${message}` });
}

/** Subscribes to the queries; onApplied runs while current, and a failure is always reported. */
export function subscribeTables(connection: DbConnection, what: string, isCurrent: () => boolean,
  queries: readonly Query[], onApplied: () => void): SubscriptionHandle {
  return connection.subscriptionBuilder()
    .onApplied(() => { if (isCurrent()) onApplied(); })
    .onError(ctx => reportSubscriptionError(what, isCurrent, ctx.event))
    .subscribe([...queries]);
}

/** One subscription whose tables are read again once it settles and on every change. */
export function watchTables(connection: DbConnection, watch: {
  what: string; isCurrent: () => boolean; listen: readonly ChangingTable[]; queries: readonly Query[];
  read: (ctx?: EventContext) => void; changes?: readonly TableChange[];
}): SubscriptionHandle {
  onTableChange(watch.listen, watch.isCurrent, watch.read, watch.changes);
  return subscribeTables(connection, watch.what, watch.isCurrent, watch.queries, () => watch.read());
}
