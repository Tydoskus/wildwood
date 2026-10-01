import { DUEL_WIDE_FIELDS, REPLAY_WIDE_FIELDS, applyWideFields, wideStatsApply } from "../../../shared/wide-stats";

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

type WideRows = { iter(): Iterable<{ statsJson: string } & Record<string, any>> };

/** A duel row with its stats past f32 from duel_wide_stats laid over it, as the server reads it. */
export function withWideDuel<T extends { id: bigint } & Record<string, any>>(connection: { db: { duelWideStats?: WideRows } }, row: T): T {
  for (const wide of connection.db.duelWideStats?.iter() ?? []) if (wide.duelId === row.id) return applyWideFields(row, wide.statsJson, DUEL_WIDE_FIELDS);
  return row;
}

/** A replay row with its stats past f32 from duel_replay_wide_stats laid over it. */
export function withWideReplay<T extends { id: bigint } & Record<string, any>>(connection: { db: { duelReplayWideStats?: WideRows } }, row: T): T {
  for (const wide of connection.db.duelReplayWideStats?.iter() ?? []) if (wide.replayId === row.id) return applyWideFields(row, wide.statsJson, REPLAY_WIDE_FIELDS);
  return row;
}
