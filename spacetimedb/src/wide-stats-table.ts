import { table, t } from "spacetimedb/server";

/**
 * A player's bag, apart from player_progress so a kill report's progress write does not resend it
 * (shared/progress-row.ts). Public like player_progress: profiles read another player's.
 */
export const playerInventory = table({ name: "player_inventory", public: true }, {
  identity: t.identity().primaryKey(), inventoryJson: t.string(), cosmeticItemsJson: t.string(),
});

// player_wide_stats and player_combat_rating moved onto player_progress (migration 57) and nothing reads
// them; they go in the next release that breaks clients.
export const playerWideStats = table({ name: "player_wide_stats", public: true }, {
  identity: t.identity().primaryKey(), maxHp: t.f64(), damage: t.f64(), armor: t.f64(), regen: t.f64(),
});

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
