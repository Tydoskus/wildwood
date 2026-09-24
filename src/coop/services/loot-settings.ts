import { tables, type DbConnection } from "../../module_bindings";
import { reducerErrorMessage } from "./reducer-errors";

export type LootSettings = { autoKeepBest: boolean; autoEquipBest: boolean };
export type LootSettingsResult = { ok: boolean; error?: string };

type Target = { connection: DbConnection; isCurrent: () => boolean };

/** What an account that never chose has: both on, the server's default too. */
export const DEFAULT_LOOT_SETTINGS: LootSettings = Object.freeze({ autoKeepBest: true, autoEquipBest: true });

/**
 * This account's loot automation, from the caller-scoped my_loot_settings
 * view: Auto keep best (duplicates settle themselves, the better skill roll is
 * kept) and Auto equip upgrades. No row means both are on. The server acts on
 * them; the client only shows the switches and sends the player's changes.
 */
export function createLootSettings(notify: () => void) {
  let target: Target | null = null;
  let settings: LootSettings = DEFAULT_LOOT_SETTINGS;

  /**
   * Follows the view's row on a new connection. The caller subscribes to
   * `table` in its own subscription and calls the returned read once that
   * subscription settles.
   */
  function watch(connection: DbConnection, isCurrent: () => boolean) {
    target = { connection, isCurrent };
    settings = DEFAULT_LOOT_SETTINGS;
    const read = () => {
      if (!isCurrent()) return;
      const [row] = [...connection.db.myLootSettings.iter()];
      settings = row ? { autoKeepBest: row.autoKeepBest, autoEquipBest: row.autoEquipBest } : DEFAULT_LOOT_SETTINGS;
      notify();
    };
    connection.db.myLootSettings.onInsert(read);
    connection.db.myLootSettings.onUpdate(read);
    connection.db.myLootSettings.onDelete(read);
    return read;
  }

  async function setLootSettings(next: LootSettings): Promise<LootSettingsResult> {
    const current = target;
    if (!current || !current.isCurrent() || !current.connection.isActive) return { ok: false, error: "NOT CONNECTED" };
    try {
      await current.connection.reducers.setLootSettings({ autoKeepBest: next.autoKeepBest, autoEquipBest: next.autoEquipBest });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: reducerErrorMessage(error) };
    }
  }

  return {
    watch,
    table: tables.myLootSettings,
    api: {
      /** Auto keep best and Auto equip upgrades, as the server has them. */
      lootSettings: (): LootSettings => settings,
      setLootSettings,
    },
  };
}
