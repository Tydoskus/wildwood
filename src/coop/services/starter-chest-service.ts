import { tables, type DbConnection } from "../../module_bindings";
import type { StarterWeaponKind } from "../../../shared/starter-chest";
import { reducerErrorMessage } from "./reducer-errors";
import { withRequestDeadline } from "./request-deadline";
import { watchTables } from "./table-watch";

export type StarterChestResult = { ok: boolean; error?: string };

/**
 * Whether this account has opened the Starter Chest (my_starter_weapon), and the pick through claim_starter_weapon.
 * Until the row has been read the chest counts as opened, so a veteran never sees it flash.
 */
export function createStarterChestRows(notify: () => void) {
  let target: { connection: DbConnection; isCurrent: () => boolean } | null = null;
  let loaded = false, opened = false;

  function watch(connection: DbConnection, isCurrent: () => boolean) {
    target = { connection, isCurrent };
    loaded = false; opened = false;
    const read = () => {
      const next = [...connection.db.myStarterWeapon.iter()].length > 0;
      if (loaded && next === opened) return;
      loaded = true; opened = next;
      notify();
    };
    watchTables(connection, { what: "starter chest", isCurrent, listen: [connection.db.myStarterWeapon], queries: [tables.myStarterWeapon], read });
  }

  async function claim(kind: StarterWeaponKind): Promise<StarterChestResult> {
    const current = target;
    if (!current || !current.isCurrent() || !current.connection.isActive) return { ok: false, error: "Not Connected" };
    try {
      await withRequestDeadline(current.connection.reducers.claimStarterWeapon({ kind }));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: reducerErrorMessage(error) };
    }
  }

  return {
    watch,
    api: {
      /** True while the account's chest waits to be opened. */
      starterChestWaiting: () => loaded && !opened,
      claimStarterWeapon: claim,
    },
  };
}
