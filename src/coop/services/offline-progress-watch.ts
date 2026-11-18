import { tables, type DbConnection } from "../../module_bindings";
import { watchTables } from "./table-watch";
import type { OfflineActivity } from "../../../shared/offline-gathering";
export type { OfflineActivity };

export type OfflineProgressSummary = {
  /** Identifies this server grant so dismissing or collecting it never re-opens a stale copy. */
  grantedAtMicros?: string;
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
  /** The mining, chopping and fishing on offer beside the fight; absent on a summary that was paid as a fight already. */
  choice?: OfflineGatherChoice;
};

export type OfflineFishingChoice = {
  catches: number;
  experienceGain: number;
  fishOres: Record<string, number>;
};

export type OfflineGatherChoice = {
  rocks: number;
  miningGain: number;
  mineOres: Record<string, number>;
  trees: number;
  woodcuttingGain: number;
  chopOres: Record<string, number>;
  fishing?: OfflineFishingChoice;
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
 * Listens for deletes too and never downgrades a grant whose choice already arrived,
 * so collecting cannot flash a zombie summary back onto the screen.
 */
export function watchOfflineProgress(
  connection: DbConnection,
  isCurrent: () => boolean,
  present: (summary: OfflineProgressSummary | null) => void,
  isAcknowledged?: (grantedAtMicros: string) => boolean,
) {
  /** Highest completeness seen per grant: 0 = fight only, 1 = gather choice, 2 = gather + fishing choice. */
  const seenRank = new Map<string, number>();
  const apply = () => {
    const row = [...connection.db.myOfflineProgress.iter()][0];
    if (!row) { present(null); return; }
    const grantKey = String(row.grantedAtMicros);
    if (isAcknowledged?.(grantKey)) { present(null); return; }
    const gather = [...connection.db.myOfflineGatherChoice.iter()].find(entry => entry.grantedAtMicros === row.grantedAtMicros);
    const fishing = [...connection.db.myOfflineFishingChoice.iter()].find(entry => entry.grantedAtMicros === row.grantedAtMicros);
    const rank = gather ? (fishing ? 2 : 1) : 0;
    const prev = seenRank.get(grantKey);
    if (prev !== undefined && rank <= prev) return;
    seenRank.set(grantKey, rank);
    present({
      grantedAtMicros: grantKey,
      mapId: row.mapId, seconds: row.seconds, kills: row.kills,
      damage: row.damage, health: row.health, armor: row.armor,
      regen: row.regen, attackSpeed: row.attackSpeed, blocked: row.blocked,
      choice: gather && {
        rocks: gather.rocks, miningGain: gather.miningGain, mineOres: parseOres(gather.mineOres),
        trees: gather.trees, woodcuttingGain: gather.woodcuttingGain, chopOres: parseOres(gather.chopOres),
        ...(fishing ? {
          fishing: { catches: fishing.catches, experienceGain: fishing.experienceGain, fishOres: parseOres(fishing.fishOres) },
        } : {}),
      },
    });
  };
  watchTables(connection, {
    what: "offline progress", isCurrent,
    listen: [connection.db.myOfflineProgress, connection.db.myOfflineGatherChoice, connection.db.myOfflineFishingChoice],
    changes: ["insert", "update", "delete"],
    queries: [tables.myOfflineProgress, tables.myOfflineGatherChoice, tables.myOfflineFishingChoice],
    read: apply,
  });
}

/** Holds the waiting offline summary for the coop facade and guarantees an acknowledged grant never re-opens. */
export function createOfflineProgressService(connection: () => DbConnection | null, notify: () => void) {
  let pending: OfflineProgressSummary | null = null;
  const acknowledged = new Set<string>();
  return {
    watch(current: DbConnection, isCurrent: () => boolean) {
      pending = null;
      watchOfflineProgress(current, isCurrent, summary => {
        pending = summary;
        notify();
      }, grantKey => acknowledged.has(grantKey));
    },
    api: {
      pendingOfflineProgress: () => pending,
      async acknowledgeOfflineProgress(activity: OfflineActivity = "fight") {
        const grantKey = pending?.grantedAtMicros;
        const current = connection();
        if (current?.isActive) await current.reducers.collectOfflineProgressAs({ activity });
        if (grantKey) acknowledged.add(grantKey);
        pending = null;
        notify();
      },
    },
  };
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
