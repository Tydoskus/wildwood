import "./stat-graph.css";

import { BOSS_DAMAGE_PROFILES } from "../game/boss-damage";
import { ENEMY_TYPES, type EnemyDefinition, type EnemyKind } from "../game/enemies";
import {
  ADVANCED_LAVA_WASTES_MAP_ID,
  BEGINNER_DESERT_MAP_ID,
  CLOUDSPIRE_MAP_ID,
  createSpawnSites,
  CRYSTAL_HOLLOWS_MAP_ID, CLOCKWORK_RUINS_MAP_ID, DUSKFALL_ORCHARD_MAP_ID,
  INFERNAL_DEPTHS_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  MOONFEN_MAP_ID,
  mapSpawnCamps,
  SAMURAI_GARDEN_MAP_ID,
  TUTORIAL_FOREST_MAP_ID,
  WATER_REACH_MAP_ID,
  type MapId,
} from "../game/world";
import { formatCompactNumber } from "../ui/number-format";
import {
  DRAGON_MAX_HP,
  DRAGON_REWARD_DAMAGE,
  FROSTCLAW_MAX_HP,
  FROSTCLAW_REWARD_ARMOR,
  FROSTCLAW_REWARD_DAMAGE,
  FROSTCLAW_REWARD_HEALTH,
  GLOOMROOT_MAX_HP,
  GLOOMROOT_REWARD_ARMOR,
  GLOOMROOT_REWARD_DAMAGE,
  GLOOMROOT_REWARD_HEALTH,
  GLOOMROOT_REWARD_REGEN,
  KOI_SHOGUN_MAX_HP,
  KOI_SHOGUN_REWARD_ARMOR,
  KOI_SHOGUN_REWARD_DAMAGE,
  KOI_SHOGUN_REWARD_HEALTH,
  KOI_SHOGUN_REWARD_REGEN,
  MAGMALISK_MAX_HP,
  MAGMALISK_REWARD_ARMOR,
  MAGMALISK_REWARD_DAMAGE,
  MAGMALISK_REWARD_HEALTH,
  MAGMALISK_REWARD_REGEN,
  MAP_DISPLAY_NAMES,
  MIREMAW_MAX_HP,
  MIREMAW_REWARD_ARMOR,
  MIREMAW_REWARD_DAMAGE,
  MIREMAW_REWARD_HEALTH,
  MIREMAW_REWARD_REGEN,
  PRISMSHELL_MAX_HP, IRONHORN_MAX_HP, DREADREAPER_MAX_HP,
  PRISMSHELL_REWARD_ARMOR, IRONHORN_REWARD_ARMOR, DREADREAPER_REWARD_ARMOR,
  PRISMSHELL_REWARD_DAMAGE, IRONHORN_REWARD_DAMAGE, DREADREAPER_REWARD_DAMAGE,
  PRISMSHELL_REWARD_HEALTH, IRONHORN_REWARD_HEALTH, DREADREAPER_REWARD_HEALTH,
  PRISMSHELL_REWARD_REGEN, IRONHORN_REWARD_REGEN, DREADREAPER_REWARD_REGEN,
  SPIDER_MAX_HP,
  SPIDER_REWARD_DAMAGE,
  SPIDER_REWARD_HEALTH,
  TEMPEST_KIRIN_MAX_HP,
  TEMPEST_KIRIN_REWARD_ARMOR,
  TEMPEST_KIRIN_REWARD_DAMAGE,
  TEMPEST_KIRIN_REWARD_HEALTH,
  TEMPEST_KIRIN_REWARD_REGEN,
  TIDEWYRM_MAX_HP,
  TIDEWYRM_REWARD_ARMOR,
  TIDEWYRM_REWARD_DAMAGE,
  TIDEWYRM_REWARD_HEALTH,
  TIDEWYRM_REWARD_REGEN,
} from "../../shared/rules";

type RewardStat = "damage" | "health" | "armor" | "regen";
type MetricGroup = "combat" | "rewards";
type BossKind = keyof typeof BOSS_DAMAGE_PROFILES;

export type StatGraphMetricKey =
  | "regularHealth"
  | "regularDamage"
  | "bossHealth"
  | "bossHeavyHit"
  | "regularRewardDamage1"
  | "regularRewardDamage2"
  | "regularRewardDamage3"
  | "regularRewardHealth1"
  | "regularRewardHealth2"
  | "regularRewardArmor1"
  | "regularRewardRegen1"
  | "bossRewardDamage"
  | "bossRewardHealth"
  | "bossRewardArmor"
  | "bossRewardRegen";

export type StatGraphMetric = {
  key: StatGraphMetricKey;
  label: string;
  group: MetricGroup;
  series: number;
  regularReward?: { stat: RewardStat; sourceIndex: number };
};

export const STAT_GRAPH_METRICS = [
  { key: "regularHealth", label: "Regular HP", group: "combat", series: 1 },
  { key: "regularDamage", label: "Regular damage / strength", group: "combat", series: 2 },
  { key: "bossHealth", label: "Boss HP", group: "combat", series: 3 },
  { key: "bossHeavyHit", label: "Boss heavy hit", group: "combat", series: 4 },
  { key: "regularRewardDamage1", label: "Regular damage reward · first", group: "rewards", series: 5, regularReward: { stat: "damage", sourceIndex: 0 } },
  { key: "regularRewardDamage2", label: "Regular damage reward · second", group: "rewards", series: 6, regularReward: { stat: "damage", sourceIndex: 1 } },
  { key: "regularRewardDamage3", label: "Regular damage reward · third", group: "rewards", series: 7, regularReward: { stat: "damage", sourceIndex: 2 } },
  { key: "regularRewardHealth1", label: "Regular health reward · first", group: "rewards", series: 8, regularReward: { stat: "health", sourceIndex: 0 } },
  { key: "regularRewardHealth2", label: "Regular health reward · second", group: "rewards", series: 9, regularReward: { stat: "health", sourceIndex: 1 } },
  { key: "regularRewardArmor1", label: "Regular armor reward", group: "rewards", series: 10, regularReward: { stat: "armor", sourceIndex: 0 } },
  { key: "regularRewardRegen1", label: "Regular regen reward", group: "rewards", series: 11, regularReward: { stat: "regen", sourceIndex: 0 } },
  { key: "bossRewardDamage", label: "Boss clear: damage", group: "rewards", series: 12 },
  { key: "bossRewardHealth", label: "Boss clear: health", group: "rewards", series: 13 },
  { key: "bossRewardArmor", label: "Boss clear: armor", group: "rewards", series: 14 },
  { key: "bossRewardRegen", label: "Boss clear: regen", group: "rewards", series: 15 },
] as const satisfies readonly StatGraphMetric[];

export type RegularRewardSource = {
  kind: EnemyKind;
  amount: number;
};

export type StatGraphRow = {
  mapId: MapId;
  name: string;
  values: Record<StatGraphMetricKey, number | null>;
  multipliers: Record<StatGraphMetricKey, number | null>;
  regularRewards: Record<RewardStat, readonly RegularRewardSource[]>;
};

type BossRewards = Partial<Record<RewardStat, number>>;
type AuthoredMap = {
  id: MapId;
  bossKind: BossKind;
  bossMaxHp: number;
  bossRewards: BossRewards;
};

const AUTHORED_MAPS: readonly AuthoredMap[] = [
  {
    id: TUTORIAL_FOREST_MAP_ID,
    bossKind: "dragon",
    bossMaxHp: DRAGON_MAX_HP,
    bossRewards: { damage: DRAGON_REWARD_DAMAGE },
  },
  {
    id: BEGINNER_DESERT_MAP_ID,
    bossKind: "spider",
    bossMaxHp: SPIDER_MAX_HP,
    bossRewards: { damage: SPIDER_REWARD_DAMAGE, health: SPIDER_REWARD_HEALTH },
  },
  {
    id: INTERMEDIATE_SNOWLANDS_MAP_ID,
    bossKind: "frostclaw",
    bossMaxHp: FROSTCLAW_MAX_HP,
    bossRewards: {
      damage: FROSTCLAW_REWARD_DAMAGE,
      health: FROSTCLAW_REWARD_HEALTH,
      armor: FROSTCLAW_REWARD_ARMOR,
    },
  },
  {
    id: ADVANCED_LAVA_WASTES_MAP_ID,
    bossKind: "magmalisk",
    bossMaxHp: MAGMALISK_MAX_HP,
    bossRewards: {
      damage: MAGMALISK_REWARD_DAMAGE,
      health: MAGMALISK_REWARD_HEALTH,
      armor: MAGMALISK_REWARD_ARMOR,
      regen: MAGMALISK_REWARD_REGEN,
    },
  },
  {
    id: INFERNAL_DEPTHS_MAP_ID,
    bossKind: "gloomroot",
    bossMaxHp: GLOOMROOT_MAX_HP,
    bossRewards: {
      damage: GLOOMROOT_REWARD_DAMAGE,
      health: GLOOMROOT_REWARD_HEALTH,
      armor: GLOOMROOT_REWARD_ARMOR,
      regen: GLOOMROOT_REWARD_REGEN,
    },
  },
  {
    id: WATER_REACH_MAP_ID,
    bossKind: "tidewyrm",
    bossMaxHp: TIDEWYRM_MAX_HP,
    bossRewards: {
      damage: TIDEWYRM_REWARD_DAMAGE,
      health: TIDEWYRM_REWARD_HEALTH,
      armor: TIDEWYRM_REWARD_ARMOR,
      regen: TIDEWYRM_REWARD_REGEN,
    },
  },
  {
    id: SAMURAI_GARDEN_MAP_ID,
    bossKind: "koiShogun",
    bossMaxHp: KOI_SHOGUN_MAX_HP,
    bossRewards: {
      damage: KOI_SHOGUN_REWARD_DAMAGE,
      health: KOI_SHOGUN_REWARD_HEALTH,
      armor: KOI_SHOGUN_REWARD_ARMOR,
      regen: KOI_SHOGUN_REWARD_REGEN,
    },
  },
  {
    id: CLOUDSPIRE_MAP_ID,
    bossKind: "tempestKirin",
    bossMaxHp: TEMPEST_KIRIN_MAX_HP,
    bossRewards: {
      damage: TEMPEST_KIRIN_REWARD_DAMAGE,
      health: TEMPEST_KIRIN_REWARD_HEALTH,
      armor: TEMPEST_KIRIN_REWARD_ARMOR,
      regen: TEMPEST_KIRIN_REWARD_REGEN,
    },
  },
  {
    id: MOONFEN_MAP_ID,
    bossKind: "miremaw",
    bossMaxHp: MIREMAW_MAX_HP,
    bossRewards: {
      damage: MIREMAW_REWARD_DAMAGE,
      health: MIREMAW_REWARD_HEALTH,
      armor: MIREMAW_REWARD_ARMOR,
      regen: MIREMAW_REWARD_REGEN,
    },
  },
  {
    id: CRYSTAL_HOLLOWS_MAP_ID,
    bossKind: "prismshell",
    bossMaxHp: PRISMSHELL_MAX_HP,
    bossRewards: {
      damage: PRISMSHELL_REWARD_DAMAGE,
      health: PRISMSHELL_REWARD_HEALTH,
      armor: PRISMSHELL_REWARD_ARMOR,
      regen: PRISMSHELL_REWARD_REGEN,
    },
  }, {
    id: CLOCKWORK_RUINS_MAP_ID,
    bossKind: "ironhorn",
    bossMaxHp: IRONHORN_MAX_HP,
    bossRewards: {
      damage: IRONHORN_REWARD_DAMAGE,
      health: IRONHORN_REWARD_HEALTH,
      armor: IRONHORN_REWARD_ARMOR,
      regen: IRONHORN_REWARD_REGEN,
    },
  }, {
    id: DUSKFALL_ORCHARD_MAP_ID,
    bossKind: "dreadreaper",
    bossMaxHp: DREADREAPER_MAX_HP,
    bossRewards: {
      damage: DREADREAPER_REWARD_DAMAGE,
      health: DREADREAPER_REWARD_HEALTH,
      armor: DREADREAPER_REWARD_ARMOR,
      regen: DREADREAPER_REWARD_REGEN,
    },
  },
];

function weightedAverage(
  entries: readonly { value: number; weight: number }[],
): number | null {
  const totalWeight = entries.reduce((total, entry) => total + entry.weight, 0);
  if (totalWeight <= 0) return null;
  return entries.reduce((total, entry) => total + entry.value * entry.weight, 0) / totalWeight;
}

function regularMapStats(mapId: MapId) {
  const counts = new Map<EnemyKind, number>();
  for (const site of createSpawnSites({ x: 4050, y: 4050 }, mapId)) {
    counts.set(site.type, (counts.get(site.type) ?? 0) + 1);
  }

  const entries = (read: (enemy: EnemyDefinition) => number) =>
    [...counts.entries()].map(([kind, weight]) => ({ value: read(ENEMY_TYPES[kind]), weight }));

  return {
    health: weightedAverage(entries((enemy) => enemy.hp)),
    damage: weightedAverage(entries((enemy) => enemy.damage)),
  };
}

function regularMapRewardSources(mapId: MapId): Record<RewardStat, RegularRewardSource[]> {
  const sources: Record<RewardStat, RegularRewardSource[]> = {
    damage: [], health: [], armor: [], regen: [],
  };
  const includedKinds = new Set<EnemyKind>();
  for (const camp of mapSpawnCamps(mapId)) {
    for (const kind of camp.types) {
      if (includedKinds.has(kind)) continue;
      includedKinds.add(kind);
      // Spitter is onboarding-only. It is intentionally excluded from the
      // campaign progression view, whose first damage source is Cindermaw.
      if (kind === "Spitter") continue;
      const enemy = ENEMY_TYPES[kind];
      if (enemy.reward.type === "speed") continue;
      sources[enemy.reward.type].push({ kind, amount: enemy.reward.amount });
    }
  }
  return sources;
}

function bossHeavyHit(kind: BossKind) {
  return Math.max(...(Object.values(BOSS_DAMAGE_PROFILES[kind]) as number[]));
}

function mapValues(
  map: AuthoredMap,
  regularRewards: Record<RewardStat, readonly RegularRewardSource[]>,
): StatGraphRow["values"] {
  const regular = regularMapStats(map.id);
  return {
    regularHealth: regular.health,
    regularDamage: regular.damage,
    bossHealth: map.bossMaxHp,
    bossHeavyHit: bossHeavyHit(map.bossKind),
    regularRewardDamage1: regularRewards.damage[0]?.amount ?? null,
    regularRewardDamage2: regularRewards.damage[1]?.amount ?? null,
    regularRewardDamage3: regularRewards.damage[2]?.amount ?? null,
    regularRewardHealth1: regularRewards.health[0]?.amount ?? null,
    regularRewardHealth2: regularRewards.health[1]?.amount ?? null,
    regularRewardArmor1: regularRewards.armor[0]?.amount ?? null,
    regularRewardRegen1: regularRewards.regen[0]?.amount ?? null,
    bossRewardDamage: map.bossRewards.damage ?? null,
    bossRewardHealth: map.bossRewards.health ?? null,
    bossRewardArmor: map.bossRewards.armor ?? null,
    bossRewardRegen: map.bossRewards.regen ?? null,
  };
}

function mapMultipliers(
  values: StatGraphRow["values"],
  previous: StatGraphRow["values"] | null,
): StatGraphRow["multipliers"] {
  const multipliers = {} as StatGraphRow["multipliers"];
  for (const metric of STAT_GRAPH_METRICS) {
    const current = values[metric.key];
    const prior = previous?.[metric.key] ?? null;
    multipliers[metric.key] = current !== null && prior !== null && prior !== 0
      ? current / prior
      : null;
  }
  return multipliers;
}

export const AUTHORED_STAT_GRAPH: readonly StatGraphRow[] = (() => {
  let previous: StatGraphRow["values"] | null = null;
  return AUTHORED_MAPS.map((map) => {
    const regularRewards = regularMapRewardSources(map.id);
    const values = mapValues(map, regularRewards);
    const row: StatGraphRow = {
      mapId: map.id,
      name: MAP_DISPLAY_NAMES[map.id],
      values,
      multipliers: mapMultipliers(values, previous),
      regularRewards,
    };
    previous = values;
    return row;
  });
})();

function formatValue(value: number) {
  const absolute = Math.abs(value);
  if (absolute > 0 && absolute < 1) return value.toPrecision(3).replace(/0+$/, "").replace(/\.$/, "");
  return formatCompactNumber(value);
}

function formatFullValue(value: number) {
  if (Math.abs(value) < 1_000_000_000_000_000_000_000) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(value);
  }
  return value.toExponential(4);
}

function formatMultiplier(value: number | null) {
  if (value === null) return "—";
  if (value >= 100 || value < 0.01) return `${value.toExponential(2)}×`;
  if (value >= 10 || value < 0.1) return `${value.toFixed(1)}×`;
  return `${value.toFixed(2)}×`;
}

function svgElement<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string>,
) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

function renderChart(svg: SVGSVGElement, metrics: readonly StatGraphMetric[]) {
  const width = 1120;
  const height = 410;
  const margin = { top: 24, right: 24, bottom: 92, left: 76 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = metrics.flatMap((metric) => AUTHORED_STAT_GRAPH
    .map((row) => row.multipliers[metric.key])
    .filter((value): value is number => value !== null && value > 0));
  const minimum = Math.min(...values, 1);
  const maximum = Math.max(...values, 1);
  const minimumExponent = Math.min(0, Math.floor(Math.log10(minimum)));
  const maximumExponent = Math.max(0, Math.ceil(Math.log10(maximum)));
  const domainMinimum = 10 ** minimumExponent;
  const domainMaximum = 10 ** maximumExponent;
  const logMinimum = Math.log10(domainMinimum);
  const logRange = Math.log10(domainMaximum) - logMinimum || 1;
  const x = (index: number) => margin.left + (index / (AUTHORED_STAT_GRAPH.length - 1)) * plotWidth;
  const y = (value: number) => margin.top + (1 - (Math.log10(value) - logMinimum) / logRange) * plotHeight;

  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Map-to-map balance multipliers");
  const title = svgElement("title", {});
  title.textContent = "Map-to-map balance multipliers";
  const description = svgElement("desc", {});
  description.textContent = "Each point is the current map value divided by the previous map value. Tutorial Forest is the baseline.";
  svg.append(title, description);

  for (let exponent = minimumExponent; exponent <= maximumExponent; exponent += 1) {
    for (const base of [1, 2, 5]) {
      const tick = base * 10 ** exponent;
      if (tick < domainMinimum || tick > domainMaximum) continue;
      const tickY = y(tick);
      svg.append(
        svgElement("line", {
          x1: String(margin.left), x2: String(width - margin.right),
          y1: String(tickY), y2: String(tickY),
          class: tick === 1 ? "chart-grid chart-baseline" : "chart-grid",
        }),
        svgElement("text", {
          x: String(margin.left - 12), y: String(tickY + 4),
          class: "chart-axis-label", "text-anchor": "end",
        }),
      );
      svg.lastChild!.textContent = formatMultiplier(tick);
    }
  }

  svg.append(
    svgElement("line", {
      x1: String(margin.left), x2: String(margin.left),
      y1: String(margin.top), y2: String(height - margin.bottom),
      class: "chart-axis",
    }),
    svgElement("line", {
      x1: String(margin.left), x2: String(width - margin.right),
      y1: String(height - margin.bottom), y2: String(height - margin.bottom),
      class: "chart-axis",
    }),
  );

  const yAxisTitle = svgElement("text", {
    x: "18", y: String(margin.top + plotHeight / 2),
    class: "chart-axis-title", transform: `rotate(-90 18 ${margin.top + plotHeight / 2})`,
    "text-anchor": "middle",
  });
  yAxisTitle.textContent = "multiplier vs previous map";
  svg.append(yAxisTitle);

  AUTHORED_STAT_GRAPH.forEach((row, index) => {
    const label = svgElement("text", {
      x: String(x(index)), y: String(height - margin.bottom + 22),
      class: "chart-map-label", transform: `rotate(-38 ${x(index)} ${height - margin.bottom + 22})`,
      "text-anchor": "end",
    });
    label.textContent = `${index + 1}. ${row.name}`;
    svg.append(label);
  });

  for (const metric of metrics) {
    let path = "";
    let connected = false;
    AUTHORED_STAT_GRAPH.forEach((row, index) => {
      const multiplier = row.multipliers[metric.key];
      if (multiplier === null || multiplier <= 0) {
        connected = false;
        return;
      }
      path += `${connected ? " L" : "M"} ${x(index).toFixed(2)} ${y(multiplier).toFixed(2)}`;
      connected = true;
    });
    if (path) svg.append(svgElement("path", { d: path, class: `chart-line series-${metric.series}` }));

    AUTHORED_STAT_GRAPH.forEach((row, index) => {
      const multiplier = row.multipliers[metric.key];
      if (multiplier === null || multiplier <= 0) return;
      const point = svgElement("circle", {
        cx: String(x(index)), cy: String(y(multiplier)), r: "4",
        class: `chart-point series-${metric.series}`,
      });
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = `${row.name}: ${formatMultiplier(multiplier)}`;
      point.append(title);
      svg.append(point);
    });
  }
}

function renderLegend(container: HTMLElement, metrics: readonly StatGraphMetric[]) {
  container.replaceChildren();
  for (const metric of metrics) {
    const item = document.createElement("span");
    item.className = "legend-item";
    const swatch = document.createElement("span");
    swatch.className = `legend-swatch series-${metric.series}`;
    swatch.setAttribute("aria-hidden", "true");
    item.append(swatch, document.createTextNode(metric.label));
    container.append(item);
  }
}

function renderTable(table: HTMLTableElement, metrics: readonly StatGraphMetric[]) {
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  const metricHeading = document.createElement("th");
  metricHeading.scope = "col";
  metricHeading.textContent = "Metric";
  head.append(metricHeading);
  for (const [index, row] of AUTHORED_STAT_GRAPH.entries()) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.innerHTML = `<span>${index + 1}</span><small>${row.name}</small>`;
    head.append(cell);
  }

  const body = table.createTBody();
  for (const metric of metrics) {
    const row = body.insertRow();
    const label = row.insertCell();
    label.className = "metric-label";
    label.innerHTML = `<span class="legend-swatch series-${metric.series}"></span>${metric.label}`;
    for (const [index, data] of AUTHORED_STAT_GRAPH.entries()) {
      const cell = row.insertCell();
      const value = data.values[metric.key];
      const multiplier = data.multipliers[metric.key];
      if (value === null) {
        cell.innerHTML = "<span class=\"missing\">—</span>";
        continue;
      }
      const valueText = formatValue(value);
      const fullValue = formatFullValue(value);
      const stepText = index === 0 ? "BASE" : formatMultiplier(multiplier);
      const source = metric.regularReward
        ? data.regularRewards[metric.regularReward.stat][metric.regularReward.sourceIndex]
        : null;
      const sourceText = source ? `${source.kind} · ` : "";
      cell.innerHTML = `<span title="${fullValue}">${valueText}</span><small>${sourceText}${stepText}</small>`;
    }
  }
}

function render() {
  const combatMetrics = STAT_GRAPH_METRICS.filter((metric) => metric.group === "combat");
  const rewardMetrics = STAT_GRAPH_METRICS.filter((metric) => metric.group === "rewards");
  const combatChart = document.querySelector<SVGSVGElement>("#combat-chart");
  const rewardChart = document.querySelector<SVGSVGElement>("#reward-chart");
  const combatLegend = document.querySelector<HTMLElement>("#combat-legend");
  const rewardLegend = document.querySelector<HTMLElement>("#reward-legend");
  const combatTable = document.querySelector<HTMLTableElement>("#combat-table");
  const rewardTable = document.querySelector<HTMLTableElement>("#reward-table");
  if (!combatChart || !rewardChart || !combatLegend || !rewardLegend || !combatTable || !rewardTable) return;

  renderChart(combatChart, combatMetrics);
  renderChart(rewardChart, rewardMetrics);
  renderLegend(combatLegend, combatMetrics);
  renderLegend(rewardLegend, rewardMetrics);
  renderTable(combatTable, combatMetrics);
  renderTable(rewardTable, rewardMetrics);
}

if (typeof document !== "undefined") render();
