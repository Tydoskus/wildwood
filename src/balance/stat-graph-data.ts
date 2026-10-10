import { generateMap, isProceduralMap } from "../../shared/procedural-maps";

import { BOSS_DAMAGE_PROFILES } from "../game/boss-damage";
import { ENEMY_TYPES, type EnemyDefinition, type EnemyKind } from "../game/enemies";
import {
  ADVANCED_LAVA_WASTES_MAP_ID,
  BEGINNER_DESERT_MAP_ID,
  CLOUDSPIRE_MAP_ID,
  createSpawnSites,
  CRYSTAL_HOLLOWS_MAP_ID, CLOCKWORK_RUINS_MAP_ID, DUSKFALL_ORCHARD_MAP_ID, NEON_BASTION_MAP_ID, VERDANT_CATACOMBS_MAP_ID, ION_CITADEL_MAP_ID,
  INFERNAL_DEPTHS_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  MOONFEN_MAP_ID,
  mapSpawnCamps,
  SAMURAI_GARDEN_MAP_ID,
  TUTORIAL_FOREST_MAP_ID,
  WATER_REACH_MAP_ID,
  type MapId,
} from "../game/world";
import {
  DRAGON_MAX_HP,
  FROSTCLAW_MAX_HP,
  GLOOMROOT_MAX_HP,
  KOI_SHOGUN_MAX_HP,
  MAGMALISK_MAX_HP,
  MAP_DISPLAY_NAMES,
  MIREMAW_MAX_HP,
  PRISMSHELL_MAX_HP, IRONHORN_MAX_HP, DREADREAPER_MAX_HP, VOLTWARDEN_MAX_HP, GRAVEBLOOM_MAX_HP, AEGIS_PRIME_MAX_HP,
  SPIDER_MAX_HP,
  TEMPEST_KIRIN_MAX_HP,
  TIDEWYRM_MAX_HP,
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
  | "regularRewardRegen1";

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

type AuthoredMap = {
  id: MapId;
  bossKind: BossKind;
  bossMaxHp: number;
};

export const AUTHORED_MAPS: readonly AuthoredMap[] = [
  {
    id: TUTORIAL_FOREST_MAP_ID,
    bossKind: "dragon",
    bossMaxHp: DRAGON_MAX_HP,
  },
  {
    id: BEGINNER_DESERT_MAP_ID,
    bossKind: "spider",
    bossMaxHp: SPIDER_MAX_HP,
  },
  {
    id: INTERMEDIATE_SNOWLANDS_MAP_ID,
    bossKind: "frostclaw",
    bossMaxHp: FROSTCLAW_MAX_HP,
  },
  {
    id: ADVANCED_LAVA_WASTES_MAP_ID,
    bossKind: "magmalisk",
    bossMaxHp: MAGMALISK_MAX_HP,
  },
  {
    id: INFERNAL_DEPTHS_MAP_ID,
    bossKind: "gloomroot",
    bossMaxHp: GLOOMROOT_MAX_HP,
  },
  {
    id: WATER_REACH_MAP_ID,
    bossKind: "tidewyrm",
    bossMaxHp: TIDEWYRM_MAX_HP,
  },
  {
    id: SAMURAI_GARDEN_MAP_ID,
    bossKind: "koiShogun",
    bossMaxHp: KOI_SHOGUN_MAX_HP,
  },
  {
    id: CLOUDSPIRE_MAP_ID,
    bossKind: "tempestKirin",
    bossMaxHp: TEMPEST_KIRIN_MAX_HP,
  },
  {
    id: MOONFEN_MAP_ID,
    bossKind: "miremaw",
    bossMaxHp: MIREMAW_MAX_HP,
  },
  {
    id: CRYSTAL_HOLLOWS_MAP_ID,
    bossKind: "prismshell",
    bossMaxHp: PRISMSHELL_MAX_HP,
  }, {
    id: CLOCKWORK_RUINS_MAP_ID,
    bossKind: "ironhorn",
    bossMaxHp: IRONHORN_MAX_HP,
  }, {
    id: DUSKFALL_ORCHARD_MAP_ID,
    bossKind: "dreadreaper",
    bossMaxHp: DREADREAPER_MAX_HP,
  }, {
    id: NEON_BASTION_MAP_ID,
    bossKind: "voltwarden",
    bossMaxHp: VOLTWARDEN_MAX_HP,
  }, {
    id: VERDANT_CATACOMBS_MAP_ID,
    bossKind: "gravebloom",
    bossMaxHp: GRAVEBLOOM_MAX_HP,
  }, {
    id: ION_CITADEL_MAP_ID,
    bossKind: "aegisPrime",
    bossMaxHp: AEGIS_PRIME_MAX_HP,
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
      if (enemy.reward.type === "speed" || enemy.reward.type === "crit") continue;
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
      name: isProceduralMap(map.id) ? generateMap(map.id).name : MAP_DISPLAY_NAMES[map.id],
      values,
      multipliers: mapMultipliers(values, previous),
      regularRewards,
    };
    previous = values;
    return row;
  });
})();
