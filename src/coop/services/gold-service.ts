import { tables, type DbConnection } from "../../module_bindings";
import { watchTables } from "./table-watch";

/** This account's gold (player_gold, its own row); no row means none. */
export function createGoldRows(notify: () => void) {
  let gold = 0n;

  function watch(connection: DbConnection, isCurrent: () => boolean) {
    gold = 0n;
    const read = () => {
      let next = 0n;
      for (const row of connection.db.playerGold.iter()) if (row.identity.isEqual(me)) next = row.gold;
      if (next === gold) return;
      gold = next;
      notify();
    };
    const me = connection.identity!;
    watchTables(connection, { what: "gold", isCurrent, listen: [connection.db.playerGold], queries: [tables.playerGold.where(row => row.identity.eq(me))], read });
  }

  return {
    watch,
    api: {
      gold: (): bigint => gold,
    },
  };
}
