import { pinnedMapBalance } from "./map-balance";
import { personalBossDefinition } from "../../shared/personal-bosses";
import { Range, SenderError, table, t } from "spacetimedb/server";
import { defeatBudget, defeatMinRespawnSeconds, enemyDefeatDefinition, mapEnemyPopulation, DEFEAT_BUDGET_WINDOW_SECONDS, ENEMY_DEFEAT_BATCH_MAX, SIM_CLOCK_BANK_SECONDS, type EnemyDefeat } from "../../shared/enemy-defeats";
import { bossDefeatLimits, BOSS_REWARD_WINDOW_SECONDS } from "./boss-defeat-limits";
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

/**
 * The first thing every kill reducer does, before any other read: one report
 * from a bucket of KILL_REPORT_BURST that refills one every
 * KILL_REPORT_REFILL_SECONDS. Every report runs the whole kill reducer
 * whatever it pays, and nothing else stopped a script sending them as fast as
 * the socket allowed.
 *
 * An honest client never gets near it. It reports every 30 seconds, plus a
 * drain before a portal, a boss reward, a hidden tab and an update screen,
 * each a single report. Clients up to 0.826 report on every acknowledgement,
 * one per round trip for a fast farmer, through the legacy reducers; those
 * are left unthrottled, since throttling them held honest players' portals
 * for thirty seconds until they reloaded. After a
 * dropped socket the backlog goes out back to back, but a
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

export type EnemyDefeatBatch = { streamId: string; sequence: bigint; mapId: string; enemies: EnemyDefeat[];
  /** Milliseconds the client simulated since its previous report; absent on the legacy reducers, which skip the check. */
  simulatedMillis?: number | null };

/**
 * O(distinct species), independent of account count; one receipt per batch.
 *
 * What a report is paid, in order:
 *  1. The simulation clock (new reducers only) scales each claim back to what
 *     real time allowed, when the client ran ahead of it.
 *  2. The spawn wall: nobody kills a species on a map faster than it respawns.
 *  3. The account's combat clock: one clock across every map and species that
 *     each kill spends from. A kill costs whichever is longer, the time this
 *     player's own combat needs for it or the map's respawn divided by its
 *     whole population (the fastest a player standing at every camp at once
 *     could see enemies come back). The second closes map hopping: each map's
 *     spawn bucket refills while the player is away, but they all draw on one
 *     clock, so rotating maps sustains one map's wall and no more. On the new
 *     reducers that clock refills with the game time the simulation clock
 *     accepted (1.), so kills are paid for with play the server believes;
 *     the legacy pair refills it at real time.
 *  4. Boss clears have their own earned-time clock, and also spend their fight
 *     seconds from the combat clock, without ever being refused for it.
 */
export function acceptEnemyDefeats(ctx: BossRewardContext, batch: EnemyDefeatBatch, activeMapIds: string | readonly string[],
  bossCombat: (earned: { type: string; amount: number; count: number }[]) => { dps: number; attackInterval: number; projectiles?: number; reach?: number; bossDps?: number }) {
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
    return { rewards: [], count: 0, lootCount: 0, restrict: true, violations: [{ enemy: "batch", requested: total, accepted: 0 }], balance: null };
  }
  // Scale first, then the bounds below, so the spawn wall and combat clock see
  // only what real time allowed and are not drained by the excess.
  const simulation = batch.simulatedMillis == null ? null : chargeSimulationClock(ctx, batch.mapId, batch.simulatedMillis);
  const scale = simulation?.scale ?? 1;
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
  const now = ctx.timestamp.microsSinceUnixEpoch;
  // One clock for the whole account: a kill spends the seconds this player
  // needs to make it. Per-species buckets let a script claim every species on
  // every map at the full rate at once, each from its own bank.
  const clockKey = combatTimeKey(ctx.sender);
  const clockPrevious = ctx.db.enemyDefeatBudget.key.find(clockKey);
  // On the new reducers the clock refills with the game time the simulation
  // clock accepted, not the wall clock: kills have to be paid for with play
  // the server believes happened. A report claiming no time (a client that
  // cannot say, or one that has been taken apart to say nothing) gets none,
  // and only the bank pays it. The legacy pair still refills at real time
  // until it is retired.
  const refill = simulation ? simulation.creditedSeconds
    : clockPrevious ? Math.max(0, Number(now - clockPrevious.updatedAtMicros) / 1e6) : 0;
  let combatSeconds = clockPrevious ? Math.min(COMBAT_TIME_BANK_SECONDS, clockPrevious.tokens + refill) : COMBAT_TIME_BANK_SECONDS;
  let clockSpent = false;
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
      const limits = bossDefeatLimits(boss.hp, combat.bossDps ?? combat.dps, combat.attackInterval, boss.respawnSeconds);
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
      // enemies come back in the time? It refills at real time, so a backlog
      // flushed after a dropped socket is honoured, and it never restricts:
      // the payout is bounded and that is all.
      // Kill rewards raise damage and attack speed as they land, and the
      // client fought the whole report with those gains while the saved row
      // still shows the stats from before it. Estimate with the stats this
      // report grants (bounded by the spawn wall above), as the client had
      // them by its last kill; anything less pays a fast-growing farmer at
      // the rate they started the report with.
      const combat = bossCombat([...rewards, { ...definition.reward, count: acceptedCount }]);
      const plausibleRate = plausibleKillsPerSecond(definition.hp, combat.dps, combat.attackInterval, combat.projectiles ?? 1)
        * (combat.reach ?? 1) * PLAUSIBLE_KILL_TOLERANCE;
      const costPerKill = plausibleRate > 0 ? Math.max(1 / plausibleRate, wallSecondsPerKill) : Infinity;
      const plausible = Number.isFinite(costPerKill) ? Math.max(0, Math.floor(combatSeconds / costPerKill + 1e-6)) : 0;
      if (acceptedCount > plausible) acceptedCount = plausible;
      if (acceptedCount) combatSeconds = Math.max(0, combatSeconds - acceptedCount * costPerKill);
      clockSpent = true;
      if (!acceptedCount) continue;
    }
    const next = { key: budgetKey, identity: ctx.sender, tokens: Math.max(0, tokens - acceptedCount), updatedAtMicros: now };
    if (previous) ctx.db.enemyDefeatBudget.key.update(next); else ctx.db.enemyDefeatBudget.insert(next);
    count += acceptedCount;
    rewards.push({ ...definition.reward, count: acceptedCount });
    if (definition.loot) lootCount += acceptedCount;
  }
  if (clockSpent || (simulation && simulation.creditedSeconds > 0)) {
    const clock = { key: clockKey, identity: ctx.sender, tokens: combatSeconds, updatedAtMicros: now };
    if (clockPrevious) ctx.db.enemyDefeatBudget.key.update(clock); else ctx.db.enemyDefeatBudget.insert(clock);
  }
  const receipt = { key, identity: ctx.sender, sequence: batch.sequence };
  if (prior) ctx.db.regularEnemyLootCursor.key.update(receipt); else ctx.db.regularEnemyLootCursor.insert(receipt);
  // A clipped claim is bounded, never a session action: the spawn wall clips
  // an honest client too (a portal round-trip re-presents a personal boss the
  // earned-time clock has not paid for yet, and a map change starts a fresh
  // stream against a bucket the last visit drained). Only a report larger than
  // any real client can send still restricts, above. The pinned balance goes
  // back to the caller so the rewards need not read and parse it again.
  return { rewards, count, lootCount, restrict: false, violations, balance };
}
