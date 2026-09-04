import "./styles.css";

import { MAP_DISPLAY_NAMES } from "../../shared/rules";
import { formatCompactNumber } from "../ui/number-format";
import {
  BALANCE_MAP_IDS,
  buildStackedLogTargetCurve,
  defaultBalanceSimulationConfig,
  type BalanceMapId,
  type BalanceSimulationConfig,
  type BalanceSimulationProgress,
  type BalanceSimulationResult,
  type FarmingStrategy,
  type GuidedFarmingStrategy,
  type ProgressionStat,
  type ResearchPlan,
  type StatProgressionMetric,
  type TimelinePoint,
} from "./simulator";

type SimulationResponse =
  | { id: number; ok: true; type: "progress"; progress: BalanceSimulationProgress }
  | { id: number; ok: true; type: "complete"; elapsedMs: number; result: BalanceSimulationResult }
  | { id: number; ok: false; message: string };

const STORAGE_KEY = "wildwood.balanceLab.config.v6";
const STORAGE_SCHEMA_VERSION = 6;
const SVG_NS = "http://www.w3.org/2000/svg";

function requiredElement<T extends Element>(id: string) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing Balance Lab element #${id}`);
  return element as unknown as T;
}

const form = requiredElement<HTMLFormElement>("simulationForm");
const durationDays = requiredElement<HTMLInputElement>("durationDays");
const trials = requiredElement<HTMLInputElement>("trials");
const trialsValue = requiredElement<HTMLOutputElement>("trialsValue");
const strategy = requiredElement<HTMLSelectElement>("strategy");
const researchPlan = requiredElement<HTMLSelectElement>("researchPlan");
const bossTargetMinutes = requiredElement<HTMLInputElement>("bossTargetMinutes");
const targetDesertHours = requiredElement<HTMLInputElement>("targetDesertHours");
const targetMapDurationMultiplier = requiredElement<HTMLInputElement>("targetMapDurationMultiplier");
const targetMapPowerMultiplier = requiredElement<HTMLInputElement>("targetMapPowerMultiplier");
const targetPowerArcPercent = requiredElement<HTMLInputElement>("targetPowerArcPercent");
const requiredClears = requiredElement<HTMLInputElement>("requiredClears");
const respawnSeconds = requiredElement<HTMLInputElement>("respawnSeconds");
const pathingMultiplier = requiredElement<HTMLInputElement>("pathingMultiplier");
const itemUpgradeLevel = requiredElement<HTMLInputElement>("itemUpgradeLevel");
const equipmentStrengthPercent = requiredElement<HTMLInputElement>("equipmentStrengthPercent");
const futureSpeedupReservePercent = requiredElement<HTMLInputElement>("futureSpeedupReservePercent");
const tuningMap = requiredElement<HTMLSelectElement>("tuningMap");
const mapHpMultiplier = requiredElement<HTMLInputElement>("mapHpMultiplier");
const mapBossHpMultiplier = requiredElement<HTMLInputElement>("mapBossHpMultiplier");
const mapDamageMultiplier = requiredElement<HTMLInputElement>("mapDamageMultiplier");
const mapRewardMultiplier = requiredElement<HTMLInputElement>("mapRewardMultiplier");
const mapBossRewardMultiplier = requiredElement<HTMLInputElement>("mapBossRewardMultiplier");
const mapHpValue = requiredElement<HTMLOutputElement>("mapHpValue");
const mapBossHpValue = requiredElement<HTMLOutputElement>("mapBossHpValue");
const mapDamageValue = requiredElement<HTMLOutputElement>("mapDamageValue");
const mapRewardValue = requiredElement<HTMLOutputElement>("mapRewardValue");
const mapBossRewardValue = requiredElement<HTMLOutputElement>("mapBossRewardValue");
const resetConfigButton = requiredElement<HTMLButtonElement>("resetConfigButton");
const resetMapButton = requiredElement<HTMLButtonElement>("resetMapButton");
const copyConfigButton = requiredElement<HTMLButtonElement>("copyConfigButton");
const runButton = requiredElement<HTMLButtonElement>("runButton");
const runEstimate = requiredElement<HTMLElement>("runEstimate");
const runStatus = requiredElement<HTMLElement>("runStatus");
const runStatusText = requiredElement<HTMLElement>("runStatusText");
const runMeta = requiredElement<HTMLElement>("runMeta");
const summaryCards = requiredElement<HTMLElement>("summaryCards");
const mapTableBody = requiredElement<HTMLTableSectionElement>("mapTableBody");
const timeBudgetRows = requiredElement<HTMLElement>("timeBudgetRows");
const statTimeRows = requiredElement<HTMLElement>("statTimeRows");
const statTimeTableBody = requiredElement<HTMLTableSectionElement>("statTimeTableBody");
const headroomBasisNote = requiredElement<HTMLElement>("headroomBasisNote");
const headroomTableBody = requiredElement<HTMLTableSectionElement>("headroomTableBody");
const diagnosticList = requiredElement<HTMLOListElement>("diagnosticList");
const enemyMap = requiredElement<HTMLSelectElement>("enemyMap");
const enemyBasisNote = requiredElement<HTMLElement>("enemyBasisNote");
const enemyTableBody = requiredElement<HTMLTableSectionElement>("enemyTableBody");
const powerChart = requiredElement<SVGSVGElement>("powerChart");
const chartFrame = requiredElement<HTMLElement>("chartFrame");
const chartTooltip = requiredElement<HTMLElement>("chartTooltip");
const chartSampleNote = requiredElement<HTMLElement>("chartSampleNote");
const previousLegend = requiredElement<HTMLElement>("previousLegend");
const strategyLegend = requiredElement<HTMLElement>("strategyLegend");

const strategyLabels: Record<GuidedFarmingStrategy, string> = {
  natural: "NEARBY",
  efficient: "POWER",
  "dps-first": "DPS-FIRST",
  "boss-rush": "BOSS-RUSH",
};

type ChartRenderState = {
  config: BalanceSimulationConfig;
  maps: BalanceSimulationResult["maps"];
  timeline: TimelinePoint[];
  simulatedCampaigns: number;
  strategyTimelines?: BalanceSimulationResult["strategyTimelines"];
  strategyComparisonTrials?: number;
  visibleTimeline?: TimelinePoint[];
};

function mergeStoredConfig(stored: unknown): BalanceSimulationConfig {
  const defaults = defaultBalanceSimulationConfig();
  if (!stored || typeof stored !== "object") return defaults;
  const candidate = stored as Partial<BalanceSimulationConfig>;
  if (
    !Number.isFinite(candidate.targetDesertDurationSeconds) ||
    !Number.isFinite(candidate.targetMapDurationMultiplier) ||
    !Number.isFinite(candidate.targetMapPowerMultiplier)
  ) return defaults;
  const adjustments = { ...defaults.mapAdjustments };
  for (const mapId of BALANCE_MAP_IDS) {
    const adjustment = candidate.mapAdjustments?.[mapId];
    if (adjustment) adjustments[mapId] = { ...adjustments[mapId], ...adjustment };
  }
  return { ...defaults, ...candidate, mapAdjustments: adjustments };
}

function loadConfig() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as {
      schemaVersion?: number;
      curveBaseline?: string;
      config?: unknown;
    } | null;
    if (stored?.schemaVersion !== STORAGE_SCHEMA_VERSION) return defaultBalanceSimulationConfig();
    const loaded = mergeStoredConfig(stored.config);
    if (stored.curveBaseline !== "balanced-tech-tree" && loaded.researchPlan === "off") {
      loaded.researchPlan = "balanced";
    }
    return loaded;
  } catch {
    return defaultBalanceSimulationConfig();
  }
}

let config = loadConfig();
let selectedTuningMap: BalanceMapId = BALANCE_MAP_IDS[0];
let selectedEnemyMap: BalanceMapId = BALANCE_MAP_IDS[0];
let result: BalanceSimulationResult | null = null;
let previousResult: BalanceSimulationResult | null = null;
let requestId = 0;
let requestStartedAt = 0;

for (const mapId of BALANCE_MAP_IDS) {
  const tuningOption = document.createElement("option");
  tuningOption.value = mapId;
  tuningOption.textContent = MAP_DISPLAY_NAMES[mapId];
  tuningMap.append(tuningOption);
  const enemyOption = tuningOption.cloneNode(true) as HTMLOptionElement;
  enemyMap.append(enemyOption);
}

function numberValue(input: HTMLInputElement, fallback: number) {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function syncControlsFromConfig() {
  durationDays.value = String(Number((config.durationSeconds / 86_400).toFixed(4)));
  trials.value = String(config.trials);
  trialsValue.value = String(config.trials);
  strategy.value = config.strategy;
  researchPlan.value = config.researchPlan;
  bossTargetMinutes.value = String(Number((config.bossTargetSeconds / 60).toFixed(2)));
  targetDesertHours.value = String(Number((config.targetDesertDurationSeconds / 3_600).toFixed(2)));
  targetMapDurationMultiplier.value = String(config.targetMapDurationMultiplier);
  targetMapPowerMultiplier.value = String(config.targetMapPowerMultiplier);
  targetPowerArcPercent.value = String(Number((config.targetPowerArcBlend * 100).toFixed(2)));
  requiredClears.value = String(config.requiredClears);
  respawnSeconds.value = String(config.respawnSeconds);
  pathingMultiplier.value = String(config.pathingMultiplier);
  itemUpgradeLevel.value = String(config.itemUpgradeLevel);
  equipmentStrengthPercent.value = String(Number((config.equipmentStrengthMultiplier * 100).toFixed(2)));
  futureSpeedupReservePercent.value = String(Number(((config.futureSpeedupReserveMultiplier - 1) * 100).toFixed(2)));
  tuningMap.value = selectedTuningMap;
  syncTuningControls();
  updateRunEstimate();
}

function syncConfigFromControls() {
  config.durationSeconds = numberValue(durationDays, config.durationSeconds / 86_400) * 86_400;
  config.trials = Math.round(numberValue(trials, config.trials));
  config.strategy = strategy.value as FarmingStrategy;
  config.researchPlan = researchPlan.value as ResearchPlan;
  config.bossTargetSeconds = numberValue(bossTargetMinutes, config.bossTargetSeconds / 60) * 60;
  config.targetDesertDurationSeconds = numberValue(targetDesertHours, config.targetDesertDurationSeconds / 3_600) * 3_600;
  config.targetMapDurationMultiplier = numberValue(targetMapDurationMultiplier, config.targetMapDurationMultiplier);
  config.targetMapPowerMultiplier = numberValue(targetMapPowerMultiplier, config.targetMapPowerMultiplier);
  config.targetPowerArcBlend = numberValue(targetPowerArcPercent, config.targetPowerArcBlend * 100) / 100;
  config.requiredClears = Math.round(numberValue(requiredClears, config.requiredClears));
  config.respawnSeconds = numberValue(respawnSeconds, config.respawnSeconds);
  config.pathingMultiplier = numberValue(pathingMultiplier, config.pathingMultiplier);
  config.itemUpgradeLevel = Math.round(numberValue(itemUpgradeLevel, config.itemUpgradeLevel));
  config.equipmentStrengthMultiplier = numberValue(
    equipmentStrengthPercent,
    config.equipmentStrengthMultiplier * 100,
  ) / 100;
  config.futureSpeedupReserveMultiplier = 1 + numberValue(
    futureSpeedupReservePercent,
    (config.futureSpeedupReserveMultiplier - 1) * 100,
  ) / 100;
  trialsValue.value = String(config.trials);
  updateRunEstimate();
}

function syncTuningControls() {
  const adjustment = config.mapAdjustments[selectedTuningMap];
  mapHpMultiplier.value = percentInputValue(adjustment.hp);
  mapBossHpMultiplier.value = percentInputValue(adjustment.bossHp);
  mapDamageMultiplier.value = percentInputValue(adjustment.damage);
  mapRewardMultiplier.value = percentInputValue(adjustment.reward);
  mapBossRewardMultiplier.value = percentInputValue(adjustment.bossReward);
  mapHpValue.value = formatTuningPercent(numberValue(mapHpMultiplier, 100));
  mapBossHpValue.value = formatTuningPercent(numberValue(mapBossHpMultiplier, 100));
  mapDamageValue.value = formatTuningPercent(numberValue(mapDamageMultiplier, 100));
  mapRewardValue.value = formatTuningPercent(numberValue(mapRewardMultiplier, 100));
  mapBossRewardValue.value = formatTuningPercent(numberValue(mapBossRewardMultiplier, 100));
}

function percentInputValue(multiplier: number) {
  return String(Number((multiplier * 100).toPrecision(8)));
}

function formatTuningPercent(percent: number) {
  if (percent === 0) return "0%";
  if (percent < .01) return `${Number(percent.toPrecision(3))}%`;
  if (percent < 10) return `${Number(percent.toFixed(2))}%`;
  return `${Number(percent.toFixed(1))}%`;
}

function syncTuningConfig() {
  config.mapAdjustments[selectedTuningMap] = {
    hp: numberValue(mapHpMultiplier, 100) / 100,
    bossHp: numberValue(mapBossHpMultiplier, 100) / 100,
    damage: numberValue(mapDamageMultiplier, 100) / 100,
    reward: numberValue(mapRewardMultiplier, 100) / 100,
    bossReward: numberValue(mapBossRewardMultiplier, 100) / 100,
  };
  syncTuningControls();
}

function updateRunEstimate() {
  runEstimate.textContent = `${config.trials} campaign${config.trials === 1 ? "" : "s"}`;
}

function setStatus(state: "idle" | "running" | "done" | "error", message: string, meta = "") {
  runStatus.dataset.state = state;
  runStatusText.textContent = message;
  runMeta.textContent = meta;
}

function markDirty() {
  syncConfigFromControls();
  setStatus("idle", result ? "Settings changed · run to update" : "Ready to simulate");
}

function saveConfig() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      schemaVersion: STORAGE_SCHEMA_VERSION,
      curveBaseline: "balanced-tech-tree",
      config,
    }));
  } catch { /* Local storage is optional. */ }
}

function formatDuration(seconds: number | null, compact = false) {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const absolute = Math.max(0, seconds);
  if (absolute < 60) return `${absolute < 10 ? absolute.toFixed(1) : Math.round(absolute)}s`;
  if (absolute < 3_600) {
    const minutes = absolute / 60;
    return `${minutes < 10 && !compact ? minutes.toFixed(1) : Math.round(minutes)}m`;
  }
  if (absolute < 86_400) {
    const hours = absolute / 3_600;
    return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)}h`;
  }
  const days = absolute / 86_400;
  return `${days < 10 ? days.toFixed(1) : Math.round(days)}d`;
}

function formatPercent(value: number) {
  if (value > 0 && value < 1) return "<1%";
  return `${Math.round(value)}%`;
}

function formatRatio(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1_000) return `${formatCompactNumber(value)}×`;
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)}×`;
}

function deltaMarkup(current: number, previous: number | null) {
  if (!previous || !Number.isFinite(previous)) return "";
  const delta = (current / previous - 1) * 100;
  if (Math.abs(delta) < .05) return `<span class="delta">UNCHANGED</span>`;
  const className = delta < 0 ? "delta negative" : "delta";
  return `<span class="${className}">${delta > 0 ? "+" : ""}${delta.toFixed(1)}% VS PREVIOUS</span>`;
}

function renderSummary(next: BalanceSimulationResult) {
  const finalPower = next.finalPower.median;
  const furthestMap = [...next.maps].reverse().find((map) => map.reachedPercent >= 50) ?? next.maps[0];
  const previousFurthest = previousResult
    ? [...previousResult.maps].reverse().find((map) => map.reachedPercent >= 50)
    : null;
  const hasMeasuredWindow = (map: BalanceSimulationResult["maps"][number]) =>
    map.hasBoss ? map.completedPercent >= 50 : map.durationVsTarget === null || map.durationVsTarget >= .75;
  const pacingTargets = next.maps.filter((map) => map.durationVsTarget !== null && hasMeasuredWindow(map));
  const pacingHits = pacingTargets.filter((map) => map.durationVsTarget! >= .75 && map.durationVsTarget! <= 1.25).length;
  const powerTargets = next.maps.filter((map) => map.powerGrowthMultiplier !== null && map.targetPowerGrowthMultiplier !== null && hasMeasuredWindow(map));
  const powerHits = powerTargets.filter((map) => {
    const fit = map.powerGrowthMultiplier! / map.targetPowerGrowthMultiplier!;
    return fit >= .65 && fit <= 1.5;
  }).length;
  const headroomTargets = next.maps.filter((map) => map.futureHeadroom !== null);
  const headroomHits = headroomTargets.filter((map) => map.futureHeadroom?.reservePass).length;
  const strategyLabels: Record<keyof BalanceSimulationResult["strategyMix"], string> = {
    natural: "nearby",
    efficient: "power",
    "dps-first": "DPS",
    "boss-rush": "boss",
    "boss-farm": "farm",
  };
  const strategyMix = Object.entries(next.strategyMix)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => `${strategyLabels[id as keyof typeof strategyLabels]} ${count}`)
    .join(" · ");
  const cards = [
    {
      label: "FINAL MEDIAN POWER",
      value: formatCompactNumber(finalPower),
      detail: `${formatCompactNumber(next.finalPower.p10)}–${formatCompactNumber(next.finalPower.p90)} P10–P90 · ${deltaMarkup(finalPower, previousResult?.finalPower.median ?? null)}`,
    },
    {
      label: "FINAL MEDIAN DPS",
      value: formatCompactNumber(next.finalDps.median),
      detail: `${formatCompactNumber(next.finalDps.p10)}–${formatCompactNumber(next.finalDps.p90)} P10–P90 · ${deltaMarkup(next.finalDps.median, previousResult?.finalDps.median ?? null)}`,
    },
    {
      label: "CURVE TARGETS",
      value: `${pacingHits}/${pacingTargets.length} ON TIME`,
      detail: `${powerHits}/${powerTargets.length} near ${formatRatio(next.config.targetMapPowerMultiplier)} power growth · ${headroomHits}/${headroomTargets.length} hold ${((next.config.futureSpeedupReserveMultiplier - 1) * 100).toFixed(0)}% future reserve · ${strategyMix || "no strategy sample"}`,
    },
    {
      label: "FURTHEST MEDIAN MAP",
      value: furthestMap.name,
      detail: `entered ${formatDuration(furthestMap.enteredAtMedianSeconds)} · gear ${furthestMap.exitPowerComponentsMedian?.equipmentSharePercent.toFixed(0) ?? "—"}% of exit power · ${previousFurthest && previousFurthest.mapId !== furthestMap.mapId ? `<span class="delta">was ${previousFurthest.name}</span>` : "50%+ of runs"}`,
    },
  ];
  summaryCards.replaceChildren();
  for (const card of cards) {
    const article = document.createElement("article");
    article.className = "summary-card";
    article.innerHTML = `<div class="label">${card.label}</div><div class="value">${card.value}</div><div class="detail">${card.detail}</div>`;
    summaryCards.append(article);
  }
}

function mapDurationText(map: BalanceSimulationResult["maps"][number]) {
  if (map.reachedPercent === 0) return "—";
  if (!map.hasBoss) return `${formatDuration(map.durationMedianSeconds)} observed`;
  const suffix = map.durationCensoredPercent > 0 ? "+" : "";
  return `${formatDuration(map.durationP10Seconds)} / ${formatDuration(map.durationMedianSeconds)}${suffix} / ${formatDuration(map.durationP90Seconds)}${suffix}`;
}

function powerCompositionMarkup(map: BalanceSimulationResult["maps"][number]) {
  const components = map.exitPowerComponentsMedian;
  if (!components || components.total <= 0) return "";
  const share = (value: number) => Math.round(value / components.total * 100);
  const repeatMarkup = map.bossFirstClearEfficiencyRatioMedian === null
    ? ""
    : `<span class="cell-sub">first clear ${map.bossFirstClearEfficiencyRatioMedian.toFixed(1)}× regular · repeat ${map.bossRepeatEfficiencyRatioMedian?.toFixed(1) ?? "—"}× regular · ${formatCompactNumber(map.repeatBossKillsMedian ?? 0)} repeat clears</span>`;
  return `<span class="cell-sub">budget D ${share(components.damage)}% · HP ${share(components.health)}% · A ${share(components.armor)}% · R ${share(components.regeneration)}%</span>` +
    `<span class="cell-sub">equipment adds ${components.equipmentSharePercent.toFixed(0)}% of exit power${map.bossRewardGrowthSharePercent === null ? "" : ` · boss supplies ${map.bossRewardGrowthSharePercent.toFixed(0)}% of map gains`}</span>${repeatMarkup}`;
}

function curveProgressMarkup(map: BalanceSimulationResult["maps"][number]) {
  if (!map.curveProgress) return `<span class="neutral">${map.reachedPercent ? "NO GROWTH SAMPLE" : "NOT REACHED"}</span>`;
  const triplet = (curve: NonNullable<typeof map.curveProgress>) =>
    `${Math.round(curve.p25 * 100)} / ${Math.round(curve.p50 * 100)} / ${Math.round(curve.p75 * 100)}%`;
  return `${triplet(map.curveProgress)}<span class="cell-sub">${map.targetCurveProgress ? `target ${triplet(map.targetCurveProgress)}` : "onboarding shape"}</span>`;
}

const TIME_BUDGET_CATEGORIES = [
  { key: "regularCombatSeconds", label: "REGULAR COMBAT" },
  { key: "bossCombatSeconds", label: "BOSS" },
  { key: "travelSeconds", label: "TRAVEL" },
  { key: "respawnWaitSeconds", label: "RESPAWN WAIT" },
  { key: "lootRetargetSeconds", label: "LOOT / RETARGET" },
] as const;

const STAT_TIME_CATEGORIES: Array<{ key: ProgressionStat; label: string }> = [
  { key: "damage", label: "DAMAGE" },
  { key: "health", label: "HEALTH" },
  { key: "armor", label: "ARMOR" },
  { key: "regeneration", label: "REGEN" },
  { key: "attackSpeed", label: "ATTACK SPEED" },
];

function renderTimeBudgets(next: BalanceSimulationResult) {
  timeBudgetRows.replaceChildren();
  const addBudgetRow = (
    map: BalanceSimulationResult["maps"][number],
    budget: NonNullable<BalanceSimulationResult["maps"][number]["timeBudgetMedian"]>,
    suffix = "",
  ) => {
    const total = TIME_BUDGET_CATEGORIES.reduce((sum, category) => sum + budget[category.key], 0);
    if (total <= 0) return;
    const row = document.createElement("div");
    row.className = "time-budget-row";
    const label = document.createElement("span");
    label.className = "time-budget-map";
    label.textContent = suffix ? `${map.name} · ${suffix}` : map.name;
    const track = document.createElement("div");
    track.className = "time-budget-track";
    track.setAttribute("role", "img");
    const description = TIME_BUDGET_CATEGORIES
      .filter((category) => budget[category.key] > 0)
      .map((category) => `${category.label.toLowerCase()} ${Math.round(budget[category.key] / total * 100)}%`)
      .join(", ");
    track.setAttribute("aria-label", `${map.name}${suffix ? ` ${suffix.toLowerCase()}` : ""}: ${description}`);
    for (const category of TIME_BUDGET_CATEGORIES) {
      const seconds = budget[category.key];
      if (seconds <= 0) continue;
      const segment = document.createElement("span");
      segment.className = `time-budget-segment ${category.key}`;
      segment.style.width = `${seconds / total * 100}%`;
      track.append(segment);
    }
    const value = document.createElement("span");
    value.className = "time-budget-total";
    value.textContent = formatDuration(total);
    row.append(label, track, value);
    timeBudgetRows.append(row);
  };
  for (const map of next.maps) {
    const budget = map.timeBudgetMedian;
    if (!budget) continue;
    addBudgetRow(map, budget);
    if (map.repeatTimeBudgetMedian) addBudgetRow(map, map.repeatTimeBudgetMedian, "REPEAT LOOP");
  }
}

function statTimeCell(metric: StatProgressionMetric | undefined) {
  if (!metric || metric.investmentSecondsMedian < .01) return `<span class="neutral">—</span>`;
  const efficiency = metric.secondsPerOnePercentPower === null
    ? "NO DIRECT POWER"
    : `${formatDuration(metric.secondsPerOnePercentPower)} / +1%`;
  const doubling = metric.effectiveDoublingSecondsMedian === null
    ? "no effective 2×"
    : `effective 2× ${formatDuration(metric.effectiveDoublingSecondsMedian)}`;
  return `${formatDuration(metric.investmentSecondsMedian)}` +
    `<span class="cell-sub">${metric.investmentSharePercent.toFixed(0)}% pursuit · ${metric.rewardGrowthSharePercent.toFixed(0)}% direct growth</span>` +
    `<span class="cell-sub">${efficiency} · ${doubling}</span>`;
}

function renderStatProgression(next: BalanceSimulationResult) {
  statTimeRows.replaceChildren();
  statTimeTableBody.replaceChildren();
  for (const map of next.maps) {
    if (map.reachedPercent <= 0) continue;
    const trackedSeconds = map.statProgression.reduce(
      (sum, metric) => sum + metric.investmentSecondsMedian,
      0,
    );
    if (trackedSeconds > 0) {
      const row = document.createElement("div");
      row.className = "stat-time-row";
      const label = document.createElement("span");
      label.className = "time-budget-map";
      label.textContent = map.name;
      const track = document.createElement("div");
      track.className = "stat-time-track";
      track.setAttribute("role", "img");
      const description = STAT_TIME_CATEGORIES.flatMap((category) => {
        const metric = map.statProgression.find((entry) => entry.stat === category.key);
        return metric && metric.investmentSecondsMedian > 0
          ? [`${category.label.toLowerCase()} ${Math.round(metric.investmentSecondsMedian / trackedSeconds * 100)}%`]
          : [];
      }).join(", ");
      track.setAttribute("aria-label", `${map.name}: ${description} of active stat pursuit time`);
      for (const category of STAT_TIME_CATEGORIES) {
        const metric = map.statProgression.find((entry) => entry.stat === category.key);
        if (!metric || metric.investmentSecondsMedian <= 0) continue;
        const segment = document.createElement("span");
        segment.className = `stat-time-segment ${category.key}`;
        segment.style.width = `${metric.investmentSecondsMedian / trackedSeconds * 100}%`;
        track.append(segment);
      }
      const value = document.createElement("span");
      value.className = "time-budget-total";
      value.textContent = `${formatDuration(trackedSeconds)} active`;
      row.append(label, track, value);
      statTimeRows.append(row);
    }

    const tableRow = document.createElement("tr");
    const cells = STAT_TIME_CATEGORIES.map((category) =>
      statTimeCell(map.statProgression.find((entry) => entry.stat === category.key)));
    tableRow.innerHTML = `<td><span class="map-name">${map.name}</span></td>${cells.map((cell) => `<td>${cell}</td>`).join("")}`;
    statTimeTableBody.append(tableRow);
  }
}

function safeCeilingText(multiplier: number | null) {
  if (multiplier === null) return `NOT LIMITING`;
  return `${multiplier.toFixed(2)}×`;
}

function momentumMarkup(momentum: BalanceSimulationResult["maps"][number]["momentum"]) {
  if (!momentum) return "";
  return `<span class="cell-sub">+${momentum.meaningfulGainPercent.toFixed(0)}% gap ${formatDuration(momentum.longestGainGapSeconds)} (${momentum.longestGainGapSharePercent.toFixed(0)}%) · biggest ${formatRatio(1 + momentum.largestSingleJumpPercent / 100)} / ${momentum.largestSingleJumpGrowthSharePercent.toFixed(0)}% log</span>`;
}

function renderHeadroom(next: BalanceSimulationResult) {
  const reservePercent = (next.config.futureSpeedupReserveMultiplier - 1) * 100;
  headroomBasisNote.textContent = `Tests ${reservePercent.toFixed(0)}% uniform future speed. Category ceilings hold all other time fixed.`;
  headroomTableBody.replaceChildren();
  for (const map of next.maps.slice(1)) {
    const row = document.createElement("tr");
    const headroom = map.futureHeadroom;
    const momentum = map.momentum;
    if (!headroom) {
      const unavailableLabel = map.hasBoss ? "CENSORED" : "OPEN WINDOW";
      row.innerHTML = `
        <td><span class="map-name">${map.name}</span>${momentumMarkup(momentum)}</td>
        <td><span class="neutral">${unavailableLabel}</span></td>
        <td>—</td><td>—</td><td>—</td><td>—</td>`;
      headroomTableBody.append(row);
      continue;
    }
    const reserveClass = headroom.reservePass ? "good" : "risk";
    const reserveLabel = headroom.reservePass ? "ROOM HELD" : "NO ROOM";
    row.innerHTML = `
      <td><span class="map-name">${map.name}</span>${momentumMarkup(momentum)}</td>
      <td class="${reserveClass}">${reserveLabel}<span class="cell-sub">projected ${formatDuration(headroom.projectedDurationAtReserveSeconds)} · floor ${formatDuration((map.targetDurationSeconds ?? 0) * .75)}</span></td>
      <td>${safeCeilingText(headroom.uniformSafeMultiplier)}<span class="cell-sub">whole map</span></td>
      <td>${safeCeilingText(headroom.combatSafeMultiplier)}<span class="cell-sub">same fights</span></td>
      <td>${safeCeilingText(headroom.farmingSafeMultiplier)}<span class="cell-sub">rewards / clears</span></td>
      <td>${safeCeilingText(headroom.movementSafeMultiplier)}<span class="cell-sub">travel</span></td>`;
    headroomTableBody.append(row);
  }
}

function renderMapTable(next: BalanceSimulationResult) {
  mapTableBody.replaceChildren();
  next.maps.forEach((map, index) => {
    const row = document.createElement("tr");
    row.dataset.mapId = map.mapId;
    row.tabIndex = 0;
    const reached = map.reachedPercent;
    const cleared = map.hasBoss ? formatPercent(map.completedPercent) : "OPEN";
    const bossTtk = map.hasBoss
      ? `${formatDuration(map.bossTtkAtEntryMedianSeconds)}<span class="cell-sub">exit ${formatDuration(map.bossTtkAtExitMedianSeconds)}</span>`
      : "—";
    const durationFit = map.durationVsTarget;
    const durationWall = durationFit !== null && (durationFit < .75 || durationFit > 1.25);
    const stepMarkup = durationFit === null
      ? `<span class="neutral">${index === 0 ? "ONBOARDING" : "CENSORED"}</span>`
      : `<span class="step-pill${durationWall ? " wall" : ""}">${durationFit.toFixed(2)}× TARGET</span><span class="cell-sub">${map.durationVsPrevious === null ? map.hasBoss ? "no reliable step" : "observed window" : `${map.durationVsPrevious.toFixed(2)}× previous map`}</span>`;
    const power = map.entryPowerMedian === null
      ? "—"
      : `${formatCompactNumber(map.entryPowerMedian)} → ${formatCompactNumber(map.exitPowerMedian ?? map.entryPowerMedian)}`;
    const powerGrowth = map.powerGrowthMultiplier === null
      ? ""
      : `<span class="cell-sub">${formatRatio(map.powerGrowthMultiplier)} growth${map.targetPowerGrowthMultiplier === null ? " · onboarding" : ` · target ${formatRatio(map.targetPowerGrowthMultiplier)}`}${map.exitEffectiveStatsMedian ? ` · ${(map.exitEffectiveStatsMedian.damage / Math.max(1, map.exitEffectiveStatsMedian.maxHp)).toFixed(2)}× D/HP` : ""}</span>`;
    const durationTarget = map.targetDurationSeconds === null
      ? `<span class="cell-sub">onboarding baseline</span>`
      : `<span class="cell-sub">target ${formatDuration(map.targetDurationSeconds)}</span>`;
    row.innerHTML = `
      <td><span class="map-rank">${index + 1}</span><span class="map-name">${map.name}</span></td>
      <td>${formatPercent(reached)} / ${cleared}<span class="cell-sub">${reached === 0 ? "not reached" : !map.hasBoss ? "open-ended window" : map.durationCensoredPercent ? `${Math.round(map.durationCensoredPercent)}% duration-censored` : "complete sample"}</span></td>
      <td>${formatDuration(map.enteredAtMedianSeconds)}</td>
      <td>${mapDurationText(map)}${durationTarget}</td>
      <td>${power}${powerGrowth}${powerCompositionMarkup(map)}</td>
      <td>${curveProgressMarkup(map)}</td>
      <td>${bossTtk}</td>
      <td>${map.regularKillsMedian === null ? "—" : Math.round(map.regularKillsMedian).toLocaleString()}</td>
      <td>${stepMarkup}</td>`;
    const selectRow = () => {
      selectedEnemyMap = map.mapId;
      enemyMap.value = map.mapId;
      renderEnemyTable(next);
    };
    row.addEventListener("click", selectRow);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectRow();
      }
    });
    mapTableBody.append(row);
  });
}

function renderDiagnostics(next: BalanceSimulationResult) {
  diagnosticList.replaceChildren();
  for (const diagnostic of next.diagnostics) {
    const item = document.createElement("li");
    item.textContent = diagnostic;
    diagnosticList.append(item);
  }
}

function renderEnemyTable(next: BalanceSimulationResult) {
  const summary = next.maps.find((map) => map.mapId === selectedEnemyMap);
  const metrics = next.enemyMetrics[selectedEnemyMap];
  enemyBasisNote.textContent = summary?.entryPowerMedian === null
    ? "Map not reached by the representative run; projected from that run's furthest available entry build."
    : `Representative entry power ${formatCompactNumber(summary?.entryPowerMedian ?? 0)} · selected HP, damage, and reward multipliers included.`;
  enemyTableBody.replaceChildren();
  for (const metric of metrics) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><span class="enemy-name">${metric.enemy}</span>${metric.elite ? `<span class="enemy-elite">ELITE</span>` : ""}</td>
      <td>${metric.spawnCount}</td>
      <td>${formatCompactNumber(metric.hp)}</td>
      <td>+${formatCompactNumber(metric.rewardAmount)}<span class="reward-type">${metric.rewardType}</span></td>
      <td>${formatDuration(metric.timeToKillSeconds)}<span class="cell-sub">${metric.ttkVsMapMedian.toFixed(2)}× map median</span></td>
      <td>${formatDuration(metric.fullClearCombatSeconds)}<span class="cell-sub">${metric.fullClearCombatSharePercent.toFixed(0)}% of full-clear combat</span></td>
      <td>+${formatCompactNumber(metric.powerGain)}<span class="cell-sub">${metric.powerGainPercentOfEntry.toFixed(3)}% entry power · ${metric.combatSecondsPerOnePercentPower === null ? "—" : formatDuration(metric.combatSecondsPerOnePercentPower)} / 1%</span></td>
      <td>${formatCompactNumber(metric.combatPowerPerMinute)}<span class="cell-sub">${metric.efficiencyVsMapMedian.toFixed(2)}× map median</span></td>
      <td class="${metric.hitsToDefeatPlayer <= 1 ? "risk" : ""}">${formatCompactNumber(metric.damageAfterArmor)}<span class="cell-sub">${metric.hitPercentOfHealth >= 1_000 ? formatCompactNumber(metric.hitPercentOfHealth) : metric.hitPercentOfHealth.toFixed(0)}% HP · ${metric.hitsToDefeatPlayer.toLocaleString()} hits · ${formatCompactNumber(metric.incomingDamagePerSecond)}/s</span><span class="cell-sub">survival ${formatDuration(metric.survivalSeconds)}${metric.referenceHitPercentOfHealth === null ? "" : ` · reference hit ${metric.referenceHitPercentOfHealth.toFixed(1)}% HP`}</span></td>`;
    enemyTableBody.append(row);
  }
}

function svgElement<K extends keyof SVGElementTagNameMap>(name: K, attributes: Record<string, string | number> = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function linePath(
  points: TimelinePoint[],
  value: (point: TimelinePoint) => number,
  x: (seconds: number) => number,
  y: (number: number) => number,
) {
  return points.map((point, index) => `${index ? "L" : "M"}${x(point.timeSeconds).toFixed(2)},${y(value(point)).toFixed(2)}`).join(" ");
}

function renderChart(next: ChartRenderState) {
  const width = 960;
  const height = 390;
  const left = 72;
  const right = 18;
  const top = 50;
  const bottom = 43;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const visibleTimeline = next.visibleTimeline ?? next.timeline;
  const previousPoints = previousResult?.timeline.filter((point) => point.timeSeconds <= next.config.durationSeconds) ?? [];
  const strategyTimelines = (next.strategyTimelines ?? []).filter((entry) => entry.timeline.length > 1);
  const targetCurve = buildStackedLogTargetCurve(
    next.maps.slice(1),
    18,
    next.config.targetPowerArcBlend,
  ).filter((point) => point.timeSeconds <= next.config.durationSeconds);
  const values = next.timeline.flatMap((point) => [point.powerP10, point.powerP90]);
  values.push(...previousPoints.map((point) => point.powerMedian));
  values.push(...targetCurve.map((point) => point.power));
  values.push(...strategyTimelines.flatMap((entry) => entry.timeline.map((point) => point.powerMedian)));
  const positive = values.filter((value) => value > 0 && Number.isFinite(value));
  let minExponent = Math.floor(Math.log10(Math.min(...positive)));
  let maxExponent = Math.ceil(Math.log10(Math.max(...positive)));
  if (minExponent === maxExponent) maxExponent += 1;
  const x = (seconds: number) => left + Math.max(0, Math.min(1, seconds / next.config.durationSeconds)) * plotWidth;
  const y = (value: number) => top + (maxExponent - Math.log10(Math.max(10 ** minExponent, value))) / (maxExponent - minExponent) * plotHeight;

  powerChart.replaceChildren();
  const exponentStep = Math.max(1, Math.ceil((maxExponent - minExponent) / 6));
  for (let exponent = minExponent; exponent <= maxExponent; exponent += exponentStep) {
    const yPosition = y(10 ** exponent);
    powerChart.append(svgElement("line", { x1: left, y1: yPosition, x2: width - right, y2: yPosition, class: "chart-grid" }));
    const label = svgElement("text", { x: left - 10, y: yPosition + 3, class: "chart-axis-label", "text-anchor": "end" });
    label.textContent = formatCompactNumber(10 ** exponent);
    powerChart.append(label);
  }
  if ((maxExponent - minExponent) % exponentStep !== 0) {
    const yPosition = y(10 ** maxExponent);
    powerChart.append(svgElement("line", { x1: left, y1: yPosition, x2: width - right, y2: yPosition, class: "chart-grid" }));
  }
  for (let tick = 0; tick <= 6; tick += 1) {
    const seconds = next.config.durationSeconds * tick / 6;
    const xPosition = x(seconds);
    powerChart.append(svgElement("line", { x1: xPosition, y1: top, x2: xPosition, y2: height - bottom, class: "chart-grid" }));
    const label = svgElement("text", { x: xPosition, y: height - 18, class: "chart-axis-label", "text-anchor": tick === 0 ? "start" : tick === 6 ? "end" : "middle" });
    label.textContent = formatDuration(seconds, true);
    powerChart.append(label);
  }

  next.maps.forEach((map, index) => {
    if (map.enteredAtMedianSeconds === null) return;
    const xPosition = x(map.enteredAtMedianSeconds);
    powerChart.append(svgElement("line", { x1: xPosition, y1: top, x2: xPosition, y2: height - bottom, class: "map-entry-line" }));
    const label = svgElement("text", { x: xPosition + 5, y: 12 + index % 3 * 13, class: "map-entry-label" });
    label.textContent = map.name.toUpperCase();
    powerChart.append(label);
  });

  const upper = visibleTimeline.map((point) => `${x(point.timeSeconds).toFixed(2)},${y(point.powerP90).toFixed(2)}`);
  const lower = [...visibleTimeline].reverse().map((point) => `${x(point.timeSeconds).toFixed(2)},${y(point.powerP10).toFixed(2)}`);
  powerChart.append(svgElement("path", { d: `M${upper.join(" L")} L${lower.join(" L")} Z`, class: "chart-range" }));
  if (previousPoints.length > 1 && previousResult) {
    powerChart.append(svgElement("path", {
      d: linePath(previousPoints, (point) => point.powerMedian, x, y),
      class: "chart-previous",
    }));
  }
  if (targetCurve.length > 1) {
    const path = targetCurve.map((point, index) => `${index ? "L" : "M"}${x(point.timeSeconds).toFixed(2)},${y(point.power).toFixed(2)}`).join(" ");
    powerChart.append(svgElement("path", { d: path, class: "chart-target" }));
  }
  for (const entry of strategyTimelines) {
    powerChart.append(svgElement("path", {
      d: linePath(entry.timeline, (point) => point.powerMedian, x, y),
      class: `chart-strategy ${entry.strategy}`,
    }));
  }
  powerChart.append(svgElement("path", {
    d: linePath(visibleTimeline, (point) => point.powerMedian, x, y),
    class: "chart-median",
  }));

  const focusLine = svgElement("line", { y1: top, y2: height - bottom, class: "chart-focus" });
  const focusDot = svgElement("circle", { r: 4, class: "chart-focus-dot" });
  focusLine.style.display = "none";
  focusDot.style.display = "none";
  powerChart.append(focusLine, focusDot);
  const hitArea = svgElement("rect", { x: left, y: top, width: plotWidth, height: plotHeight, fill: "transparent" });
  hitArea.addEventListener("pointermove", (event) => {
    const bounds = powerChart.getBoundingClientRect();
    const viewX = (event.clientX - bounds.left) / bounds.width * width;
    const ratio = Math.max(0, Math.min(1, (viewX - left) / plotWidth));
    const index = Math.round(ratio * (visibleTimeline.length - 1));
    const point = visibleTimeline[index];
    const xPosition = x(point.timeSeconds);
    const yPosition = y(point.powerMedian);
    focusLine.setAttribute("x1", String(xPosition));
    focusLine.setAttribute("x2", String(xPosition));
    focusDot.setAttribute("cx", String(xPosition));
    focusDot.setAttribute("cy", String(yPosition));
    focusLine.style.display = "";
    focusDot.style.display = "";
    chartTooltip.hidden = false;
    const strategyValues = strategyTimelines.map((entry) => {
      const strategyPoint = entry.timeline[index] ?? entry.timeline[entry.timeline.length - 1];
      return `<br><span class="tooltip-strategy ${entry.strategy}">${strategyLabels[entry.strategy]} ${formatCompactNumber(strategyPoint.powerMedian)}</span>`;
    }).join("");
    chartTooltip.innerHTML = `<strong>${formatDuration(point.timeSeconds)}</strong><br>POWER ${formatCompactNumber(point.powerMedian)}<br>RANGE ${formatCompactNumber(point.powerP10)}–${formatCompactNumber(point.powerP90)}<br>DPS ${formatCompactNumber(point.dpsMedian)}${strategyValues}`;
    const frameBounds = chartFrame.getBoundingClientRect();
    const tooltipLeft = event.clientX - frameBounds.left + 14;
    chartTooltip.style.left = `${Math.min(frameBounds.width - 175, Math.max(8, tooltipLeft))}px`;
    chartTooltip.style.top = `${Math.max(8, event.clientY - frameBounds.top - 38)}px`;
  });
  hitArea.addEventListener("pointerleave", () => {
    chartTooltip.hidden = true;
    focusLine.style.display = "none";
    focusDot.style.display = "none";
  });
  powerChart.append(hitArea);
  previousLegend.hidden = !previousPoints.length;
  strategyLegend.replaceChildren();
  strategyLegend.hidden = !strategyTimelines.length;
  for (const entry of strategyTimelines) {
    const legendItem = document.createElement("span");
    legendItem.innerHTML = `<i class="legend-line strategy ${entry.strategy}"></i>${strategyLabels[entry.strategy]}`;
    strategyLegend.append(legendItem);
  }
  const comparisonText = strategyTimelines.length
    ? ` · ${next.strategyComparisonTrials ?? "—"} STRATEGY RUN${next.strategyComparisonTrials === 1 ? "" : "S"}`
    : "";
  chartSampleNote.textContent = `${next.simulatedCampaigns} SEEDED RUN${next.simulatedCampaigns === 1 ? "" : "S"}${comparisonText}`;
}

function renderProgress(progress: BalanceSimulationProgress) {
  const revealCount = progress.completedTrials >= progress.totalTrials
    ? progress.timeline.length
    : Math.min(
      progress.timeline.length,
      Math.max(2, Math.ceil(progress.timeline.length * progress.completedTrials / progress.totalTrials)),
    );
  renderChart({
    config: progress.config,
    maps: [],
    timeline: progress.timeline,
    visibleTimeline: progress.timeline.slice(0, revealCount),
    simulatedCampaigns: progress.completedTrials,
  });
}

function render(next: BalanceSimulationResult) {
  renderSummary(next);
  renderChart(next);
  renderTimeBudgets(next);
  renderStatProgression(next);
  renderHeadroom(next);
  renderMapTable(next);
  renderDiagnostics(next);
  const medianMap = [...next.maps].reverse().find((map) => map.reachedPercent >= 50);
  if (medianMap) selectedEnemyMap = medianMap.mapId;
  enemyMap.value = selectedEnemyMap;
  renderEnemyTable(next);
}

let simulationWorker = new Worker(new URL("./balance-worker.ts", import.meta.url), { type: "module" });

function runSimulation() {
  syncConfigFromControls();
  syncTuningConfig();
  saveConfig();
  requestId += 1;
  requestStartedAt = performance.now();
  runButton.disabled = true;
  form.inert = true;
  setStatus("running", `Simulating ${config.trials} seeded campaigns…`, `${Number((config.durationSeconds / 86_400).toFixed(2))} game days each`);
  simulationWorker.postMessage({ id: requestId, config });
}

simulationWorker.addEventListener("message", (event: MessageEvent<SimulationResponse>) => {
  if (event.data.id !== requestId) return;
  if (!event.data.ok) {
    runButton.disabled = false;
    form.inert = false;
    setStatus("error", "Simulation failed", event.data.message);
    return;
  }
  if (event.data.type === "progress") {
    const { completedTrials, totalTrials } = event.data.progress;
    renderProgress(event.data.progress);
    setStatus(
      "running",
      `Simulating ${completedTrials}/${totalTrials} seeded campaigns…`,
      `${Math.round(completedTrials / totalTrials * 100)}% of graph filled`,
    );
    return;
  }
  runButton.disabled = false;
  form.inert = false;
  previousResult = result;
  result = event.data.result;
  config = result.config;
  syncControlsFromConfig();
  render(result);
  const wallMs = performance.now() - requestStartedAt;
  setStatus("done", "Simulation complete", `${result.simulatedCampaigns} runs · ${(event.data.elapsedMs / 1_000).toFixed(2)}s model / ${(wallMs / 1_000).toFixed(2)}s wall`);
});

simulationWorker.addEventListener("error", (event) => {
  runButton.disabled = false;
  form.inert = false;
  setStatus("error", "Simulation worker failed", event.message);
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runSimulation();
});

form.addEventListener("input", (event) => {
  if (
    event.target === mapHpMultiplier ||
    event.target === mapBossHpMultiplier ||
    event.target === mapDamageMultiplier ||
    event.target === mapRewardMultiplier ||
    event.target === mapBossRewardMultiplier
  ) {
    syncTuningConfig();
  }
  markDirty();
});

form.addEventListener("change", markDirty);

tuningMap.addEventListener("change", () => {
  selectedTuningMap = tuningMap.value as BalanceMapId;
  syncTuningControls();
});

enemyMap.addEventListener("change", () => {
  selectedEnemyMap = enemyMap.value as BalanceMapId;
  if (result) renderEnemyTable(result);
});

resetMapButton.addEventListener("click", () => {
  config.mapAdjustments[selectedTuningMap] = { hp: 1, bossHp: 1, damage: 1, reward: 1, bossReward: 1 };
  syncTuningControls();
  markDirty();
});

resetConfigButton.addEventListener("click", () => {
  config = defaultBalanceSimulationConfig();
  selectedTuningMap = BALANCE_MAP_IDS[0];
  syncControlsFromConfig();
  markDirty();
});

copyConfigButton.addEventListener("click", async () => {
  syncConfigFromControls();
  syncTuningConfig();
  const text = JSON.stringify(config, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    copyConfigButton.textContent = "COPIED";
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
    copyConfigButton.textContent = "COPIED";
  }
  window.setTimeout(() => { copyConfigButton.textContent = "COPY CONFIG"; }, 1_200);
});

syncControlsFromConfig();
runSimulation();

window.addEventListener("beforeunload", () => simulationWorker.terminate());
