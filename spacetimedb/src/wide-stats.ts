import { DUEL_WIDE_FIELDS, F32_STAT_LIMIT, REPLAY_WIDE_FIELDS, WIDE_STAT_FIELDS, applyWideFields, atWideClamp, narrowStat, needsWideStats, splitWideFields, wideStatsApply } from "../../shared/wide-stats";

/**
 * Full-precision combat stats for players past what player_progress can hold.
 *
 * player_progress keeps maxHp, damage, armor and regen as f32, which tops out
 * near 3.4e38, and SpacetimeDB cannot widen a column in place. So a player
 * whose stats pass F32_STAT_LIMIT gets a row here with the real f64 values,
 * and player_progress keeps the value clamped to the limit. Nobody else has a
 * row, so ordinary saves and reads cost nothing extra.
 *
 * Every write goes through snapshot-row-writes.ts (writeWideStats below) and
 * every read through readPlayerProgress / iterPlayerProgress. The table is
 * declared in wide-stats-table.ts, so these helpers load without the server library. A row here is
 * used only while it agrees with player_progress's clamped value, so a direct
 * write to player_progress always wins over a stale one.
 */

import { cleanRating } from "../../shared/stat-rating";

type Ctx = { db: any };
type Progress = { identity: any; maxHp: number; damage: number; armor: number; regen: number };

/**
 * Stores a progress row's stats: the wide row when any passes the limit (and
 * drops a stale one when none does), and the row clamped for player_progress.
 */
export function writeWideStats<T extends Progress>(ctx: Ctx, written: T): T {
  // The run's crit rating rides on progress but lives in its own table: written
  // when the row carries one (a reset carries 0), left alone when it does not.
  const { critRating, ...stats } = written as T & { critRating?: number };
  if (critRating !== undefined) writeCritRating(ctx, stats.identity, critRating);
  // A row read without its wide stats still carries the clamp; keep what is behind it.
  const row = withWideStats(ctx, stats as T);
  const existing = ctx.db.playerWideStats?.identity.find(row.identity);
  if (!needsWideStats(row)) {
    if (existing) ctx.db.playerWideStats.identity.delete(row.identity);
    return row;
  }
  const wide = { identity: row.identity, maxHp: row.maxHp, damage: row.damage, armor: row.armor, regen: row.regen };
  if (existing) ctx.db.playerWideStats.identity.update(wide); else ctx.db.playerWideStats.insert(wide);
  const narrowed = { ...row };
  for (const field of WIDE_STAT_FIELDS) narrowed[field] = narrowStat(row[field]) as T[typeof field];
  return narrowed;
}

/** A player_progress row with its full-precision stats restored. */
export function withWideStats<T extends Progress | null | undefined>(ctx: Ctx, row: T): T {
  // Only a stat sitting at the clamp can have more behind it.
  if (!row || !WIDE_STAT_FIELDS.some(field => Math.fround(row[field]) >= Math.fround(F32_STAT_LIMIT))) return row;
  return wideStatsApply(row, ctx.db.playerWideStats?.identity.find(row.identity)) as T;
}

/** The run's crit damage rating (player_combat_rating): 0 without a row. */
export function readCritRating(ctx: Ctx, identity: any) {
  return cleanRating(ctx.db.playerCombatRating?.identity.find(identity)?.critDamage ?? 0);
}
function writeCritRating(ctx: Ctx, identity: any, rating: number) {
  const table = ctx.db.playerCombatRating;
  if (!table) return;
  const critDamage = cleanRating(rating), existing = table.identity.find(identity);
  if (!critDamage) { if (existing) table.identity.delete(identity); return; }
  if (existing?.critDamage === critDamage) return;
  if (existing) table.identity.update({ identity, critDamage }); else table.insert({ identity, critDamage });
}
const withCritRating = <T extends Progress | null | undefined>(ctx: Ctx, row: T) =>
  row ? { ...row, critRating: readCritRating(ctx, row.identity) } as T & { critRating: number } : row;

/** The one way to read a player's progress: player_progress with any wide stats and its crit rating laid over it. */
export function readPlayerProgress(ctx: Ctx, identity: any) {
  return withCritRating(ctx, withWideStats(ctx, ctx.db.playerProgress.identity.find(identity)));
}

/** Every player's progress, wide stats and crit rating included. */
export function* iterPlayerProgress(ctx: Ctx): Generator<any> {
  for (const row of ctx.db.playerProgress.iter() as Iterable<any>) yield withCritRating(ctx, withWideStats(ctx, row));
}

/**
 * Stores a duel row's stats: the companion row when any passes the limit (and
 * drops a stale one when none does), and the row clamped for the duel table.
 * An insert has no id yet; it writes the companion row after (writeDuelWideAfterInsert).
 */
export function writeDuelWide<T extends Record<string, any>>(ctx: Ctx, written: T): T {
  // A row read without its wide stats still carries the clamp; keep what is behind it.
  const row = written.id ? withDuelWide(ctx, written) : written;
  const { narrowed, wideJson } = splitWideFields(row, DUEL_WIDE_FIELDS);
  if (row.id) storeDuelWide(ctx, row.id, row.challenger, wideJson);
  return narrowed;
}
export function writeDuelWideAfterInsert(ctx: Ctx, inserted: Record<string, any>, row: Record<string, any>) {
  storeDuelWide(ctx, inserted.id, inserted.challenger, splitWideFields(row, DUEL_WIDE_FIELDS).wideJson);
}
function storeDuelWide(ctx: Ctx, duelId: bigint, challenger: any, statsJson: string) {
  const existing = ctx.db.duelWideStats?.duelId.find(duelId);
  if (!statsJson) { if (existing) ctx.db.duelWideStats.duelId.delete(duelId); return; }
  const next = { duelId, challenger, statsJson };
  if (existing) ctx.db.duelWideStats.duelId.update(next); else ctx.db.duelWideStats?.insert(next);
}
export function deleteDuelWide(ctx: Ctx, duelId: bigint) {
  if (ctx.db.duelWideStats?.duelId.find(duelId)) ctx.db.duelWideStats.duelId.delete(duelId);
}

/** A duel row with its full-precision stats restored. Every duel read goes through this. */
export function withDuelWide<T extends Record<string, any> | null | undefined>(ctx: Ctx, row: T): T {
  if (!row || !atWideClamp(row, DUEL_WIDE_FIELDS)) return row;
  return applyWideFields(row, ctx.db.duelWideStats?.duelId.find(row.id)?.statsJson, DUEL_WIDE_FIELDS) as T;
}

/** A replay row ready to insert: clamped, with its companion row written when needed. */
export function writeReplayWide<T extends Record<string, any>>(ctx: Ctx, row: T): T {
  const { narrowed, wideJson } = splitWideFields(row, REPLAY_WIDE_FIELDS);
  const existing = ctx.db.duelReplayWideStats?.replayId.find(row.id);
  if (!wideJson) { if (existing) ctx.db.duelReplayWideStats.replayId.delete(row.id); }
  else if (existing) ctx.db.duelReplayWideStats.replayId.update({ replayId: row.id, statsJson: wideJson });
  else ctx.db.duelReplayWideStats?.insert({ replayId: row.id, statsJson: wideJson });
  return narrowed;
}
export function deleteReplayWide(ctx: Ctx, replayId: bigint) {
  if (ctx.db.duelReplayWideStats?.replayId.find(replayId)) ctx.db.duelReplayWideStats.replayId.delete(replayId);
}
