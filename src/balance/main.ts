import "./styles.css";

import { MAP_DISPLAY_NAMES } from "../../shared/rules";
import { formatCompactNumber } from "../ui/number-format";
import {
  BALANCE_MAP_IDS,
  defaultBalanceSimulationConfig,
  type BalanceMapId,
  type BalanceSimulationConfig,
  type BalanceSimulationResult,
  type FarmingStrategy,
  type ResearchPlan,
  type TimelinePoint,
} from "./simulator";

type SimulationResponse =
  | { id: number; ok: true; elapsedMs: number; result: BalanceSimulationResult }
  | { id: number; ok: false; message: string };

const STORAGE_KEY = "wildwood.balanceLab.config.v1";
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
const targetMapDurationMultiplier = requiredElement<HTMLInputElement>("targetMapDurationMultiplier");
const requiredClears = requiredElement<HTMLInputElement>("requiredClears");
const respawnSeconds = requiredElement<HTMLInputElement>("respawnSeconds");
const pathingMultiplier = requiredElement<HTMLInputElement>("pathingMultiplier");
const itemUpgradeLevel = requiredElement<HTMLInputElement>("itemUpgradeLevel");
const tuningMap = requiredElement<HTMLSelectElement>("tuningMap");
const mapHpMultiplier = requiredElement<HTMLInputElement>("mapHpMultiplier");
const mapDamageMultiplier = requiredElement<HTMLInputElement>("mapDamageMultiplier");
const mapRewardMultiplier = requiredElement<HTMLInputElement>("mapRewardMultiplier");
const mapHpValue = requiredElement<HTMLOutputElement>("mapHpValue");
const mapDamageValue = requiredElement<HTMLOutputElement>("mapDamageValue");
const mapRewardValue = requiredElement<HTMLOutputElement>("mapRewardValue");
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
const diagnosticList = requiredElement<HTMLOListElement>("diagnosticList");
const enemyMap = requiredElement<HTMLSelectElement>("enemyMap");
const enemyBasisNote = requiredElement<HTMLElement>("enemyBasisNote");
const enemyTableBody = requiredElement<HTMLTableSectionElement>("enemyTableBody");
const powerChart = requiredElement<SVGSVGElement>("powerChart");
const chartFrame = requiredElement<HTMLElement>("chartFrame");
const chartTooltip = requiredElement<HTMLElement>("chartTooltip");
const chartSampleNote = requiredElement<HTMLElement>("chartSampleNote");
const previousLegend = requiredElement<HTMLElement>("previousLegend");

function mergeStoredConfig(stored: unknown): BalanceSimulationConfig {
  const defaults = defaultBalanceSimulationConfig();
  if (!stored || typeof stored !== "object") return defaults;
  const candidate = stored as Partial<BalanceSimulationConfig>;
  const adjustments = { ...defaults.mapAdjustments };
  for (const mapId of BALANCE_MAP_IDS) {
    const adjustment = candidate.mapAdjustments?.[mapId];
    if (adjustment) adjustments[mapId] = { ...adjustments[mapId], ...adjustment };
  }
  return { ...defaults, ...candidate, mapAdjustments: adjustments };
}

function loadConfig() {
  try {
    return mergeStoredConfig(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
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
  durationDays.value = String(Number((config.durationSeconds / 86_400).toFixed(2)));
  trials.value = String(config.trials);
  trialsValue.value = String(config.trials);
  strategy.value = config.strategy;
  researchPlan.value = config.researchPlan;
  bossTargetMinutes.value = String(Number((config.bossTargetSeconds / 60).toFixed(2)));
  targetMapDurationMultiplier.value = String(config.targetMapDurationMultiplier);
  requiredClears.value = String(config.requiredClears);
  respawnSeconds.value = String(config.respawnSeconds);
  pathingMultiplier.value = String(config.pathingMultiplier);
  itemUpgradeLevel.value = String(config.itemUpgradeLevel);
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
  config.targetMapDurationMultiplier = numberValue(targetMapDurationMultiplier, config.targetMapDurationMultiplier);
  config.requiredClears = Math.round(numberValue(requiredClears, config.requiredClears));
  config.respawnSeconds = numberValue(respawnSeconds, config.respawnSeconds);
  config.pathingMultiplier = numberValue(pathingMultiplier, config.pathingMultiplier);
  config.itemUpgradeLevel = Math.round(numberValue(itemUpgradeLevel, config.itemUpgradeLevel));
  trialsValue.value = String(config.trials);
  updateRunEstimate();
}

function syncTuningControls() {
  const adjustment = config.mapAdjustments[selectedTuningMap];
  mapHpMultiplier.value = String(Math.round(adjustment.hp * 100));
  mapDamageMultiplier.value = String(Math.round(adjustment.damage * 100));
  mapRewardMultiplier.value = String(Math.round(adjustment.reward * 100));
  mapHpValue.value = `${mapHpMultiplier.value}%`;
  mapDamageValue.value = `${mapDamageMultiplier.value}%`;
  mapRewardValue.value = `${mapRewardMultiplier.value}%`;
}

function syncTuningConfig() {
  config.mapAdjustments[selectedTuningMap] = {
    hp: numberValue(mapHpMultiplier, 100) / 100,
    damage: numberValue(mapDamageMultiplier, 100) / 100,
    reward: numberValue(mapRewardMultiplier, 100) / 100,
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
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch { /* Local storage is optional. */ }
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
  const initialPower = next.timeline[0]?.powerMedian ?? 1;
  const finalPower = next.finalPower.median;
  const dailyGrowth = (finalPower / Math.max(1, initialPower)) ** (86_400 / next.config.durationSeconds);
  const furthestMap = [...next.maps].reverse().find((map) => map.reachedPercent >= 50) ?? next.maps[0];
  const previousFurthest = previousResult
    ? [...previousResult.maps].reverse().find((map) => map.reachedPercent >= 50)
    : null;
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
      label: "GEOMETRIC GROWTH / DAY",
      value: formatRatio(dailyGrowth),
      detail: `${formatRatio(finalPower / Math.max(1, initialPower))} across ${formatDuration(next.config.durationSeconds)}`,
    },
    {
      label: "FURTHEST MEDIAN MAP",
      value: furthestMap.name,
      detail: `entered ${formatDuration(furthestMap.enteredAtMedianSeconds)} · ${previousFurthest && previousFurthest.mapId !== furthestMap.mapId ? `<span class="delta">was ${previousFurthest.name}</span>` : "50%+ of runs"}`,
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

function renderMapTable(next: BalanceSimulationResult) {
  mapTableBody.replaceChildren();
  next.maps.forEach((map, index) => {
    const row = document.createElement("tr");
    row.dataset.mapId = map.mapId;
    row.tabIndex = 0;
    const reached = map.reachedPercent;
    const cleared = map.hasBoss ? formatPercent(map.completedPercent) : "OPEN";
    const bossTtk = map.hasBoss ? formatDuration(map.bossTtkAtEntryMedianSeconds) : "—";
    const step = map.durationVsPrevious;
    const stepMarkup = step === null
      ? `<span class="neutral">${index === 0 ? "BASE" : map.hasBoss ? "CENSORED" : "ENDLESS"}</span>`
      : `<span class="step-pill${step > next.config.targetMapDurationMultiplier * 1.5 ? " wall" : ""}">${step.toFixed(2)}×</span><span class="cell-sub">target ${next.config.targetMapDurationMultiplier.toFixed(2)}×</span>`;
    const power = map.entryPowerMedian === null
      ? "—"
      : `${formatCompactNumber(map.entryPowerMedian)} → ${formatCompactNumber(map.exitPowerMedian ?? map.entryPowerMedian)}`;
    row.innerHTML = `
      <td><span class="map-rank">${index + 1}</span><span class="map-name">${map.name}</span></td>
      <td>${formatPercent(reached)} / ${cleared}<span class="cell-sub">${reached === 0 ? "not reached" : !map.hasBoss ? "open-ended window" : map.durationCensoredPercent ? `${Math.round(map.durationCensoredPercent)}% duration-censored` : "complete sample"}</span></td>
      <td>${formatDuration(map.enteredAtMedianSeconds)}</td>
      <td>${mapDurationText(map)}</td>
      <td>${power}</td>
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
      <td><span class="enemy-name">${metric.enemy}</span></td>
      <td>${metric.spawnCount}</td>
      <td>${formatCompactNumber(metric.hp)}</td>
      <td>+${formatCompactNumber(metric.rewardAmount)}<span class="reward-type">${metric.rewardType}</span></td>
      <td>${formatDuration(metric.timeToKillSeconds)}</td>
      <td>${formatCompactNumber(metric.combatPowerPerMinute)}</td>
      <td>${formatCompactNumber(metric.damageAfterArmor)}<span class="cell-sub">${metric.hitPercentOfHealth >= 1_000 ? formatCompactNumber(metric.hitPercentOfHealth) : metric.hitPercentOfHealth.toFixed(0)}% HP</span></td>
      <td class="${metric.hitsToDefeatPlayer <= 1 ? "risk" : ""}">${metric.hitsToDefeatPlayer.toLocaleString()}</td>`;
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

function renderChart(next: BalanceSimulationResult) {
  const width = 960;
  const height = 390;
  const left = 72;
  const right = 18;
  const top = 50;
  const bottom = 43;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const previousPoints = previousResult?.timeline.filter((point) => point.timeSeconds <= next.config.durationSeconds) ?? [];
  const values = next.timeline.flatMap((point) => [point.powerP10, point.powerP90]);
  values.push(...previousPoints.map((point) => point.powerMedian));
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
    const label = svgElement("text", { x: xPosition + 5, y: 17 + index % 2 * 13, class: "map-entry-label" });
    label.textContent = map.name.toUpperCase();
    powerChart.append(label);
  });

  const upper = next.timeline.map((point) => `${x(point.timeSeconds).toFixed(2)},${y(point.powerP90).toFixed(2)}`);
  const lower = [...next.timeline].reverse().map((point) => `${x(point.timeSeconds).toFixed(2)},${y(point.powerP10).toFixed(2)}`);
  powerChart.append(svgElement("path", { d: `M${upper.join(" L")} L${lower.join(" L")} Z`, class: "chart-range" }));
  if (previousPoints.length > 1 && previousResult) {
    powerChart.append(svgElement("path", {
      d: linePath(previousPoints, (point) => point.powerMedian, x, y),
      class: "chart-previous",
    }));
  }
  powerChart.append(svgElement("path", {
    d: linePath(next.timeline, (point) => point.powerMedian, x, y),
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
    const index = Math.round(ratio * (next.timeline.length - 1));
    const point = next.timeline[index];
    const xPosition = x(point.timeSeconds);
    const yPosition = y(point.powerMedian);
    focusLine.setAttribute("x1", String(xPosition));
    focusLine.setAttribute("x2", String(xPosition));
    focusDot.setAttribute("cx", String(xPosition));
    focusDot.setAttribute("cy", String(yPosition));
    focusLine.style.display = "";
    focusDot.style.display = "";
    chartTooltip.hidden = false;
    chartTooltip.innerHTML = `<strong>${formatDuration(point.timeSeconds)}</strong><br>POWER ${formatCompactNumber(point.powerMedian)}<br>RANGE ${formatCompactNumber(point.powerP10)}–${formatCompactNumber(point.powerP90)}<br>DPS ${formatCompactNumber(point.dpsMedian)}`;
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
  chartSampleNote.textContent = `${next.simulatedCampaigns} SEEDED RUN${next.simulatedCampaigns === 1 ? "" : "S"}`;
}

function render(next: BalanceSimulationResult) {
  renderSummary(next);
  renderChart(next);
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
  runButton.disabled = false;
  form.inert = false;
  if (!event.data.ok) {
    setStatus("error", "Simulation failed", event.data.message);
    return;
  }
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
  if (event.target === mapHpMultiplier || event.target === mapDamageMultiplier || event.target === mapRewardMultiplier) {
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
  config.mapAdjustments[selectedTuningMap] = { hp: 1, damage: 1, reward: 1 };
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
