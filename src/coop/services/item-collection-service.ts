import { tables, type DbConnection } from "../../module_bindings";

/** Every item this account has had drop, from its own player_item_collection rows (the map window's Gear Collection). */
export function createItemCollectionRows(notify: () => void) {
  let collected: ReadonlySet<string> = new Set();
  function watch(connection: DbConnection, isCurrent: () => boolean) {
    collected = new Set();
    const read = () => {
      if (!isCurrent()) return;
      collected = new Set([...connection.db.playerItemCollection.iter()].filter(row => row.identity.isEqual(me)).map(row => row.itemId));
      notify();
    };
    const me = connection.identity!;
    connection.db.playerItemCollection.onInsert(read); connection.db.playerItemCollection.onDelete(read);
    connection.subscriptionBuilder().onApplied(read).subscribe([tables.playerItemCollection.where(row => row.identity.eq(me))]);
  }
  return { watch, api: { collectedItems: (): ReadonlySet<string> => collected } };
}
