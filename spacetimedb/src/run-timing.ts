import { table, t } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import { parseRunBossClears, type RunBossClear } from "../../shared/run-timing";

/**
 * How long the current prestige run has taken, in active play, and when each boss first fell in it: what a run
 * timer shows on any device. Time is the account's own active play (player_lifetime), so offline time and time away
 * do not count. One row per player, written on prestige and on a boss's first clear in the run.
 */
export const playerRunTiming = table({ name: "player_run_timing", public: false }, {
  identity: t.identity().primaryKey(),
  /** The prestige level this run is at. */
  prestige: t.u32(),
  /** The account's active play (player_lifetime.playedMicros, live) when this run began. */
  startPlayedMicros: t.u64(),
  /** False for a run already under way when timing began: its start and earlier clears are unknown. */
  wholeRun: t.bool(),
  /** Each boss's first clear this run, in order: JSON [[mapId, playedMicrosIntoRun, clearedAtMicros], ...]. */
  bossClears: t.string(),
});

/** Each finished run, saved when the player prestiges out of it: the Prestige window's run log and bests. */
export const playerRunHistory = table({ name: "player_run_history", public: false }, {
  id: t.u64().primaryKey().autoInc(),
  identity: t.identity().index("btree"),
  /** The prestige level the run was at. */
  prestige: t.u32(),
  /** The run's whole active play, start to prestige. */
  playedMicros: t.u64(),
  wholeRun: t.bool(),
  /** As player_run_timing.bossClears. */
  bossClears: t.string(),
  endedAt: t.timestamp(),
});

type Ctx = any;

/** The account's active play up to now: what is banked, and the session it has open. */
export function livePlayedMicros(ctx: Ctx, identity: Identity) {
  const lifetime = ctx.db.playerLifetime.identity.find(identity);
  if (!lifetime) return 0n;
  if (!ctx.db.playerController.identity.find(identity)) return lifetime.playedMicros as bigint;
  const open = BigInt(ctx.timestamp.microsSinceUnixEpoch) - BigInt(lifetime.sessionStartedAt.microsSinceUnixEpoch);
  return (lifetime.playedMicros as bigint) + (open > 0n ? open : 0n);
}

function write(ctx: Ctx, row: { identity: Identity; prestige: number; startPlayedMicros: bigint; wholeRun: boolean; bossClears: string }) {
  if (ctx.db.playerRunTiming.identity.find(row.identity)) ctx.db.playerRunTiming.identity.update(row);
  else ctx.db.playerRunTiming.insert(row);
}

/**
 * The run's row, made on first sight: a first run began with the account, so it is whole; a later run already under
 * way is timed from now, and says so.
 */
export function ensureRunTiming(ctx: Ctx, identity: Identity) {
  const existing = ctx.db.playerRunTiming.identity.find(identity);
  if (existing) return existing;
  const prestige = ctx.db.playerPrestige.identity.find(identity)?.level ?? 0;
  const row = { identity, prestige, startPlayedMicros: prestige ? livePlayedMicros(ctx, identity) : 0n, wholeRun: !prestige, bossClears: "[]" };
  write(ctx, row);
  return row;
}

/** A prestige saves the run it ends to the log and starts the next run's clock, with no bosses down. */
export function startRunTiming(ctx: Ctx, identity: Identity, prestige: number) {
  const ended = ctx.db.playerRunTiming.identity.find(identity);
  if (ended) {
    const played = livePlayedMicros(ctx, identity) - BigInt(ended.startPlayedMicros);
    ctx.db.playerRunHistory.insert({ id: 0n, identity, prestige: ended.prestige, playedMicros: played > 0n ? played : 0n,
      wholeRun: ended.wholeRun, bossClears: ended.bossClears, endedAt: ctx.timestamp });
  }
  write(ctx, { identity, prestige, startPlayedMicros: livePlayedMicros(ctx, identity), wholeRun: true, bossClears: "[]" });
}

/** A boss's first clear this run, at the run's active time. A challenge run is not the run, so its clears are not. */
export function recordRunBossClear(ctx: Ctx, identity: Identity, mapId: string) {
  if (ctx.db.playerPrestigeChallenge?.identity.find(identity)?.active || ctx.db.playerAggroChallenge?.identity.find(identity)?.active) return;
  const row = ensureRunTiming(ctx, identity);
  const clears: RunBossClear[] = parseRunBossClears(row.bossClears);
  if (clears.some(clear => clear.mapId === mapId)) return;
  const played = livePlayedMicros(ctx, identity) - row.startPlayedMicros;
  clears.push({ mapId, playedMicros: Number(played > 0n ? played : 0n), clearedAtMicros: Number(ctx.timestamp.microsSinceUnixEpoch) });
  write(ctx, { ...row, bossClears: JSON.stringify(clears.map(clear => [clear.mapId, clear.playedMicros, clear.clearedAtMicros])) });
}
