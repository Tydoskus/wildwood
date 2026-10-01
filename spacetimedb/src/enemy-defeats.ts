import { pinnedMapBalance } from "./map-balance";
import { isProceduralMap } from "../../shared/procedural-maps";
import { personalBossDefinition } from "../../shared/personal-bosses";
import { Range, SenderError, table, t } from "spacetimedb/server";
import { defeatBudget, defeatMinRespawnSeconds, enemyDefeatDefinition, mapEnemyPopulation, DEFEAT_BUDGET_WINDOW_SECONDS, ENEMY_DEFEAT_BATCH_MAX, SIM_CLOCK_BANK_SECONDS, type EnemyDefeat } from "../../shared/enemy-defeats";
import { bossDefeatLimits, BOSS_REWARD_WINDOW_SECONDS } from "./boss-defeat-limits";
import { RIPOSTE_REFLECT_SHARE } from "../../shared/prestige-perks";
import { bossRespawnSecondsWithResearch, enemyRespawnSecondsWithResearch } from "../../shared/utility-research";
import { KILL_REPORT_BURST, KILL_REPORT_REFILL_SECONDS, REGULAR_ENEMY_RESPAWN_SECONDS } from "../../shared/rules";
import { recordModerationAction } from "./moderation-history";
import type { GameReducerContext } from "./index";

type BossRewardContext = Pick<GameReducerContext, "db" | "sender" | "timestamp">;

export const enemyDefeatBudget = table({ name: "enemy_defeat_budget" }, {
  key: t.string().primaryKey(), identity: t.identity().index("btree"), tokens: t.f64(), updatedAtMicros: t.u64().index("btree"),
});

/**
 * A budget row nobody has touched for this long is dropped by the maintenance
 * sweep. Rows were only ever added (one per player, map and species, and every
 * Endless level is its own map), so the table grew without end. Dropping one
 * is never looser: a missing spawn bucket starts at the arrival bank, below a
 * full one; the combat clock is full after 15 idle minutes either way; a boss
 * clock restarts at one reward window; the simulation clock and the report
 * limiter are full after five minutes and a minute idle, and start full.
 */
export const DEFEAT_BUDGET_IDLE_MICROS = 6n * 3_600_000_000n;
/** Rows dropped per sweep at most, so one sweep stays cheap however far behind it is. */
export const DEFEAT_BUDGET_PRUNE_BATCH = 5_000;

/** Drops the oldest idle budget rows, read in order from the updatedAtMicros index. Returns how many went. */
export function pruneIdleDefeatBudgets(ctx: Pick<GameReducerContext, "db" | "timestamp">) {
  const cutoff = ctx.timestamp.microsSinceUnixEpoch - DEFEAT_BUDGET_IDLE_MICROS;
  if (cutoff <= 0n) return 0;
  const idle: string[] = [];
  for (const row of ctx.db.enemyDefeatBudget.updatedAtMicros.filter(new Range({ tag: "unbounded" }, { tag: "excluded", value: cutoff }))) {
    idle.push(row.key);
    if (idle.length === DEFEAT_BUDGET_PRUNE_BATCH) break;
  }
  for (const key of idle) ctx.db.enemyDefeatBudget.key.delete(key);
  return idle.length;
}
// Retained for non-destructive schema compatibility with previous releases.
// Reward validation now uses earned combat time, not a fixed defeat count.
export const bossDefeatWindow = table({ name: "boss_defeat_window" }, {
  identity: t.identity().primaryKey(), acceptedAtMicros: t.array(t.u64()),
});
// Historical per-map receipt timestamps; no longer read or written for limits.
export const bossMapDefeatWindow = table({ name: "boss_map_defeat_window" }, {
  identity: t.identity().primaryKey(), acceptedAtMicros: t.array(t.u64()), acceptedMapIds: t.array(t.string()),
});

const bossTimeKey = (identity: { toHexString(): string }, mapId: string) => `${identity.toHexString()}:${mapId}:boss-time-v1`;
/** Seconds of regular-enemy combat the player has banked, across every map and species. */
export const combatTimeKey = (identity: { toHexString(): string }) => `${identity.toHexString()}:combat-time-v1`;

// Retained for non-destructive schema compatibility. Nothing writes here any
// more: a clipped claim is simply paid what it earned, which needs no queue and
// no person. Payouts are bounded by the respawn ceiling, the combat clock and
// the simulation clock (see acceptEnemyDefeats), and none of them ever costs
// anyone their session.
export const enemyDefeatReview = table(
  { name: "enemy_defeat_review", public: false, indexes: [{ accessor: "byIdentity", algorithm: "btree", columns: ["identity"] as const }] },
  {
    id: t.u64().primaryKey().autoInc(), identity: t.identity(), mapId: t.string(), enemy: t.string(), kind: t.string(),
    requested: t.u32(), accepted: t.u32(), detail: t.string(), recordedAt: t.timestamp(),
  },
);
/** Combat time a report may draw on at once. Per-species banks held five
 * minutes each, so a player fighting several species could deliver a longer
 * backlog after a dropped socket; one shared bank needs the longer window. */
export const COMBAT_TIME_BANK_SECONDS = 3 * DEFEAT_BUDGET_WINDOW_SECONDS;
/** Every arrow landing a maximum critical still leaves this much headroom. */
export const PLAUSIBLE_KILL_TOLERANCE = 1.25;

/**
 * The most kills per second this player's combat can produce against one
 * species: one projectile kills at most one enemy, and each enemy needs a whole
 * number of hits. An optimistic bound, like bossDefeatLimits, not a claim that
 * combat happened.
 */
export function plausibleKillsPerSecond(hp: number, dps: number, attackInterval: number, projectiles = 1) {
  if (![hp, dps, attackInterval, projectiles].every(Number.isFinite) || hp <= 0 || dps <= 0 || attackInterval <= 0 || projectiles < 1) return 0;
  const hitDamage = dps * attackInterval / projectiles;
  const hitsPerKill = Math.max(1, Math.ceil(hp / hitDamage - 1e-9));
  return projectiles / attackInterval / hitsPerKill;
}

/** Called only on account-world entry/travel; reconnecting never resets credit. */
export function beginBossTimeBudget(ctx: BossRewardContext, mapId: string) {
  const boss = personalBossDefinition(mapId);
  if (!boss) return;
  const key = bossTimeKey(ctx.sender, mapId);
  if (!ctx.db.enemyDefeatBudget.key.find(key)) ctx.db.enemyDefeatBudget.insert({
    key, identity: ctx.sender, tokens: boss.respawnSeconds, updatedAtMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
}
/**
 * The maps a report may be for: where the player stands, and, while they stand
 * at Home, the combat map they left to get there. A report is sealed on the
 * map it was earned on; a portal drains it first, but a drain that times out or
 * a tab hidden mid-trip leaves it queued while the player is already Home.
 * Rejecting it there threw those kills away. Every budget below is keyed by
 * the report's own map, so honouring the departed map pays no more than
 * staying on it would have.
 */
export function permittedDefeatMaps(ctx: BossRewardContext, player: { mapId: string }, homeMapId: string): string[] {
  if (player.mapId !== homeMapId) return [player.mapId];
  const left = ctx.db.homeReturnLocation.identity.find(ctx.sender)?.mapId;
  return left && left !== homeMapId ? [player.mapId, left] : [player.mapId];
}
/** How far this account's game simulation may still run ahead of real time. */
export const simulationClockKey = (identity: { toHexString(): string }) => `${identity.toHexString()}:sim-clock-v1`;
/** The account's kill-report limiter; see KILL_REPORT_BURST. */
export const reportRateKey = (identity: { toHexString(): string }) => `${identity.toHexString()}:report-rate-v1`;
/** The account's kill-rate watch; see watchKillRate. */
export const killRateKey = (identity: { toHexString(): string }) => `${identity.toHexString()}:kill-rate-v1`;

/**
 * The watch's line: paid kills per second that honest play cannot sustain.
 * Every kill-gem payout from 2026-09-20 to 09-27 put each account's best
 * fifteen minutes at or under 1.65/s (auto-farm on one 13-site Endless camp,
 * 13 / 7.5 s = 1.73/s at most), and 2.0/s for ten minutes at most, on a
 * two-camp shuttle. The line scales with the map's respawn, so a faster
 * respawn (research, or a balance change) moves it too: an Endless damage
 * camp and its nearest six-site camp hold 19 sites, 2.53/s at a 7.5 s
 * respawn, so Endless takes 20 sites' worth per respawn; campaign maps' best
 * pair is far smaller, and 16.5 keeps them at 2.2/s at 7.5 s. Never below
 * KILL_RATE_WATCH_PER_SECOND. A client edited to claim honest-looking game
 * time is still paid up to the spawn wall (3-4/s, 4.3-5.7/s on Tutorial
 * Forest), well above it.
 */
export const KILL_RATE_WATCH_PER_SECOND = 2.2;
export const KILL_RATE_WATCH_SITES = { endless: 20, campaign: 16.5 };
export function killRateWatchLine(mapId: string, respawnSeconds: number) {
  const sites = isProceduralMap(mapId) ? KILL_RATE_WATCH_SITES.endless : KILL_RATE_WATCH_SITES.campaign;
  return Math.max(KILL_RATE_WATCH_PER_SECOND, Number.isFinite(respawnSeconds) && respawnSeconds > 0 ? sites / respawnSeconds : 0);
}
/** Paid kills above the line before an account is written down: fifteen minutes at 3/s against 2.2. */
export const KILL_RATE_WATCH_EXCESS = 720;
/**
 * How far below zero the bucket may go: time that passed with fewer kills
 * than the line allows, kept as credit for a backlog behind it. Ten minutes,
 * the backlog the simulation clock pays. A backlog flushed after a stall
 * arrives as one report carrying the whole stall and the rest a moment apart;
 * without this the stall's drain was thrown away on the first and the rest
 * landed undrained.
 */
export const KILL_RATE_WATCH_CREDIT_SECONDS = SIM_CLOCK_BANK_SECONDS;
/** Added to the stored level while an episode lasts. */
const KILL_RATE_WATCH_FLAGGED = 1e9;
/** Whether a stored watch value is mid-episode. */
export const killRateWatchFlagged = (tokens: number) => tokens >= KILL_RATE_WATCH_FLAGGED / 2;

/**
 * The watch's arithmetic, on its own so it can be tested: a bucket that paid
 * kills fill and the time they were earned in drains at `perSecond`. It
 * passes KILL_RATE_WATCH_EXCESS only after kills have outrun the line for a
 * long stretch. The time a report's kills were earned in is the longer of
 * the real time since the account's last report and the game time the
 * simulation clock accepted for it: batches sealed together after an outage
 * arrive a moment apart, each carrying its share of the outage. Kills are
 * added and drained over the same interval, and offline progress never
 * passes through here. An episode starts when the level crosses the excess
 * and lasts until it falls under half of it; while it lasts the stored value
 * carries KILL_RATE_WATCH_FLAGGED on top of the level.
 */
export function killRateWatch(previous: { tokens: number; updatedAtMicros: bigint } | null | undefined, nowMicros: bigint, paidKills: number,
  creditedSeconds = 0, perSecond = KILL_RATE_WATCH_PER_SECOND) {
  const stored = previous?.tokens ?? 0;
  const flagged = killRateWatchFlagged(stored);
  const before = flagged ? stored - KILL_RATE_WATCH_FLAGGED : stored;
  const elapsed = previous ? Math.max(0, Number(nowMicros - previous.updatedAtMicros) / 1e6) : 0;
  const earnedOver = Math.max(elapsed, Number.isFinite(creditedSeconds) ? creditedSeconds : 0);
  const level = Math.max(-perSecond * KILL_RATE_WATCH_CREDIT_SECONDS, before + Math.max(0, paidKills) - earnedOver * perSecond);
  const episodeStarted = !flagged && level >= KILL_RATE_WATCH_EXCESS;
  const stillFlagged = (flagged || episodeStarted) && level >= KILL_RATE_WATCH_EXCESS / 2;
  return { level, episodeStarted, tokens: stillFlagged ? level + KILL_RATE_WATCH_FLAGGED : level };
}

/** The account's pay-ceiling shadow clock; see PAY_CEILING. */
export const payCeilingKey = (identity: { toHexString(): string }) => `${identity.toHexString()}:pay-ceiling-v1`;
/**
 * The pay ceiling: the account's combat clock charging every regular kill at
 * least 1 / killRateWatchLine seconds instead of the map's respawn over its
 * population. Paid kills then cannot be sustained above the line honest play
 * never reaches (about 2.2/s; 2.67/s on Endless at a 7.5 s respawn), where
 * the spawn wall let a client edited to claim honest-looking game time reach
 * 3-4/s. The per-species spawn buckets stay: rewards differ by species, and
 * without them a claim could be all of the best-paying one.
 *
 * Until `enforced` is set it only watches: a shadow clock charged at the
 * ceiling's price runs beside the real one and writes a moderation line
 * (pay_ceiling_shadow) when an episode in which it would have paid less
 * begins, and another with the episode's total when it ends. Enforce once
 * that has run long enough to show no honest account is caught; then delete
 * the shadow, and update the tests that assumed the spawn-wall floor
 * (bow-skills "pays an honest top-rolled bow its full claim" and "still
 * bounds a script", kill-plausibility "charges every kill at least the map's
 * respawn over its whole population", and farm-rate-simulation's two
 * watch-mode tests): they start from a nearly empty clock, where the 900 s
 * bank that absorbs an honest burst in play is missing.
 * Tests switch it on to check enforcement; nothing else writes to it.
 */
export const PAY_CEILING = { enforced: false };
/**
 * A would-clip episode lasts until the shadow clock holds half the bank again,
 * so a short break does not start a new one; while it lasts the shadow is
 * stored as -1 - seconds, and the kills it would have cut are totted up in
 * payCeilingEpisodeKey, written out as a second line when it ends.
 */
const PAY_CEILING_RECOVERED_SECONDS = COMBAT_TIME_BANK_SECONDS / 2;
export const payCeilingEpisodeKey = (identity: { toHexString(): string }) => `${identity.toHexString()}:pay-ceiling-episode-v1`;

/**
 * Writes an account down, once per episode, when its paid kills outrun
 * anything honest play has reached. It clips and restricts nothing: the
 * moderation line is for a person to read (npm run audit:kill-rates). It
 * catches what the simulation clock cannot, a client edited to report
 * honest-looking game time, which the spawn wall still pays.
 */
function watchKillRate(ctx: BossRewardContext, mapId: string, respawnSeconds: number, paidKills: number, creditedSeconds: number) {
  const key = killRateKey(ctx.sender);
  const previous = ctx.db.enemyDefeatBudget.key.find(key);
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const line = killRateWatchLine(mapId, respawnSeconds);
  const watch = killRateWatch(previous, now, paidKills, creditedSeconds, line);
  const next = { key, identity: ctx.sender, tokens: watch.tokens, updatedAtMicros: now };
  if (previous) ctx.db.enemyDefeatBudget.key.update(next); else ctx.db.enemyDefeatBudget.insert(next);
  if (!watch.episodeStarted) return;
  const displayName = ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? "";
  const detail = { identity: ctx.sender.toHexString(), displayName, mapId, excessKills: Math.round(watch.level),
    abovePerSecond: Number(line.toFixed(2)) };
  console.warn("Kill rate above honest play", JSON.stringify(detail));
  recordModerationAction(ctx as any, { targetIdentity: detail.identity, targetName: displayName, channel: "account",
    action: "kill_rate_flag", actorType: "automatic", rule: "sustained_kill_rate",
    reason: `Paid kills stayed above ${detail.abovePerSecond}/s long enough to bank ${detail.excessKills} over it on ${mapId}. Nothing was clipped; review with npm run audit:kill-rates.`,
    before: "", after: "" });
}

/**
 * The first thing every kill reducer does, before any other read: one report
 * from a bucket of KILL_REPORT_BURST that refills one every
 * KILL_REPORT_REFILL_SECONDS. Every report runs the whole kill reducer
 * whatever it pays, and nothing else stopped a script sending them as fast as
 * the socket allowed.
 *
 * An honest client never gets near it. It reports every 30 seconds, plus a
 * drain before a portal, a boss reward, a hidden tab and an update screen,
 * each a single report. (Clients up to 0.826 reported on every
 * acknowledgement, through record_enemy_defeats, which now only tells them to
 * refresh.) After a dropped socket the backlog goes out back to back, but a
 * tab keeps adding to its unsent batch until it holds a hundred kills, so
 * even five minutes offline is a handful of reports, and orphaned tabs add a
 * few more. Sixteen covers all of that at once, and a minute later it is full
 * again. If it ever were reached, the kills stay queued in the tab and are
 * paid thirty seconds later: nothing is refused, only delayed.
 *
 * A reducer that throws rolls this write back with everything else, so only a
 * report the server actually processed spends from the bucket. A report that
 * throws later (a wrong map, an invalid enemy) is not counted, and costs the
 * reads up to its throw: the session and controller checks and the cursor.
 */
export function throttleKillReports(ctx: BossRewardContext) {
  const key = reportRateKey(ctx.sender);
  const previous = ctx.db.enemyDefeatBudget.key.find(key);
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const tokens = previous
    ? Math.min(KILL_REPORT_BURST, previous.tokens + Math.max(0, Number(now - previous.updatedAtMicros) / 1e6) / KILL_REPORT_REFILL_SECONDS)
    : KILL_REPORT_BURST;
  if (tokens < 1 - 1e-9) throw new SenderError("Enemy rewards are catching up.");
  const next = { key, identity: ctx.sender, tokens: Math.max(0, tokens - 1), updatedAtMicros: now };
  if (previous) ctx.db.enemyDefeatBudget.key.update(next); else ctx.db.enemyDefeatBudget.insert(next);
}

/**
 * While a client keeps running ahead, its bank is stored below zero, as
 * -(bank + 1): an episode under way. It ends once the bank has a minute of
 * slack again. A flush's later batches claim almost no time and are not
 * scaled, so "the last report was scaled" would end it after every flush.
 */
export const SIM_CLOCK_EPISODE_RECOVERY_SECONDS = 60;
const storedSimClock = (bank: number, inEpisode: boolean) => inEpisode ? -bank - 1 : bank;
const readSimClock = (stored: number) => stored < 0 ? { bank: Math.max(0, -stored - 1), inEpisode: true } : { bank: stored, inEpisode: false };
/**
 * The arithmetic of the simulation clock, on its own so it can be tested.
 *
 * The client says how many milliseconds of game simulation it ran since it
 * sealed its previous report. The server already knows how much real time
 * passed since that report arrived. An honest client cannot simulate faster
 * than real time: its fixed 60 Hz steps are capped at eight a frame in the
 * foreground and one second per wake in the background. So claimed never
 * exceeds real elapsed plus network jitter, and the bank covers the jitter
 * and a backlog delivered late after a dropped socket (the socket being down
 * is real time too). The bank is capped after this report's time is added
 * and its claim taken off, so a report after a long idle (600 seconds real,
 * 600 simulated) leaves a full bank rather than an empty one.
 *
 * A client whose clock runs fast (a hooked performance.now or
 * requestAnimationFrame) simulates more seconds than the server sees pass.
 * The bank drains, and from then on its kills are scaled to the real-time
 * share, which is what an honest player at the same pace earns. Nothing is
 * refused or restricted; the report is consumed either way.
 *
 * `previous` is the account's clock row; missing means a full bank. A claim
 * of zero means the client could not say, and is never scaled.
 * `episodeStarted` marks the first scaled report of an episode, the one worth
 * a log line.
 */
export function simulationClock(previous: { tokens: number; updatedAtMicros: bigint } | null | undefined, nowMicros: bigint, simulatedMillis: number) {
  const claimed = Math.max(0, simulatedMillis) / 1000;
  // No row: the account's first report on this clock, or its first since the
  // idle sweep dropped the row after six quiet hours. The client counts game
  // time from when its page loaded, which can be long before its first kill
  // (menus, Home, the tutorial, a weak character dying), and there is no
  // earlier report to measure real time from. Measuring it against the bank
  // alone clipped a player who took over five minutes to land a kill. So the
  // first report is paid in full and the bank starts full: a cheater gains one
  // report, still under the spawn wall, per six idle hours.
  if (!previous) return { before: SIM_CLOCK_BANK_SECONDS, credit: Math.max(SIM_CLOCK_BANK_SECONDS, claimed), claimed, scale: 1, bank: SIM_CLOCK_BANK_SECONDS, tokens: SIM_CLOCK_BANK_SECONDS, episodeStarted: false };
  const realSeconds = Math.max(0, Number(nowMicros - previous.updatedAtMicros) / 1e6);
  const { bank: before, inEpisode } = readSimClock(previous.tokens);
  const credit = before + realSeconds;
  const scale = claimed > credit ? credit / claimed : 1;
  const bank = Math.min(SIM_CLOCK_BANK_SECONDS, Math.max(0, credit - claimed));
  const stillAhead = scale < 1 || (inEpisode && bank < SIM_CLOCK_EPISODE_RECOVERY_SECONDS);
  return { before, credit, claimed, scale, bank, tokens: storedSimClock(bank, stillAhead), episodeStarted: scale < 1 && !inEpisode };
}
/**
 * A report's claimed counts after the simulation clock's scale; exactly the
 * counts when unscaled. The report's total is rounded once and handed out by
 * largest remainder, `first` entries (a boss clear) before any other, then the
 * earliest entry on a tie. Flooring each entry took a
 * whole kill off every species under any scale below one, and a boss clear,
 * always a count of one, with it; an Endless report, one entry per site,
 * could lose all of it.
 */
export function scaledDefeatCounts(counts: readonly number[], scale: number, first: readonly boolean[] = []) {
  if (scale === 1) return [...counts];
  const exact = counts.map(count => Math.max(0, count) * Math.max(0, scale));
  const scaled = exact.map(value => Math.floor(value + 1e-9));
  let left = Math.floor(exact.reduce((sum, value) => sum + value, 0) + .5) - scaled.reduce((sum, value) => sum + value, 0);
  const byRemainder = exact.map((value, index) => ({ index, remainder: value - scaled[index] }))
    .sort((a, b) => Number(Boolean(first[b.index])) - Number(Boolean(first[a.index])) || b.remainder - a.remainder || a.index - b.index);
  for (const { index } of byRemainder) {
    if (left <= 0) break;
    if (scaled[index] < counts[index]) { scaled[index]++; left--; }
  }
  return scaled;
}

/**
 * Reads and advances the account's simulation clock for one report. Returns
 * the payout scale and the game seconds the server accepts as played: the
 * claim, cut to the real-time share when it ran ahead.
 */
function chargeSimulationClock(ctx: BossRewardContext, mapId: string, simulatedMillis: number) {
  const key = simulationClockKey(ctx.sender);
  const previous = ctx.db.enemyDefeatBudget.key.find(key);
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const clock = simulationClock(previous, now, simulatedMillis);
  const next = { key, identity: ctx.sender, tokens: clock.tokens, updatedAtMicros: now };
  if (previous) ctx.db.enemyDefeatBudget.key.update(next); else ctx.db.enemyDefeatBudget.insert(next);
  // Once per episode: the first scaled report. Reports while it stays scaled
  // are the same episode and stay quiet.
  if (clock.episodeStarted) {
    const displayName = ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? "";
    const ratio = clock.claimed / Math.max(1e-9, clock.credit);
    const detail = { identity: ctx.sender.toHexString(), displayName, mapId,
      claimed: Number(clock.claimed.toFixed(3)), credit: Number(clock.credit.toFixed(3)), ratio: Number(ratio.toFixed(3)) };
    console.warn("Enemy rewards scaled: simulation ahead of server time", JSON.stringify(detail));
    // An audit line for a developer reading the moderation log. The log is
    // developer-only: it restricts nothing and the player never sees it.
    recordModerationAction(ctx as any, { targetIdentity: detail.identity, targetName: displayName, channel: "account",
      action: "rewards_scaled", actorType: "automatic", rule: "simulation_clock_ahead",
      reason: `Simulated ${detail.claimed}s against ${detail.credit}s of server time on ${mapId} (${detail.ratio}x); kill rewards scaled to the real-time share.`,
      before: "", after: "" });
  }
  return { scale: clock.scale, creditedSeconds: clock.claimed * clock.scale };
}

/**
 * Keeps the running total of kills the pay ceiling would have cut in the
 * current episode, and writes a moderation line when the episode begins
 * (naming the account at once) and when it ends (with the total, the number
 * that tells a script from a brush with the line). Only accounts the shadow
 * has caught reach this, so honest play pays nothing for it.
 */
function recordPayCeilingEpisode(ctx: BossRewardContext, mapId: string, ceilingPerSecond: number, wouldClip: number,
  started: boolean, ended: boolean) {
  const key = payCeilingEpisodeKey(ctx.sender);
  const previous = started ? null : ctx.db.enemyDefeatBudget.key.find(key);
  const total = (previous?.tokens ?? 0) + wouldClip;
  const now = ctx.timestamp.microsSinceUnixEpoch;
  if (ended) { if (previous) ctx.db.enemyDefeatBudget.key.delete(key); }
  else {
    const row = { key, identity: ctx.sender, tokens: total, updatedAtMicros: now };
    if (previous) ctx.db.enemyDefeatBudget.key.update(row);
    else if (ctx.db.enemyDefeatBudget.key.find(key)) ctx.db.enemyDefeatBudget.key.update(row);
    else ctx.db.enemyDefeatBudget.insert(row);
  }
  if (!started && !ended) return;
  const displayName = ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? "";
  const line = Number(ceilingPerSecond.toFixed(2));
  const reason = started
    ? `The pay ceiling (${line}/s on ${mapId}) would have paid ${wouldClip} fewer kills in this report. Watching only: nothing was clipped.`
    : `Episode over: the pay ceiling would have paid ${Math.round(total)} fewer kills in all. Watching only: nothing was clipped.`;
  console.warn("Pay ceiling would clip", JSON.stringify({ identity: ctx.sender.toHexString(), displayName, mapId, wouldClip: Math.round(total), started }));
  recordModerationAction(ctx as any, { targetIdentity: ctx.sender.toHexString(), targetName: displayName, channel: "account",
    action: started ? "pay_ceiling_would_clip" : "pay_ceiling_episode_total", actorType: "automatic", rule: "pay_ceiling_shadow",
    reason, before: "", after: "" });
}

export type EnemyDefeatBatch = { streamId: string; sequence: bigint; mapId: string; enemies: EnemyDefeat[];
  /** Milliseconds the client simulated since its previous report. */
  simulatedMillis: number };

/**
 * O(distinct species), independent of account count; one receipt per batch.
 *
 * What a report is paid, in order:
 *  1. The simulation clock scales each claim back to what
 *     real time allowed, when the client ran ahead of it.
 *  2. The spawn wall: nobody kills a species on a map faster than it respawns.
 *  3. The account's combat clock: one clock across every map and species that
 *     each kill spends from. A kill costs whichever is longer, the time this
 *     player's own combat needs for it or the map's respawn divided by its
 *     whole population (the fastest a player standing at every camp at once
 *     could see enemies come back). The second closes map hopping: each map's
 *     spawn bucket refills while the player is away, but they all draw on one
 *     clock, so rotating maps sustains one map's wall and no more. That clock
 *     refills with the game time the simulation clock accepted (1.), so kills
 *     are paid for with play the server believes.
 *  4. Boss clears have their own earned-time clock, and also spend their fight
 *     seconds from the combat clock, without ever being refused for it.
 */
export function acceptEnemyDefeats(ctx: BossRewardContext, batch: EnemyDefeatBatch, activeMapIds: string | readonly string[],
  bossCombat: (earned: { type: string; amount: number; count: number }[]) => { dps: number; attackInterval: number; projectiles?: number; reach?: number; bossDps?: number;
    reflect?: { maxHp: number; regen: number; preArmor?: number } | null }) {
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(batch.streamId) || batch.sequence < 1n || !batch.enemies.length)
    throw new SenderError("Invalid enemy defeat batch.");
  const key = `${ctx.sender.toHexString()}:${batch.streamId}`;
  const prior = ctx.db.regularEnemyLootCursor.key.find(key);
  // A report already consumed is a retry of one whose acknowledgement was
  // lost. Return before anything is charged: it must not spend the simulation
  // clock (or anything else) a second time.
  if (batch.sequence <= (prior?.sequence ?? 0n)) return null;
  if (!(typeof activeMapIds === "string" ? [activeMapIds] : activeMapIds).includes(batch.mapId)) throw new SenderError("Enemy defeats belong to another map.");
  if (batch.sequence !== (prior?.sequence ?? 0n) + 1n) throw new SenderError("Enemy defeat batches must arrive in order.");
  const total = batch.enemies.reduce((sum, entry) => sum + entry.count, 0);
  if (batch.enemies.every(entry => Number.isInteger(entry.count) && entry.count > 0)
    && total > ENEMY_DEFEAT_BATCH_MAX) {
    const receipt = { key, identity: ctx.sender, sequence: batch.sequence };
    if (prior) ctx.db.regularEnemyLootCursor.key.update(receipt); else ctx.db.regularEnemyLootCursor.insert(receipt);
    return { rewards: [], kills: [], count: 0, lootCount: 0, restrict: true, violations: [{ enemy: "batch", requested: total, accepted: 0 }], balance: null };
  }
  // Scale first, then the bounds below, so the spawn wall and combat clock see
  // only what real time allowed and are not drained by the excess.
  const simulation = chargeSimulationClock(ctx, batch.mapId, batch.simulatedMillis);
  const scale = simulation.scale;
  const balance = pinnedMapBalance(ctx, ctx.sender, batch.mapId);
  const utility = ctx.db.playerResearch.identity.find(ctx.sender);
  const regularRespawn = enemyRespawnSecondsWithResearch(balance?.regularRespawnSeconds ?? REGULAR_ENEMY_RESPAWN_SECONDS, utility?.enemyRespawn ?? 0);
  const mapPopulation = mapEnemyPopulation(batch.mapId);
  // The least combat time one kill on this map can cost: the whole map comes
  // back once per respawn, so no player can sustain more than population /
  // respawn kills a second on it, however strong. See 3. above.
  const wallSecondsPerKill = mapPopulation > 0 ? defeatMinRespawnSeconds(regularRespawn) / mapPopulation : 0;
  const seen = new Set<string>();
  let count = 0, lootCount = 0, submittedCount = 0;
  // What was paid, by enemy: daily quests count kills by kind.
  const kills: { enemy: string; count: number }[] = [];
  const now = ctx.timestamp.microsSinceUnixEpoch;
  // One clock for the whole account: a kill spends the seconds this player
  // needs to make it. Per-species buckets let a script claim every species on
  // every map at the full rate at once, each from its own bank.
  const clockKey = combatTimeKey(ctx.sender);
  const clockPrevious = ctx.db.enemyDefeatBudget.key.find(clockKey);
  // The clock refills with the game time the simulation clock accepted, not
  // the wall clock: kills have to be paid for with play the server believes
  // happened. A report claiming no time (a client that cannot say, or one
  // that has been taken apart to say nothing) gets none, and only the bank
  // pays it.
  let combatSeconds = clockPrevious ? Math.min(COMBAT_TIME_BANK_SECONDS, clockPrevious.tokens + simulation.creditedSeconds) : COMBAT_TIME_BANK_SECONDS;
  let clockSpent = false;
  // The pay ceiling (see PAY_CEILING): the least a kill can cost the clock.
  const ceilingSecondsPerKill = 1 / killRateWatchLine(batch.mapId, defeatMinRespawnSeconds(regularRespawn));
  // Watching only: the same clock as it would stand had the ceiling always applied.
  const shadowKey = payCeilingKey(ctx.sender);
  const shadowPrevious = PAY_CEILING.enforced ? null : ctx.db.enemyDefeatBudget.key.find(shadowKey);
  const shadowFlagged = Boolean(shadowPrevious && shadowPrevious.tokens < 0);
  let shadowSeconds = shadowPrevious
    ? Math.min(COMBAT_TIME_BANK_SECONDS, (shadowFlagged ? -shadowPrevious.tokens - 1 : shadowPrevious.tokens) + simulation.creditedSeconds)
    : combatSeconds;
  let wouldClip = 0;
  const rewards = [];
  const violations: { enemy: string; requested: number; accepted: number }[] = [];
  // A save can contain regular kills that already raised the client's DPS.
  // Validate those first, then include only their server-calculated rewards.
  const entries = batch.enemies.some(entry => entry.enemy === "boss")
    ? [...batch.enemies.filter(entry => entry.enemy !== "boss"), ...batch.enemies.filter(entry => entry.enemy === "boss")]
    : batch.enemies;
  // A boss clear is the one kill a scaled report must not drop on a tie.
  const scaledCounts = scaledDefeatCounts(entries.map(entry => Number.isInteger(entry.count) ? entry.count : 0), scale, entries.map(entry => entry.enemy === "boss"));
  for (const [index, entry] of entries.entries()) {
    const definition = enemyDefeatDefinition(batch.mapId, entry.enemy, balance ?? undefined);
    if (!definition || seen.has(entry.enemy) || !Number.isInteger(entry.count) || entry.count < 1 || (submittedCount += entry.count) > ENEMY_DEFEAT_BATCH_MAX)
      throw new SenderError("Invalid enemy for this map.");
    seen.add(entry.enemy);
    // Validation above is on the count the client sent; everything below
    // works from what the simulation clock left of it.
    const claimed = scaledCounts[index];
    if (!claimed) { violations.push({ enemy: entry.enemy, requested: entry.count, accepted: 0 }); continue; }
    const bossDefinition = entry.enemy === "boss" ? balance?.boss ?? personalBossDefinition(batch.mapId) : null;
    const boss = bossDefinition && { ...bossDefinition, respawnSeconds: bossRespawnSecondsWithResearch(bossDefinition.respawnSeconds, utility?.bossRespawn ?? 0) };
    const budget = boss ? { capacity: 1 + Math.ceil(300 / boss.respawnSeconds), perSecond: 1 / boss.respawnSeconds } : defeatBudget(definition.population, defeatMinRespawnSeconds(regularRespawn));
    const budgetKey = `${ctx.sender.toHexString()}:${batch.mapId}:${entry.enemy}`;
    const previous = ctx.db.enemyDefeatBudget.key.find(budgetKey);
    const elapsed = previous ? Math.max(0, Number(now - previous.updatedAtMicros) / 1e6) : 0;
    const tokens = previous ? Math.min(budget.capacity, previous.tokens + elapsed * budget.perSecond) : ((budget as { initial?: number }).initial ?? budget.capacity);
    let acceptedCount = claimed;
    if (boss) {
      const combat = bossCombat(rewards);
      // A boss is one target, so reach adds nothing here; Arrow Storm's extra
      // arrows on it are damage, and bossDps carries them.
      // Reflect covers up to half the player's health pool and half their regen
      // of the boss's HP, scaled up by their armor since it returns the hit
      // before armor; their own damage has to cover the rest.
      const reflected = combat.reflect ? RIPOSTE_REFLECT_SHARE * (combat.reflect.preArmor ?? 1) : 0;
      // A curve map's boss regen, which its gate makes decisive; the authored maps' bound never counted regen.
      const gateRegen = balance?.rules.ARMOR_CURVE === 1 ? boss.hp * ((boss as { regenFraction?: number }).regenFraction ?? 0) : 0;
      const limits = bossDefeatLimits(Math.max(1, boss.hp - reflected * (combat.reflect?.maxHp ?? 0)),
        (combat.bossDps ?? combat.dps) + reflected * (combat.reflect?.regen ?? 0), combat.attackInterval, boss.respawnSeconds, gateRegen);
      const timeKey = bossTimeKey(ctx.sender, batch.mapId);
      const clock = ctx.db.enemyDefeatBudget.key.find(timeKey);
      // Existing online clients may have fought before this check was deployed.
      // Allow at most one ordinary save window, never a full slow-fight credit.
      const initialCredit = BOSS_REWARD_WINDOW_SECONDS + boss.respawnSeconds;
      const credit = limits ? Math.min(limits.capacitySeconds, clock
        ? clock.tokens + Math.max(0, Number(now - clock.updatedAtMicros) / 1e6) : initialCredit) : 0;
      // The earned-time budget already enforces HP / server DPS + respawn.
      // Receipt timestamps are not kill timestamps: counting them again in a
      // rolling per-map window rejects valid boundary kills and delayed saves.
      acceptedCount = limits ? Math.max(0, Math.min(claimed, Math.floor(tokens + 1e-6),
        Math.floor(credit / limits.cycleSeconds + 1e-9))) : 0;
      const nextClock = { key: timeKey, identity: ctx.sender,
        tokens: Math.max(0, credit - acceptedCount * (limits?.cycleSeconds ?? 0)), updatedAtMicros: now };
      if (clock) ctx.db.enemyDefeatBudget.key.update(nextClock); else ctx.db.enemyDefeatBudget.insert(nextClock);
      // Excess claims are consumed without rewards. Never leave an impossible
      // sealed report blocking saves, portals, or the valid kills behind it.
      if (acceptedCount < entry.count) violations.push({ enemy: entry.enemy, requested: entry.count, accepted: acceptedCount });
      if (!acceptedCount) continue;
      // The fight itself was combat time the player could not spend on
      // regular enemies, so it comes off the shared clock too. Only after
      // acceptance, and never below zero: the boss's own clock above is what
      // bounds clears, and a first clear must not wait on this one.
      combatSeconds = Math.max(0, combatSeconds - acceptedCount * Math.max(0, limits!.cycleSeconds - boss.respawnSeconds));
      shadowSeconds = Math.max(0, shadowSeconds - acceptedCount * Math.max(0, limits!.cycleSeconds - boss.respawnSeconds));
      clockSpent = true;
    } else {
      // A sealed batch must be consumable even when it exceeds the maximum
      // bucket (one Endless spawn holds 91 kills; a report can contain 100).
      // Award only the server-earned allowance, then acknowledge the report so
      // it cannot permanently block saving or travel. Retrying a new stream
      // cannot restore the spent allowance.
      acceptedCount = Math.max(0, Math.min(claimed, Math.floor(tokens + 1e-6)));
      if (acceptedCount < entry.count) violations.push({ enemy: entry.enemy, requested: entry.count, accepted: acceptedCount });
      // The spawn wall above bounds one species on one map. This second bound
      // is the account's combat clock: could this player's own combat have
      // produced these kills, and could any player have seen this many
      // enemies come back in the time? It refills with the game time the tab
      // ran, so a backlog flushed after a dropped socket is honoured, and it
      // never restricts: the payout is bounded and that is all.
      // Kill rewards raise damage and attack speed as they land, and the
      // client fought the whole report with those gains while the saved row
      // still shows the stats from before it. Estimate with the stats this
      // report grants (bounded by the spawn wall above), as the client had
      // them by its last kill; anything less pays a fast-growing farmer at
      // the rate they started the report with.
      const combat = bossCombat([...rewards, { ...definition.reward, count: acceptedCount }]);
      const plausibleRate = plausibleKillsPerSecond(definition.hp, combat.dps, combat.attackInterval, combat.projectiles ?? 1)
        * (combat.reach ?? 1) * PLAUSIBLE_KILL_TOLERANCE;
      const floorCost = PAY_CEILING.enforced ? Math.max(wallSecondsPerKill, ceilingSecondsPerKill) : wallSecondsPerKill;
      const costPerKill = plausibleRate > 0 ? Math.max(1 / plausibleRate, floorCost) : Infinity;
      const plausible = Number.isFinite(costPerKill) ? Math.max(0, Math.floor(combatSeconds / costPerKill + 1e-6)) : 0;
      if (acceptedCount > plausible) acceptedCount = plausible;
      if (acceptedCount) combatSeconds = Math.max(0, combatSeconds - acceptedCount * costPerKill);
      if (!PAY_CEILING.enforced && Number.isFinite(costPerKill)) {
        const shadowCost = Math.max(costPerKill, ceilingSecondsPerKill);
        const shadowPaid = Math.min(acceptedCount, Math.max(0, Math.floor(shadowSeconds / shadowCost + 1e-6)));
        wouldClip += acceptedCount - shadowPaid;
        shadowSeconds = Math.max(0, shadowSeconds - shadowPaid * shadowCost);
      }
      clockSpent = true;
      if (!acceptedCount) continue;
    }
    const next = { key: budgetKey, identity: ctx.sender, tokens: Math.max(0, tokens - acceptedCount), updatedAtMicros: now };
    if (previous) ctx.db.enemyDefeatBudget.key.update(next); else ctx.db.enemyDefeatBudget.insert(next);
    count += acceptedCount;
    rewards.push({ ...definition.reward, count: acceptedCount });
    kills.push({ enemy: entry.enemy, count: acceptedCount });
    if (definition.loot) lootCount += acceptedCount;
  }
  if (clockSpent || simulation.creditedSeconds > 0) {
    const clock = { key: clockKey, identity: ctx.sender, tokens: combatSeconds, updatedAtMicros: now };
    if (clockPrevious) ctx.db.enemyDefeatBudget.key.update(clock); else ctx.db.enemyDefeatBudget.insert(clock);
    if (!PAY_CEILING.enforced) {
      const episodeStarted = wouldClip > 0 && !shadowFlagged;
      const inEpisode = shadowFlagged || episodeStarted;
      const flagged = inEpisode && (wouldClip > 0 || shadowSeconds < PAY_CEILING_RECOVERED_SECONDS);
      const shadow = { key: shadowKey, identity: ctx.sender, tokens: flagged ? -1 - shadowSeconds : shadowSeconds, updatedAtMicros: now };
      if (shadowPrevious) ctx.db.enemyDefeatBudget.key.update(shadow); else ctx.db.enemyDefeatBudget.insert(shadow);
      if (inEpisode) recordPayCeilingEpisode(ctx, batch.mapId, 1 / ceilingSecondsPerKill, wouldClip, episodeStarted, !flagged);
    }
  }
  const receipt = { key, identity: ctx.sender, sequence: batch.sequence };
  if (prior) ctx.db.regularEnemyLootCursor.key.update(receipt); else ctx.db.regularEnemyLootCursor.insert(receipt);
  if (count > 0) watchKillRate(ctx, batch.mapId, defeatMinRespawnSeconds(regularRespawn), count, simulation.creditedSeconds);
  // A clipped claim is bounded, never a session action: the spawn wall clips
  // an honest client too (a portal round-trip re-presents a personal boss the
  // earned-time clock has not paid for yet, and a map change starts a fresh
  // stream against a bucket the last visit drained). Only a report larger than
  // any real client can send still restricts, above. The pinned balance goes
  // back to the caller so the rewards need not read and parse it again.
  return { rewards, kills, count, lootCount, restrict: false, violations, balance };
}
