import { table, t } from "spacetimedb/server";

/** Full-precision combat stats for players past f32: see wide-stats.ts. */
export const playerWideStats = table({ name: "player_wide_stats", public: true }, {
  identity: t.identity().primaryKey(), maxHp: t.f64(), damage: t.f64(), armor: t.f64(), regen: t.f64(),
});

/**
 * The run's crit damage rating (shared/stat-rating.ts), from crit camps: reset on prestige like any run stat.
 * Its own table, read and written with player_progress (wide-stats.ts), rather than a column every session's
 * table would have to add. No row means 0. Attack speed has no column: its rating is read back from attackRate.
 */
export const playerCombatRating = table({ name: "player_combat_rating", public: true }, {
  identity: t.identity().primaryKey(), critDamage: t.f64(),
});

/**
 * Duel stats past f32, as JSON beside the duel row (wide-stats.ts). The
 * challenger is kept so a client can subscribe to its own duels' rows.
 */
export const duelWideStats = table({ name: "duel_wide_stats", public: true }, {
  duelId: t.u64().primaryKey(), challenger: t.identity(), statsJson: t.string(),
});

/** A saved replay's stats past f32, keyed by the replay's (the duel's) id. */
export const duelReplayWideStats = table({ name: "duel_replay_wide_stats", public: true }, {
  replayId: t.u64().primaryKey(), statsJson: t.string(),
});
