import { table, t } from "spacetimedb/server";
import type { GameReducerContext } from "./index";

// Additive tables: shipped clients can still decode the original perk table.
export const prestigeExpansion = table({ name: "prestige_expansion", public: true }, {
  id: t.u8().primaryKey(), launchedAt: t.timestamp(), unlocksAt: t.timestamp(),
});
export const playerPrestigeExpansionPerk = table({ name: "player_prestige_expansion_perk", public: true }, {
  identity: t.identity().primaryKey(), bossSlayer: t.u32(), secondWind: t.u32(), longShot: t.u32(), fleetFoot: t.u32(),
});

type Context = Pick<GameReducerContext, "db" | "timestamp">;

/**
 * The live database's row was written at launch with a 30-minute countdown
 * and has long since unlocked; it is never rewritten. A database created
 * after that (a local or test one) starts unlocked rather than replaying the
 * launch countdown.
 */
export function ensurePrestigeExpansion(ctx: Context) {
  if (ctx.db.prestigeExpansion.id.find(0)) return;
  ctx.db.prestigeExpansion.insert({ id: 0, launchedAt: ctx.timestamp, unlocksAt: ctx.timestamp });
}

export function prestigeExpanded(ctx: Context) {
  const row = ctx.db.prestigeExpansion.id.find(0);
  return Boolean(row && ctx.timestamp.microsSinceUnixEpoch >= row.unlocksAt.microsSinceUnixEpoch);
}

/** Every account gets one respec that refunds perk points but keeps the run's stats. A row means it is spent. */
export const playerFreeRespec = table({ name: "player_free_respec", public: true }, {
  identity: t.identity().primaryKey(), usedAt: t.timestamp(),
});

export const playerPrestige = table({ name: "player_prestige", public: true }, {
  identity: t.identity().primaryKey(), level: t.u32().default(0), perkPoints: t.u32().default(0),
  peakPower: t.f64().default(0), prestigedAt: t.timestamp(),
});
// Perk ranks live apart from the level that bought them. player_prestige is
// public and already subscribed by shipped clients, so its shape is frozen;
// a new table is additive and leaves those clients connected.
export const playerPrestigePerk = table({ name: "player_prestige_perk", public: true }, {
  identity: t.identity().primaryKey(),
  keenEdge: t.u32().default(0), doubleStrike: t.u32().default(0), splitShot: t.u32().default(0), riposte: t.u32().default(0),
});
