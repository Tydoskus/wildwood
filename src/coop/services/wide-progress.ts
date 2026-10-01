import { wideStatsApply } from "../../../shared/wide-stats";

type Identified = { identity: { toHexString(): string } };
type Stats = { maxHp: number; damage: number; armor: number; regen: number };
type Connection = { db: { playerWideStats?: { iter(): Iterable<Identified & Stats> } } };

/**
 * A player_progress row with its full-precision stats from player_wide_stats
 * laid over it, the same way the server reads it (shared/wide-stats.ts). The
 * table holds a row only for players past f32's range, so this is a scan of
 * almost nothing.
 */
export function withWideProgress<T extends Identified & Stats>(connection: Connection, row: T): T {
  const id = row.identity.toHexString();
  for (const wide of connection.db.playerWideStats?.iter() ?? []) {
    if (wide.identity.toHexString() === id) return wideStatsApply(row, wide);
  }
  return row;
}
