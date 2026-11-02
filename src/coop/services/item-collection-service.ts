import { tables, type DbConnection } from "../../module_bindings";
import { watchTables } from "./table-watch";

/** Every item this account has had drop, from its own player_item_collection rows (the map window's Gear Collection). */
export function createItemCollectionRows(notify: () => void) {
  let collected: ReadonlySet<string> = new Set();
  function watch(connection: DbConnection, isCurrent: () => boolean) {
    collected = new Set();
    const read = () => {
      collected = new Set([...connection.db.playerItemCollection.iter()].filter(row => row.identity.isEqual(me)).map(row => row.itemId));
      notify();
    };
    const me = connection.identity!;
    watchTables(connection, {
      what: "item collection", isCurrent, listen: [connection.db.playerItemCollection], changes: ["insert", "delete"],
      queries: [tables.playerItemCollection.where(row => row.identity.eq(me))], read,
    });
  }
  return { watch, api: { collectedItems: (): ReadonlySet<string> => collected } };
}
