/**
 * The Balance Lab scorecard: Ryan's per-map checks (memory: balance-design-principles)
 * against the Lab's representative run, on the build it arrives at each map with.
 *
 *   npm run balance:scorecard -- [--trials 5] [--endless 0] [--json]
 *
 * Columns: map time and its growth over the last map; whether farming the new map pays
 * more per minute than staying on the last one (same arrival build); a regular's hit as
 * a share of the arriving player's health; whether the boss beats the arriving build;
 * the boss's heaviest attack over the map's regular hit; and the arriving build's attack speed and
 * crit multiplier with the attack speed and crit camp kills made on the map (shared/stat-rating.ts).
 */
import { LIVE_BALANCE } from "../src/balance/live-balance";
import { arrivalChecks, defaultBalanceSimulationConfig, runBalanceSimulation, type BalanceMapId } from "../src/balance/simulator";
import { resolveMapBalance } from "../shared/map-balance";
import { criticalDamageMultiplier } from "../shared/critical-damage";

const args = process.argv.slice(2);
const option = (flag: string, fallback: number) => {
  const index = args.indexOf(flag);
  return index >= 0 ? Number(args[index + 1]) : fallback;
};
const config = { ...defaultBalanceSimulationConfig(), balanceSettings: structuredClone(LIVE_BALANCE.settings),
  trials: option("--trials", 5), endlessMaps: option("--endless", 0) };
const result = runBalanceSimulation(config);
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : NaN;
};
const rows = result.maps.map((map, index) => {
  const arrival = result.arrivalStates?.[map.mapId];
  const here = arrival ? arrivalChecks(config, map.mapId, arrival) : null;
  const previousMap = result.maps[index - 1];
  const there = arrival && previousMap ? arrivalChecks(config, previousMap.mapId as BalanceMapId, arrival) : null;
  const best = (enemies: { combatPowerPerMinute: number }[] | undefined) => Math.max(0, ...(enemies ?? []).map(enemy => enemy.combatPowerPerMinute));
  // Regulars of the original five roles: the attack speed and crit camps (0.901.47) copy the damage camp's hit.
  const original = (type: string) => type !== "speed" && type !== "crit";
  const regularHits = (here?.enemies ?? []).filter(enemy => !enemy.elite && original(enemy.rewardType)).map(enemy => enemy.hitPercentOfHealth);
  const balance = resolveMapBalance(map.mapId, structuredClone(LIVE_BALANCE.settings), 1);
  // Endless enemies are its lanes (Dread Warden the elite); campaign maps list their kinds.
  const regularRows = Object.keys(balance.lanes).length
    ? Object.entries(balance.lanes).filter(([lane]) => lane !== "Dread Warden").map(([, lane]) => lane)
    : Object.values(balance.enemies).filter(enemy => !enemy.elite);
  const regularDamage = median(regularRows.filter(row => original(row.reward.type)).map(row => row.damage));
  const heavy = balance.boss ? Math.max(balance.boss.damage, ...Object.values(balance.boss.attacks)) : NaN;
  const previousTime = previousMap?.durationMedianSeconds ?? null;
  return {
    map: map.name,
    hours: map.durationMedianSeconds === null ? null : map.durationMedianSeconds / 3600,
    growth: previousTime && map.durationMedianSeconds ? map.durationMedianSeconds / previousTime : null,
    payVsPrevious: there ? best(here?.enemies) / Math.max(1e-9, best(there.enemies)) : null,
    regularHitPercent: regularHits.length ? median(regularHits) : null,
    bossBeatsArrival: here?.bossOutcome ? here.bossOutcome.diedAt !== null : null,
    bossFightMinutes: here?.bossFightSeconds == null ? null : here.bossFightSeconds / 60,
    heavyOverRegular: Number.isFinite(heavy) && regularDamage > 0 ? heavy / regularDamage : null,
    // The rating stats (0.901.47): what the arriving build has, and the camp kills made on the map.
    attacksPerSecond: arrival ? 1 / arrival.stats.attackRate : null,
    critMultiplier: arrival ? criticalDamageMultiplier({ researchRank: arrival.research.criticalDamage, rating: arrival.stats.critRating, capRank: arrival.research.critCap }) : null,
    speedKills: map.statProgression.find(stat => stat.stat === "attackSpeed")?.rewardEventsMedian ?? null,
    critKills: map.statProgression.find(stat => stat.stat === "critDamage")?.rewardEventsMedian ?? null,
    regularKills: map.regularKillsMedian,
  };
});
if (args.includes("--json")) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const cell = (value: number | null, digits = 2) => value === null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
  console.log(["Map".padEnd(26), "Hours".padStart(7), "Growth".padStart(7), "Pay/prev".padStart(9), "Reg hit%".padStart(9), "Boss wins".padStart(10), "Boss min".padStart(9), "Heavy×".padStart(7), "Atk/s".padStart(6), "Crit×".padStart(6), "Spd k".padStart(6), "Crit k".padStart(6), "Kills".padStart(7)].join(" "));
  for (const row of rows) {
    console.log([row.map.padEnd(26), cell(row.hours).padStart(7), cell(row.growth).padStart(7), cell(row.payVsPrevious).padStart(9),
      cell(row.regularHitPercent, 1).padStart(9), String(row.bossBeatsArrival ?? "—").padStart(10), cell(row.bossFightMinutes, 1).padStart(9),
      cell(row.heavyOverRegular, 1).padStart(7), cell(row.attacksPerSecond).padStart(6), cell(row.critMultiplier, 1).padStart(6),
      cell(row.speedKills, 0).padStart(6), cell(row.critKills, 0).padStart(6), cell(row.regularKills, 0).padStart(7)].join(" "));
  }
}
