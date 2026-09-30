import { table, t } from "spacetimedb/server";
import { Timestamp } from "spacetimedb";
import { PRESTIGE_EXPANSION_DELAY_MS } from "../../shared/prestige-expansion";
import type { GameReducerContext } from "./index";

// Additive tables: shipped clients can still decode the original perk table.
export const prestigeExpansion = table({ name: "prestige_expansion", public: true }, {
  id: t.u8().primaryKey(), launchedAt: t.timestamp(), unlocksAt: t.timestamp(),
});
export const playerPrestigeExpansionPerk = table({ name: "player_prestige_expansion_perk", public: true }, {
  identity: t.identity().primaryKey(), bossSlayer: t.u32(), secondWind: t.u32(), longShot: t.u32(), fleetFoot: t.u32(),
});

type Context = Pick<GameReducerContext, "db" | "timestamp">;

/** First post-publish maintenance/connect starts it once; later publishes never restart it. */
export function ensurePrestigeExpansion(ctx: Context) {
  if (ctx.db.prestigeExpansion.id.find(0)) return;
  ctx.db.prestigeExpansion.insert({ id: 0, launchedAt: ctx.timestamp,
    unlocksAt: new Timestamp(ctx.timestamp.microsSinceUnixEpoch + BigInt(PRESTIGE_EXPANSION_DELAY_MS) * 1000n) });
}

export function prestigeExpanded(ctx: Context) {
  const row = ctx.db.prestigeExpansion.id.find(0);
  return Boolean(row && ctx.timestamp.microsSinceUnixEpoch >= row.unlocksAt.microsSinceUnixEpoch);
}

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
