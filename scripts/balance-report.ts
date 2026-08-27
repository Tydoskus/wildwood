import { formatCompactNumber } from "../src/ui/number-format";
import {
  BALANCE_MAP_IDS,
  defaultBalanceSimulationConfig,
  runBalanceSimulation,
  type BalanceMapId,
  type BalanceSimulationConfig,
  type FarmingStrategy,
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
    if (key !== "hp" && key !== "damage" && key !== "reward") throw new Error(`Unknown map multiplier "${key}".`);
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
      if (value !== "boss-rush" && value !== "efficient" && value !== "natural") throw new Error(`Invalid strategy "${value}".`);
      config.strategy = value as FarmingStrategy;
    } else if (flag === "--research") {
      if (value !== "off" && value !== "balanced" && value !== "damage-first") throw new Error(`Invalid research plan "${value}".`);
      config.researchPlan = value as ResearchPlan;
    }
    else if (flag === "--boss-target") config.bossTargetSeconds = parseDuration(value);
    else if (flag === "--target-desert") config.targetDesertDurationSeconds = parseDuration(value);
    else if (flag === "--target-step") config.targetMapDurationMultiplier = Number(value);
    else if (flag === "--target-power") config.targetMapPowerMultiplier = Number(value);
    else if (flag === "--clears") config.requiredClears = Number(value);
    else if (flag === "--respawn") config.respawnSeconds = parseDuration(value);
    else if (flag === "--gear-level") config.itemUpgradeLevel = Number(value);
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

function printHelp() {
  console.log(`Wildwood Balance Lab CLI

Usage: npm run balance:simulate -- [options]

  --duration 13.64h            Simulation window (s, m, h, or d)
  --trials 100                 Seeded loot campaigns
  --strategy boss-rush         boss-rush, efficient, or natural
  --research off               off, balanced, or damage-first
  --boss-target 5m             Solo TTK required before attempting a boss
  --target-desert 2h           Explicit Beginner Desert duration target
  --target-step 1.35           Desired duration multiplier between maps
  --target-power 200           Desired relative power growth inside each map
  --clears 1                   Full spawn-site clears required per map
  --respawn 30s                Regular enemy respawn time
  --gear-level 0               Shared equipped-item upgrade level (0–10)
  --pathing 1.15               Travel distance overhead
  --seed 1337                  Deterministic base seed
  --map infernal_depths:hp=1.2,damage=.9,reward=1.1
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

console.log(`Wildwood Balance Lab · ${result.simulatedCampaigns} campaigns · ${formatDuration(result.config.durationSeconds)} · ${result.config.strategy}`);
console.log(`Final power ${formatCompactNumber(result.finalPower.median)} (${formatCompactNumber(result.finalPower.p10)}–${formatCompactNumber(result.finalPower.p90)}) · DPS ${formatCompactNumber(result.finalDps.median)}`);
console.log("");
console.log(`${pad("Map", 26)}${pad("Reach/Clear", 15)}${pad("Entry", 10)}${pad("Map time / target", 23)}${pad("Power entry → exit", 25)}${pad("Growth / target", 19)}${pad("Dmg/HP", 10)}${pad("Boss TTK", 12)}Time fit`);
for (const map of result.maps) {
  const clear = map.hasBoss ? `${Math.round(map.completedPercent)}%` : "open";
  const censored = map.hasBoss && map.durationCensoredPercent > 0 ? "+" : "";
  const power = map.entryPowerMedian === null ? "—" : `${formatCompactNumber(map.entryPowerMedian)} → ${formatCompactNumber(map.exitPowerMedian ?? 0)}`;
  const mapTime = `${formatDuration(map.durationMedianSeconds)}${censored} / ${formatDuration(map.targetDurationSeconds)}`;
  const growth = map.powerGrowthMultiplier === null
    ? "—"
    : `${map.powerGrowthMultiplier.toFixed(map.powerGrowthMultiplier >= 10 ? 1 : 2)}× / ${map.targetPowerGrowthMultiplier?.toFixed(0) ?? "—"}×`;
  const fit = map.durationVsTarget === null ? "—" : `${map.durationVsTarget.toFixed(2)}×`;
  const damageToHealth = map.exitEffectiveStatsMedian
    ? `${(map.exitEffectiveStatsMedian.damage / Math.max(1, map.exitEffectiveStatsMedian.maxHp)).toFixed(2)}×`
    : "—";
  console.log(
    `${pad(map.name, 26)}${pad(`${Math.round(map.reachedPercent)}%/${clear}`, 15)}` +
    `${pad(formatDuration(map.enteredAtMedianSeconds), 10)}${pad(mapTime, 23)}` +
    `${pad(power, 25)}${pad(growth, 19)}${pad(damageToHealth, 10)}${pad(formatDuration(map.bossTtkAtEntryMedianSeconds), 12)}${fit}`,
  );
}
console.log("");
console.log("Scaling signals");
for (const diagnostic of result.diagnostics) console.log(`- ${diagnostic}`);
console.log("");
console.log(`Completed in ${((performance.now() - startedAt) / 1_000).toFixed(2)}s.`);
