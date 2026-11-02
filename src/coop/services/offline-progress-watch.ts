import { tables, type DbConnection } from "../../module_bindings";
import { watchTables } from "./table-watch";
export type { OfflineActivity } from "../../../shared/offline-gathering";

export type OfflineProgressSummary = {
  mapId: string;
  seconds: number;
  kills: number;
  damage: number;
  health: number;
  armor: number;
  regen: number;
  attackSpeed: number;
  /** Nothing was earned: no unlocked map was survivable for the full window. */
  blocked: boolean;
  /** The mining and chopping on offer beside the fight; absent on a summary that was paid as a fight already. */
  choice?: OfflineGatherChoice;
};

export type OfflineGatherChoice = {
  rocks: number;
  miningGain: number;
  mineOres: Record<string, number>;
  trees: number;
  woodcuttingGain: number;
  chopOres: Record<string, number>;
};

function parseOres(json: string): Record<string, number> {
  try {
    const value = JSON.parse(json);
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

/**
 * Watches for the one summary the server leaves behind on world entry.
 *
 * The row exists only while it is unread, so the subscription is quiet for the
 * rest of the session: nothing is written to this table while playing.
 */
export function watchOfflineProgress(
  connection: DbConnection,
  isCurrent: () => boolean,
  present: (summary: OfflineProgressSummary) => void,
) {
  const seen = new Set<string>();
  const apply = () => {
    const row = [...connection.db.myOfflineProgress.iter()][0];
    if (!row) return;
    const gather = [...connection.db.myOfflineGatherChoice.iter()].find(entry => entry.grantedAtMicros === row.grantedAtMicros);
    // World entry can be retried; the same grant must open one summary. Its choice may arrive a moment after it.
    const key = `${row.grantedAtMicros}:${Boolean(gather)}`;
    if (seen.has(key)) return;
    seen.add(key);
    present({
      mapId: row.mapId, seconds: row.seconds, kills: row.kills,
      damage: row.damage, health: row.health, armor: row.armor,
      regen: row.regen, attackSpeed: row.attackSpeed, blocked: row.blocked,
      choice: gather && {
        rocks: gather.rocks, miningGain: gather.miningGain, mineOres: parseOres(gather.mineOres),
        trees: gather.trees, woodcuttingGain: gather.woodcuttingGain, chopOres: parseOres(gather.chopOres),
      },
    });
  };
  watchTables(connection, {
    what: "offline progress", isCurrent, listen: [connection.db.myOfflineProgress, connection.db.myOfflineGatherChoice],
    changes: ["insert", "update"], queries: [tables.myOfflineProgress, tables.myOfflineGatherChoice], read: apply,
  });
}

/**
 * The account's opt-out. A missing row means on, which is the default and what
 * almost every account has, so no row needs adding.
 */
export function watchOfflineProgressPreference(connection: DbConnection, isCurrent: () => boolean, present: (enabled: boolean) => void) {
  const read = () => present([...connection.db.myOfflinePreference.iter()][0]?.enabled ?? true);
  watchTables(connection, { what: "offline preference", isCurrent, listen: [connection.db.myOfflinePreference], queries: [tables.myOfflinePreference], read });
}

/**
 * The opt-out as the coop API serves it: mirrored so settings can render
 * before a row arrives, and shown immediately when changed. A change the
 * server refuses (another tab holds the session, a reconnect) puts the switch
 * back to what the server has: the subscription never corrects it, since the
 * row did not change.
 */
export function createOfflineProgressPreference(connection: () => DbConnection | null, notify: () => void) {
  let enabled = true;
  return {
    watch(current: DbConnection, isCurrent: () => boolean) {
      watchOfflineProgressPreference(current, isCurrent, next => {
        enabled = next;
        notify();
      });
    },
    api: {
      offlineProgressEnabled: () => enabled,
      async setOfflineProgressEnabled(next: boolean) {
        const current = connection();
        if (!current?.isActive) return false;
        enabled = next;
        notify();
        try {
          await current.reducers.setOfflineProgressEnabled({ enabled: next });
          return true;
        } catch (error) {
          enabled = [...current.db.myOfflinePreference.iter()][0]?.enabled ?? true;
          notify();
          console.warn("WildStat offline progress setting was not saved:", error);
          return false;
        }
      },
    },
  };
}
