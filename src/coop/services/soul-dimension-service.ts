import { tables, type DbConnection } from "../../module_bindings";
import { cleanSoulLevel, cleanSoulStats, EMPTY_REWARD_KILLS, type RewardKillCounts, type SoulLevel, type SoulStats } from "../../../shared/soul-dimension";

/**
 * This account's Soul Dimension rows: its soul stats, Soul Level and kills by
 * reward type (caller-scoped views), and whether the dimension is open to
 * everyone yet (a public one-row table the developer switches).
 */
export function createSoulDimensionRows(connection: () => DbConnection | null, notify: () => void) {
  let soul: SoulStats | null = null;
  let level: SoulLevel | null = null;
  let kills: RewardKillCounts = { ...EMPTY_REWARD_KILLS };
  let open = false;

  function watch(current: DbConnection, isCurrent: () => boolean) {
    soul = null;
    level = null;
    kills = { ...EMPTY_REWARD_KILLS };
    open = false;
    const read = () => {
      if (!isCurrent()) return;
      const [soulRow] = [...current.db.mySoulStats.iter()];
      soul = soulRow ? cleanSoulStats(soulRow) : null;
      const [levelRow] = [...current.db.mySoulLevel.iter()];
      level = levelRow ? cleanSoulLevel(levelRow) : null;
      const killRow = current.db.playerRewardKills.identity.find(me);
      kills = killRow ? {
        damage: Number(killRow.damage), health: Number(killRow.health), armor: Number(killRow.armor),
        regen: Number(killRow.regen), speed: Number(killRow.speed),
      } : { ...EMPTY_REWARD_KILLS };
      // Open unless the developer's switch has closed it: no row is open.
      open = current.db.soulDimensionConfig.id.find(0)?.open ?? true;
      notify();
    };
    current.db.mySoulStats.onInsert(read); current.db.mySoulStats.onUpdate(read); current.db.mySoulStats.onDelete(read);
    const me = current.identity!;
    current.db.playerRewardKills.onInsert(read); current.db.playerRewardKills.onUpdate(read); current.db.playerRewardKills.onDelete(read);
    current.db.soulDimensionConfig.onInsert(read); current.db.soulDimensionConfig.onUpdate(read); current.db.soulDimensionConfig.onDelete(read);
    current.db.mySoulLevel.onInsert(read); current.db.mySoulLevel.onUpdate(read); current.db.mySoulLevel.onDelete(read);
    current.subscriptionBuilder().onApplied(read).subscribe([tables.mySoulStats, tables.playerRewardKills.where(row => row.identity.eq(me)), tables.soulDimensionConfig]);
    // Its own subscription, so a server without the view yet leaves the others working.
    current.subscriptionBuilder().onApplied(read).onError(() => {}).subscribe([tables.mySoulLevel]);
  }

  return {
    watch,
    api: {
      /** Permanent soul stats as the server has them; null before any soul kill. */
      soulStats: (): SoulStats | null => soul,
      /** The Soul Level and its Soul XP as the server has them; null before any soul kill. */
      soulLevel: (): SoulLevel | null => level,
      /** Campaign and Endless kills by reward type: what Soul Dimension tiers read. */
      rewardKills: (): RewardKillCounts => kills,
      /** Whether the developer has opened the Soul Dimension to everyone. */
      soulDimensionOpen: () => open,
      /** A fall into one of the Town's wells: the server puts the player back on the square. */
      async fallIntoWell() {
        const current = connection();
        if (!current?.isActive) return false;
        await current.reducers.fallIntoWell({});
        return true;
      },
      /** Going through a Town door, into its room or back out: the server moves the player if they are at it. */
      async useTownDoor(door: number) {
        const current = connection();
        if (!current?.isActive) return false;
        await current.reducers.useTownDoor({ door });
        return true;
      },
      /** Developer only: open the Soul Dimension to everyone who has prestiged, or close it. */
      async setSoulDimensionOpen(next: boolean) {
        const current = connection();
        if (!current?.isActive) return false;
        await current.reducers.setSoulDimensionOpen({ open: next });
        return true;
      },
    },
  };
}
