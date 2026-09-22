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
