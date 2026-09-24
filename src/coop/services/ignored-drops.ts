import { tables, type DbConnection } from "../../module_bindings";
import { reducerErrorMessage } from "./reducer-errors";

export type IgnoredDropsResult = { ok: boolean; error?: string };

type Target = { connection: DbConnection; isCurrent: () => boolean };

/**
 * This account's loot filter, from the caller-scoped my_ignored_drops view:
 * slot entries (`slot:HAND` and so on) and item ids that are turned off, and
 * the reducer that changes them. The server never drops what the filter turns
 * off; the client only shows the list and sends the player's changes.
 */
export function createIgnoredDrops(notify: () => void) {
  let target: Target | null = null;
  let ignored: ReadonlySet<string> = new Set();

  /**
   * Follows the view's rows on a new connection. The caller subscribes to
   * `table` in its own subscription, beside the offers these rows act on,
   * and calls the returned read once that subscription settles.
   */
  function watch(connection: DbConnection, isCurrent: () => boolean) {
    target = { connection, isCurrent };
    ignored = new Set();
    const read = () => {
      if (!isCurrent()) return;
      ignored = new Set([...connection.db.myIgnoredDrops.iter()].map(row => row.itemId));
      notify();
    };
    connection.db.myIgnoredDrops.onInsert(read);
    connection.db.myIgnoredDrops.onUpdate(read);
    connection.db.myIgnoredDrops.onDelete(read);
    return read;
  }

  async function setIgnoredDrops(itemIds: readonly string[], value: boolean): Promise<IgnoredDropsResult> {
    const current = target;
    if (!current || !current.isCurrent() || !current.connection.isActive) return { ok: false, error: "NOT CONNECTED" };
    try {
      await current.connection.reducers.setIgnoredDrops({ itemIds: [...itemIds], ignored: value });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: reducerErrorMessage(error) };
    }
  }

  return {
    watch,
    table: tables.myIgnoredDrops,
    api: {
      /** Loot filter entries turned off: `slot:<SLOT>` for a whole slot, or an item id. */
      ignoredDrops: (): ReadonlySet<string> => ignored,
      setIgnoredDrops,
    },
  };
}
