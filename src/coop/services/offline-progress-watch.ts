import { tables, type DbConnection } from "../../module_bindings";

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
};

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
  const apply = (row: OfflineProgressSummary & { grantedAtMicros: bigint }) => {
    if (!isCurrent()) return;
    // World entry can be retried; the same grant must open one summary.
    const key = String(row.grantedAtMicros);
    if (seen.has(key)) return;
    seen.add(key);
    present({
      mapId: row.mapId, seconds: row.seconds, kills: row.kills,
      damage: row.damage, health: row.health, armor: row.armor,
      regen: row.regen, attackSpeed: row.attackSpeed, blocked: row.blocked,
    });
  };
  connection.db.myOfflineProgress.onInsert((_ctx, row) => apply(row));
  connection.db.myOfflineProgress.onUpdate((_ctx, _old, row) => apply(row));
  connection.subscriptionBuilder().onApplied(() => {
    for (const row of connection.db.myOfflineProgress.iter()) apply(row);
  }).subscribe([tables.myOfflineProgress]);
}

/**
 * The account's opt-out. A missing row means on, which is the default and what
 * almost every account will have, so nothing was migrated to add it.
 */
export function watchOfflineProgressPreference(connection: DbConnection, present: (enabled: boolean) => void) {
  const read = () => present([...connection.db.myOfflinePreference.iter()][0]?.enabled ?? true);
  connection.db.myOfflinePreference.onInsert(read);
  connection.db.myOfflinePreference.onUpdate(read);
  connection.db.myOfflinePreference.onDelete(read);
  connection.subscriptionBuilder().onApplied(read).subscribe([tables.myOfflinePreference]);
}

/**
 * The opt-out as the coop API serves it: mirrored so settings can render
 * before a row arrives, and shown immediately when changed, with the
 * subscription correcting it if the server disagrees.
 */
export function createOfflineProgressPreference(connection: () => DbConnection | null, notify: () => void) {
  let enabled = true;
  return {
    watch(current: DbConnection, isCurrent: () => boolean) {
      watchOfflineProgressPreference(current, next => {
        if (!isCurrent()) return;
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
        await current.reducers.setOfflineProgressEnabled({ enabled: next });
        return true;
      },
    },
  };
}
