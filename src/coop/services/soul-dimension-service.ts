import { tables, type DbConnection } from "../../module_bindings";
import { cleanSoulStats, EMPTY_REWARD_KILLS, type RewardKillCounts, type SoulStats } from "../../../shared/soul-dimension";

/**
 * This account's Soul Dimension rows: its soul stats and its kills by reward
 * type (both caller-scoped views), and whether the dimension is open to
 * everyone yet (a public one-row table the developer switches).
 */
export function createSoulDimensionRows(connection: () => DbConnection | null, notify: () => void) {
  let soul: SoulStats | null = null;
  let kills: RewardKillCounts = { ...EMPTY_REWARD_KILLS };
  let open = false;

  function watch(current: DbConnection, isCurrent: () => boolean) {
    soul = null;
    kills = { ...EMPTY_REWARD_KILLS };
    open = false;
    const read = () => {
      if (!isCurrent()) return;
      const [soulRow] = [...current.db.mySoulStats.iter()];
      soul = soulRow ? cleanSoulStats(soulRow) : null;
      const [killRow] = [...current.db.myRewardKills.iter()];
      kills = killRow ? {
        damage: Number(killRow.damage), health: Number(killRow.health), armor: Number(killRow.armor),
        regen: Number(killRow.regen), speed: Number(killRow.speed),
      } : { ...EMPTY_REWARD_KILLS };
      open = Boolean(current.db.soulDimensionConfig.id.find(0)?.open);
      notify();
    };
    current.db.mySoulStats.onInsert(read); current.db.mySoulStats.onUpdate(read); current.db.mySoulStats.onDelete(read);
    current.db.myRewardKills.onInsert(read); current.db.myRewardKills.onUpdate(read); current.db.myRewardKills.onDelete(read);
    current.db.soulDimensionConfig.onInsert(read); current.db.soulDimensionConfig.onUpdate(read); current.db.soulDimensionConfig.onDelete(read);
    current.subscriptionBuilder().onApplied(read).subscribe([tables.mySoulStats, tables.myRewardKills, tables.soulDimensionConfig]);
  }

  return {
    watch,
    api: {
      /** Permanent soul stats as the server has them; null before any soul kill. */
      soulStats: (): SoulStats | null => soul,
      /** Campaign and Endless kills by reward type: what Soul Dimension tiers read. */
      rewardKills: (): RewardKillCounts => kills,
      /** Whether the developer has opened the Soul Dimension to everyone. */
      soulDimensionOpen: () => open,
      /** A fall into one of the village's wells: the server puts the player back on the square. */
      async fallIntoWell() {
        const current = connection();
        if (!current?.isActive) return false;
        await current.reducers.fallIntoWell({});
        return true;
      },
      /** Going through a village door, into its room or back out: the server moves the player if they are at it. */
      async useSoulDoor(door: number) {
        const current = connection();
        if (!current?.isActive) return false;
        await current.reducers.useSoulDoor({ door });
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
