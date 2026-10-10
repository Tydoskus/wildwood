import { DUEL_WIDE_FIELDS, REPLAY_WIDE_FIELDS, applyWideFields, wideStatsApply } from "../../../shared/wide-stats";

type Identified = { identity: { toHexString(): string } };
type Stats = { maxHp: number; damage: number; armor: number; regen: number };
type Connection = { db: {
  playerWideStats?: { iter(): Iterable<Identified & Stats> };
  playerCombatRating?: { iter(): Iterable<Identified & { critDamage: number }> };
} };

/**
 * A player_progress row with its full-precision stats from player_wide_stats
 * laid over it, the same way the server reads it (shared/wide-stats.ts), and
 * the run's crit rating from player_combat_rating (0 without a row). Both
 * tables hold rows for few players, so these are scans of almost nothing.
 */
export function withWideProgress<T extends Identified & Stats>(connection: Connection, row: T): T & { critRating: number } {
  const id = row.identity.toHexString();
  let critRating = 0;
  for (const rating of connection.db.playerCombatRating?.iter() ?? []) {
    if (rating.identity.toHexString() === id) { critRating = rating.critDamage; break; }
  }
  for (const wide of connection.db.playerWideStats?.iter() ?? []) {
    if (wide.identity.toHexString() === id) return { ...wideStatsApply(row, wide), critRating };
  }
  return { ...row, critRating };
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
