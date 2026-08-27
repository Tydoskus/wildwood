import { ATTACK_WINDUP_SECONDS } from "../game/attack-timeline";
import { damageAfterArmor } from "../game/combat";
import { ENEMY_TYPES, type EnemyKind, type RewardType } from "../game/enemies";
import { createGameBootstrap } from "../game/runtime/game-bootstrap";
import {
  ADVANCED_LAVA_WASTES_MAP_ID,
  BEGINNER_DESERT_MAP_ID,
  createSpawnSites,
  INFERNAL_DEPTHS_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  TUTORIAL_FOREST_MAP_ID,
  WATER_REACH_MAP_ID,
  type MapId,
} from "../game/world";
import {
  BASIC_PAPER_HAT,
  DARK_METAL_HELMET,
  DESERT_ITEM_DROP_DENOMINATOR,
  FIRE_METAL_BOW,
  FIRE_METAL_HELMET,
  FOREST_ITEM_DROP_DENOMINATOR,
  FROST_ARMOR,
  FROST_BOW,
  INFERNAL_ITEM_DROP_DENOMINATOR,
  IRON_BOW,
  ITEM_DEFINITIONS,
  LAVA_BOSS_ITEM_DROP_DENOMINATOR,
  LAVA_BOW,
  LAVA_HELMET_ITEM_DROP_DENOMINATOR,
  LAVA_ITEM_DROP_DENOMINATOR,
  MAGMA_ARMOR,
  NIGHT_FOREST_HELMET_ITEM_DROP_DENOMINATOR,
  SNOW_BOSS_ARMOR_DROP_DENOMINATOR,
  SNOW_BOSS_ITEM_DROP_DENOMINATOR,
  STARTER_BOW,
  STARTER_STONE,
  WOODEN_ARMOR,
  WOOD_FULL_HELM,
  itemDefinition,
  type ItemId,
} from "../../shared/items";
import { effectivePlayerPowerStats, playerPowerForStats, type PlayerPowerStats } from "../../shared/player-power";
import {
  RESEARCH_DEFINITIONS,
  RESEARCH_IDS,
  createEmptyResearchRanks,
  researchDurationMs,
  researchIsAvailable,
  researchStatRewardMultiplier,
  type ResearchId,
  type ResearchRanks,
} from "../../shared/research";
import {
  BALANCE_TARGET_DESERT_DURATION_SECONDS,
  BALANCE_TARGET_MAP_DURATION_MULTIPLIER,
  BALANCE_TARGET_MAP_POWER_MULTIPLIER,
  BOOTS_SPEED_BONUS,
  DEFAULT_ATTACK_INTERVAL,
  DEFAULT_ATTACK_RANGE,
  DRAGON_REWARD_DAMAGE,
  FROSTCLAW_REWARD_ARMOR,
  FROSTCLAW_REWARD_DAMAGE,
  FROSTCLAW_REWARD_HEALTH,
  GLOOMROOT_REWARD_ARMOR,
  GLOOMROOT_REWARD_DAMAGE,
  GLOOMROOT_REWARD_HEALTH,
  GLOOMROOT_REWARD_REGEN,
  MAGMALISK_REWARD_ARMOR,
  MAGMALISK_REWARD_DAMAGE,
  MAGMALISK_REWARD_HEALTH,
  MAGMALISK_REWARD_REGEN,
  MAP_DISPLAY_NAMES,
  MAX_BASE_ATTACKS_PER_SECOND,
  MIN_ATTACK_INTERVAL,
  PLAYER_BASE_HP,
  PLAYER_PROJECTILE_SPEED,
  PLAYER_SPEED,
  SPIDER_REWARD_DAMAGE,
  SPIDER_REWARD_HEALTH,
} from "../../shared/rules";

export const BALANCE_MAP_IDS = [
  TUTORIAL_FOREST_MAP_ID,
  BEGINNER_DESERT_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  ADVANCED_LAVA_WASTES_MAP_ID,
  INFERNAL_DEPTHS_MAP_ID,
  WATER_REACH_MAP_ID,
] as const;

export type BalanceMapId = typeof BALANCE_MAP_IDS[number];
export type FarmingStrategy = "natural" | "efficient" | "boss-rush";
export type ResearchPlan = "off" | "balanced" | "damage-first";

export type MapAdjustment = {
  hp: number;
  damage: number;
  reward: number;
};

export type BalanceSimulationConfig = {
  durationSeconds: number;
  trials: number;
  strategy: FarmingStrategy;
  researchPlan: ResearchPlan;
  bossTargetSeconds: number;
  targetDesertDurationSeconds: number;
  targetMapDurationMultiplier: number;
  targetMapPowerMultiplier: number;
  requiredClears: number;
  respawnSeconds: number;
  itemUpgradeLevel: number;
  pathingMultiplier: number;
  seed: number;
  mapAdjustments: Record<BalanceMapId, MapAdjustment>;
};

export type PersistentStats = {
  damage: number;
  maxHp: number;
  attackRate: number;
  armor: number;
  regen: number;
};

type EquippedItems = {
  head: string;
  chest: string;
  weapon: string;
};

export type SimulationStateSnapshot = {
  stats: PersistentStats;
  research: ResearchRanks;
  equipped: EquippedItems;
  bootsEquipped: boolean;
  itemUpgradeLevel: number;
};

type DropDefinition = {
  itemId: ItemId;
  denominator: number;
  eligible?: (enemy: EnemyKind) => boolean;
};

type BossReward = { type: Exclude<RewardType, "speed">; amount: number };

type BossDefinition = {
  name: string;
  hp: number;
  x: number;
  y: number;
  rewards: BossReward[];
  drops: DropDefinition[];
};

type BalanceMapDefinition = {
  id: BalanceMapId;
  name: string;
  arrival: { x: number; y: number };
  regularDrops: DropDefinition[];
  boss: BossDefinition | null;
};

type ActiveResearch = {
  id: ResearchId;
  completesAt: number;
};

type MutableSimulationState = {
  time: number;
  mapIndex: number;
  stats: PersistentStats;
  research: ResearchRanks;
  equipped: EquippedItems;
  ownedItems: Set<string>;
  bootsEquipped: boolean;
  itemUpgradeLevel: number;
  activeResearch: ActiveResearch | null;
};

type SiteState = ReturnType<typeof createSpawnSites>[number] & {
  availableAt: number;
  kills: number;
};

type HistoryPoint = {
  timeSeconds: number;
  power: number;
  dps: number;
  mapIndex: number;
};

export type TrialMapRecord = {
  mapId: BalanceMapId;
  enteredAtSeconds: number;
  exitedAtSeconds: number | null;
  entryPower: number;
  exitPower: number;
  entryBossTtkSeconds: number | null;
  bossFightSeconds: number | null;
  regularKills: number;
  fullClears: number;
  entryState: SimulationStateSnapshot;
  exitState: SimulationStateSnapshot;
};

type TrialResult = {
  samples: Array<{ timeSeconds: number; power: number; dps: number; mapIndex: number }>;
  maps: TrialMapRecord[];
  finalPower: number;
  finalDps: number;
};

export type TimelinePoint = {
  timeSeconds: number;
  powerP10: number;
  powerMedian: number;
  powerP90: number;
  dpsMedian: number;
};

export type MapSummary = {
  mapId: BalanceMapId;
  name: string;
  hasBoss: boolean;
  reachedPercent: number;
  completedPercent: number;
  durationCensoredPercent: number;
  enteredAtMedianSeconds: number | null;
  durationP10Seconds: number | null;
  durationMedianSeconds: number | null;
  durationP90Seconds: number | null;
  entryPowerMedian: number | null;
  exitPowerMedian: number | null;
  exitStatsMedian: Omit<PersistentStats, "attackRate"> | null;
  exitStatsP90: Omit<PersistentStats, "attackRate"> | null;
  exitEffectiveStatsMedian: PlayerPowerStats | null;
  bossTtkAtEntryMedianSeconds: number | null;
  bossFightMedianSeconds: number | null;
  regularKillsMedian: number | null;
  fullClearsMedian: number | null;
  durationVsPrevious: number | null;
  targetDurationSeconds: number | null;
  durationVsTarget: number | null;
  powerGrowthMultiplier: number | null;
  targetPowerGrowthMultiplier: number | null;
};

export type EnemyBalanceMetric = {
  enemy: EnemyKind;
  spawnCount: number;
  hp: number;
  rewardType: RewardType;
  rewardAmount: number;
  timeToKillSeconds: number;
  powerGain: number;
  combatPowerPerMinute: number;
  damageAfterArmor: number;
  hitPercentOfHealth: number;
  hitsToDefeatPlayer: number;
};

export type BalanceSimulationResult = {
  config: BalanceSimulationConfig;
  timeline: TimelinePoint[];
  maps: MapSummary[];
  enemyMetrics: Record<BalanceMapId, EnemyBalanceMetric[]>;
  diagnostics: string[];
  finalPower: { p10: number; median: number; p90: number };
  finalDps: { p10: number; median: number; p90: number };
  simulatedCampaigns: number;
};

const SAMPLE_COUNT = 180;
const MAP_TRANSITION_SECONDS = 6;
const LOOT_AND_RETARGET_SECONDS = .3;
const DEFAULT_FOREST_ONBOARDING_SECONDS = 22.5 * 60;
const DEFAULT_CAMPAIGN_DURATION_SECONDS = DEFAULT_FOREST_ONBOARDING_SECONDS + BALANCE_MAP_IDS
  .slice(1)
  .reduce((total, _mapId, index) => total + BALANCE_TARGET_DESERT_DURATION_SECONDS * BALANCE_TARGET_MAP_DURATION_MULTIPLIER ** index, 0);
const PROJECTILE_TRAVEL_SECONDS = DEFAULT_ATTACK_RANGE / PLAYER_PROJECTILE_SPEED * .5;
const FIRST_HIT_SECONDS = ATTACK_WINDUP_SECONDS + PROJECTILE_TRAVEL_SECONDS;

const balancedResearchOrder: ResearchId[] = [
  "foraging", "warcraft", "moveSpeed", "vitality", "precision",
  "regeneration", "prosperity", "criticalChance", "criticalDamage",
];
const damageResearchOrder: ResearchId[] = [
  "foraging", "warcraft", "prosperity", "criticalChance", "criticalDamage",
  "moveSpeed", "vitality", "precision", "regeneration",
];

function defaultMapAdjustments(): Record<BalanceMapId, MapAdjustment> {
  return Object.fromEntries(BALANCE_MAP_IDS.map((id) => [id, { hp: 1, damage: 1, reward: 1 }])) as Record<BalanceMapId, MapAdjustment>;
}

export function defaultBalanceSimulationConfig(): BalanceSimulationConfig {
  return {
    durationSeconds: DEFAULT_CAMPAIGN_DURATION_SECONDS,
    trials: 100,
    strategy: "boss-rush",
    researchPlan: "off",
    bossTargetSeconds: 5 * 60,
    targetDesertDurationSeconds: BALANCE_TARGET_DESERT_DURATION_SECONDS,
    targetMapDurationMultiplier: BALANCE_TARGET_MAP_DURATION_MULTIPLIER,
    targetMapPowerMultiplier: BALANCE_TARGET_MAP_POWER_MULTIPLIER,
    requiredClears: 1,
    respawnSeconds: 30,
    itemUpgradeLevel: 0,
    pathingMultiplier: 1.15,
    seed: 1_337,
    mapAdjustments: defaultMapAdjustments(),
  };
}

function normalizeConfig(config: Partial<BalanceSimulationConfig>): BalanceSimulationConfig {
  const defaults = defaultBalanceSimulationConfig();
  const strategy = config.strategy ?? defaults.strategy;
  const researchPlan = config.researchPlan ?? defaults.researchPlan;
  const adjustments = defaultMapAdjustments();
  for (const id of BALANCE_MAP_IDS) {
    const next = config.mapAdjustments?.[id];
    if (!next) continue;
    adjustments[id] = {
      hp: finiteRange(next.hp, 1, .000_001, 100),
      damage: finiteRange(next.damage, 1, 0, 100),
      reward: finiteRange(next.reward, 1, 0, 100),
    };
  }
  return {
    durationSeconds: finiteRange(config.durationSeconds, defaults.durationSeconds, 60, 30 * 24 * 60 * 60),
    trials: Math.round(finiteRange(config.trials, defaults.trials, 1, 250)),
    strategy: strategy === "natural" || strategy === "boss-rush" ? strategy : "efficient",
    researchPlan: researchPlan === "balanced" || researchPlan === "damage-first" ? researchPlan : "off",
    bossTargetSeconds: finiteRange(config.bossTargetSeconds, defaults.bossTargetSeconds, 1, 24 * 60 * 60),
    targetDesertDurationSeconds: finiteRange(
      config.targetDesertDurationSeconds,
      defaults.targetDesertDurationSeconds,
      60,
      30 * 24 * 60 * 60,
    ),
    targetMapDurationMultiplier: finiteRange(
      config.targetMapDurationMultiplier,
      defaults.targetMapDurationMultiplier,
      1,
      10,
    ),
    targetMapPowerMultiplier: finiteRange(
      config.targetMapPowerMultiplier,
      defaults.targetMapPowerMultiplier,
      1,
      1_000_000,
    ),
    requiredClears: Math.round(finiteRange(config.requiredClears, defaults.requiredClears, 0, 20)),
    respawnSeconds: finiteRange(config.respawnSeconds, defaults.respawnSeconds, 1, 300),
    itemUpgradeLevel: Math.round(finiteRange(config.itemUpgradeLevel, defaults.itemUpgradeLevel, 0, 10)),
    pathingMultiplier: finiteRange(config.pathingMultiplier, defaults.pathingMultiplier, .25, 5),
    seed: Math.round(finiteRange(config.seed, defaults.seed, 1, 0x7fffffff)),
    mapAdjustments: adjustments,
  };
}

function finiteRange(value: unknown, fallback: number, minimum: number, maximum: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
}

function createMapDefinitions(): BalanceMapDefinition[] {
  const bootstrap = createGameBootstrap();
  const always = () => true;
  const nonElite = (enemy: EnemyKind) => !ENEMY_TYPES[enemy].elite;
  return [
    {
      id: TUTORIAL_FOREST_MAP_ID,
      name: MAP_DISPLAY_NAMES[TUTORIAL_FOREST_MAP_ID],
      arrival: bootstrap.startSpawn,
      regularDrops: [
        { itemId: STARTER_BOW, denominator: FOREST_ITEM_DROP_DENOMINATOR, eligible: always },
        { itemId: WOODEN_ARMOR, denominator: FOREST_ITEM_DROP_DENOMINATOR, eligible: always },
      ],
      boss: {
        name: "Dragon",
        hp: bootstrap.boss.maxHp,
        x: bootstrap.boss.x,
        y: bootstrap.boss.y,
        rewards: [{ type: "damage", amount: DRAGON_REWARD_DAMAGE }],
        drops: [],
      },
    },
    {
      id: BEGINNER_DESERT_MAP_ID,
      name: MAP_DISPLAY_NAMES[BEGINNER_DESERT_MAP_ID],
      arrival: bootstrap.mapConfig[BEGINNER_DESERT_MAP_ID].arrival,
      regularDrops: [
        { itemId: WOOD_FULL_HELM, denominator: DESERT_ITEM_DROP_DENOMINATOR, eligible: nonElite },
        { itemId: IRON_BOW, denominator: DESERT_ITEM_DROP_DENOMINATOR, eligible: nonElite },
      ],
      boss: {
        name: "Desert Spider",
        hp: bootstrap.spiderBoss.maxHp,
        x: bootstrap.spiderBoss.x,
        y: bootstrap.spiderBoss.y,
        rewards: [
          { type: "damage", amount: SPIDER_REWARD_DAMAGE },
          { type: "health", amount: SPIDER_REWARD_HEALTH },
        ],
        drops: [],
      },
    },
    {
      id: INTERMEDIATE_SNOWLANDS_MAP_ID,
      name: MAP_DISPLAY_NAMES[INTERMEDIATE_SNOWLANDS_MAP_ID],
      arrival: bootstrap.mapConfig[INTERMEDIATE_SNOWLANDS_MAP_ID].arrival,
      regularDrops: [],
      boss: {
        name: "Frostclaw",
        hp: bootstrap.frostclawBoss.maxHp,
        x: bootstrap.frostclawBoss.x,
        y: bootstrap.frostclawBoss.y,
        rewards: [
          { type: "damage", amount: FROSTCLAW_REWARD_DAMAGE },
          { type: "health", amount: FROSTCLAW_REWARD_HEALTH },
          { type: "armor", amount: FROSTCLAW_REWARD_ARMOR },
        ],
        drops: [
          { itemId: FROST_BOW, denominator: SNOW_BOSS_ITEM_DROP_DENOMINATOR },
          { itemId: FROST_ARMOR, denominator: SNOW_BOSS_ARMOR_DROP_DENOMINATOR },
        ],
      },
    },
    {
      id: ADVANCED_LAVA_WASTES_MAP_ID,
      name: MAP_DISPLAY_NAMES[ADVANCED_LAVA_WASTES_MAP_ID],
      arrival: bootstrap.mapConfig[ADVANCED_LAVA_WASTES_MAP_ID].arrival,
      regularDrops: [
        { itemId: MAGMA_ARMOR, denominator: LAVA_ITEM_DROP_DENOMINATOR, eligible: always },
        { itemId: FIRE_METAL_HELMET, denominator: LAVA_HELMET_ITEM_DROP_DENOMINATOR, eligible: always },
      ],
      boss: {
        name: "Magmalisk",
        hp: bootstrap.magmaliskBoss.maxHp,
        x: bootstrap.magmaliskBoss.x,
        y: bootstrap.magmaliskBoss.y,
        rewards: [
          { type: "damage", amount: MAGMALISK_REWARD_DAMAGE },
          { type: "health", amount: MAGMALISK_REWARD_HEALTH },
          { type: "armor", amount: MAGMALISK_REWARD_ARMOR },
          { type: "regen", amount: MAGMALISK_REWARD_REGEN },
        ],
        drops: [{ itemId: LAVA_BOW, denominator: LAVA_BOSS_ITEM_DROP_DENOMINATOR }],
      },
    },
    {
      id: INFERNAL_DEPTHS_MAP_ID,
      name: MAP_DISPLAY_NAMES[INFERNAL_DEPTHS_MAP_ID],
      arrival: bootstrap.mapConfig[INFERNAL_DEPTHS_MAP_ID].arrival,
      regularDrops: [
        { itemId: FIRE_METAL_BOW, denominator: INFERNAL_ITEM_DROP_DENOMINATOR, eligible: always },
        { itemId: DARK_METAL_HELMET, denominator: NIGHT_FOREST_HELMET_ITEM_DROP_DENOMINATOR, eligible: always },
      ],
      boss: {
        name: "Gloomroot",
        hp: bootstrap.gloomrootBoss.maxHp,
        x: bootstrap.gloomrootBoss.x,
        y: bootstrap.gloomrootBoss.y,
        rewards: [
          { type: "damage", amount: GLOOMROOT_REWARD_DAMAGE },
          { type: "health", amount: GLOOMROOT_REWARD_HEALTH },
          { type: "armor", amount: GLOOMROOT_REWARD_ARMOR },
          { type: "regen", amount: GLOOMROOT_REWARD_REGEN },
        ],
        drops: [],
      },
    },
    {
      id: WATER_REACH_MAP_ID,
      name: MAP_DISPLAY_NAMES[WATER_REACH_MAP_ID],
      arrival: bootstrap.mapConfig[WATER_REACH_MAP_ID].arrival,
      regularDrops: [],
      boss: null,
    },
  ];
}

const MAP_DEFINITIONS = createMapDefinitions();

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296;
  };
}

function stateSnapshot(state: MutableSimulationState): SimulationStateSnapshot {
  return {
    stats: { ...state.stats },
    research: { ...state.research },
    equipped: { ...state.equipped },
    bootsEquipped: state.bootsEquipped,
    itemUpgradeLevel: state.itemUpgradeLevel,
  };
}

function effectiveStats(state: Pick<SimulationStateSnapshot, "stats" | "research" | "equipped" | "itemUpgradeLevel">) {
  return effectivePlayerPowerStats({
    ...state.stats,
    equippedHead: state.equipped.head,
    equippedChest: state.equipped.chest,
    equippedRightHand: state.equipped.weapon,
  }, state.research, () => state.itemUpgradeLevel);
}

function powerForState(state: Pick<SimulationStateSnapshot, "stats" | "research" | "equipped" | "itemUpgradeLevel">) {
  return playerPowerForStats(effectiveStats(state));
}

function continuousPowerForState(state: Pick<SimulationStateSnapshot, "stats" | "research" | "equipped" | "itemUpgradeLevel">) {
  const stats = effectiveStats(state);
  return stats.damage * DEFAULT_ATTACK_INTERVAL / Math.max(MIN_ATTACK_INTERVAL, stats.attackRate) +
    stats.maxHp + stats.armor * 3 + stats.regen * 10;
}

function combatStats(state: Pick<SimulationStateSnapshot, "stats" | "research" | "equipped" | "itemUpgradeLevel">, bossesCanCrit: boolean) {
  const effective = effectiveStats(state);
  const criticalChance = bossesCanCrit ? state.research.criticalChance * .01 : 0;
  const criticalMultiplier = 1.05 + state.research.criticalDamage * .05;
  const averageHit = effective.damage * (1 + criticalChance * (criticalMultiplier - 1));
  return {
    ...effective,
    averageHit,
    dps: averageHit / Math.max(MIN_ATTACK_INTERVAL, effective.attackRate),
  };
}

function timeToKill(hitPoints: number, hitDamage: number, attackInterval: number) {
  const hits = Math.max(1, Math.ceil(Math.max(1, hitPoints) / Math.max(1, hitDamage)));
  return FIRST_HIT_SECONDS + (hits - 1) * Math.max(MIN_ATTACK_INTERVAL, attackInterval);
}

function movementSpeed(state: MutableSimulationState) {
  const base = PLAYER_SPEED + (state.bootsEquipped ? BOOTS_SPEED_BONUS : 0);
  return base * (1 + state.research.moveSpeed * .02);
}

function applyRewardToStats(stats: PersistentStats, type: RewardType, amount: number) {
  switch (type) {
    case "damage": stats.damage += amount; break;
    case "health": stats.maxHp += amount; break;
    case "armor": stats.armor += amount; break;
    case "regen": stats.regen += amount; break;
    case "speed": {
      const attacksPerSecond = Math.min(MAX_BASE_ATTACKS_PER_SECOND, 1 / Math.max(MIN_ATTACK_INTERVAL, stats.attackRate) + amount);
      stats.attackRate = 1 / attacksPerSecond;
      break;
    }
  }
}

function rewardAmount(state: MutableSimulationState, baseAmount: number, mapRewardMultiplier: number) {
  return baseAmount * researchStatRewardMultiplier(state.research) * mapRewardMultiplier;
}

function nextResearch(state: MutableSimulationState, plan: ResearchPlan) {
  if (plan === "off") return null;
  const order = plan === "damage-first" ? damageResearchOrder : balancedResearchOrder;
  const available = RESEARCH_IDS.filter((id) => researchIsAvailable(id, state.research));
  if (!available.length) return null;
  if (plan === "damage-first") {
    return [...available].sort((left, right) => order.indexOf(left) - order.indexOf(right))[0];
  }
  return [...available].sort((left, right) =>
    state.research[left] - state.research[right] || order.indexOf(left) - order.indexOf(right))[0];
}

function startNextResearch(state: MutableSimulationState, plan: ResearchPlan) {
  const id = nextResearch(state, plan);
  state.activeResearch = id
    ? { id, completesAt: state.time + researchDurationMs(id, state.research[id]) / 1_000 }
    : null;
}

function advanceTime(
  state: MutableSimulationState,
  targetTime: number,
  plan: ResearchPlan,
  recordHistory: () => void,
) {
  while (state.activeResearch && state.activeResearch.completesAt <= targetTime) {
    state.time = state.activeResearch.completesAt;
    const id = state.activeResearch.id;
    const previousRank = state.research[id];
    state.research[id] = Math.min(RESEARCH_DEFINITIONS[id].maxRank, previousRank + 1);
    if (id === "vitality") {
      state.stats.maxHp = state.stats.maxHp / (1 + previousRank * .02) * (1 + state.research.vitality * .02);
    }
    recordHistory();
    startNextResearch(state, plan);
  }
  state.time = targetTime;
}

function equipmentSlot(itemId: ItemId): keyof EquippedItems | null {
  const slot = ITEM_DEFINITIONS[itemId].slot;
  if (slot === "HEAD") return "head";
  if (slot === "CHEST") return "chest";
  if (slot === "HAND") return "weapon";
  return null;
}

function acquireAndAutoEquip(state: MutableSimulationState, itemId: ItemId, recordHistory: () => void) {
  if (state.ownedItems.has(itemId)) return;
  state.ownedItems.add(itemId);
  const slot = equipmentSlot(itemId);
  if (!slot) return;
  const previous = state.equipped[slot];
  const previousPower = powerForState(state);
  state.equipped[slot] = itemId;
  if (powerForState(state) + .0001 < previousPower) {
    state.equipped[slot] = previous;
    return;
  }
  recordHistory();
}

function rollDrops(
  state: MutableSimulationState,
  drops: readonly DropDefinition[],
  enemy: EnemyKind | null,
  random: () => number,
  recordHistory: () => void,
) {
  for (const drop of drops) {
    if (enemy && drop.eligible && !drop.eligible(enemy)) continue;
    if (random() >= 1 / drop.denominator) continue;
    acquireAndAutoEquip(state, drop.itemId, recordHistory);
  }
}

function travelSeconds(
  from: { x: number; y: number },
  to: { x: number; y: number },
  state: MutableSimulationState,
  pathingMultiplier: number,
) {
  const approachDistance = Math.max(0, Math.hypot(to.x - from.x, to.y - from.y) - DEFAULT_ATTACK_RANGE * .72);
  return approachDistance / Math.max(1, movementSpeed(state)) * pathingMultiplier;
}

function projectedRewardPowerGain(
  state: MutableSimulationState,
  enemy: EnemyKind,
  adjustment: MapAdjustment,
) {
  const before = continuousPowerForState(state);
  const projected = stateSnapshot(state);
  const reward = ENEMY_TYPES[enemy].reward;
  applyRewardToStats(projected.stats, reward.type, reward.amount * researchStatRewardMultiplier(state.research) * adjustment.reward);
  return Math.max(0, continuousPowerForState(projected) - before);
}

function selectSite(
  sites: SiteState[],
  state: MutableSimulationState,
  position: { x: number; y: number },
  map: BalanceMapDefinition,
  config: BalanceSimulationConfig,
) {
  const available = sites.filter((site) => site.availableAt <= state.time);
  if (!available.length) return null;
  const pendingClear = available.filter((site) => site.kills < config.requiredClears);
  // A boss-rush has no meaningful single-stat target on an open-ended map.
  // Keep its sites within one clear of each other so the forecast represents
  // progressing through the whole map instead of camping one instant-respawn
  // damage enemy forever.
  const lowestKills = Math.min(...sites.map((site) => site.kills));
  // Late-game maps carry five complementary permanent reward tracks. Cycling
  // the least-cleared sites keeps boss readiness from collapsing into a single
  // damage camp and preserves the authored damage/health/armor/regen curve.
  const openMapCycle = config.strategy === "boss-rush" && (!map.boss || map.id === INFERNAL_DEPTHS_MAP_ID)
    ? available.filter((site) => site.kills === lowestKills)
    : [];
  const candidates = openMapCycle.length ? openMapCycle : pendingClear.length ? pendingClear : available;
  const adjustment = config.mapAdjustments[map.id];
  const combat = combatStats(state, true);
  return candidates.reduce((best, site) => {
    const enemy = ENEMY_TYPES[site.type];
    const travel = travelSeconds(position, site, state, config.pathingMultiplier);
    const fight = timeToKill(enemy.hp * adjustment.hp, combat.averageHit, combat.attackRate);
    const duration = Math.max(.01, travel + fight + LOOT_AND_RETARGET_SECONDS);
    let score = -travel;
    if (config.strategy === "efficient") {
      score = projectedRewardPowerGain(state, site.type, adjustment) / duration;
    } else if (config.strategy === "boss-rush") {
      const reward = enemy.reward;
      const focus = reward.type === "damage" || reward.type === "speed" ? 1 : .04;
      score = projectedRewardPowerGain(state, site.type, adjustment) * focus / duration;
    }
    return !best || score > best.score ? { site, score, travel, fight } : best;
  }, null as { site: SiteState; score: number; travel: number; fight: number } | null);
}

function createSites(map: BalanceMapDefinition) {
  const bossPoint = map.boss ?? { x: 4_040, y: 4_240 };
  return createSpawnSites(bossPoint, map.id).map((site) => ({ ...site, availableAt: 0, kills: 0 }));
}

function bossFightSeconds(state: MutableSimulationState, map: BalanceMapDefinition, adjustment: MapAdjustment) {
  if (!map.boss) return null;
  const combat = combatStats(state, false);
  return timeToKill(map.boss.hp * adjustment.hp, combat.averageHit, combat.attackRate);
}

function simulateTrial(config: BalanceSimulationConfig, trialIndex: number): TrialResult {
  const random = seededRandom(config.seed + trialIndex * 104_729);
  const state: MutableSimulationState = {
    time: 0,
    mapIndex: 0,
    stats: { damage: 4, maxHp: PLAYER_BASE_HP, attackRate: DEFAULT_ATTACK_INTERVAL, armor: 0, regen: 0 },
    research: createEmptyResearchRanks(),
    equipped: { head: BASIC_PAPER_HAT, chest: "", weapon: STARTER_STONE },
    ownedItems: new Set([BASIC_PAPER_HAT, STARTER_STONE]),
    bootsEquipped: false,
    itemUpgradeLevel: config.itemUpgradeLevel,
    activeResearch: null,
  };
  const history: HistoryPoint[] = [];
  const records: TrialMapRecord[] = [];
  let position = { ...MAP_DEFINITIONS[0].arrival };
  let sites = createSites(MAP_DEFINITIONS[0]);

  const recordHistory = () => {
    const combat = combatStats(state, true);
    const point = { timeSeconds: state.time, power: playerPowerForStats(combat), dps: combat.dps, mapIndex: state.mapIndex };
    const previous = history[history.length - 1];
    if (previous && Math.abs(previous.timeSeconds - point.timeSeconds) < 1e-7) history[history.length - 1] = point;
    else history.push(point);
  };

  const beginMapRecord = (map: BalanceMapDefinition): TrialMapRecord => ({
    mapId: map.id,
    enteredAtSeconds: state.time,
    exitedAtSeconds: null,
    entryPower: powerForState(state),
    exitPower: powerForState(state),
    entryBossTtkSeconds: bossFightSeconds(state, map, config.mapAdjustments[map.id]),
    bossFightSeconds: null,
    regularKills: 0,
    fullClears: 0,
    entryState: stateSnapshot(state),
    exitState: stateSnapshot(state),
  });

  records.push(beginMapRecord(MAP_DEFINITIONS[0]));
  recordHistory();
  startNextResearch(state, config.researchPlan);

  let safety = 0;
  while (state.time < config.durationSeconds && safety < 5_000_000) {
    safety += 1;
    const map = MAP_DEFINITIONS[state.mapIndex];
    const mapRecord = records[records.length - 1];
    const adjustment = config.mapAdjustments[map.id];
    const clears = sites.length ? Math.min(...sites.map((site) => site.kills)) : 0;
    const currentBossFight = bossFightSeconds(state, map, adjustment);

    if (map.boss && clears >= config.requiredClears && currentBossFight !== null && currentBossFight <= config.bossTargetSeconds) {
      const travel = travelSeconds(position, map.boss, state, config.pathingMultiplier);
      const finishesAt = state.time + travel + currentBossFight;
      if (finishesAt > config.durationSeconds) {
        advanceTime(state, config.durationSeconds, config.researchPlan, recordHistory);
        break;
      }
      advanceTime(state, finishesAt, config.researchPlan, recordHistory);
      position = { x: map.boss.x, y: map.boss.y };
      for (const reward of map.boss.rewards) {
        applyRewardToStats(state.stats, reward.type, rewardAmount(state, reward.amount, adjustment.reward));
      }
      rollDrops(state, map.boss.drops, null, random, recordHistory);
      recordHistory();
      mapRecord.exitedAtSeconds = state.time;
      mapRecord.exitPower = powerForState(state);
      mapRecord.exitState = stateSnapshot(state);
      mapRecord.bossFightSeconds = currentBossFight;
      mapRecord.fullClears = clears;
      if (state.mapIndex >= MAP_DEFINITIONS.length - 1) continue;
      advanceTime(state, Math.min(config.durationSeconds, state.time + MAP_TRANSITION_SECONDS), config.researchPlan, recordHistory);
      if (state.time >= config.durationSeconds) break;
      state.mapIndex += 1;
      const nextMap = MAP_DEFINITIONS[state.mapIndex];
      position = { ...nextMap.arrival };
      sites = createSites(nextMap);
      records.push(beginMapRecord(nextMap));
      recordHistory();
      continue;
    }

    const selected = selectSite(sites, state, position, map, config);
    if (!selected) {
      const nextAvailable = Math.min(...sites.map((site) => site.availableAt));
      advanceTime(state, Math.min(config.durationSeconds, nextAvailable), config.researchPlan, recordHistory);
      continue;
    }
    const finishesAt = state.time + selected.travel + selected.fight + LOOT_AND_RETARGET_SECONDS;
    if (finishesAt > config.durationSeconds) {
      advanceTime(state, config.durationSeconds, config.researchPlan, recordHistory);
      break;
    }
    advanceTime(state, finishesAt, config.researchPlan, recordHistory);
    position = { x: selected.site.x, y: selected.site.y };
    selected.site.kills += 1;
    selected.site.availableAt = state.time + config.respawnSeconds;
    const reward = ENEMY_TYPES[selected.site.type].reward;
    applyRewardToStats(state.stats, reward.type, rewardAmount(state, reward.amount, adjustment.reward));
    mapRecord.regularKills += 1;
    mapRecord.fullClears = Math.min(...sites.map((site) => site.kills));
    if (!state.bootsEquipped && map.id === TUTORIAL_FOREST_MAP_ID && mapRecord.fullClears >= 1) state.bootsEquipped = true;
    rollDrops(state, map.regularDrops, selected.site.type, random, recordHistory);
    recordHistory();
  }

  if (state.time < config.durationSeconds) advanceTime(state, config.durationSeconds, config.researchPlan, recordHistory);
  recordHistory();
  const activeRecord = records[records.length - 1];
  if (activeRecord && activeRecord.exitedAtSeconds === null) {
    activeRecord.exitPower = powerForState(state);
    activeRecord.exitState = stateSnapshot(state);
    activeRecord.fullClears = sites.length ? Math.min(...sites.map((site) => site.kills)) : 0;
  }

  const samples: TrialResult["samples"] = [];
  let historyIndex = 0;
  for (let sampleIndex = 0; sampleIndex <= SAMPLE_COUNT; sampleIndex += 1) {
    const timeSeconds = config.durationSeconds * sampleIndex / SAMPLE_COUNT;
    while (historyIndex + 1 < history.length && history[historyIndex + 1].timeSeconds <= timeSeconds) historyIndex += 1;
    const point = history[historyIndex];
    samples.push({ timeSeconds, power: point.power, dps: point.dps, mapIndex: point.mapIndex });
  }
  const final = samples[samples.length - 1];
  return { samples, maps: records, finalPower: final.power, finalDps: final.dps };
}

function quantile(values: number[], probability: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sorted[lower + 1] === undefined ? sorted[lower] : sorted[lower] + fraction * (sorted[lower + 1] - sorted[lower]);
}

function numericQuantile(values: number[], probability: number) {
  return quantile(values, probability) ?? 0;
}

function mapRecordFor(trial: TrialResult, mapId: BalanceMapId) {
  return trial.maps.find((record) => record.mapId === mapId);
}

function mapSummary(
  trials: TrialResult[],
  map: BalanceMapDefinition,
  durationSeconds: number,
  targetDurationSeconds: number | null,
  targetPowerGrowthMultiplier: number | null,
): MapSummary {
  const records = trials.map((trial) => mapRecordFor(trial, map.id)).filter((record): record is TrialMapRecord => Boolean(record));
  const completed = records.filter((record) => record.exitedAtSeconds !== null);
  const durations = records.map((record) => (record.exitedAtSeconds ?? durationSeconds) - record.enteredAtSeconds);
  const durationMedianSeconds = quantile(durations, .5);
  const exitStatsAt = (probability: number): Omit<PersistentStats, "attackRate"> | null => records.length ? {
    damage: numericQuantile(records.map((record) => record.exitState.stats.damage), probability),
    maxHp: numericQuantile(records.map((record) => record.exitState.stats.maxHp), probability),
    armor: numericQuantile(records.map((record) => record.exitState.stats.armor), probability),
    regen: numericQuantile(records.map((record) => record.exitState.stats.regen), probability),
  } : null;
  const exitEffectiveStatsAt = (probability: number): PlayerPowerStats | null => records.length ? {
    damage: numericQuantile(records.map((record) => effectiveStats(record.exitState).damage), probability),
    maxHp: numericQuantile(records.map((record) => effectiveStats(record.exitState).maxHp), probability),
    attackRate: numericQuantile(records.map((record) => effectiveStats(record.exitState).attackRate), probability),
    armor: numericQuantile(records.map((record) => effectiveStats(record.exitState).armor), probability),
    regen: numericQuantile(records.map((record) => effectiveStats(record.exitState).regen), probability),
  } : null;
  return {
    mapId: map.id,
    name: map.name,
    hasBoss: Boolean(map.boss),
    reachedPercent: records.length / trials.length * 100,
    completedPercent: map.boss ? completed.length / trials.length * 100 : 0,
    durationCensoredPercent: map.boss && records.length
      ? (records.length - completed.length) / records.length * 100
      : 100,
    enteredAtMedianSeconds: quantile(records.map((record) => record.enteredAtSeconds), .5),
    durationP10Seconds: quantile(durations, .1),
    durationMedianSeconds,
    durationP90Seconds: quantile(durations, .9),
    entryPowerMedian: quantile(records.map((record) => record.entryPower), .5),
    exitPowerMedian: quantile(records.map((record) => record.exitPower), .5),
    exitStatsMedian: exitStatsAt(.5),
    exitStatsP90: exitStatsAt(.9),
    exitEffectiveStatsMedian: exitEffectiveStatsAt(.5),
    bossTtkAtEntryMedianSeconds: quantile(records.flatMap((record) => record.entryBossTtkSeconds === null ? [] : [record.entryBossTtkSeconds]), .5),
    bossFightMedianSeconds: quantile(completed.flatMap((record) => record.bossFightSeconds === null ? [] : [record.bossFightSeconds]), .5),
    regularKillsMedian: quantile(records.map((record) => record.regularKills), .5),
    fullClearsMedian: quantile(records.map((record) => record.fullClears), .5),
    durationVsPrevious: null,
    targetDurationSeconds,
    durationVsTarget: durationMedianSeconds !== null && targetDurationSeconds !== null
      ? durationMedianSeconds / targetDurationSeconds
      : null,
    powerGrowthMultiplier: quantile(records.map((record) => record.exitPower / Math.max(1, record.entryPower)), .5),
    targetPowerGrowthMultiplier,
  };
}

function enemyMetricsForMap(
  map: BalanceMapDefinition,
  snapshot: SimulationStateSnapshot,
  adjustment: MapAdjustment,
) {
  const sites = createSites(map);
  const counts = new Map<EnemyKind, number>();
  for (const site of sites) counts.set(site.type, (counts.get(site.type) ?? 0) + 1);
  const combat = combatStats(snapshot, true);
  const beforePower = continuousPowerForState(snapshot);
  return [...counts.entries()].map(([enemyKind, spawnCount]): EnemyBalanceMetric => {
    const enemy = ENEMY_TYPES[enemyKind];
    const projected: SimulationStateSnapshot = {
      ...snapshot,
      stats: { ...snapshot.stats },
      research: { ...snapshot.research },
      equipped: { ...snapshot.equipped },
    };
    const amount = enemy.reward.amount * researchStatRewardMultiplier(snapshot.research) * adjustment.reward;
    applyRewardToStats(projected.stats, enemy.reward.type, amount);
    const fight = timeToKill(enemy.hp * adjustment.hp, combat.averageHit, combat.attackRate);
    const powerGain = Math.max(0, continuousPowerForState(projected) - beforePower);
    const incomingHit = damageAfterArmor(enemy.damage * adjustment.damage, combat.armor);
    return {
      enemy: enemyKind,
      spawnCount,
      hp: enemy.hp * adjustment.hp,
      rewardType: enemy.reward.type,
      rewardAmount: amount,
      timeToKillSeconds: fight,
      powerGain,
      combatPowerPerMinute: powerGain / Math.max(.01, fight + LOOT_AND_RETARGET_SECONDS) * 60,
      damageAfterArmor: incomingHit,
      hitPercentOfHealth: incomingHit / Math.max(1, combat.maxHp) * 100,
      hitsToDefeatPlayer: Math.max(1, Math.ceil(combat.maxHp / incomingHit)),
    };
  }).sort((left, right) => right.combatPowerPerMinute - left.combatPowerPerMinute);
}

function buildDiagnostics(
  config: BalanceSimulationConfig,
  maps: MapSummary[],
  finalPower: BalanceSimulationResult["finalPower"],
  enemyMetrics: Record<BalanceMapId, EnemyBalanceMetric[]>,
) {
  const diagnostics: string[] = [];
  let measuredPacingTargets = 0;
  let pacingTargetsOnTrack = 0;
  let measuredPowerTargets = 0;
  let powerTargetsOnTrack = 0;
  let measuredStatMixes = 0;
  let statMixesOnTrack = 0;
  for (let index = 1; index < maps.length; index += 1) {
    const current = maps[index];
    if (current.reachedPercent < 50) {
      diagnostics.push(`${current.name} is reached in only ${current.reachedPercent.toFixed(0)}% of runs within the selected time window.`);
      continue;
    }
    const durationIsCensored = current.hasBoss && current.completedPercent < 50;
    if (durationIsCensored) {
      diagnostics.push(`${current.name} is not completed by the median run; its displayed map time is a lower bound capped by the simulation window.`);
    } else if (current.durationVsTarget !== null) {
      measuredPacingTargets += 1;
      if (current.durationVsTarget > 1.25) {
        diagnostics.push(`${current.name} takes ${current.durationVsTarget.toFixed(2)}× its ${formatDiagnosticDuration(current.targetDurationSeconds)} target; lower health or improve reward cadence.`);
      } else if (current.durationVsTarget < .75) {
        diagnostics.push(`${current.name} takes only ${current.durationVsTarget.toFixed(2)}× its ${formatDiagnosticDuration(current.targetDurationSeconds)} target; it needs more progression runway.`);
      } else {
        pacingTargetsOnTrack += 1;
      }
    }
    if (!durationIsCensored && current.powerGrowthMultiplier !== null && current.targetPowerGrowthMultiplier !== null) {
      measuredPowerTargets += 1;
      const powerFit = current.powerGrowthMultiplier / current.targetPowerGrowthMultiplier;
      if (powerFit > 1.5) {
        diagnostics.push(`${current.name} grows power ${current.powerGrowthMultiplier.toFixed(1)}×, above the ${current.targetPowerGrowthMultiplier.toFixed(0)}× curve budget; flatten its reward spikes.`);
      } else if (powerFit < .65) {
        diagnostics.push(`${current.name} grows power only ${current.powerGrowthMultiplier.toFixed(1)}× against a ${current.targetPowerGrowthMultiplier.toFixed(0)}× curve budget; add smaller, more frequent gains.`);
      } else {
        powerTargetsOnTrack += 1;
      }
    }
    if (current.exitEffectiveStatsMedian) {
      measuredStatMixes += 1;
      const damageToHealth = current.exitEffectiveStatsMedian.damage / Math.max(1, current.exitEffectiveStatsMedian.maxHp);
      if (damageToHealth > 1.5) {
        diagnostics.push(`${current.name} exits at ${damageToHealth.toFixed(1)}× damage-to-health; damage is outrunning survivability.`);
      } else if (damageToHealth < .25) {
        diagnostics.push(`${current.name} exits at only ${damageToHealth.toFixed(2)}× damage-to-health; health is consuming too much of the progression budget.`);
      } else {
        statMixesOnTrack += 1;
      }
    }
    if (current.hasBoss && current.bossFightMedianSeconds !== null && current.durationMedianSeconds) {
      const bossShare = current.bossFightMedianSeconds / current.durationMedianSeconds;
      if (bossShare > .25) diagnostics.push(`${current.name}'s boss consumes ${(bossShare * 100).toFixed(0)}% of median map time; keep the boss as a capstone rather than the whole progression wall.`);
    }
  }
  const pacingCurveOnTrack = measuredPacingTargets > 0 && measuredPacingTargets === pacingTargetsOnTrack;
  if (pacingCurveOnTrack) {
    diagnostics.unshift(`Pacing curve: ${pacingTargetsOnTrack}/${measuredPacingTargets} measured maps land within ±25% of their explicit duration targets.`);
  }
  const powerCurveOnTrack = measuredPowerTargets > 0 && measuredPowerTargets === powerTargetsOnTrack;
  if (powerCurveOnTrack) {
    diagnostics.splice(pacingCurveOnTrack ? 1 : 0, 0, `Power curve: ${powerTargetsOnTrack}/${measuredPowerTargets} measured maps stay near the ${config.targetMapPowerMultiplier.toFixed(0)}× per-map growth budget.`);
  }
  if (measuredStatMixes > 0 && measuredStatMixes === statMixesOnTrack) {
    diagnostics.splice((pacingCurveOnTrack ? 1 : 0) + (powerCurveOnTrack ? 1 : 0), 0, `Stat mix: ${statMixesOnTrack}/${measuredStatMixes} maps keep damage and health inside the authored combat envelope.`);
  }
  const spread = finalPower.p10 > 0 ? finalPower.p90 / finalPower.p10 : 1;
  if (spread > 1.75) diagnostics.push(`Random equipment drops create a ${spread.toFixed(1)}× P90-to-P10 final-power spread; inspect loot timing before changing base rewards.`);
  for (const map of maps.filter((entry) => entry.reachedPercent >= 50)) {
    const metrics = enemyMetrics[map.mapId];
    const productive = metrics.filter((metric) => metric.combatPowerPerMinute > 0);
    const middle = productive.length ? productive[Math.floor(productive.length / 2)].combatPowerPerMinute : 0;
    const best = productive[0];
    if (best && middle > 0 && best.combatPowerPerMinute / middle >= 4) {
      diagnostics.push(`${map.name}: ${best.enemy} produces ${(best.combatPowerPerMinute / middle).toFixed(1)}× the median enemy's combat power per minute, so optimal farming collapses onto one reward track.`);
    }
    const lethal = metrics.filter((metric) => metric.hitsToDefeatPlayer <= 1);
    if (lethal.length >= Math.ceil(metrics.length / 2)) {
      diagnostics.push(`${map.name}: ${lethal.length}/${metrics.length} enemy types can one-hit the representative entry build; progression timing does not count deaths, dodges, or recovery.`);
    }
  }
  const lastReached = [...maps].reverse().find((map) => map.reachedPercent >= 50);
  if (lastReached) diagnostics.push(`The median run reaches ${lastReached.name}; map durations include travel, respawns, farming, and a solo boss fight capped at ${(config.bossTargetSeconds / 60).toFixed(1)} minutes.`);
  diagnostics.push("Regular-enemy damage is reported as hit size and hits-to-defeat, but player dodging and boss attack patterns are intentionally not guessed by the progression clock.");
  return diagnostics;
}

function formatDiagnosticDuration(seconds: number | null) {
  if (seconds === null) return "selected";
  if (seconds < 3_600) return `${(seconds / 60).toFixed(0)}m`;
  return `${(seconds / 3_600).toFixed(seconds < 36_000 ? 2 : 1)}h`;
}

export function runBalanceSimulation(input: Partial<BalanceSimulationConfig> = {}): BalanceSimulationResult {
  const config = normalizeConfig(input);
  const trials = Array.from({ length: config.trials }, (_, index) => simulateTrial(config, index));
  const timeline = trials[0].samples.map((sample, index): TimelinePoint => {
    const powers = trials.map((trial) => trial.samples[index].power);
    const dps = trials.map((trial) => trial.samples[index].dps);
    return {
      timeSeconds: sample.timeSeconds,
      powerP10: numericQuantile(powers, .1),
      powerMedian: numericQuantile(powers, .5),
      powerP90: numericQuantile(powers, .9),
      dpsMedian: numericQuantile(dps, .5),
    };
  });
  const maps = MAP_DEFINITIONS.map((map, index) => {
    const progressionIndex = index - 1;
    const targetDurationSeconds = progressionIndex < 0
      ? null
      : config.targetDesertDurationSeconds * config.targetMapDurationMultiplier ** progressionIndex;
    return mapSummary(
      trials,
      map,
      config.durationSeconds,
      targetDurationSeconds,
      progressionIndex < 0 ? null : config.targetMapPowerMultiplier,
    );
  });
  for (let index = 1; index < maps.length; index += 1) {
    const previous = maps[index - 1].durationMedianSeconds;
    const current = maps[index].durationMedianSeconds;
    const reliable = maps[index].hasBoss && maps[index].completedPercent >= 50 && maps[index - 1].completedPercent >= 50;
    maps[index].durationVsPrevious = reliable && previous && current ? current / previous : null;
  }
  const finalPowers = trials.map((trial) => trial.finalPower);
  const finalDpsValues = trials.map((trial) => trial.finalDps);
  const finalPower = {
    p10: numericQuantile(finalPowers, .1),
    median: numericQuantile(finalPowers, .5),
    p90: numericQuantile(finalPowers, .9),
  };
  const finalDps = {
    p10: numericQuantile(finalDpsValues, .1),
    median: numericQuantile(finalDpsValues, .5),
    p90: numericQuantile(finalDpsValues, .9),
  };
  const representativePower = finalPower.median;
  const representative = [...trials].sort((left, right) =>
    Math.abs(left.finalPower - representativePower) - Math.abs(right.finalPower - representativePower))[0];
  const enemyMetrics = Object.fromEntries(MAP_DEFINITIONS.map((map) => {
    const record = mapRecordFor(representative, map.id);
    const snapshot = record?.entryState ?? representative.maps[representative.maps.length - 1].entryState;
    return [map.id, enemyMetricsForMap(map, snapshot, config.mapAdjustments[map.id])];
  })) as Record<BalanceMapId, EnemyBalanceMetric[]>;
  return {
    config,
    timeline,
    maps,
    enemyMetrics,
    diagnostics: buildDiagnostics(config, maps, finalPower, enemyMetrics),
    finalPower,
    finalDps,
    simulatedCampaigns: trials.length,
  };
}
