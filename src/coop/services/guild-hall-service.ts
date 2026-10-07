import { tables, type DbConnection } from "../../module_bindings";
import { parseGuildHallLevels, type GuildHallLevels, type GuildHallPart } from "../../../shared/guild-hall";

export type GuildHallState = { guildId: string; fund: number; spent: number; levels: GuildHallLevels };

/**
 * This account's guild hall: its guild's hall row (fund and upgrade levels)
 * through the caller-scoped my_guild_hall view, empty without a guild; and the
 * hall's two reducers, an upgrade and the door.
 */
export function createGuildHallRows(connection: () => DbConnection | null, notify: () => void) {
  let hall: GuildHallState | null = null;

  function watch(current: DbConnection, isCurrent: () => boolean) {
    hall = null;
    const read = () => {
      if (!isCurrent()) return;
      const [row] = [...current.db.myGuildHall.iter()];
      hall = row ? { guildId: String(row.guildId), fund: row.fund, spent: row.spent, levels: parseGuildHallLevels(row.levels) } : null;
      notify();
    };
    current.db.myGuildHall.onInsert(read); current.db.myGuildHall.onUpdate(read); current.db.myGuildHall.onDelete(read);
    current.subscriptionBuilder().onApplied(read).subscribe([tables.myGuildHall]);
  }

  return {
    watch,
    api: {
      /** The player's guild's hall as the server has it; null without a guild. */
      guildHall: (): GuildHallState | null => hall,
      /** The President or a Vice President buys a part's next level from the hall fund. */
      async upgradeGuildHall(part: GuildHallPart) {
        const current = connection();
        if (!current?.isActive) return false;
        await current.reducers.upgradeGuildHall({ part });
        return true;
      },
      /** Through the hall's door, in or out: the server moves the player if they are at it. */
      async useGuildHallDoor() {
        const current = connection();
        if (!current?.isActive) return false;
        await current.reducers.useGuildHallDoor({});
        return true;
      },
    },
  };
}
