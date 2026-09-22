/**
 * Read-only plausibility audit for one account.
 *
 * The server already bounds how fast an account may claim kills. It does not
 * bound what those kills were worth, and that is the gap this reports: every
 * permanent stat a player holds has to be buyable with the kills they have
 * actually been credited for. An account whose stats cannot be reconstructed
 * from its own kill count is the thing worth a look.
 *
 * Nothing here writes. Run it against live and read the numbers.
 */
import { execFileSync } from "node:child_process";
import { createMapDefinitions, createSites } from "../src/balance/simulator";
import { personalBossDefinition } from "../shared/personal-bosses";
import { LIVE_BALANCE } from "../src/balance/live-balance";
import { researchStatRewardMultiplier, RESEARCH_IDS, RESEARCH_DEFINITIONS } from "../shared/research";
import { prestigeStatMultiplier } from "../shared/prestige";
import {
  effectivePlayerMovementSpeed, ENEMY_CHASE_SPEED_MARGIN, MAX_PLAYER_MOVEMENT_SPEED,
  MAX_MOVE_SPEED_RESEARCH_RANK, PLAYER_SPEED,
} from "../shared/rules";

type Row = Record<string, any>;
const DATABASE = "wildwood-coop";

function sql(query: string): Row[] {
  const output = execFileSync(process.env.SPACETIME_BIN || "spacetime", [
    "sql", DATABASE, "--server", "maincloud", "--format", "json", query,
  ], { encoding: "utf8", timeout: 30_000 });
  const table = JSON.parse(output)[0];
  if (!table?.rows) return [];
  return table.rows.map((row: any[]) => Object.fromEntries(table.schema.elements
    .map((element: any, index: number) => [element.name?.some ?? element.name, row[index]])));
}

const hex = (identity: any) => String(identity).replace(/^0x/i, "").toLowerCase();
const compact = (value: number) => value >= 1e9 ? `${(value / 1e9).toFixed(2)}b`
  : value >= 1e6 ? `${(value / 1e6).toFixed(2)}m` : value >= 1e3 ? `${(value / 1e3).toFixed(1)}k` : value.toFixed(0);

function resolveIdentity(target: string) {
  if (/^(0x)?[0-9a-f]{64}$/i.test(target)) return hex(target);
  const matches = sql("SELECT identity, display_name FROM player_profile")
    .filter(row => String(row.display_name).toLowerCase() === target.toLowerCase());
  if (!matches.length) throw new Error(`No account named "${target}".`);
  if (matches.length > 1) throw new Error(`${matches.length} accounts named "${target}"; pass an identity instead.`);
  return hex(matches[0].identity);
}

/**
 * The single best permanent reward per kill for each stat, across every map the
 * account could have stood on. Deliberately generous: it assumes every kill was
 * the most valuable enemy in the game for that stat, which nobody achieves.
 */
function bestRewardPerKill(endlessDepth: number) {
  const best: Record<string, number> = {};
  for (const map of createMapDefinitions(endlessDepth, LIVE_BALANCE.settings)) {
    for (const site of createSites(map)) {
      const reward = site.definition?.reward;
      if (!reward) continue;
      best[reward.type] = Math.max(best[reward.type] ?? 0, reward.amount);
    }
    for (const reward of map.boss?.rewards ?? []) {
      best[`boss:${reward.type}`] = Math.max(best[`boss:${reward.type}`] ?? 0, reward.amount);
    }
  }
  return best;
}


/**
 * The fastest the game can pay out permanent damage anywhere: the best boss
 * reward divided by its respawn. Repeat boss clears pay in full, so this is the
 * real ceiling on earned damage, and it does not care how anyone farmed.
 */
function bestDamagePerSecond(endlessDepth: number) {
  let best = 0;
  for (const map of createMapDefinitions(endlessDepth, LIVE_BALANCE.settings)) {
    const boss = personalBossDefinition(map.id);
    const damage = map.boss?.rewards.find(reward => reward.type === "damage")?.amount ?? 0;
    if (boss && damage) best = Math.max(best, damage / boss.respawnSeconds);
  }
  return best;
}

function audit(target: string) {
  const identity = resolveIdentity(target);
  const where = `identity = x'${identity}'`;
  const one = (table: string, columns = "*") => sql(`SELECT ${columns} FROM ${table} WHERE ${where}`)[0];

  const profile = one("player_profile");
  const progress = one("player_progress");
  if (!progress) throw new Error("No player_progress row for that account.");
  const lifetime = one("player_lifetime");
  const research = one("player_research") ?? {};
  const prestige = one("player_prestige");
  const procedural = one("procedural_progress");

  // Boss-time budget rows carry the last accepted boss claim per map, which is
  // the only per-boss timestamp the server keeps.
  const bossRows = sql(`SELECT key, updated_at_micros FROM enemy_defeat_budget WHERE ${where}`)
    .filter(row => String(row.key).includes("boss-time"))
    .map(row => ({ map: String(row.key).split(":")[1], at: Number(row.updated_at_micros) / 1e6 }))
    .sort((left, right) => left.at - right.at);
  const endlessDepth = Math.max(0, ...bossRows
    .map(row => Number(/^endless_(\d+)$/.exec(row.map)?.[1] ?? 0)));

  const kills = Number(lifetime?.enemy_kills ?? 0);
  const playedSeconds = Number(lifetime?.played_micros ?? 0) / 1e6;
  // Research ids are camelCase; the table columns are snake_case.
  const snake = (id: string) => id.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  const ranks = Object.fromEntries(RESEARCH_IDS.map(id =>
    [id, Number((research as any)[snake(id)] ?? (research as any)[id] ?? 0)]));
  const level = Number(prestige?.level ?? 0);
  const gain = researchStatRewardMultiplier(ranks as any) * prestigeStatMultiplier(level);
  const best = bestRewardPerKill(endlessDepth);
  const bossClaims = Number(progress.boss_reward_claims ?? 0);
  const bossCount = bossClaims.toString(2).split("").filter(bit => bit === "1").length;

  console.log(`\n${profile?.display_name ?? "(no profile)"}  ${identity.slice(0, 16)}…`);
  const joined = Number(lifetime?.joined_at ?? 0);
  console.log(`joined ${joined ? new Date(joined / 1000).toISOString().slice(0, 10) : "?"} · played ${(playedSeconds / 3600).toFixed(1)}h · ${kills.toLocaleString()} credited kills`
    + (playedSeconds > 0 ? ` (${(kills / playedSeconds).toFixed(3)}/s)` : ""));
  console.log(`prestige ${level} · endless cleared ${Number(procedural?.completed ?? 0)} · deepest endless boss ${endlessDepth || "—"} · ${bossCount}/15 campaign bosses`);
  console.log(`stat gain ${gain.toFixed(2)}x  (research ${researchStatRewardMultiplier(ranks as any).toFixed(2)}x · prestige ${prestigeStatMultiplier(level).toFixed(2)}x)`);

  console.log(`\nCan the kills pay for the stats?  (bound assumes every kill was the game's best for that stat)`);
  const stats: [string, string, string][] = [
    ["damage", "damage", "damage"], ["max_hp", "health", "max HP"],
    ["armor", "armor", "armor"], ["regen", "regen", "regen"],
  ];
  let worst = 0;
  for (const [column, rewardType, label] of stats) {
    const actual = Number(progress[column] ?? 0);
    const fromKills = kills * (best[rewardType] ?? 0) * gain;
    const fromBosses = bossCount * (best[`boss:${rewardType}`] ?? 0) * gain;
    const bound = fromKills + fromBosses;
    const ratio = bound > 0 ? actual / bound : Infinity;
    worst = Math.max(worst, ratio);
    const flag = ratio > 1 ? `  <-- ${ratio.toFixed(1)}x OVER` : "";
    console.log(`  ${label.padEnd(8)} ${compact(actual).padStart(9)}  vs best case ${compact(bound).padStart(9)}  ${(ratio * 100).toFixed(0).padStart(4)}%${flag}`);
  }

  const damage = Number(progress.damage ?? 0);
  const health = Number(progress.max_hp ?? 0);
  const perSecond = bestDamagePerSecond(endlessDepth);
  const hoursNeeded = perSecond > 0 ? damage / perSecond / 3600 : Infinity;
  const hoursPlayed = playedSeconds / 3600;
  const ratio = hoursPlayed > 0 ? hoursNeeded / hoursPlayed : Infinity;
  console.log(`\nCould the clock pay for the damage?`);
  console.log(`  ${compact(damage)} damage needs ${hoursNeeded.toFixed(1)}h of killing the best boss on cooldown`);
  console.log(`  this account has played ${hoursPlayed.toFixed(1)}h  ->  ${ratio.toFixed(2)}x`
    + (ratio > 1 ? `  <-- IMPOSSIBLE: more damage than the game can pay out in its whole playtime` : ""));
  console.log(`\ndamage per credited kill ${compact(kills ? damage / kills : 0)}`
    + ` · damage-to-health ${health ? (damage / health).toFixed(2) : "—"}x`);
  console.log(`  Repeat boss clears pay full rewards and count as kills, so a boss farmer reads`);
  console.log(`  high here honestly. The clock bound above is the one that cannot be argued with.`);

  const speedRank = ranks.moveSpeed ?? 0;
  const speed = effectivePlayerMovementSpeed(false, speedRank, Number(progress.speed_override ?? 0));
  const ceiling = MAX_PLAYER_MOVEMENT_SPEED + 25;
  console.log(`\nmove speed ${speed.toFixed(1)} (rank ${speedRank}/${MAX_MOVE_SPEED_RESEARCH_RANK}`
    + `${Number(progress.speed_override ?? 0) > 0 ? `, OVERRIDE ${progress.speed_override}` : ""})`
    + ` · ceiling ${ceiling} with boots · enemies chase at ${(PLAYER_SPEED * (1 + speedRank * .02) - ENEMY_CHASE_SPEED_MARGIN).toFixed(0)}`);

  if (bossRows.length) {
    console.log(`\nboss claims, oldest first:`);
    let previous = 0;
    for (const row of bossRows) {
      const gap = previous ? ` +${((row.at - previous) / 3600).toFixed(2)}h` : "";
      console.log(`  ${row.map.padEnd(24)} ${new Date(row.at * 1000).toISOString().slice(0, 19)}${gap}`);
      previous = row.at;
    }
  }

  console.log(ratio > 1
    ? `\nIMPOSSIBLE: this account holds more damage than its playtime can pay for.`
    : worst > 1
      ? `\nUNEXPLAINED: stats exceed what this account's own kills could buy, by up to ${worst.toFixed(1)}x.`
      : `\nWithin what the clock and the kills allow.`);
}

/**
 * Triage: every account ranked by permanent damage earned per credited kill.
 * This rises naturally with progression, so depth and prestige are printed
 * beside it; what stands out is an account high on this list while shallow on
 * those, or one whose damage dwarfs its health.
 */
function outliers(limit: number) {
  const index = <T extends Row>(rows: T[]) => new Map(rows.map(row => [hex(row.identity), row]));
  const progress = index(sql("SELECT identity, damage, max_hp FROM player_progress"));
  const lifetime = index(sql("SELECT identity, enemy_kills, played_micros FROM player_lifetime"));
  const profiles = index(sql("SELECT identity, display_name FROM player_profile"));
  const prestige = index(sql("SELECT identity, level FROM player_prestige"));
  const procedural = index(sql("SELECT identity, completed FROM procedural_progress"));

  const rows = [...progress].flatMap(([identity, row]) => {
    const life = lifetime.get(identity);
    const kills = Number(life?.enemy_kills ?? 0);
    if (kills < 2_000) return [];
    const damage = Number(row.damage ?? 0);
    const health = Number(row.max_hp ?? 0);
    return [{
      identity, kills, damage, health,
      perKill: damage / kills,
      shape: health ? damage / health : Infinity,
      hours: Number(life?.played_micros ?? 0) / 3.6e9,
      name: String(profiles.get(identity)?.display_name ?? "?"),
      level: Number(prestige.get(identity)?.level ?? 0),
      endless: Number(procedural.get(identity)?.completed ?? 0),
    }];
  }).sort((left, right) => right.perKill - left.perKill);

  console.log(`\n${rows.length.toLocaleString()} accounts with over 2,000 credited kills, by damage earned per kill\n`);
  console.log(`${"name".padEnd(20)}${"dmg/kill".padStart(10)}${"dmg:hp".padStart(8)}${"damage".padStart(10)}${"kills".padStart(9)}${"hours".padStart(7)}${"P".padStart(3)}${"endless".padStart(8)}`);
  for (const row of rows.slice(0, limit)) {
    console.log(`${row.name.slice(0, 19).padEnd(20)}${compact(row.perKill).padStart(10)}${row.shape.toFixed(1).padStart(8)}`
      + `${compact(row.damage).padStart(10)}${row.kills.toLocaleString().padStart(9)}${row.hours.toFixed(0).padStart(7)}${String(row.level).padStart(3)}${String(row.endless).padStart(8)}`);
  }
  const middle = rows[Math.floor(rows.length / 2)];
  console.log(`\nmidpoint: ${compact(middle.perKill)} damage per kill, ${middle.shape.toFixed(1)}x damage-to-health`);
}

const target = process.argv[2];
if (!target) {
  console.error("Usage:\n  npm run audit:player -- <display name or identity>\n  npm run audit:player -- --outliers [count]");
  process.exit(1);
}
if (target === "--outliers") outliers(Number(process.argv[3] ?? 15));
else audit(target);
