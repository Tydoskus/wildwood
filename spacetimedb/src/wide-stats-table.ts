import { table, t } from "spacetimedb/server";

/** Full-precision combat stats for players past f32: see wide-stats.ts. */
export const playerWideStats = table({ name: "player_wide_stats", public: true }, {
  identity: t.identity().primaryKey(), maxHp: t.f64(), damage: t.f64(), armor: t.f64(), regen: t.f64(),
});
