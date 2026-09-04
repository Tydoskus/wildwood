import { formatCompactNumber } from "../src/ui/number-format";
import {
  BALANCE_MAP_IDS,
  defaultBalanceSimulationConfig,
  runBalanceSimulation,
  type BalanceMapId,
  type BalanceSimulationConfig,
  type BalanceSimulationResult,
  type FarmingStrategy,
  type ProgressionStat,
  type ResearchPlan,
} from "../src/balance/simulator";

function parseDuration(value: string) {
  const match = value.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)(s|m|h|d)?$/);
  if (!match) throw new Error(`Invalid duration "${value}". Use values such as 30m, 12h, or 7d.`);
  const multipliers = { s: 1, m: 60, h: 3_600, d: 86_400 };
  return Number(match[1]) * multipliers[(match[2] || "s") as keyof typeof multipliers];
}

function valueAfter(args: string[], index: number, flag: string) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function parseMapAdjustment(config: BalanceSimulationConfig, specification: string) {
  const [rawMapId, rawValues] = specification.split(":", 2);
  if (!BALANCE_MAP_IDS.includes(rawMapId as BalanceMapId) || !rawValues) {
    throw new Error(`Invalid --map value "${specification}". Use map_id:hp=1.2,damage=1,reward=.9.`);
  }
  const mapId = rawMapId as BalanceMapId;
  const adjustment = { ...config.mapAdjustments[mapId] };
  for (const pair of rawValues.split(",")) {
    const [key, rawValue] = pair.split("=", 2);
    if (key !== "hp" && key !== "bossHp" && key !== "damage" && key !== "reward" && key !== "bossReward") {
      throw new Error(`Unknown map multiplier "${key}".`);
    }
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${key} multiplier "${rawValue}".`);
    adjustment[key] = value;
  }
  config.mapAdjustments[mapId] = adjustment;
}

function parseArguments(args: string[]) {
  const config = defaultBalanceSimulationConfig();
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--json") { json = true; continue; }
    if (flag === "--help" || flag === "-h") return { config, json, help: true };
    const value = valueAfter(args, index, flag);
    index += 1;
    if (flag === "--duration") config.durationSeconds = parseDuration(value);
    else if (flag === "--trials") config.trials = Number(value);
    else if (flag === "--strategy") {
      if (value !== "boss-rush" && value !== "efficient" && value !== "dps-first" && value !== "natural" && value !== "mixed" && value !== "boss-farm") throw new Error(`Invalid strategy "${value}".`);
      config.strategy = value as FarmingStrategy;
    } else if (flag === "--research") {
      if (value !== "off" && value !== "balanced" && value !== "damage-first") throw new Error(`Invalid research plan "${value}".`);
      config.researchPlan = value as ResearchPlan;
    }
    else if (flag === "--boss-target") config.bossTargetSeconds = parseDuration(value);
    else if (flag === "--target-desert") config.targetDesertDurationSeconds = parseDuration(value);
    else if (flag === "--target-step") config.targetMapDurationMultiplier = Number(value);
    else if (flag === "--target-power") config.targetMapPowerMultiplier = Number(value);
    else if (flag === "--target-arc") config.targetPowerArcBlend = Number(value);
    else if (flag === "--future-speedup") config.futureSpeedupReserveMultiplier = Number(value);
    else if (flag === "--clears") config.requiredClears = Number(value);
    else if (flag === "--respawn") config.respawnSeconds = parseDuration(value);
    else if (flag === "--gear-level") config.itemUpgradeLevel = Number(value);
    else if (flag === "--equipment-strength") config.equipmentStrengthMultiplier = Number(value);
    else if (flag === "--pathing") config.pathingMultiplier = Number(value);
    else if (flag === "--seed") config.seed = Number(value);
    else if (flag === "--map") parseMapAdjustment(config, value);
    else throw new Error(`Unknown option "${flag}". Run with --help for usage.`);
  }
  return { config, json, help: false };
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  if (seconds < 3_600) return `${(seconds / 60).toFixed(seconds < 600 ? 1 : 0)}m`;
  if (seconds < 86_400) return `${(seconds / 3_600).toFixed(seconds < 36_000 ? 1 : 0)}h`;
  return `${(seconds / 86_400).toFixed(seconds < 864_000 ? 1 : 0)}d`;
}

function pad(value: string, width: number) {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

const statColumns: Array<{ stat: ProgressionStat; label: string }> = [
  { stat: "damage", label: "Damage" },
  { stat: "health", label: "Health" },
  { stat: "armor", label: "Armor" },
  { stat: "regeneration", label: "Regen" },
  { stat: "attackSpeed", label: "Atk speed" },
];

function statTimeCell(map: BalanceSimulationResult["maps"][number], stat: ProgressionStat) {
  const metric = map.statProgression.find((entry) => entry.stat === stat);
  if (!metric || metric.investmentSecondsMedian < .01) return "—";
  const efficiency = metric.secondsPerOnePercentPower === null
    ? "no gain"
    : formatDuration(metric.secondsPerOnePercentPower);
  return `${formatDuration(metric.investmentSecondsMedian)}/${efficiency}`;
}

function printHelp() {
  console.log(`WildStat Balance Lab CLI

Usage: npm run balance:simulate -- [options]

  --duration 29.25h            Simulation window (s, m, h, or d)
  --trials 100                 Seeded loot campaigns
  --strategy mixed             mixed, boss-rush, efficient, dps-first, natural, or boss-farm
  --research off               off, balanced, or damage-first
  --boss-target 5m             Solo TTK floor; late maps scale to 5%, max 15m
  --target-desert 2h           Explicit Beginner Desert duration target
  --target-step 1.35           Desired duration multiplier between maps
  --target-power 8.5           Desired relative power growth inside each map
  --target-arc .35             Target opening momentum (0 straight, 1 full arc)
  --future-speedup 1.25        Uniform future progression-rate reserve
  --clears 1                   Full spawn-site clears required per map
  --respawn 30s                Regular enemy respawn time
  --gear-level 0               Shared equipped-item upgrade level (0–10)
  --equipment-strength 1       Sandbox equipment-bonus strength multiplier
  --pathing 1.15               Travel distance overhead
  --seed 1337                  Deterministic base seed
  --map water_reach:hp=1,bossHp=2,damage=.9,reward=1,bossReward=.5
  --json                       Print the complete machine-readable result`);
}

const parsed = parseArguments(process.argv.slice(2));
if (parsed.help) {
  printHelp();
  process.exit(0);
}

const startedAt = performance.now();
const result = runBalanceSimulation(parsed.config);
if (parsed.json) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

console.log(`WildStat Balance Lab · ${result.simulatedCampaigns} campaigns · ${formatDuration(result.config.durationSeconds)} · ${result.config.strategy} · research ${result.config.researchPlan}`);
console.log(`Final power ${formatCompactNumber(result.finalPower.median)} (${formatCompactNumber(result.finalPower.p10)}–${formatCompactNumber(result.finalPower.p90)}) · DPS ${formatCompactNumber(result.finalDps.median)}`);
const strategyLabels: Record<keyof BalanceSimulationResult["strategyMix"], string> = {
  natural: "nearby",
  efficient: "power",
  "dps-first": "DPS",
  "boss-rush": "boss",
  "boss-farm": "farm",
};
console.log(`Behavior mix ${Object.entries(result.strategyMix).filter(([, count]) => count > 0).map(([id, count]) => `${strategyLabels[id as keyof typeof strategyLabels]} ${count}`).join(" · ")}`);
console.log("");
console.log(`${pad("Map", 26)}${pad("Reach/Clear", 15)}${pad("Entry", 10)}${pad("Map time / target", 23)}${pad("Power entry → exit", 25)}${pad("Growth / target", 19)}${pad("Curve 25/50/75", 20)}${pad("Gear/Boss", 14)}${pad("Dmg/HP", 10)}${pad("Boss TTK in→out", 17)}Time fit`);
for (const map of result.maps) {
  const clear = map.hasBoss ? `${Math.round(map.completedPercent)}%` : "open";
  const censored = map.hasBoss && map.durationCensoredPercent > 0 ? "+" : "";
  const power = map.entryPowerMedian === null ? "—" : `${formatCompactNumber(map.entryPowerMedian)} → ${formatCompactNumber(map.exitPowerMedian ?? 0)}`;
  const mapTime = `${formatDuration(map.durationMedianSeconds)}${censored} / ${formatDuration(map.targetDurationSeconds)}`;
  const growth = map.powerGrowthMultiplier === null
    ? "—"
    : `${map.powerGrowthMultiplier.toFixed(map.powerGrowthMultiplier >= 10 ? 1 : 2)}× / ${map.targetPowerGrowthMultiplier?.toFixed(map.targetPowerGrowthMultiplier >= 10 ? 1 : 2) ?? "—"}×`;
  const fit = map.durationVsTarget === null ? "—" : `${map.durationVsTarget.toFixed(2)}×`;
  const damageToHealth = map.exitEffectiveStatsMedian
    ? `${(map.exitEffectiveStatsMedian.damage / Math.max(1, map.exitEffectiveStatsMedian.maxHp)).toFixed(2)}×`
    : "—";
  const curve = map.curveProgress
    ? `${Math.round(map.curveProgress.p25 * 100)}/${Math.round(map.curveProgress.p50 * 100)}/${Math.round(map.curveProgress.p75 * 100)}%`
    : "—";
  const gearBoss = map.exitPowerComponentsMedian
    ? `${map.exitPowerComponentsMedian.equipmentSharePercent.toFixed(0)}%/${map.bossRewardGrowthSharePercent?.toFixed(0) ?? "—"}%`
    : "—";
  console.log(
    `${pad(map.name, 26)}${pad(`${Math.round(map.reachedPercent)}%/${clear}`, 15)}` +
    `${pad(formatDuration(map.enteredAtMedianSeconds), 10)}${pad(mapTime, 23)}` +
    `${pad(power, 25)}${pad(growth, 19)}${pad(curve, 20)}${pad(gearBoss, 14)}${pad(damageToHealth, 10)}${pad(`${formatDuration(map.bossTtkAtEntryMedianSeconds)}→${formatDuration(map.bossTtkAtExitMedianSeconds)}`, 17)}${fit}`,
  );
}
console.log("");
console.log("Boss reward audit · first-clear power/min vs regular; repeat permanent power is capped");
for (const map of result.maps.filter((entry) => entry.hasBoss && entry.bossFirstClearEfficiencyRatioMedian !== null)) {
  console.log(`- ${map.name}: first clear ${formatCompactNumber(map.bossFirstClearPowerPerMinuteMedian ?? 0)} / min vs ${formatCompactNumber(map.bestRegularPowerPerMinuteMedian ?? 0)} regular · ${map.bossFirstClearEfficiencyRatioMedian!.toFixed(2)}× · repeat ${formatCompactNumber(map.bossRepeatPermanentPowerPerMinuteMedian ?? 0)} / min permanent · ${formatCompactNumber(map.repeatBossKillsMedian ?? 0)} repeat kills`);
}
console.log("");
console.log("Median map time allocation");
console.log(`${pad("Map", 26)}${pad("Combat", 12)}${pad("Boss", 10)}${pad("Travel", 10)}${pad("Respawn", 10)}Loot`);
for (const map of result.maps) {
  const budget = map.timeBudgetMedian;
  if (!budget) continue;
  const total = Object.values(budget).reduce((sum, seconds) => sum + seconds, 0);
  const percent = (seconds: number) => `${Math.round(seconds / Math.max(1, total) * 100)}%`;
  console.log(`${pad(map.name, 26)}${pad(percent(budget.regularCombatSeconds), 12)}${pad(percent(budget.bossCombatSeconds), 10)}${pad(percent(budget.travelSeconds), 10)}${pad(percent(budget.respawnWaitSeconds), 10)}${percent(budget.lootRetargetSeconds)}`);
}
const repeatMaps = result.maps.filter((map) => {
  const budget = map.repeatTimeBudgetMedian;
  return budget && Object.values(budget).some((seconds) => seconds > 0);
});
if (repeatMaps.length) {
  console.log("");
  console.log("Median repeat-loop allocation (excluded from first-clear map duration)");
  console.log(`${pad("Map", 26)}${pad("Boss", 10)}${pad("Respawn", 10)}${pad("Loot", 10)}Repeats`);
  for (const map of repeatMaps) {
    const budget = map.repeatTimeBudgetMedian!;
    const total = Object.values(budget).reduce((sum, seconds) => sum + seconds, 0);
    const percent = (seconds: number) => `${Math.round(seconds / Math.max(1, total) * 100)}%`;
    console.log(`${pad(map.name, 26)}${pad(percent(budget.bossCombatSeconds), 10)}${pad(percent(budget.respawnWaitSeconds), 10)}${pad(percent(budget.lootRetargetSeconds), 10)}${Math.round(map.repeatBossKillsMedian ?? 0)}`);
  }
}
console.log("");
console.log("Median stat investment · active pursuit time / time per +1% entry power");
console.log(`${pad("Map", 26)}${statColumns.map((column) => pad(column.label, 18)).join("")}`);
for (const map of result.maps.filter((entry) => entry.reachedPercent > 0)) {
  console.log(`${pad(map.name, 26)}${statColumns.map((column) => pad(statTimeCell(map, column.stat), 18)).join("")}`);
}
console.log("");
console.log(`Future-system headroom · reserve ${((result.config.futureSpeedupReserveMultiplier - 1) * 100).toFixed(0)}% uniform speed`);
console.log(`${pad("Map", 26)}${pad("Reserve", 12)}${pad("Uniform", 12)}${pad("Combat", 12)}${pad("Farm rate", 12)}${pad("Movement", 14)}${pad("Longest +10%", 18)}Largest jump`);
const ceiling = (value: number | null) => value === null ? "not limiting" : `${value.toFixed(2)}×`;
for (const map of result.maps.slice(1)) {
  const headroom = map.futureHeadroom;
  const momentum = map.momentum;
  console.log(
    `${pad(map.name, 26)}${pad(headroom ? headroom.reservePass ? "pass" : "NO ROOM" : map.hasBoss ? "censored" : "open window", 12)}` +
    `${pad(headroom ? ceiling(headroom.uniformSafeMultiplier) : "—", 12)}` +
    `${pad(headroom ? ceiling(headroom.combatSafeMultiplier) : "—", 12)}` +
    `${pad(headroom ? ceiling(headroom.farmingSafeMultiplier) : "—", 12)}` +
    `${pad(headroom ? ceiling(headroom.movementSafeMultiplier) : "—", 14)}` +
    `${pad(momentum ? `${formatDuration(momentum.longestGainGapSeconds)} (${momentum.longestGainGapSharePercent.toFixed(0)}%)` : "—", 18)}` +
    `${momentum ? `${(1 + momentum.largestSingleJumpPercent / 100).toFixed(1)}× (${momentum.largestSingleJumpGrowthSharePercent.toFixed(0)}% log)` : "—"}`,
  );
}
console.log("");
console.log("Enemy pressure");
for (const map of result.maps) {
  const metrics = result.enemyMetrics[map.mapId];
  const wall = [...metrics].sort((left, right) => right.fullClearCombatSharePercent - left.fullClearCombatSharePercent)[0];
  const best = [...metrics].sort((left, right) => right.efficiencyVsMapMedian - left.efficiencyVsMapMedian)[0];
  if (!wall || !best) continue;
  console.log(`- ${map.name}: ${wall.enemy} uses ${wall.fullClearCombatSharePercent.toFixed(0)}% of full-clear combat; ${best.enemy} earns ${best.efficiencyVsMapMedian.toFixed(1)}× median power/min.`);
}
console.log("");
console.log("Scaling signals");
for (const diagnostic of result.diagnostics) console.log(`- ${diagnostic}`);
console.log("");
console.log(`Completed in ${((performance.now() - startedAt) / 1_000).toFixed(2)}s.`);
