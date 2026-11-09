/**
 * Read-only plausibility audit for one account.
 *
 * Kills are the only source of permanent stats, and a prestige resets the
 * stats. So what an account holds has to be earnable in the time since its run
 * began: at the fastest kill speed the spawn limit allows, with every kill the
 * most valuable enemy it has unlocked, at the highest stat gain it could have.
 * An account past that bound is the thing worth a look.
 *
 * Nothing here writes. Run it against live and read the numbers.
 */
import { execFileSync } from "node:child_process";
import { DEFEAT_BUDGET_WINDOW_SECONDS, enemyDefeatDefinition, mapEnemyPopulation } from "../shared/enemy-defeats";
import { CAMPAIGN_MAPS } from "../shared/campaign-registry";
import { ENEMY_TYPES } from "../shared/enemy-definitions";
import { proceduralMapId } from "../shared/procedural-map-core";
import { CARDS, type CardSlot } from "../shared/cards";
import { MAX_ACTIVE_CARD_SLOTS } from "../shared/active-cards";
import { cardStatFactors, cardStatGainFactor, cardTotals, respawnSecondsWithCards } from "../shared/card-effects";
import { researchStatRewardMultiplier, RESEARCH_IDS } from "../shared/research";
import { enemyRespawnSecondsWithResearch } from "../shared/utility-research";
import { campaignComplete, prestigeStatMultiplier } from "../shared/prestige";
import { GUILD_WEEK_QUEST_CAP, guildQuestBonus } from "../shared/weekly-quests";
import { SERVER_BOOST_MULTIPLIER } from "../shared/server-boost";
import { ONBOARDING_DAMAGE_REWARD, ONBOARDING_REGEN_REWARD } from "../shared/onboarding";
import {
  effectivePlayerMovementSpeed, ENEMY_CHASE_SPEED_MARGIN, MAX_PLAYER_MOVEMENT_SPEED,
  MAX_MOVE_SPEED_RESEARCH_RANK, PLAYER_BASE_DAMAGE, PLAYER_BASE_HP, PLAYER_BASE_REGEN, PLAYER_SPEED,
  REGULAR_ENEMY_RESPAWN_SECONDS,
} from "../shared/rules";

type Row = Record<string, any>;
const DATABASE = "wildwood-coop";

function sql(query: string): Row[] {
  const output = execFileSync(process.env.SPACETIME_BIN || "spacetime", [
    "sql", DATABASE, "--server", "maincloud", "--format", "json", query,
  ], { encoding: "utf8", timeout: 60_000, maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "ignore"] });
  const table = JSON.parse(output)[0];
  if (!table?.rows) return [];
  return table.rows.map((row: any[]) => Object.fromEntries(table.schema.elements
    .map((element: any, index: number) => [element.name?.some ?? element.name, row[index]])));
}

// Identities and timestamps come back wrapped in a one-item list.
const unwrap = (value: any) => Array.isArray(value) ? value[0] : value;
const hex = (identity: any) => String(unwrap(identity)).replace(/^0x/i, "").toLowerCase();
const compact = (value: number) => value >= 1e15 ? value.toExponential(2)
  : value >= 1e12 ? `${(value / 1e12).toFixed(2)}t` : value >= 1e9 ? `${(value / 1e9).toFixed(2)}b`
  : value >= 1e6 ? `${(value / 1e6).toFixed(2)}m` : value >= 1e3 ? `${(value / 1e3).toFixed(1)}k` : value.toFixed(value < 10 ? 1 : 0);
const hours = (seconds: number) => seconds < 3600 ? `${(seconds / 60).toFixed(1)}min` : `${(seconds / 3600).toFixed(1)}h`;
const share = (ratio: number) => ratio > 100 ? `${compact(ratio)}x` : `${(ratio * 100).toFixed(ratio < .1 ? 1 : 0)}%`;
const stamp = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 16).replace("T", " ");

function resolveIdentity(target: string) {
  if (/^(0x)?[0-9a-f]{64}$/i.test(target)) return hex(target);
  const matches = sql("SELECT identity, display_name FROM player_profile")
    .filter(row => String(row.display_name).toLowerCase() === target.toLowerCase());
  if (!matches.length) throw new Error(`No account named "${target}".`);
  if (matches.length > 1) throw new Error(`${matches.length} accounts named "${target}"; pass an identity instead.`);
  return hex(matches[0].identity);
}

const STATS = [
  { column: "damage", reward: "damage", label: "damage", base: PLAYER_BASE_DAMAGE + ONBOARDING_DAMAGE_REWARD },
  { column: "max_hp", reward: "health", label: "max HP", base: PLAYER_BASE_HP },
  { column: "armor", reward: "armor", label: "armor", base: 0 },
  { column: "regen", reward: "regen", label: "regen", base: PLAYER_BASE_REGEN + ONBOARDING_REGEN_REWARD },
] as const;
type Best = Record<string, number>;

function raise(best: Best, reward: { type: string; amount: number } | undefined) {
  if (reward && Number.isFinite(reward.amount)) best[reward.type] = Math.max(best[reward.type] ?? 0, reward.amount);
}

/** The best reward per kill for each stat on one map, from the rewards the server pays. */
function mapBest(mapId: string, enemies: readonly string[]) {
  const best: Best = {};
  for (const enemy of enemies) raise(best, enemyDefeatDefinition(mapId, enemy)?.reward);
  return best;
}

const campaignBest = (() => {
  const best: Best = {};
  for (const map of CAMPAIGN_MAPS) for (const [type, amount] of Object.entries(mapBest(map.id, Object.keys(ENEMY_TYPES)))) raise(best, { type, amount });
  return best;
})();
const endlessBest: Best[] = [];
/** The best reward per kill for each stat up to an Endless level, the campaign included. */
function bestRewardPerKill(endlessLevel: number) {
  for (let level = endlessBest.length + 1; level <= endlessLevel; level++) {
    const mapId = proceduralMapId(level);
    const best = { ...(endlessBest[level - 2] ?? campaignBest) };
    const sites = Array.from({ length: mapEnemyPopulation(mapId) }, (_, site) => `site:${site}`);
    for (const [type, amount] of Object.entries(mapBest(mapId, sites))) raise(best, { type, amount });
    endlessBest.push(best);
  }
  return { ...(endlessLevel > 0 ? endlessBest[endlessLevel - 1] : campaignBest) };
}

/** The most the card catalogue can add: four copies of the best card in each slot. */
function cardCeiling(value: (cardIds: string[]) => number) {
  const bySlot: Partial<Record<CardSlot, number>> = {};
  for (const card of CARDS) {
    bySlot[card.slot] = Math.max(bySlot[card.slot] ?? 0, value(Array(MAX_ACTIVE_CARD_SLOTS).fill(card.id)));
  }
  return Object.values(bySlot).reduce((sum, part) => sum + part, 0);
}
const CARD_RESPAWN_CEILING = cardCeiling(ids => cardStatFactors(cardTotals(ids)).respawn);
const cardGainCeiling = (reward: string) => 1 + cardCeiling(ids => cardStatGainFactor(cardTotals(ids), reward) - 1);
const QUEST_CEILING = guildQuestBonus(GUILD_WEEK_QUEST_CAP);
// The reward curve in the repo went live on this day. A run older than it
// earned at other rewards, so the bound cannot judge it.
const REWARDS_SINCE_SECONDS = Date.UTC(2026, 9, 20) / 1000;
// What the spawn limit lets an account bank before it starts to clip.
const KILL_BANK_SECONDS = 3 * DEFEAT_BUDGET_WINDOW_SECONDS;

type Account = {
  progress: Row; lifetime?: Row; research?: Row; prestige?: Row; procedural?: Row; balance: Row[];
};

/**
 * What the account's current run could have earned at the most, per stat. The
 * run began at the last prestige, or at the join date for one never prestiged.
 */
function runBound(account: Account, nowSeconds: number) {
  const { progress, lifetime, prestige, procedural } = account;
  const snake = (id: string) => id.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  const ranks = Object.fromEntries(RESEARCH_IDS.map(id =>
    [id, Number(account.research?.[snake(id)] ?? account.research?.[id] ?? 0)])) as Record<string, number>;
  const level = Number(prestige?.level ?? 0);
  const started = Number(unwrap(level > 0 ? prestige?.prestiged_at : lifetime?.joined_at) ?? 0) / 1e6;
  const runSeconds = Math.max(0, nowSeconds - started);

  // A cleared level opens the next one, so that is the deepest they can farm.
  const cleared = Number(procedural?.completed ?? 0);
  const endlessLevel = cleared > 0 || campaignComplete(Number(progress.boss_reward_claims ?? 0)) ? cleared + 1 : 0;
  const best = bestRewardPerKill(endlessLevel);
  // The rewards pinned for the map they stand on win over the curve.
  for (const row of account.balance) {
    try {
      const snapshot = JSON.parse(String(row.snapshot_json));
      for (const entry of [...Object.values(snapshot.lanes ?? {}), ...Object.values(snapshot.enemies ?? {})] as any[]) raise(best, entry?.reward);
    } catch { /* an unreadable snapshot adds nothing */ }
  }

  const respawn = respawnSecondsWithCards(
    enemyRespawnSecondsWithResearch(REGULAR_ENEMY_RESPAWN_SECONDS, ranks.enemyRespawn ?? 0), CARD_RESPAWN_CEILING);
  const killsPerSecond = mapEnemyPopulation(CAMPAIGN_MAPS[0].id) / respawn;
  const gain = {
    research: researchStatRewardMultiplier(ranks as any), prestige: prestigeStatMultiplier(level),
    quests: QUEST_CEILING, boost: SERVER_BOOST_MULTIPLIER,
  };
  const shared = gain.research * gain.prestige * gain.quests * gain.boost;

  const stats = STATS.map(stat => {
    const held = Number(progress[stat.column] ?? 0);
    const earned = Math.max(0, held - stat.base);
    const perKill = (best[stat.reward] ?? 0) * shared * cardGainCeiling(stat.reward);
    const killsNeeded = perKill > 0 ? earned / perKill : earned > 0 ? Infinity : 0;
    const secondsNeeded = killsNeeded / killsPerSecond;
    return { ...stat, held, perKill, killsNeeded, secondsNeeded, ratio: secondsNeeded / (runSeconds + KILL_BANK_SECONDS) };
  });
  return { ranks, level, started, runSeconds, cleared, endlessLevel, respawn, killsPerSecond, gain, stats,
    judged: started >= REWARDS_SINCE_SECONDS,
    worst: Math.max(...stats.map(stat => stat.ratio)) };
}

function audit(target: string) {
  const identity = resolveIdentity(target);
  const where = `identity = x'${identity}'`;
  const one = (table: string) => sql(`SELECT * FROM ${table} WHERE ${where}`)[0];

  const profile = one("player_profile");
  const progress = one("player_progress");
  if (!progress) throw new Error("No player_progress row for that account.");
  const lifetime = one("player_lifetime");
  const account: Account = {
    progress, lifetime, research: one("player_research"), prestige: one("player_prestige"),
    procedural: one("procedural_progress"), balance: sql(`SELECT * FROM player_map_balance WHERE ${where}`),
  };
  const nowSeconds = Date.now() / 1000;
  const bound = runBound(account, nowSeconds);

  const kills = Number(lifetime?.enemy_kills ?? 0);
  // Played time is banked when a session ends, so add the one in progress.
  const session = Number(unwrap(lifetime?.session_started_at) ?? 0) / 1e6;
  const playedSeconds = Number(lifetime?.played_micros ?? 0) / 1e6 + (session > 0 ? Math.max(0, nowSeconds - session) : 0);
  const joined = Number(unwrap(lifetime?.joined_at) ?? 0) / 1e6;
  const claims = Number(progress.boss_reward_claims ?? 0);
  const bossCount = claims.toString(2).split("").filter(bit => bit === "1").length;

  console.log(`\n${profile?.display_name ?? "(no profile)"}  ${identity.slice(0, 16)}…`);
  console.log(`joined ${joined ? stamp(joined).slice(0, 10) : "?"} · played ${(playedSeconds / 3600).toFixed(1)}h · ${kills.toLocaleString()} lifetime kills`
    + (playedSeconds > 0 ? ` (${(kills / playedSeconds).toFixed(2)}/s while playing)` : ""));
  console.log(`prestige ${bound.level} · this run began ${bound.started ? stamp(bound.started) : "?"} UTC, ${hours(bound.runSeconds)} ago`
    + ` · ${bossCount}/${CAMPAIGN_MAPS.length} campaign bosses · Endless cleared ${bound.cleared}`);

  const { gain } = bound;
  console.log(`\nBest case used for the bound`);
  console.log(`  kill speed  ${bound.killsPerSecond.toFixed(2)}/s  (${mapEnemyPopulation(CAMPAIGN_MAPS[0].id)} enemies back every ${bound.respawn.toFixed(2)}s, the spawn limit)`);
  console.log(`  stat gain   research ${gain.research.toFixed(2)}x · prestige ${gain.prestige.toFixed(2)}x · quests ${gain.quests.toFixed(2)}x · Server Boost ${gain.boost}x`
    + ` · cards up to ${cardGainCeiling("damage").toFixed(2)}x`);
  console.log(`  every kill  the most valuable enemy up to ${bound.endlessLevel ? `Endless ${bound.endlessLevel}` : "the end of the campaign"}`);

  console.log(`\nCould this run have earned its stats?`);
  console.log(`  ${"stat".padEnd(8)}${"held".padStart(10)}${"best/kill".padStart(11)}${"kills".padStart(10)}${"time".padStart(10)}${"of run".padStart(9)}`);
  for (const stat of bound.stats) {
    console.log(`  ${stat.label.padEnd(8)}${compact(stat.held).padStart(10)}${compact(stat.perKill).padStart(11)}`
      + `${compact(stat.killsNeeded).padStart(10)}${(stat.secondsNeeded > 3.6e9 ? "-" : hours(stat.secondsNeeded)).padStart(10)}${share(stat.ratio).padStart(9)}`
      + (bound.judged && stat.ratio > 1 ? "  <-- OVER" : ""));
  }

  const speedRank = bound.ranks.moveSpeed ?? 0;
  const speed = effectivePlayerMovementSpeed(false, speedRank, Number(progress.speed_override ?? 0));
  console.log(`\nmove speed ${speed.toFixed(1)} (rank ${speedRank}/${MAX_MOVE_SPEED_RESEARCH_RANK}`
    + `${Number(progress.speed_override ?? 0) > 0 ? `, OVERRIDE ${progress.speed_override}` : ""})`
    + ` · ceiling ${MAX_PLAYER_MOVEMENT_SPEED + 25} with boots · enemies chase at ${(PLAYER_SPEED * (1 + speedRank * .02) - ENEMY_CHASE_SPEED_MARGIN).toFixed(0)}`);

  let clears: [string, number, number][] = [];
  try { clears = JSON.parse(String(one("player_run_timing")?.boss_clears ?? "[]")); } catch { /* no timing row */ }
  if (clears.length) {
    console.log(`\nlast boss clears this run (${clears.length} in all):`);
    for (const [index, [map, , at]] of clears.entries()) {
      if (index < clears.length - 6) continue;
      const gap = index ? `  +${hours((at - clears[index - 1][2]) / 1e6)}` : "";
      console.log(`  ${String(map).padEnd(24)} ${stamp(at / 1e6)}${gap}`);
    }
  }

  console.log(!bound.judged
    ? `\nNOT JUDGED: this run began before today's reward curve (${stamp(REWARDS_SINCE_SECONDS).slice(0, 10)}), so it earned at other rewards.`
    : bound.worst > 1
      ? `\nOVER: this run holds ${share(bound.worst)} of what the spawn limit could pay since it began. Worth a look.`
      : `\nWithin what the spawn limit allows (${share(bound.worst)} of the best case).`);
}

/** Triage: every account ranked by how much of its run's best case its stats use up. */
function outliers(limit: number) {
  const index = (rows: Row[]) => new Map(rows.map(row => [hex(row.identity), row]));
  const lifetime = index(sql("SELECT * FROM player_lifetime"));
  const profiles = index(sql("SELECT identity, display_name FROM player_profile"));
  const research = index(sql("SELECT * FROM player_research"));
  const prestige = index(sql("SELECT * FROM player_prestige"));
  const procedural = index(sql("SELECT * FROM procedural_progress"));
  const nowSeconds = Date.now() / 1000;

  let older = 0;
  const rows = sql("SELECT identity, damage, max_hp, armor, regen, boss_reward_claims FROM player_progress").flatMap(progress => {
    const identity = hex(progress.identity);
    const life = lifetime.get(identity);
    const kills = Number(life?.enemy_kills ?? 0);
    if (kills < 2_000) return [];
    // Pinned map rewards are left out here: reading every snapshot is too heavy for a list.
    const bound = runBound({
      progress, lifetime: life, research: research.get(identity), prestige: prestige.get(identity),
      procedural: procedural.get(identity), balance: [],
    }, nowSeconds);
    if (!bound.judged) { older++; return []; }
    const top = bound.stats.reduce((left, right) => right.ratio > left.ratio ? right : left);
    return [{ name: String(profiles.get(identity)?.display_name ?? identity.slice(0, 10)), kills, bound, top }];
  }).sort((left, right) => right.bound.worst - left.bound.worst);

  console.log(`\n${rows.length.toLocaleString()} accounts with over 2,000 lifetime kills, by share of their run's best case`);
  console.log(`(${older.toLocaleString()} more left out: their run began before today's reward curve)\n`);
  if (!rows.length) return;
  console.log(`${"name".padEnd(20)}${"of run".padStart(8)}${"stat".padStart(8)}${"held".padStart(10)}${"run age".padStart(10)}${"P".padStart(4)}${"endless".padStart(8)}${"kills".padStart(11)}`);
  for (const row of rows.slice(0, limit)) {
    console.log(`${row.name.slice(0, 19).padEnd(20)}${share(row.bound.worst).padStart(8)}${row.top.label.padStart(8)}`
      + `${compact(row.top.held).padStart(10)}${hours(row.bound.runSeconds).padStart(10)}${String(row.bound.level).padStart(4)}`
      + `${String(row.bound.cleared).padStart(8)}${row.kills.toLocaleString().padStart(11)}`);
  }
  const over = rows.filter(row => row.bound.worst > 1).length;
  console.log(`\n${over} over 100%. Midpoint ${share(rows[Math.floor(rows.length / 2)].bound.worst)}.`);
}

const target = process.argv[2];
if (!target) {
  console.error("Usage:\n  npm run audit:player -- <display name or identity>\n  npm run audit:player -- --outliers [count]");
  process.exit(1);
}
if (target === "--outliers") outliers(Number(process.argv[3] ?? 15));
else audit(target);
