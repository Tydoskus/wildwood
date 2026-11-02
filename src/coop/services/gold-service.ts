import { tables, type DbConnection } from "../../module_bindings";

/** This account's gold (player_gold, its own row); no row means none. */
export function createGoldRows(notify: () => void) {
  let gold = 0n;

  function watch(connection: DbConnection, isCurrent: () => boolean) {
    gold = 0n;
    const read = () => {
      if (!isCurrent()) return;
      let next = 0n;
      for (const row of connection.db.playerGold.iter()) if (row.identity.isEqual(me)) next = row.gold;
      if (next === gold) return;
      gold = next;
      notify();
    };
    const me = connection.identity!;
    connection.db.playerGold.onInsert(read); connection.db.playerGold.onUpdate(read); connection.db.playerGold.onDelete(read);
    connection.subscriptionBuilder().onApplied(read).subscribe([tables.playerGold.where(row => row.identity.eq(me))]);
  }

  return {
    watch,
    api: {
      gold: (): bigint => gold,
    },
  };
}
