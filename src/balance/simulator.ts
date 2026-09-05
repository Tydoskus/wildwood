import { BOSS_TARGET_SECONDS } from "../../shared/progression";
import { ATTACK_WINDUP_SECONDS } from "../game/attack-timeline";
import { BOSS_DAMAGE_PROFILES } from "../game/boss-damage";
import { damageAfterArmor } from "../game/combat";
import { ENEMY_TYPES, type EnemyKind, type RewardType } from "../game/enemies";
import { createGameBootstrap } from "../game/runtime/game-bootstrap";
import { formatCompactNumber } from "../ui/number-format";
import {
  ADVANCED_LAVA_WASTES_MAP_ID,
  BEGINNER_DESERT_MAP_ID,
  CLOUDSPIRE_MAP_ID,
  createSpawnSites,
  INFERNAL_DEPTHS_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  MOONFEN_MAP_ID,
  CRYSTAL_HOLLOWS_MAP_ID, CLOCKWORK_RUINS_MAP_ID, DUSKFALL_ORCHARD_MAP_ID,
  SAMURAI_GARDEN_MAP_ID,
  TUTORIAL_FOREST_MAP_ID,
  WATER_REACH_MAP_ID,
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
  NIGHT_FOREST_BOW_ITEM_DROP_DENOMINATOR,
  NIGHT_BOW,
  SNOW_BOSS_ARMOR_DROP_DENOMINATOR,
  SNOW_BOSS_ITEM_DROP_DENOMINATOR,
  SNOW_BOW,
  SNOW_ITEM_DROP_DENOMINATOR,
  STARTER_BOW,
  STARTER_STONE,
  WOODEN_ARMOR,
  WOOD_FULL_HELM,
  type ItemId,
} from "../../shared/items";
import { effectivePlayerPowerStats, playerPowerForStats, type PlayerPowerStats } from "../../shared/player-power";
import { LATE_MAP_DAMAGE_TIER, lateMapReferenceBuild, type LateDamageMap } from "../../shared/incoming-damage";
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
  BALANCE_LATE_BOSS_TARGET_DURATION_SHARE,
  BALANCE_LATE_BOSS_TARGET_MAX_SECONDS,
  BALANCE_TARGET_DESERT_DURATION_SECONDS,
  BALANCE_TARGET_MAP_DURATION_MULTIPLIER,
  BALANCE_TARGET_MAP_POWER_MULTIPLIER,
  BALANCE_TARGET_POWER_ARC_BLEND,
  BOSS_RESPAWN_SECONDS,
  BOSS_REPEAT_REWARD_FRACTION,
  BOSS_REWARD_CLAIM_BITS,
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
  KOI_SHOGUN_REWARD_ARMOR,
  KOI_SHOGUN_REWARD_DAMAGE,
  KOI_SHOGUN_REWARD_HEALTH,
  KOI_SHOGUN_REWARD_REGEN,
  MAGMALISK_REWARD_ARMOR,
  MAGMALISK_REWARD_DAMAGE,
  MAGMALISK_REWARD_HEALTH,
  MAGMALISK_REWARD_REGEN,
  MIREMAW_REWARD_ARMOR,
  PRISMSHELL_REWARD_ARMOR, IRONHORN_REWARD_ARMOR, DREADREAPER_REWARD_ARMOR,
  MIREMAW_REWARD_DAMAGE,
  PRISMSHELL_REWARD_DAMAGE, IRONHORN_REWARD_DAMAGE, DREADREAPER_REWARD_DAMAGE,
  MIREMAW_REWARD_HEALTH,
  PRISMSHELL_REWARD_HEALTH, IRONHORN_REWARD_HEALTH, DREADREAPER_REWARD_HEALTH,
  MIREMAW_REWARD_REGEN,
  PRISMSHELL_REWARD_REGEN, IRONHORN_REWARD_REGEN, DREADREAPER_REWARD_REGEN,
  MAP_DISPLAY_NAMES,
  MAX_BASE_ATTACKS_PER_SECOND,
  MIN_ATTACK_INTERVAL,
  PLAYER_BASE_HP,
  PLAYER_PROJECTILE_SPEED,
  PLAYER_SPEED,
  SPIDER_REWARD_DAMAGE,
  SPIDER_REWARD_HEALTH,
  TIDEWYRM_REWARD_ARMOR,
  TIDEWYRM_REWARD_DAMAGE,
  TIDEWYRM_REWARD_HEALTH,
  TIDEWYRM_REWARD_REGEN,
  TEMPEST_KIRIN_REWARD_ARMOR,
  TEMPEST_KIRIN_REWARD_DAMAGE,
  TEMPEST_KIRIN_REWARD_HEALTH,
  TEMPEST_KIRIN_REWARD_REGEN,
} from "../../shared/rules";

export const BALANCE_MAP_IDS = [
  TUTORIAL_FOREST_MAP_ID,
  BEGINNER_DESERT_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  ADVANCED_LAVA_WASTES_MAP_ID,
  INFERNAL_DEPTHS_MAP_ID,
  WATER_REACH_MAP_ID,
  SAMURAI_GARDEN_MAP_ID,
  CLOUDSPIRE_MAP_ID,
  MOONFEN_MAP_ID,
  CRYSTAL_HOLLOWS_MAP_ID, CLOCKWORK_RUINS_MAP_ID, DUSKFALL_ORCHARD_MAP_ID,
] as const;

export type BalanceMapId = typeof BALANCE_MAP_IDS[number];
export type GuidedFarmingStrategy = "natural" | "efficient" | "dps-first" | "boss-rush";
export type FarmingStrategy = GuidedFarmingStrategy | "mixed" | "boss-farm";
export type ResearchPlan = "off" | "balanced" | "damage-first";

export type MapAdjustment = {
  hp: number;
  bossHp: number;
  damage: number;
  reward: number;
  bossReward: number;
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
  targetPowerArcBlend: number;
  futureSpeedupReserveMultiplier: number;
  requiredClears: number;
  respawnSeconds: number;
  itemUpgradeLevel: number;
  equipmentStrengthMultiplier: number;
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
  equipmentStrengthMultiplier: number;
};

type DropDefinition = {
  itemId: ItemId;
  denominator: number;
  eligible?: (enemy: EnemyKind) => boolean;
};

type BossReward = { type: Exclude<RewardType, "speed">; amount: number };

type BossDefinition = {
  kind: keyof typeof BOSS_DAMAGE_PROFILES;
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
  equipmentStrengthMultiplier: number;
  activeResearch: ActiveResearch | null;
  bossRewardClaims: number;
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
  exitBossTtkSeconds: number | null;
  bossFightSeconds: number | null;
  bossRewardPowerGain: number | null;
  repeatBossKills: number;
  repeatBossPowerGain: number;
  regularKills: number;
  fullClears: number;
  timeBudget: MapTimeBudget;
  repeatTimeBudget: MapTimeBudget;
  statInvestments: Record<ProgressionStat, TrialStatInvestment>;
  curveProgress: CurveProgress | null;
  momentum: MomentumMetric | null;
  entryState: SimulationStateSnapshot;
  exitState: SimulationStateSnapshot;
};

type TrialResult = {
  samples: Array<{ timeSeconds: number; power: number; dps: number; mapIndex: number }>;
  maps: TrialMapRecord[];
  finalPower: number;
  finalDps: number;
  primaryStrategy: GuidedFarmingStrategy | "boss-farm";
};

export type TimelinePoint = {
  timeSeconds: number;
  powerP10: number;
  powerMedian: number;
  powerP90: number;
  dpsMedian: number;
};

export type StrategyTimeline = {
  strategy: GuidedFarmingStrategy;
  timeline: TimelinePoint[];
};

export type BalanceSimulationProgress = {
  config: BalanceSimulationConfig;
  completedTrials: number;
  totalTrials: number;
  timeline: TimelinePoint[];
};

export type MapTimeBudget = {
  regularCombatSeconds: number;
  bossCombatSeconds: number;
  travelSeconds: number;
  respawnWaitSeconds: number;
  lootRetargetSeconds: number;
};

export const PROGRESSION_STAT_IDS = ["damage", "health", "armor", "regeneration", "attackSpeed"] as const;
export type ProgressionStat = typeof PROGRESSION_STAT_IDS[number];

type TrialStatInvestment = {
  investmentSeconds: number;
  combatSeconds: number;
  rewardPowerGain: number;
  rewardEvents: number;
};

export type StatProgressionMetric = {
  stat: ProgressionStat;
  investmentSecondsMedian: number;
  combatSecondsMedian: number;
  investmentSharePercent: number;
  rewardPowerGainMedian: number;
  rewardGrowthSharePercent: number;
  rewardEventsMedian: number;
  secondsPerOnePercentPower: number | null;
  entryValueMedian: number;
  exitValueMedian: number;
  growthMultiplier: number | null;
  effectiveDoublingSecondsMedian: number | null;
};

export type PowerComponents = {
  damage: number;
  health: number;
  armor: number;
  regeneration: number;
  total: number;
  equipment: number;
  equipmentSharePercent: number;
};

export type CurveProgress = {
  p25: number;
  p50: number;
  p75: number;
};

export type MomentumMetric = {
  meaningfulGainPercent: number;
  meaningfulGainCount: number;
  longestGainGapSeconds: number;
  longestGainGapSharePercent: number;
  largestSingleJumpPercent: number;
  largestSingleJumpGrowthSharePercent: number;
};

export type ProgressionHeadroom = {
  reserveMultiplier: number;
  reservePass: boolean;
  uniformSafeMultiplier: number;
  projectedDurationAtReserveSeconds: number;
  combatSafeMultiplier: number | null;
  farmingSafeMultiplier: number | null;
  movementSafeMultiplier: number | null;
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
  bossTtkAtExitMedianSeconds: number | null;
  bossFightMedianSeconds: number | null;
  bossRewardPowerGainMedian: number | null;
  bossRewardGrowthSharePercent: number | null;
  bossFirstClearPowerPerMinuteMedian: number | null;
  bossRepeatPermanentPowerPerMinuteMedian: number | null;
  bestRegularPowerPerMinuteMedian: number | null;
  bossFirstClearEfficiencyRatioMedian: number | null;
  bossRepeatEfficiencyRatioMedian: number | null;
  repeatBossKillsMedian: number | null;
  repeatBossPowerGainMedian: number | null;
  regularKillsMedian: number | null;
  fullClearsMedian: number | null;
  timeBudgetMedian: MapTimeBudget | null;
  repeatTimeBudgetMedian: MapTimeBudget | null;
  statProgression: StatProgressionMetric[];
  momentum: MomentumMetric | null;
  futureHeadroom: ProgressionHeadroom | null;
  entryPowerComponentsMedian: PowerComponents | null;
  exitPowerComponentsMedian: PowerComponents | null;
  curveProgress: CurveProgress | null;
  targetCurveProgress: CurveProgress | null;
  durationVsPrevious: number | null;
  targetDurationSeconds: number | null;
  durationVsTarget: number | null;
  powerGrowthMultiplier: number | null;
  targetPowerGrowthMultiplier: number | null;
};

export type EnemyBalanceMetric = {
  enemy: EnemyKind;
  elite: boolean;
  spawnCount: number;
  hp: number;
  rewardType: RewardType;
  rewardAmount: number;
  timeToKillSeconds: number;
  powerGain: number;
  combatPowerPerMinute: number;
  damageAfterArmor: number;
  incomingDamagePerSecond: number;
  hitPercentOfHealth: number;
  referenceHitPercentOfHealth: number | null;
  survivalSeconds: number | null;
  hitsToDefeatPlayer: number;
  fullClearCombatSeconds: number;
  fullClearCombatSharePercent: number;
  ttkVsMapMedian: number;
  efficiencyVsMapMedian: number;
  powerGainPercentOfEntry: number;
  combatSecondsPerOnePercentPower: number | null;
};

export type TargetCurvePoint = {
  timeSeconds: number;
  power: number;
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
  strategyMix: Record<GuidedFarmingStrategy | "boss-farm", number>;
  strategyTimelines?: StrategyTimeline[];
  strategyComparisonTrials?: number;
};

const SAMPLE_COUNT = 180;
const MAP_TRANSITION_SECONDS = 6;
const LOOT_AND_RETARGET_SECONDS = .3;
const DEFAULT_FOREST_ONBOARDING_SECONDS = 22.5 * 60;
const DEFAULT_CAMPAIGN_DURATION_SECONDS = 1.5 * (DEFAULT_FOREST_ONBOARDING_SECONDS + BALANCE_MAP_IDS
  .slice(1)
  .reduce((total, _mapId, index) => total + BALANCE_TARGET_DESERT_DURATION_SECONDS * BALANCE_TARGET_MAP_DURATION_MULTIPLIER ** index, 0));
const PROJECTILE_TRAVEL_SECONDS = DEFAULT_ATTACK_RANGE / PLAYER_PROJECTILE_SPEED * .5;
const FIRST_HIT_SECONDS = ATTACK_WINDUP_SECONDS + PROJECTILE_TRAVEL_SECONDS;

export function targetPowerAtMapProgress(
  entryPower: number,
  growthMultiplier: number,
  progress: number,
  arcBlend = BALANCE_TARGET_POWER_ARC_BLEND,
) {
  const start = Math.max(1, entryPower);
  const growth = Math.max(1, growthMultiplier);
  const position = Math.max(0, Math.min(1, progress));
  const blend = Math.max(0, Math.min(1, arcBlend));
  if (position === 0) return start;
  if (position === 1) return start * growth;
  const geometric = start * growth ** position;
  const logarithmicArc = start * (1 + (growth - 1) * position);
  return geometric ** (1 - blend) * logarithmicArc ** blend;
}

export function targetCurveProgress(
  growthMultiplier: number,
  arcBlend = BALANCE_TARGET_POWER_ARC_BLEND,
): CurveProgress {
  const normalized = (progress: number) => {
    const power = targetPowerAtMapProgress(1, growthMultiplier, progress, arcBlend);
    return Math.log(power) / Math.log(Math.max(1 + Number.EPSILON, growthMultiplier));
  };
  return { p25: normalized(.25), p50: normalized(.5), p75: normalized(.75) };
}

export function buildStackedLogTargetCurve(
  maps: readonly Pick<MapSummary, "enteredAtMedianSeconds" | "entryPowerMedian" | "targetDurationSeconds" | "targetPowerGrowthMultiplier">[],
  samplesPerMap = 16,
  arcBlend = BALANCE_TARGET_POWER_ARC_BLEND,
): TargetCurvePoint[] {
  const first = maps.find((map) =>
    map.enteredAtMedianSeconds !== null &&
    map.entryPowerMedian !== null &&
    map.targetDurationSeconds !== null &&
    map.targetPowerGrowthMultiplier !== null);
  if (!first) return [];
  let targetTime = first.enteredAtMedianSeconds!;
  let targetPower = first.entryPowerMedian!;
  const points: TargetCurvePoint[] = [{ timeSeconds: targetTime, power: targetPower }];
  const startIndex = maps.indexOf(first);
  for (const map of maps.slice(startIndex)) {
    if (map.targetDurationSeconds === null || map.targetPowerGrowthMultiplier === null) continue;
    const steps = Math.max(2, Math.floor(samplesPerMap));
    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps;
      points.push({
        timeSeconds: targetTime + map.targetDurationSeconds * progress,
        power: targetPowerAtMapProgress(targetPower, map.targetPowerGrowthMultiplier, progress, arcBlend),
      });
    }
    targetTime += map.targetDurationSeconds;
    targetPower *= map.targetPowerGrowthMultiplier;
  }
  return points;
}

const balancedResearchOrder: ResearchId[] = [
  "foraging", "warcraft", "moveSpeed", "vitality", "precision",
  "regeneration", "prosperity", "criticalChance", "criticalDamage",
];
const damageResearchOrder: ResearchId[] = [
  "foraging", "warcraft", "prosperity", "criticalChance", "criticalDamage",
  "moveSpeed", "vitality", "precision", "regeneration",
];

function defaultMapAdjustments(): Record<BalanceMapId, MapAdjustment> {
  return Object.fromEntries(BALANCE_MAP_IDS.map((id) => [id, {
    hp: 1,
    bossHp: 1,
    damage: 1,
    reward: 1,
    bossReward: 1,
  }])) as Record<BalanceMapId, MapAdjustment>;
}

export function defaultBalanceSimulationConfig(): BalanceSimulationConfig {
  return {
    durationSeconds: DEFAULT_CAMPAIGN_DURATION_SECONDS,
    trials: 100,
    strategy: "mixed",
    researchPlan: "balanced",
    bossTargetSeconds: BOSS_TARGET_SECONDS,
    targetDesertDurationSeconds: BALANCE_TARGET_DESERT_DURATION_SECONDS,
    targetMapDurationMultiplier: BALANCE_TARGET_MAP_DURATION_MULTIPLIER,
    targetMapPowerMultiplier: BALANCE_TARGET_MAP_POWER_MULTIPLIER,
    targetPowerArcBlend: BALANCE_TARGET_POWER_ARC_BLEND,
    futureSpeedupReserveMultiplier: 1.25,
    requiredClears: 1,
    respawnSeconds: 30,
    itemUpgradeLevel: 0,
    equipmentStrengthMultiplier: 1,
    pathingMultiplier: 1.15,
    seed: 1_337,
    mapAdjustments: defaultMapAdjustments(),
  };
}

export function bossReadinessTargetSeconds(
  mapId: BalanceMapId,
  config: Pick<
    BalanceSimulationConfig,
    "bossTargetSeconds" | "targetDesertDurationSeconds" | "targetMapDurationMultiplier"
  >,
) {
  const progressionIndex = BALANCE_MAP_IDS.indexOf(mapId) - 1;
  const lavaProgressionIndex = BALANCE_MAP_IDS.indexOf(ADVANCED_LAVA_WASTES_MAP_ID) - 1;
  if (progressionIndex < lavaProgressionIndex) return config.bossTargetSeconds;
  const targetMapDuration = config.targetDesertDurationSeconds *
    config.targetMapDurationMultiplier ** progressionIndex;
  return Math.max(
    config.bossTargetSeconds,
    Math.min(
      BALANCE_LATE_BOSS_TARGET_MAX_SECONDS,
      targetMapDuration * BALANCE_LATE_BOSS_TARGET_DURATION_SHARE,
    ),
  );
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
      hp: finiteRange(next.hp, 1, 1e-15, 100),
      bossHp: finiteRange(next.bossHp, 1, 1e-15, 100),
      damage: finiteRange(next.damage, 1, 0, 100),
      reward: finiteRange(next.reward, 1, 0, 100),
      bossReward: finiteRange(next.bossReward, 1, 0, 100),
    };
  }
  return {
    durationSeconds: finiteRange(config.durationSeconds, defaults.durationSeconds, 60, 30 * 24 * 60 * 60),
    trials: Math.round(finiteRange(config.trials, defaults.trials, 1, 250)),
    strategy: strategy === "natural" || strategy === "efficient" || strategy === "dps-first" || strategy === "boss-rush" || strategy === "boss-farm" || strategy === "mixed"
      ? strategy
      : "efficient",
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
    targetPowerArcBlend: finiteRange(config.targetPowerArcBlend, defaults.targetPowerArcBlend, 0, 1),
    futureSpeedupReserveMultiplier: finiteRange(
      config.futureSpeedupReserveMultiplier,
      defaults.futureSpeedupReserveMultiplier,
      1,
      5,
    ),
    requiredClears: Math.round(finiteRange(config.requiredClears, defaults.requiredClears, 0, 20)),
    respawnSeconds: finiteRange(config.respawnSeconds, defaults.respawnSeconds, 1, 300),
    itemUpgradeLevel: Math.round(finiteRange(config.itemUpgradeLevel, defaults.itemUpgradeLevel, 0, 10)),
    equipmentStrengthMultiplier: finiteRange(
      config.equipmentStrengthMultiplier,
      defaults.equipmentStrengthMultiplier,
      0,
      2,
    ),
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
        kind: "dragon",
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
        kind: "spider",
        name: "Desert Scorpion",
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
      regularDrops: [
        { itemId: SNOW_BOW, denominator: SNOW_ITEM_DROP_DENOMINATOR, eligible: always },
      ],
      boss: {
        kind: "frostclaw",
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
        kind: "magmalisk",
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
        { itemId: NIGHT_BOW, denominator: NIGHT_FOREST_BOW_ITEM_DROP_DENOMINATOR, eligible: always },
        { itemId: FIRE_METAL_BOW, denominator: INFERNAL_ITEM_DROP_DENOMINATOR, eligible: always },
        { itemId: DARK_METAL_HELMET, denominator: NIGHT_FOREST_HELMET_ITEM_DROP_DENOMINATOR, eligible: always },
      ],
      boss: {
        kind: "gloomroot",
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
      boss: {
        kind: "tidewyrm",
        name: "Tidewyrm",
        hp: bootstrap.tidewyrmBoss.maxHp,
        x: bootstrap.tidewyrmBoss.x,
        y: bootstrap.tidewyrmBoss.y,
        rewards: [
          { type: "damage", amount: TIDEWYRM_REWARD_DAMAGE },
          { type: "health", amount: TIDEWYRM_REWARD_HEALTH },
          { type: "armor", amount: TIDEWYRM_REWARD_ARMOR },
          { type: "regen", amount: TIDEWYRM_REWARD_REGEN },
        ],
        drops: [],
      },
    },
    {
      id: SAMURAI_GARDEN_MAP_ID,
      name: MAP_DISPLAY_NAMES[SAMURAI_GARDEN_MAP_ID],
      arrival: bootstrap.mapConfig[SAMURAI_GARDEN_MAP_ID].arrival,
      regularDrops: [],
      boss: {
        kind: "koiShogun",
        name: "Koi Shogun",
        hp: bootstrap.koiShogunBoss.maxHp,
        x: bootstrap.koiShogunBoss.x,
        y: bootstrap.koiShogunBoss.y,
        rewards: [
          { type: "damage", amount: KOI_SHOGUN_REWARD_DAMAGE },
          { type: "health", amount: KOI_SHOGUN_REWARD_HEALTH },
          { type: "armor", amount: KOI_SHOGUN_REWARD_ARMOR },
          { type: "regen", amount: KOI_SHOGUN_REWARD_REGEN },
        ],
        drops: [],
      },
    },
    {
      id: CLOUDSPIRE_MAP_ID,
      name: MAP_DISPLAY_NAMES[CLOUDSPIRE_MAP_ID],
      arrival: bootstrap.mapConfig[CLOUDSPIRE_MAP_ID].arrival,
      regularDrops: [],
      boss: {
        kind: "tempestKirin",
        name: "Tempest Kirin",
        hp: bootstrap.tempestKirinBoss.maxHp,
        x: bootstrap.tempestKirinBoss.x,
        y: bootstrap.tempestKirinBoss.y,
        rewards: [
          { type: "damage", amount: TEMPEST_KIRIN_REWARD_DAMAGE },
          { type: "health", amount: TEMPEST_KIRIN_REWARD_HEALTH },
          { type: "armor", amount: TEMPEST_KIRIN_REWARD_ARMOR },
          { type: "regen", amount: TEMPEST_KIRIN_REWARD_REGEN },
        ],
        drops: [],
      },
    },
    {
      id: MOONFEN_MAP_ID,
      name: MAP_DISPLAY_NAMES[MOONFEN_MAP_ID],
      arrival: bootstrap.mapConfig[MOONFEN_MAP_ID].arrival,
      regularDrops: [],
      boss: {
        kind: "miremaw",
        name: "Miremaw",
        hp: bootstrap.miremawBoss.maxHp,
        x: bootstrap.miremawBoss.x,
        y: bootstrap.miremawBoss.y,
        rewards: [
          { type: "damage", amount: MIREMAW_REWARD_DAMAGE },
          { type: "health", amount: MIREMAW_REWARD_HEALTH },
          { type: "armor", amount: MIREMAW_REWARD_ARMOR },
          { type: "regen", amount: MIREMAW_REWARD_REGEN },
        ],
        drops: [],
      },
    },
    {
      id: CRYSTAL_HOLLOWS_MAP_ID,
      name: MAP_DISPLAY_NAMES[CRYSTAL_HOLLOWS_MAP_ID],
      arrival: bootstrap.mapConfig[CRYSTAL_HOLLOWS_MAP_ID].arrival,
      regularDrops: [],
      boss: {
        kind: "prismshell",
        name: "Prismshell",
        hp: bootstrap.prismshellBoss.maxHp,
        x: bootstrap.prismshellBoss.x,
        y: bootstrap.prismshellBoss.y,
        rewards: [
          { type: "damage", amount: PRISMSHELL_REWARD_DAMAGE },
          { type: "health", amount: PRISMSHELL_REWARD_HEALTH },
          { type: "armor", amount: PRISMSHELL_REWARD_ARMOR },
          { type: "regen", amount: PRISMSHELL_REWARD_REGEN },
        ],
        drops: [],
      },
    }, {
      id: CLOCKWORK_RUINS_MAP_ID,
      name: MAP_DISPLAY_NAMES[CLOCKWORK_RUINS_MAP_ID],
      arrival: bootstrap.mapConfig[CLOCKWORK_RUINS_MAP_ID].arrival,
      regularDrops: [],
      boss: {
        kind: "ironhorn",
        name: "Ironhorn",
        hp: bootstrap.ironhornBoss.maxHp,
        x: bootstrap.ironhornBoss.x,
        y: bootstrap.ironhornBoss.y,
        rewards: [
          { type: "damage", amount: IRONHORN_REWARD_DAMAGE },
          { type: "health", amount: IRONHORN_REWARD_HEALTH },
          { type: "armor", amount: IRONHORN_REWARD_ARMOR },
          { type: "regen", amount: IRONHORN_REWARD_REGEN },
        ],
        drops: [],
      },
    }, {
      id: DUSKFALL_ORCHARD_MAP_ID,
      name: MAP_DISPLAY_NAMES[DUSKFALL_ORCHARD_MAP_ID],
      arrival: bootstrap.mapConfig[DUSKFALL_ORCHARD_MAP_ID].arrival,
      regularDrops: [],
      boss: {
        kind: "dreadreaper",
        name: "Dreadreaper",
        hp: bootstrap.dreadreaperBoss.maxHp,
        x: bootstrap.dreadreaperBoss.x,
        y: bootstrap.dreadreaperBoss.y,
        rewards: [
          { type: "damage", amount: DREADREAPER_REWARD_DAMAGE },
          { type: "health", amount: DREADREAPER_REWARD_HEALTH },
          { type: "armor", amount: DREADREAPER_REWARD_ARMOR },
          { type: "regen", amount: DREADREAPER_REWARD_REGEN },
        ],
        drops: [],
      },
    },
  ];
}

const MAP_DEFINITIONS = createMapDefinitions();
const LATE_COMPLEMENTARY_MAP_IDS = new Set<BalanceMapId>(
  BALANCE_MAP_IDS.slice(BALANCE_MAP_IDS.indexOf(ADVANCED_LAVA_WASTES_MAP_ID)),
);

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

export const GUIDED_FARMING_STRATEGIES: readonly GuidedFarmingStrategy[] = [
  "natural", "efficient", "dps-first", "boss-rush",
];

// A normal player periodically takes a useful non-DPS reward while preparing
// for a boss. The interval is intentionally behavior-specific: exploration
// spends more time on the wider build, while a boss-rush stays on offense.
const STRATEGY_DEFENSIVE_REWARD_INTERVALS: Record<GuidedFarmingStrategy, number> = {
  natural: 8,
  efficient: 12,
  "dps-first": 20,
  // Boss-rush stays on its readiness route; repeat rewards remain available,
  // but their full respawn-inclusive rate is audited against regular farming.
  "boss-rush": Number.POSITIVE_INFINITY,
};
type StrategyBlend = Record<GuidedFarmingStrategy, number>;
type TrialBehavior = {
  primaryStrategy: GuidedFarmingStrategy | "boss-farm";
  blend: StrategyBlend;
};

function oneHotStrategy(strategy: GuidedFarmingStrategy): StrategyBlend {
  return Object.fromEntries(GUIDED_FARMING_STRATEGIES.map((id) => [id, id === strategy ? 1 : 0])) as StrategyBlend;
}

function mixedTrialBehavior(random: () => number): TrialBehavior {
  // Give every campaign all four sensible priorities, then make one of them
  // slightly more likely. This keeps the population varied without turning
  // one run into four unrelated robot scripts.
  const primaryRoll = random();
  const primaryStrategy = primaryRoll < .2
    ? "natural"
    : primaryRoll < .5
      ? "efficient"
      : primaryRoll < .75
        ? "dps-first"
        : "boss-rush";
  const blend = Object.fromEntries(GUIDED_FARMING_STRATEGIES.map((id) => [
    id,
    .16 + random() * .08 + (id === primaryStrategy ? .12 : 0),
  ])) as StrategyBlend;
  const total = GUIDED_FARMING_STRATEGIES.reduce((sum, id) => sum + blend[id], 0);
  for (const id of GUIDED_FARMING_STRATEGIES) blend[id] /= total;
  return { primaryStrategy, blend };
}

function trialBehavior(strategy: FarmingStrategy, random: () => number): TrialBehavior {
  if (strategy === "mixed") return mixedTrialBehavior(random);
  if (strategy === "boss-farm") {
    return { primaryStrategy: "boss-farm", blend: oneHotStrategy("boss-rush") };
  }
  return { primaryStrategy: strategy, blend: oneHotStrategy(strategy) };
}

function stateSnapshot(state: MutableSimulationState): SimulationStateSnapshot {
  return {
    stats: { ...state.stats },
    research: { ...state.research },
    equipped: { ...state.equipped },
    bootsEquipped: state.bootsEquipped,
    itemUpgradeLevel: state.itemUpgradeLevel,
    equipmentStrengthMultiplier: state.equipmentStrengthMultiplier,
  };
}

type EffectiveStatsState = Pick<
  SimulationStateSnapshot,
  "stats" | "research" | "equipped" | "itemUpgradeLevel" | "equipmentStrengthMultiplier"
>;

function effectiveStats(state: EffectiveStatsState) {
  const withEquipment = effectivePlayerPowerStats({
    ...state.stats,
    equippedHead: state.equipped.head,
    equippedChest: state.equipped.chest,
    equippedRightHand: state.equipped.weapon,
  }, state.research, () => state.itemUpgradeLevel);
  const strength = Math.max(0, Math.min(2, state.equipmentStrengthMultiplier));
  if (strength === 1) return withEquipment;
  const withoutEquipment = effectivePlayerPowerStats({
    ...state.stats,
    equippedHead: "",
    equippedChest: "",
    equippedRightHand: "",
  }, state.research, () => state.itemUpgradeLevel);
  return {
    damage: withoutEquipment.damage + (withEquipment.damage - withoutEquipment.damage) * strength,
    maxHp: withoutEquipment.maxHp + (withEquipment.maxHp - withoutEquipment.maxHp) * strength,
    attackRate: withoutEquipment.attackRate + (withEquipment.attackRate - withoutEquipment.attackRate) * strength,
    armor: withoutEquipment.armor + (withEquipment.armor - withoutEquipment.armor) * strength,
    regen: withoutEquipment.regen + (withEquipment.regen - withoutEquipment.regen) * strength,
  };
}

function powerForState(state: EffectiveStatsState) {
  return playerPowerForStats(effectiveStats(state));
}

function powerComponentsForStats(stats: PlayerPowerStats) {
  const damage = stats.damage * DEFAULT_ATTACK_INTERVAL / Math.max(MIN_ATTACK_INTERVAL, stats.attackRate);
  const health = stats.maxHp;
  const armor = stats.armor * 3;
  const regeneration = stats.regen * 10;
  return { damage, health, armor, regeneration, total: damage + health + armor + regeneration };
}

function continuousPowerForState(state: EffectiveStatsState) {
  return powerComponentsForStats(effectiveStats(state)).total;
}

function powerComponentsForState(state: EffectiveStatsState): PowerComponents {
  const components = powerComponentsForStats(effectiveStats(state));
  const equipmentFree = powerComponentsForStats(effectiveStats({
    ...state,
    equipped: { head: "", chest: "", weapon: "" },
  }));
  const equipment = Math.max(0, components.total - equipmentFree.total);
  return {
    ...components,
    equipment,
    equipmentSharePercent: components.total > 0 ? equipment / components.total * 100 : 0,
  };
}

function combatStats(state: EffectiveStatsState, bossesCanCrit: boolean) {
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

function progressionStatForReward(type: RewardType): ProgressionStat {
  if (type === "speed") return "attackSpeed";
  if (type === "regen") return "regeneration";
  return type;
}

function emptyStatInvestments(): Record<ProgressionStat, TrialStatInvestment> {
  return Object.fromEntries(PROGRESSION_STAT_IDS.map((stat) => [stat, {
    investmentSeconds: 0,
    combatSeconds: 0,
    rewardPowerGain: 0,
    rewardEvents: 0,
  }])) as Record<ProgressionStat, TrialStatInvestment>;
}

function effectiveStatValue(state: EffectiveStatsState, stat: ProgressionStat) {
  const effective = effectiveStats(state);
  if (stat === "health") return effective.maxHp;
  if (stat === "regeneration") return effective.regen;
  if (stat === "attackSpeed") return 1 / Math.max(MIN_ATTACK_INTERVAL, effective.attackRate);
  return effective[stat];
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
  const projected = { ...state, stats: { ...state.stats } };
  const reward = ENEMY_TYPES[enemy].reward;
  applyRewardToStats(projected.stats, reward.type, reward.amount * researchStatRewardMultiplier(state.research) * adjustment.reward);
  return Math.max(0, continuousPowerForState(projected) - before);
}

function projectedDpsGain(
  state: MutableSimulationState,
  enemy: EnemyKind,
  adjustment: MapAdjustment,
) {
  const before = combatStats(state, true).dps;
  const projected = { ...state, stats: { ...state.stats } };
  const reward = ENEMY_TYPES[enemy].reward;
  applyRewardToStats(projected.stats, reward.type, rewardAmount(state, reward.amount, adjustment.reward));
  return Math.max(0, combatStats(projected, true).dps - before);
}

function projectedBossTtk(
  state: MutableSimulationState,
  map: BalanceMapDefinition,
  enemy: EnemyKind,
  adjustment: MapAdjustment,
) {
  if (!map.boss) return null;
  const projected = { ...state, stats: { ...state.stats } };
  const reward = ENEMY_TYPES[enemy].reward;
  applyRewardToStats(projected.stats, reward.type, rewardAmount(state, reward.amount, adjustment.reward));
  return bossFightSeconds(projected, map, adjustment);
}

function projectedBossRewardPowerGain(
  state: EffectiveStatsState,
  boss: BossDefinition,
  adjustment: MapAdjustment,
) {
  const projected: SimulationStateSnapshot = {
    stats: { ...state.stats },
    research: { ...state.research },
    equipped: { ...state.equipped },
    bootsEquipped: false,
    itemUpgradeLevel: state.itemUpgradeLevel,
    equipmentStrengthMultiplier: state.equipmentStrengthMultiplier,
  };
  const before = continuousPowerForState(projected);
  for (const reward of boss.rewards) {
    applyRewardToStats(projected.stats, reward.type, reward.amount * researchStatRewardMultiplier(projected.research) * adjustment.bossReward);
  }
  return Math.max(0, continuousPowerForState(projected) - before);
}

type BossRewardScenario = {
  firstClearCycleSeconds: number;
  firstClearPowerGain: number;
  firstClearPowerPerMinute: number;
  bestRegularPowerPerMinute: number;
  firstClearEfficiencyRatio: number;
};

function bestRegularPowerPerMinute(
  map: BalanceMapDefinition,
  snapshot: SimulationStateSnapshot,
  adjustment: MapAdjustment,
) {
  const sites = createSites(map);
  const combat = combatStats(snapshot, true);
  let best = 0;
  for (const site of sites) {
    const enemy = ENEMY_TYPES[site.type];
    const projected: SimulationStateSnapshot = {
      ...snapshot,
      stats: { ...snapshot.stats },
      research: { ...snapshot.research },
      equipped: { ...snapshot.equipped },
    };
    const reward = enemy.reward;
    applyRewardToStats(projected.stats, reward.type, reward.amount * researchStatRewardMultiplier(snapshot.research) * adjustment.reward);
    const fight = timeToKill(enemy.hp * adjustment.hp, combat.averageHit, combat.attackRate);
    const powerGain = Math.max(0, continuousPowerForState(projected) - continuousPowerForState(snapshot));
    best = Math.max(best, powerGain / Math.max(.01, fight + LOOT_AND_RETARGET_SECONDS) * 60);
  }
  return best;
}

function bossRewardScenario(
  map: BalanceMapDefinition,
  snapshot: SimulationStateSnapshot,
  adjustment: MapAdjustment,
): BossRewardScenario | null {
  if (!map.boss) return null;
  const fight = bossFightSeconds(snapshot, map, adjustment);
  if (fight === null) return null;
  const firstClearPowerGain = projectedBossRewardPowerGain(snapshot, map.boss, adjustment);
  const firstClearCycleSeconds = Math.max(.01, fight + LOOT_AND_RETARGET_SECONDS);
  const firstClearPowerPerMinute = firstClearPowerGain / firstClearCycleSeconds * 60;
  const bestRegular = bestRegularPowerPerMinute(map, snapshot, adjustment);
  return {
    firstClearCycleSeconds,
    firstClearPowerGain,
    firstClearPowerPerMinute,
    bestRegularPowerPerMinute: bestRegular,
    firstClearEfficiencyRatio: firstClearPowerPerMinute / Math.max(.01, bestRegular),
  };
}

function selectSite(
  sites: SiteState[],
  state: MutableSimulationState,
  position: { x: number; y: number },
  map: BalanceMapDefinition,
  record: TrialMapRecord,
  config: BalanceSimulationConfig,
  behavior: TrialBehavior,
  bossAlreadyCleared = false,
) {
  const available = sites.filter((site) => site.availableAt <= state.time);
  if (!available.length) return null;
  const pendingClear = available.filter((site) => site.kills < config.requiredClears);
  const adjustment = config.mapAdjustments[map.id];
  const currentBossTtk = bossFightSeconds(state, map, adjustment);
  const bossReadinessTarget = bossReadinessTargetSeconds(map.id, config);
  const needsHealth = !bossAlreadyCleared && bossHitShare(state, map, adjustment) > .3;
  const bossGateActive = !bossAlreadyCleared && currentBossTtk !== null && currentBossTtk > bossReadinessTarget;
  const totalKills = sites.reduce((total, site) => total + site.kills, 0);
  const defensiveInterval = STRATEGY_DEFENSIVE_REWARD_INTERVALS[behavior.primaryStrategy === "boss-farm" ? "boss-rush" : behavior.primaryStrategy];
  const defensiveTurn = config.strategy !== "mixed" && config.strategy !== "boss-farm" && bossGateActive && Number.isFinite(defensiveInterval) && totalKills > 0 && totalKills % defensiveInterval === defensiveInterval - 1;
  // A boss-rush has no meaningful single-stat target on an open-ended map.
  // Keep its sites within one clear of each other so the forecast represents
  // progressing through the whole map instead of camping one instant-respawn
  // damage enemy forever.
  const lowestKills = Math.min(...sites.map((site) => site.kills));
  // Late-game maps carry five complementary permanent reward tracks. Cycling
  // the least-cleared sites keeps boss readiness from collapsing into a single
  // damage camp and preserves the authored damage/health/armor/regen curve.
  const openMapCycle = behavior.primaryStrategy === "boss-rush" && config.strategy !== "mixed" && !bossGateActive && (!map.boss || LATE_COMPLEMENTARY_MAP_IDS.has(map.id))
    ? available.filter((site) => site.kills === lowestKills)
    : [];
  const candidates = openMapCycle.length ? openMapCycle : pendingClear.length ? pendingClear : available;
  const defensiveCandidates = defensiveTurn
    ? candidates.filter((site) => {
      const rewardType = ENEMY_TYPES[site.type].reward.type;
      return rewardType !== "damage" && rewardType !== "speed";
    })
    : [];
  const selectedCandidates = defensiveCandidates.length ? defensiveCandidates : candidates;
  const combat = combatStats(state, true);
  const candidateData = selectedCandidates.map((site) => {
    const enemy = ENEMY_TYPES[site.type];
    const travel = travelSeconds(position, site, state, config.pathingMultiplier);
    const fight = timeToKill(enemy.hp * adjustment.hp, combat.averageHit, combat.attackRate);
    const duration = Math.max(.01, travel + fight + LOOT_AND_RETARGET_SECONDS);
    // While a boss gate is closed, readiness is the only useful distinction:
    // projecting canonical power and DPS for every candidate would do the
    // same stat math again without changing the decision. Defer those two
    // projections until the map is actually ready for its capstone.
    const powerEfficiency = bossGateActive
      ? 0
      : projectedRewardPowerGain(state, site.type, adjustment) / duration;
    const dpsEfficiency = bossGateActive
      ? 0
      : projectedDpsGain(state, site.type, adjustment) / duration;
    const reward = enemy.reward;
    const focus = reward.type === "damage" || reward.type === "speed" ? 1 : .04;
    const bossRushEfficiency = (bossGateActive ? 0 : powerEfficiency) * focus;
    const nextBossTtk = bossGateActive && (enemy.reward.type === "damage" || enemy.reward.type === "speed")
      ? projectedBossTtk(state, map, site.type, adjustment)
      : currentBossTtk;
    const readinessEfficiency = reward.type === "damage" || reward.type === "speed"
      ? rewardAmount(state, reward.amount, adjustment.reward) / duration
      : 0;
    return {
      site,
      stat: progressionStatForReward(reward.type),
      travel,
      fight,
      duration,
      powerEfficiency,
      dpsEfficiency,
      bossRushEfficiency,
      readinessEfficiency,
      nextBossTtk,
    };
  });
  const normalize = (values: number[]) => {
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    if (maximum - minimum <= Number.EPSILON) return values.map(() => .5);
    return values.map((value) => (value - minimum) / (maximum - minimum));
  };
  const naturalScores = normalize(candidateData.map((candidate) => -candidate.travel));
  const powerScores = normalize(candidateData.map((candidate) => candidate.powerEfficiency));
  const dpsScores = normalize(candidateData.map((candidate) => candidate.dpsEfficiency));
  const bossRushScores = normalize(candidateData.map((candidate) => candidate.bossRushEfficiency));
  // A mixed player is the population baseline, so its route must not inherit
  // the boss-readiness optimizer's damage-only loop. Select the next camp by
  // the resulting variance from equal active time across the reward tracks
  // that actually exist on this map. The one exception is a readiness floor:
  // damage stays at least one equal-share track while the boss is unreachable.
  // This makes the trade-off explicit without changing the specialized
  // natural, efficient, DPS-first, or boss-rush comparison lines.
  const mixedBalance = config.strategy === "mixed" && candidateData.length > 0
    ? (() => {
      const trackedStats = [...new Set(candidateData.map((candidate) => candidate.stat))];
      const targetShare = trackedStats.length ? 1 / trackedStats.length : 0;
      const trackedTime = trackedStats.reduce(
        (total, stat) => total + record.statInvestments[stat].investmentSeconds,
        0,
      );
      const authoredTimeByStat = sites.reduce((totals, site) => {
        const enemy = ENEMY_TYPES[site.type];
        const fight = timeToKill(enemy.hp * adjustment.hp, combat.averageHit, combat.attackRate);
        const stat = progressionStatForReward(enemy.reward.type);
        totals.set(stat, (totals.get(stat) ?? 0) + fight + LOOT_AND_RETARGET_SECONDS);
        return totals;
      }, new Map<ProgressionStat, number>());
      const authoredTime = trackedStats.reduce(
        (total, stat) => total + (authoredTimeByStat.get(stat) ?? 0),
        0,
      );
      const currentDamageShare = trackedTime > 0 && trackedStats.includes("damage")
        ? record.statInvestments.damage.investmentSeconds / trackedTime
        : 0;
      // Damage is the only track that reduces boss TTK in this deterministic
      // clock. Give it the share already authored by the map's own encounter
      // time while the boss is out of reach, then return to equal-share
      // scheduling. Cap that exception at two equal-share tracks so damage can
      // never become the majority of the mixed player's farming time.
      const authoredDamageShare = authoredTime > 0 && trackedStats.includes("damage")
        ? (authoredTimeByStat.get("damage") ?? 0) / authoredTime
        : targetShare;
      const readinessFloorTarget = Math.min(targetShare * 2, Math.max(targetShare, authoredDamageShare));
      const balanceScores = candidateData.map((candidate) => {
        const nextTotal = trackedTime + candidate.duration;
        const variance = trackedStats.reduce((total, stat) => {
          const nextTime = record.statInvestments[stat].investmentSeconds +
            (candidate.stat === stat ? candidate.duration : 0);
          const nextShare = nextTime / Math.max(.01, nextTotal);
          return total + (nextShare - targetShare) ** 2;
        }, 0);
        return -variance;
      });
      return {
        targetShare,
        balanceScores,
        readinessFloorActive: bossGateActive && currentDamageShare < readinessFloorTarget,
      };
    })()
    : null;
  // Readiness uses a real defensive outcome, not damage/health parity or a
  // leaderboard-power target. Explicit DPS-only runs remain DPS-only.
  if (needsHealth && config.strategy !== "dps-first") {
    const healthCandidates = candidateData.filter(candidate => candidate.stat === "health");
    if (healthCandidates.length) return healthCandidates.reduce((best, candidate) => {
      const gain = (entry: typeof candidate) => ENEMY_TYPES[entry.site.type].reward.amount / entry.duration;
      return gain(candidate) > gain(best) ? candidate : best;
    });
  }
  return candidateData.reduce((best, candidate, index) => {
    let score = naturalScores[index];
    if (config.strategy !== "mixed" && behavior.primaryStrategy === "efficient") {
      score = powerScores[index];
    } else if (config.strategy !== "mixed" && behavior.primaryStrategy === "dps-first") {
      score = dpsScores[index];
    } else if (config.strategy !== "mixed" && (behavior.primaryStrategy === "boss-rush" || behavior.primaryStrategy === "boss-farm")) {
      score = bossRushScores[index];
    } else if (config.strategy !== "mixed" && behavior.primaryStrategy === "natural") {
      score = naturalScores[index];
    } else {
      score = behavior.blend.natural * naturalScores[index] +
        behavior.blend.efficient * powerScores[index] +
        behavior.blend["dps-first"] * dpsScores[index] +
        behavior.blend["boss-rush"] * bossRushScores[index];
    }
    if (defensiveTurn) {
      const rewardType = ENEMY_TYPES[candidate.site.type].reward.type;
      const defensivePriority = rewardType === "health" ? 3 : rewardType === "armor" ? 2 : 1;
      score = defensivePriority + naturalScores[index] * .001;
    }
    if (mixedBalance && !defensiveTurn) {
      if (mixedBalance.readinessFloorActive) {
        score = candidate.stat === "damage"
          ? 1e6 + candidate.readinessEfficiency
          : -1e6 + score * .001;
      } else {
        score = mixedBalance.balanceScores[index] + score * .000001;
      }
    } else if (bossGateActive && currentBossTtk !== null && !defensiveTurn) {
      const nextBossTtk = candidate.nextBossTtk;
      const readinessGain = nextBossTtk === null ? 0 : Math.max(0, currentBossTtk - nextBossTtk);
      // Readiness is lexically more important than canonical power while the
      // next boss is still out of reach. This safety rail is relaxed only on
      // the explicit defensive turns above, so a wider build can grow without
      // ever stalling permanently just above its boss target.
      score = candidate.readinessEfficiency * 1e6 + score * .001;
      if (readinessGain > 0) score += 1e12 + readinessGain / candidate.duration * 1e6;
    }
    return !best || score > best.score ? {
      site: candidate.site,
      score,
      travel: candidate.travel,
      fight: candidate.fight,
    } : best;
  }, null as { site: SiteState; score: number; travel: number; fight: number } | null);
}

function createSites(map: BalanceMapDefinition) {
  const bossPoint = map.boss ?? { x: 4_050, y: 4_050 };
  return createSpawnSites(bossPoint, map.id).map((site) => ({ ...site, availableAt: 0, kills: 0 }));
}

/** A readiness estimate: survive the strongest telegraphed hit with room to recover.
 * This does not simulate dodging, deaths, or promise that a boss is safe. */
function bossHitShare(state: EffectiveStatsState, map: BalanceMapDefinition, adjustment: MapAdjustment) {
  if (!map.boss) return 0;
  const stats = combatStats(state, false);
  const profile = BOSS_DAMAGE_PROFILES[map.boss.kind];
  return damageAfterArmor(Math.max(...Object.values(profile)) * adjustment.damage, stats.armor) / Math.max(1, stats.maxHp);
}

function bossFightSeconds(state: EffectiveStatsState, map: BalanceMapDefinition, adjustment: MapAdjustment) {
  if (!map.boss) return null;
  const combat = combatStats(state, false);
  return timeToKill(map.boss.hp * adjustment.bossHp, combat.averageHit, combat.attackRate);
}

function historyPowerAt(history: HistoryPoint[], timeSeconds: number) {
  let low = 0;
  let high = history.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (history[middle].timeSeconds <= timeSeconds) low = middle;
    else high = middle - 1;
  }
  return history[low]?.power ?? 0;
}

function curveProgressForRecord(
  record: TrialMapRecord,
  history: HistoryPoint[],
  simulationEndSeconds: number,
): CurveProgress | null {
  const exitTime = record.exitedAtSeconds ?? simulationEndSeconds;
  const duration = exitTime - record.enteredAtSeconds;
  const growth = record.exitPower / Math.max(1, record.entryPower);
  if (duration <= 0 || growth <= 1 + Number.EPSILON) return null;
  const logGrowth = Math.log(growth);
  const progressAt = (position: number) => {
    const power = historyPowerAt(history, record.enteredAtSeconds + duration * position);
    const achieved = Math.log(Math.max(1, power) / Math.max(1, record.entryPower)) / logGrowth;
    return Math.max(0, Math.min(1, achieved));
  };
  return { p25: progressAt(.25), p50: progressAt(.5), p75: progressAt(.75) };
}

const MEANINGFUL_GAIN_MULTIPLIER = 1.1;

function momentumForRecord(
  record: TrialMapRecord,
  history: HistoryPoint[],
  simulationEndSeconds: number,
): MomentumMetric | null {
  const exitTime = record.exitedAtSeconds ?? simulationEndSeconds;
  const duration = exitTime - record.enteredAtSeconds;
  if (duration <= 0) return null;
  const points = history.filter((point) =>
    point.timeSeconds > record.enteredAtSeconds && point.timeSeconds <= exitTime);
  let previousPower = Math.max(1, record.entryPower);
  let milestonePower = previousPower;
  let lastMilestoneAt = record.enteredAtSeconds;
  let longestGainGapSeconds = 0;
  let meaningfulGainCount = 0;
  let largestSingleJumpPercent = 0;
  let largestSingleJumpLog = 0;
  for (const point of points) {
    const power = Math.max(previousPower, point.power);
    if (power > previousPower) {
      largestSingleJumpPercent = Math.max(largestSingleJumpPercent, (power / previousPower - 1) * 100);
      largestSingleJumpLog = Math.max(largestSingleJumpLog, Math.log(power / previousPower));
    }
    if (power >= milestonePower * MEANINGFUL_GAIN_MULTIPLIER) {
      longestGainGapSeconds = Math.max(longestGainGapSeconds, point.timeSeconds - lastMilestoneAt);
      lastMilestoneAt = point.timeSeconds;
      milestonePower = power;
      meaningfulGainCount += 1;
    }
    previousPower = power;
  }
  longestGainGapSeconds = Math.max(longestGainGapSeconds, exitTime - lastMilestoneAt);
  const totalLogGrowth = Math.log(Math.max(1, record.exitPower) / Math.max(1, record.entryPower));
  return {
    meaningfulGainPercent: (MEANINGFUL_GAIN_MULTIPLIER - 1) * 100,
    meaningfulGainCount,
    longestGainGapSeconds,
    longestGainGapSharePercent: longestGainGapSeconds / duration * 100,
    largestSingleJumpPercent,
    largestSingleJumpGrowthSharePercent: totalLogGrowth > 0 ? largestSingleJumpLog / totalLogGrowth * 100 : 0,
  };
}

function simulateTrial(
  config: BalanceSimulationConfig,
  trialIndex: number,
): TrialResult {
  const random = seededRandom(config.seed + trialIndex * 104_729);
  const behavior = trialBehavior(config.strategy, random);
  const state: MutableSimulationState = {
    time: 0,
    mapIndex: 0,
    stats: { damage: 4, maxHp: PLAYER_BASE_HP, attackRate: DEFAULT_ATTACK_INTERVAL, armor: 0, regen: 0 },
    research: createEmptyResearchRanks(),
    equipped: { head: BASIC_PAPER_HAT, chest: "", weapon: STARTER_STONE },
    ownedItems: new Set([BASIC_PAPER_HAT, STARTER_STONE]),
    bootsEquipped: false,
    itemUpgradeLevel: config.itemUpgradeLevel,
    equipmentStrengthMultiplier: config.equipmentStrengthMultiplier,
    activeResearch: null,
    bossRewardClaims: 0,
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

  const spendTime = (
    record: TrialMapRecord,
    category: keyof MapTimeBudget,
    requestedSeconds: number,
    budget: MapTimeBudget = record.timeBudget,
  ) => {
    const seconds = Math.max(0, requestedSeconds);
    const actual = Math.min(seconds, Math.max(0, config.durationSeconds - state.time));
    if (actual > 0) {
      budget[category] += actual;
      advanceTime(state, state.time + actual, config.researchPlan, recordHistory);
    }
    return actual + 1e-7 >= seconds;
  };

  const addStatTime = (
    record: TrialMapRecord,
    stat: ProgressionStat,
    seconds: number,
    combat: boolean,
  ) => {
    if (seconds <= 0) return;
    record.statInvestments[stat].investmentSeconds += seconds;
    if (combat) record.statInvestments[stat].combatSeconds += seconds;
  };

  const spendTimeForStat = (
    record: TrialMapRecord,
    category: keyof MapTimeBudget,
    stat: ProgressionStat,
    requestedSeconds: number,
  ) => {
    const startedAt = state.time;
    const completed = spendTime(record, category, requestedSeconds);
    addStatTime(
      record,
      stat,
      state.time - startedAt,
      category === "regularCombatSeconds" || category === "bossCombatSeconds",
    );
    return completed;
  };

  const projectedBossStatWeights = (boss: BossDefinition, adjustment: MapAdjustment) => {
    const projected = stateSnapshot(state);
    const rewardScale = BOSS_REPEAT_REWARD_FRACTION;
    const gains = new Map<ProgressionStat, number>();
    for (const reward of boss.rewards) {
      const stat = progressionStatForReward(reward.type);
      const before = continuousPowerForState(projected);
      const amount = reward.amount * researchStatRewardMultiplier(projected.research) * adjustment.bossReward * rewardScale;
      applyRewardToStats(projected.stats, reward.type, amount);
      gains.set(stat, (gains.get(stat) ?? 0) + Math.max(0, continuousPowerForState(projected) - before));
    }
    const total = [...gains.values()].reduce((sum, gain) => sum + gain, 0);
    const fallback = gains.size ? 1 / gains.size : 0;
    return [...gains.entries()].map(([stat, gain]) => ({
      stat,
      weight: total > 0 ? gain / total : fallback,
    }));
  };

  const spendBossTime = (
    record: TrialMapRecord,
    category: "travelSeconds" | "bossCombatSeconds",
    weights: Array<{ stat: ProgressionStat; weight: number }>,
    requestedSeconds: number,
    budget: MapTimeBudget = record.timeBudget,
    trackProgression: boolean = true,
  ) => {
    const startedAt = state.time;
    const completed = spendTime(record, category, requestedSeconds, budget);
    const actual = state.time - startedAt;
    if (trackProgression) {
      for (const { stat, weight } of weights) {
        addStatTime(record, stat, actual * weight, category === "bossCombatSeconds");
      }
    }
    return completed;
  };

  const applyBossReward = (
    record: TrialMapRecord,
    map: BalanceMapDefinition,
    adjustment: MapAdjustment,
    trackProgression = true,
  ) => {
    if (!map.boss) return 0;
    const claimBit = BOSS_REWARD_CLAIM_BITS[map.boss.kind];
    const rewardScale = BOSS_REPEAT_REWARD_FRACTION;
    state.bossRewardClaims = (state.bossRewardClaims | claimBit) >>> 0;
    const powerBeforeReward = powerForState(state);
    for (const reward of map.boss.rewards) {
      const stat = progressionStatForReward(reward.type);
      const directPowerBefore = continuousPowerForState(state);
      applyRewardToStats(state.stats, reward.type, rewardAmount(state, reward.amount, adjustment.bossReward) * rewardScale);
      if (trackProgression) {
        record.statInvestments[stat].rewardPowerGain += Math.max(0, continuousPowerForState(state) - directPowerBefore);
        record.statInvestments[stat].rewardEvents += 1;
      }
    }
    return Math.max(0, powerForState(state) - powerBeforeReward);
  };

  const repeatDefeatedBoss = (
    record: TrialMapRecord,
    map: BalanceMapDefinition,
    maxRepeats: number,
  ) => {
    if (!map.boss) return;
    let repeats = 0;
    while (state.time < config.durationSeconds && repeats < maxRepeats) {
      if (!spendTime(record, "respawnWaitSeconds", BOSS_RESPAWN_SECONDS, record.repeatTimeBudget)) break;
      const repeatFight = bossFightSeconds(state, map, config.mapAdjustments[map.id]);
      if (repeatFight === null) break;
      const repeatStatWeights = projectedBossStatWeights(map.boss, config.mapAdjustments[map.id]);
      if (!spendBossTime(record, "bossCombatSeconds", repeatStatWeights, repeatFight, record.repeatTimeBudget, false)) break;
      const powerBeforeRepeat = powerForState(state);
      applyBossReward(record, map, config.mapAdjustments[map.id], false);
      rollDrops(state, map.boss.drops, null, random, recordHistory);
      if (!spendTime(record, "lootRetargetSeconds", LOOT_AND_RETARGET_SECONDS, record.repeatTimeBudget)) break;
      repeats += 1;
      record.repeatBossKills += 1;
      record.repeatBossPowerGain += Math.max(0, powerForState(state) - powerBeforeRepeat);
      recordHistory();
    }
  };

  const beginMapRecord = (map: BalanceMapDefinition): TrialMapRecord => ({
    mapId: map.id,
    enteredAtSeconds: state.time,
    exitedAtSeconds: null,
    entryPower: powerForState(state),
    exitPower: powerForState(state),
    entryBossTtkSeconds: bossFightSeconds(state, map, config.mapAdjustments[map.id]),
    exitBossTtkSeconds: bossFightSeconds(state, map, config.mapAdjustments[map.id]),
    bossFightSeconds: null,
    bossRewardPowerGain: null,
    repeatBossKills: 0,
    repeatBossPowerGain: 0,
    regularKills: 0,
    fullClears: 0,
    timeBudget: {
      regularCombatSeconds: 0,
      bossCombatSeconds: 0,
      travelSeconds: 0,
      respawnWaitSeconds: 0,
      lootRetargetSeconds: 0,
    },
    repeatTimeBudget: {
      regularCombatSeconds: 0,
      bossCombatSeconds: 0,
      travelSeconds: 0,
      respawnWaitSeconds: 0,
      lootRetargetSeconds: 0,
    },
    statInvestments: emptyStatInvestments(),
    curveProgress: null,
    momentum: null,
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
    const bossReadinessTarget = bossReadinessTargetSeconds(map.id, config);

    if (map.boss && mapRecord.bossFightSeconds === null && clears >= config.requiredClears && currentBossFight !== null && currentBossFight <= bossReadinessTarget && bossHitShare(state, map, adjustment) <= .3) {
      const statWeights = projectedBossStatWeights(map.boss, adjustment);
      const travel = travelSeconds(position, map.boss, state, config.pathingMultiplier);
      if (!spendBossTime(mapRecord, "travelSeconds", statWeights, travel)) break;
      position = { x: map.boss.x, y: map.boss.y };
      if (!spendBossTime(mapRecord, "bossCombatSeconds", statWeights, currentBossFight)) break;
      const bossRewardPowerGain = applyBossReward(mapRecord, map, adjustment);
      rollDrops(state, map.boss.drops, null, random, recordHistory);
      recordHistory();
      mapRecord.exitedAtSeconds = state.time;
      mapRecord.exitPower = powerForState(state);
      mapRecord.exitState = stateSnapshot(state);
      mapRecord.bossFightSeconds = currentBossFight;
      mapRecord.bossRewardPowerGain = bossRewardPowerGain;
      mapRecord.fullClears = clears;
      mapRecord.exitBossTtkSeconds = bossFightSeconds(state, map, adjustment);
      if (behavior.primaryStrategy === "boss-farm") {
        repeatDefeatedBoss(mapRecord, map, Number.POSITIVE_INFINITY);
        break;
      }
      if (behavior.primaryStrategy === "boss-rush") {
        // Model the repeat-boss choice explicitly. Repeated clears pay the
        // full authored reward, while the repeat budget keeps their true time
        // cost out of first-clear map pacing and exposes their economic rate.
        const repeats = state.mapIndex >= MAP_DEFINITIONS.length - 1 ? Number.POSITIVE_INFINITY : 1;
        repeatDefeatedBoss(mapRecord, map, repeats);
        if (state.time >= config.durationSeconds) break;
      }
      // The campaign curve ends at the first final-boss clear. Any modeled
      // repeats remain visible in the strategy trace, but their time is
      // reported separately so it cannot inflate first-clear map pacing.
      if (state.mapIndex >= MAP_DEFINITIONS.length - 1) {
        // Every comparison strategy must keep spending the remaining timeline
        // after its first final-boss clear. Boss-rush consumes that time in
        // repeat clears above; the other routes continue their normal regular
        // farming instead of being shown as an artificial flat line.
        continue;
      }
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

    const selected = selectSite(
      sites,
      state,
      position,
      map,
      mapRecord,
      config,
      behavior,
      mapRecord.bossFightSeconds !== null,
    );
    if (!selected) {
      const nextAvailable = Math.min(...sites.map((site) => site.availableAt));
      if (!spendTime(mapRecord, "respawnWaitSeconds", Math.max(0, nextAvailable - state.time))) break;
      continue;
    }
    const reward = ENEMY_TYPES[selected.site.type].reward;
    const stat = progressionStatForReward(reward.type);
    if (!spendTimeForStat(mapRecord, "travelSeconds", stat, selected.travel)) break;
    position = { x: selected.site.x, y: selected.site.y };
    if (!spendTimeForStat(mapRecord, "regularCombatSeconds", stat, selected.fight)) break;
    if (!spendTimeForStat(mapRecord, "lootRetargetSeconds", stat, LOOT_AND_RETARGET_SECONDS)) break;
    selected.site.kills += 1;
    selected.site.availableAt = state.time + config.respawnSeconds;
    const directPowerBefore = continuousPowerForState(state);
    applyRewardToStats(state.stats, reward.type, rewardAmount(state, reward.amount, adjustment.reward));
    mapRecord.statInvestments[stat].rewardPowerGain += Math.max(0, continuousPowerForState(state) - directPowerBefore);
    mapRecord.statInvestments[stat].rewardEvents += 1;
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
    activeRecord.exitBossTtkSeconds = bossFightSeconds(state, MAP_DEFINITIONS[state.mapIndex], config.mapAdjustments[MAP_DEFINITIONS[state.mapIndex].id]);
    activeRecord.fullClears = sites.length ? Math.min(...sites.map((site) => site.kills)) : 0;
  }
  for (const record of records) {
    record.curveProgress = curveProgressForRecord(record, history, config.durationSeconds);
    record.momentum = momentumForRecord(record, history, config.durationSeconds);
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
  return {
    samples,
    maps: records,
    finalPower: final.power,
    finalDps: final.dps,
    primaryStrategy: behavior.primaryStrategy,
  };
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
  targetPowerArcBlend: number,
  adjustment: MapAdjustment,
): MapSummary {
  const records = trials.map((trial) => mapRecordFor(trial, map.id)).filter((record): record is TrialMapRecord => Boolean(record));
  const completed = records.filter((record) => record.exitedAtSeconds !== null);
  const durationForRecord = (record: TrialMapRecord) =>
    (record.exitedAtSeconds ?? durationSeconds) - record.enteredAtSeconds;
  const durations = records.map(durationForRecord);
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
  const timeBudgetAt = (
    source: (record: TrialMapRecord) => MapTimeBudget,
    probability: number,
  ): MapTimeBudget | null => records.length ? {
    regularCombatSeconds: numericQuantile(records.map((record) => source(record).regularCombatSeconds), probability),
    bossCombatSeconds: numericQuantile(records.map((record) => source(record).bossCombatSeconds), probability),
    travelSeconds: numericQuantile(records.map((record) => source(record).travelSeconds), probability),
    respawnWaitSeconds: numericQuantile(records.map((record) => source(record).respawnWaitSeconds), probability),
    lootRetargetSeconds: numericQuantile(records.map((record) => source(record).lootRetargetSeconds), probability),
  } : null;
  const powerComponentsAt = (
    stateForRecord: (record: TrialMapRecord) => SimulationStateSnapshot,
    probability: number,
  ): PowerComponents | null => {
    if (!records.length) return null;
    const components = records.map((record) => powerComponentsForState(stateForRecord(record)));
    return {
      damage: numericQuantile(components.map((entry) => entry.damage), probability),
      health: numericQuantile(components.map((entry) => entry.health), probability),
      armor: numericQuantile(components.map((entry) => entry.armor), probability),
      regeneration: numericQuantile(components.map((entry) => entry.regeneration), probability),
      total: numericQuantile(components.map((entry) => entry.total), probability),
      equipment: numericQuantile(components.map((entry) => entry.equipment), probability),
      equipmentSharePercent: numericQuantile(components.map((entry) => entry.equipmentSharePercent), probability),
    };
  };
  const curveProgressAt = (probability: number): CurveProgress | null => {
    const curves = records.flatMap((record) => record.curveProgress ? [record.curveProgress] : []);
    return curves.length ? {
      p25: numericQuantile(curves.map((curve) => curve.p25), probability),
      p50: numericQuantile(curves.map((curve) => curve.p50), probability),
      p75: numericQuantile(curves.map((curve) => curve.p75), probability),
    } : null;
  };
  const momentumAt = (probability: number): MomentumMetric | null => {
    const metrics = records.flatMap((record) => record.momentum ? [record.momentum] : []);
    return metrics.length ? {
      meaningfulGainPercent: numericQuantile(metrics.map((metric) => metric.meaningfulGainPercent), probability),
      meaningfulGainCount: numericQuantile(metrics.map((metric) => metric.meaningfulGainCount), probability),
      longestGainGapSeconds: numericQuantile(metrics.map((metric) => metric.longestGainGapSeconds), probability),
      longestGainGapSharePercent: numericQuantile(metrics.map((metric) => metric.longestGainGapSharePercent), probability),
      largestSingleJumpPercent: numericQuantile(metrics.map((metric) => metric.largestSingleJumpPercent), probability),
      largestSingleJumpGrowthSharePercent: numericQuantile(
        metrics.map((metric) => metric.largestSingleJumpGrowthSharePercent),
        probability,
      ),
    } : null;
  };
  const statProgression = PROGRESSION_STAT_IDS.map((stat): StatProgressionMetric => {
    const trackedTimeShares = records.map((record) => {
      const total = PROGRESSION_STAT_IDS.reduce(
        (sum, id) => sum + record.statInvestments[id].investmentSeconds,
        0,
      );
      return record.statInvestments[stat].investmentSeconds / Math.max(.01, total) * 100;
    });
    const rewardGrowthShares = records.map((record) => {
      const growth = record.exitPower - record.entryPower;
      return growth > 0 ? record.statInvestments[stat].rewardPowerGain / growth * 100 : 0;
    });
    const secondsPerOnePercentPower = records.flatMap((record) => {
      const gainPercent = record.statInvestments[stat].rewardPowerGain / Math.max(1, record.entryPower) * 100;
      return gainPercent > 0
        ? [record.statInvestments[stat].investmentSeconds / gainPercent]
        : [];
    });
    const entryValues = records.map((record) => effectiveStatValue(record.entryState, stat));
    const exitValues = records.map((record) => effectiveStatValue(record.exitState, stat));
    const growthMultipliers = records.flatMap((record) => {
      const entry = effectiveStatValue(record.entryState, stat);
      const exit = effectiveStatValue(record.exitState, stat);
      return entry > 0 ? [exit / entry] : [];
    });
    const doublingSeconds = records.flatMap((record) => {
      const entry = effectiveStatValue(record.entryState, stat);
      const exit = effectiveStatValue(record.exitState, stat);
      const doublings = entry > 0 && exit > entry ? Math.log2(exit / entry) : 0;
      return doublings > 0 ? [durationForRecord(record) / doublings] : [];
    });
    return {
      stat,
      investmentSecondsMedian: numericQuantile(
        records.map((record) => record.statInvestments[stat].investmentSeconds),
        .5,
      ),
      combatSecondsMedian: numericQuantile(
        records.map((record) => record.statInvestments[stat].combatSeconds),
        .5,
      ),
      investmentSharePercent: numericQuantile(trackedTimeShares, .5),
      rewardPowerGainMedian: numericQuantile(
        records.map((record) => record.statInvestments[stat].rewardPowerGain),
        .5,
      ),
      rewardGrowthSharePercent: numericQuantile(rewardGrowthShares, .5),
      rewardEventsMedian: numericQuantile(
        records.map((record) => record.statInvestments[stat].rewardEvents),
        .5,
      ),
      secondsPerOnePercentPower: quantile(secondsPerOnePercentPower, .5),
      entryValueMedian: numericQuantile(entryValues, .5),
      exitValueMedian: numericQuantile(exitValues, .5),
      growthMultiplier: quantile(growthMultipliers, .5),
      effectiveDoublingSecondsMedian: quantile(doublingSeconds, .5),
    };
  });
  const bossRewardScenarios = records.flatMap((record) => {
    // Compare a boss cycle at map entry, before repeated clears or rewards can
    // inflate the build and hide a farming exploit behind diminishing returns.
    const scenario = bossRewardScenario(map, record.entryState, adjustment);
    return scenario ? [scenario] : [];
  });
  const observedRepeatScenarios = records.flatMap((record) => {
    const repeatSeconds = Object.values(record.repeatTimeBudget).reduce((sum, seconds) => sum + seconds, 0);
    if (record.repeatBossKills <= 0 || repeatSeconds <= 0) return [];
    const scenario = bossRewardScenario(map, record.entryState, adjustment);
    if (!scenario) return [];
    const powerPerMinute = record.repeatBossPowerGain / repeatSeconds * 60;
    return [{ powerPerMinute, efficiencyRatio: powerPerMinute / Math.max(.01, scenario.bestRegularPowerPerMinute) }];
  });
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
    bossTtkAtExitMedianSeconds: quantile(records.flatMap((record) => record.exitBossTtkSeconds === null ? [] : [record.exitBossTtkSeconds]), .5),
    bossFightMedianSeconds: quantile(completed.flatMap((record) => record.bossFightSeconds === null ? [] : [record.bossFightSeconds]), .5),
    bossRewardPowerGainMedian: quantile(completed.flatMap((record) =>
      record.bossRewardPowerGain === null ? [] : [record.bossRewardPowerGain]), .5),
    bossRewardGrowthSharePercent: quantile(completed.flatMap((record) => {
      if (record.bossRewardPowerGain === null) return [];
      const mapGrowth = record.exitPower - record.entryPower;
      return mapGrowth > 0 ? [record.bossRewardPowerGain / mapGrowth * 100] : [];
    }), .5),
    bossFirstClearPowerPerMinuteMedian: quantile(bossRewardScenarios.map((scenario) => scenario.firstClearPowerPerMinute), .5),
    bossRepeatPermanentPowerPerMinuteMedian: quantile(observedRepeatScenarios.map((scenario) => scenario.powerPerMinute), .5),
    bestRegularPowerPerMinuteMedian: quantile(bossRewardScenarios.map((scenario) => scenario.bestRegularPowerPerMinute), .5),
    bossFirstClearEfficiencyRatioMedian: quantile(bossRewardScenarios.map((scenario) => scenario.firstClearEfficiencyRatio), .5),
    bossRepeatEfficiencyRatioMedian: quantile(observedRepeatScenarios.map((scenario) => scenario.efficiencyRatio), .5),
    repeatBossKillsMedian: map.boss ? quantile(records.map((record) => record.repeatBossKills), .5) : null,
    repeatBossPowerGainMedian: map.boss ? quantile(records.map((record) => record.repeatBossPowerGain), .5) : null,
    regularKillsMedian: quantile(records.map((record) => record.regularKills), .5),
    fullClearsMedian: quantile(records.map((record) => record.fullClears), .5),
    timeBudgetMedian: timeBudgetAt((record) => record.timeBudget, .5),
    repeatTimeBudgetMedian: timeBudgetAt((record) => record.repeatTimeBudget, .5),
    statProgression,
    momentum: momentumAt(.5),
    futureHeadroom: null,
    entryPowerComponentsMedian: powerComponentsAt((record) => record.entryState, .5),
    exitPowerComponentsMedian: powerComponentsAt((record) => record.exitState, .5),
    curveProgress: curveProgressAt(.5),
    targetCurveProgress: targetPowerGrowthMultiplier === null
      ? null
      : targetCurveProgress(targetPowerGrowthMultiplier, targetPowerArcBlend),
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
  const lateTier = Object.prototype.hasOwnProperty.call(LATE_MAP_DAMAGE_TIER, map.id)
    ? LATE_MAP_DAMAGE_TIER[map.id as LateDamageMap]
    : null;
  const referenceBuild = lateTier === null ? null : lateMapReferenceBuild(lateTier);
  const raw = [...counts.entries()].map(([enemyKind, spawnCount]) => {
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
    const incomingDamagePerSecond = incomingHit * enemy.attackSpeed;
    const netIncomingDamagePerSecond = Math.max(0, incomingDamagePerSecond - combat.regen);
    const powerGainPercentOfEntry = powerGain / Math.max(1, beforePower) * 100;
    return {
      enemy: enemyKind,
      elite: Boolean(enemy.elite),
      spawnCount,
      hp: enemy.hp * adjustment.hp,
      rewardType: enemy.reward.type,
      rewardAmount: amount,
      timeToKillSeconds: fight,
      powerGain,
      combatPowerPerMinute: powerGain / Math.max(.01, fight + LOOT_AND_RETARGET_SECONDS) * 60,
      damageAfterArmor: incomingHit,
      incomingDamagePerSecond,
      hitPercentOfHealth: incomingHit / Math.max(1, combat.maxHp) * 100,
      referenceHitPercentOfHealth: referenceBuild
        ? damageAfterArmor(enemy.damage * adjustment.damage, referenceBuild.armor) / Math.max(1, referenceBuild.maxHp) * 100
        : null,
      survivalSeconds: netIncomingDamagePerSecond > 0 ? combat.maxHp / netIncomingDamagePerSecond : null,
      hitsToDefeatPlayer: Math.max(1, Math.ceil(combat.maxHp / incomingHit)),
      fullClearCombatSeconds: fight * spawnCount,
      powerGainPercentOfEntry,
      combatSecondsPerOnePercentPower: powerGainPercentOfEntry > 0
        ? fight / powerGainPercentOfEntry
        : null,
    };
  });
  const totalFullClearCombatSeconds = raw.reduce((total, metric) => total + metric.fullClearCombatSeconds, 0);
  const medianTtk = numericQuantile(raw.map((metric) => metric.timeToKillSeconds), .5);
  const productive = raw.filter((metric) => metric.combatPowerPerMinute > 0);
  const medianEfficiency = numericQuantile(productive.map((metric) => metric.combatPowerPerMinute), .5);
  return raw.map((metric): EnemyBalanceMetric => ({
    ...metric,
    fullClearCombatSharePercent: metric.fullClearCombatSeconds / Math.max(.01, totalFullClearCombatSeconds) * 100,
    ttkVsMapMedian: metric.timeToKillSeconds / Math.max(.01, medianTtk),
    efficiencyVsMapMedian: metric.combatPowerPerMinute / Math.max(.01, medianEfficiency),
  })).sort((left, right) => right.combatPowerPerMinute - left.combatPowerPerMinute);
}

function progressionHeadroomForMap(
  map: MapSummary,
  reserveMultiplier: number,
): ProgressionHeadroom | null {
  // An open map has no completion time, so its remaining simulation window is
  // not evidence of progression headroom. Report it only after a capstone or
  // another explicit completion condition exists.
  if (!map.hasBoss) return null;
  if (map.targetDurationSeconds === null || map.durationMedianSeconds === null || !map.timeBudgetMedian) return null;
  if (map.completedPercent < 50) return null;
  const total = Object.values(map.timeBudgetMedian).reduce((sum, seconds) => sum + seconds, 0);
  const observedDuration = map.durationMedianSeconds;
  const lowerDuration = map.targetDurationSeconds * .75;
  if (total <= 0 || lowerDuration <= 0) return null;
  const safeMultiplier = (scalableSeconds: number) => {
    if (scalableSeconds <= 0) return null;
    const fixedSeconds = total - scalableSeconds;
    if (fixedSeconds >= lowerDuration) return null;
    return Math.max(1, scalableSeconds / Math.max(.01, lowerDuration - fixedSeconds));
  };
  const combatSeconds = map.timeBudgetMedian.regularCombatSeconds + map.timeBudgetMedian.bossCombatSeconds;
  const farmingSeconds = total - map.timeBudgetMedian.bossCombatSeconds;
  const movementSeconds = map.timeBudgetMedian.travelSeconds;
  const projectedDurationAtReserveSeconds = observedDuration / reserveMultiplier;
  return {
    reserveMultiplier,
    reservePass: projectedDurationAtReserveSeconds >= lowerDuration,
    uniformSafeMultiplier: Math.max(1, observedDuration / lowerDuration),
    projectedDurationAtReserveSeconds,
    combatSafeMultiplier: safeMultiplier(combatSeconds),
    farmingSafeMultiplier: safeMultiplier(farmingSeconds),
    movementSafeMultiplier: safeMultiplier(movementSeconds),
  };
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
  let measuredStatTimeBalances = 0;
  let statTimeBalancesOnTrack = 0;
  let measuredHeadroomMaps = 0;
  let headroomMapsOnTrack = 0;
  let measuredEncounterRhythmMaps = 0;
  let encounterRhythmMapsOnTrack = 0;
  for (let index = 1; index < maps.length; index += 1) {
    const current = maps[index];
    if (current.reachedPercent < 50) {
      diagnostics.push(`${current.name} is reached in only ${current.reachedPercent.toFixed(0)}% of runs within the selected time window.`);
      continue;
    }
    const bossDurationIsCensored = current.hasBoss && current.completedPercent < 50;
    const openWindowIsShort = !current.hasBoss && current.durationVsTarget !== null && current.durationVsTarget < .75;
    const durationIsCensored = bossDurationIsCensored || openWindowIsShort;
    if (bossDurationIsCensored) {
      diagnostics.push(`${current.name} is not completed by the median run; its displayed map time is a lower bound capped by the simulation window.`);
    } else if (openWindowIsShort) {
      diagnostics.push(`${current.name} has only ${formatDiagnosticDuration(current.durationMedianSeconds)} left in the selected campaign window; extend the simulation before judging its open-map pacing.`);
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
    if (current.futureHeadroom) {
      measuredHeadroomMaps += 1;
      if (current.futureHeadroom.reservePass) {
        headroomMapsOnTrack += 1;
      } else {
        diagnostics.push(`${current.name} cannot absorb the reserved ${((current.futureHeadroom.reserveMultiplier - 1) * 100).toFixed(0)}% future progression speed-up without falling below the 75% duration floor; its uniform safe ceiling is only ${current.futureHeadroom.uniformSafeMultiplier.toFixed(2)}×.`);
      }
    }
    if (!durationIsCensored && current.powerGrowthMultiplier !== null && current.targetPowerGrowthMultiplier !== null) {
      measuredPowerTargets += 1;
      const powerFit = current.powerGrowthMultiplier / current.targetPowerGrowthMultiplier;
      if (powerFit > 1.5) {
        diagnostics.push(`${current.name} grows power ${current.powerGrowthMultiplier.toFixed(1)}×, above the ${current.targetPowerGrowthMultiplier.toFixed(1)}× curve budget; flatten its reward spikes.`);
      } else if (powerFit < .65) {
        diagnostics.push(`${current.name} grows power only ${current.powerGrowthMultiplier.toFixed(1)}× against a ${current.targetPowerGrowthMultiplier.toFixed(1)}× curve budget; add smaller, more frequent gains.`);
      } else {
        powerTargetsOnTrack += 1;
      }
    }
    if (current.exitEffectiveStatsMedian) {
      measuredStatMixes += 1;
      const damageToHealth = current.exitEffectiveStatsMedian.damage / Math.max(1, current.exitEffectiveStatsMedian.maxHp);
      if (damageToHealth > .25) {
        diagnostics.push(`${current.name} exits at ${damageToHealth.toFixed(1)}× damage-to-health; damage is outrunning survivability.`);
      } else if (damageToHealth < .025) {
        diagnostics.push(`${current.name} exits at only ${damageToHealth.toFixed(2)}× damage-to-health; check whether damage rewards are keeping fights moving.`);
      } else {
        statMixesOnTrack += 1;
      }
    }
    const timeTracks = current.statProgression.filter((metric) =>
      metric.stat === "damage" ||
      metric.stat === "health" ||
      metric.stat === "armor" ||
      metric.stat === "regeneration");
    const hasAttackSpeedInvestment = current.statProgression.some((metric) =>
      metric.stat === "attackSpeed" && metric.investmentSecondsMedian >= 1);
    if (!hasAttackSpeedInvestment && timeTracks.length === 4 && timeTracks.every((metric) => metric.investmentSecondsMedian >= 1)) {
      measuredStatTimeBalances += 1;
      const targetShare = 100 / timeTracks.length;
      const damageShare = timeTracks.find((metric) => metric.stat === "damage")?.investmentSharePercent ?? 0;
      const defensiveShares = timeTracks
        .filter((metric) => metric.stat !== "damage")
        .map((metric) => metric.investmentSharePercent);
      const defensiveSpread = Math.max(...defensiveShares) - Math.min(...defensiveShares);
      if (
        damageShare <= targetShare * 2 &&
        Math.min(...defensiveShares) >= targetShare * .5 &&
        defensiveSpread <= targetShare
      ) {
        statTimeBalancesOnTrack += 1;
      }
    }
    if (!durationIsCensored && current.curveProgress && current.targetCurveProgress) {
      const actual = current.curveProgress;
      const target = current.targetCurveProgress;
      if (actual.p25 < target.p25 - .1) {
        diagnostics.push(`${current.name} has a flat opening: it earns ${(actual.p25 * 100).toFixed(0)}% of its log-power growth in the first quarter versus a ${(target.p25 * 100).toFixed(0)}% target.`);
      } else if (actual.p25 > target.p25 + .15) {
        diagnostics.push(`${current.name} is too front-loaded: it earns ${(actual.p25 * 100).toFixed(0)}% of its log-power growth in the first quarter versus a ${(target.p25 * 100).toFixed(0)}% target.`);
      } else if (actual.p75 < target.p75 - .1) {
        diagnostics.push(`${current.name} stalls late: it reaches ${(actual.p75 * 100).toFixed(0)}% of its log-power growth by three quarters versus a ${(target.p75 * 100).toFixed(0)}% target.`);
      }
    }
    if (!durationIsCensored && current.momentum) {
      if (current.momentum.longestGainGapSharePercent > 20) {
        diagnostics.push(`${current.name}'s longest wait for a cumulative +${current.momentum.meaningfulGainPercent.toFixed(0)}% power gain is ${formatDiagnosticDuration(current.momentum.longestGainGapSeconds)} (${current.momentum.longestGainGapSharePercent.toFixed(0)}% of the map); future accelerators may skip nearby rewards instead of fixing this stall.`);
      }
      if (current.momentum.largestSingleJumpGrowthSharePercent > 25) {
        diagnostics.push(`${current.name}'s largest single progression event supplies ${current.momentum.largestSingleJumpGrowthSharePercent.toFixed(0)}% of its logarithmic map growth; reserve smaller milestones around that spike.`);
      }
    }
    if (current.timeBudgetMedian) {
      const budget = current.timeBudgetMedian;
      const total = Object.values(budget).reduce((sum, seconds) => sum + seconds, 0);
      const waitShare = budget.respawnWaitSeconds / Math.max(1, total);
      const travelShare = budget.travelSeconds / Math.max(1, total);
      if (waitShare > .15) {
        diagnostics.push(`${current.name} spends ${(waitShare * 100).toFixed(0)}% of measured map time waiting for respawns; this is delay rather than progression.`);
      }
      if (travelShare > .35) {
        diagnostics.push(`${current.name} spends ${(travelShare * 100).toFixed(0)}% of measured map time traveling; check camp spacing before adding enemy health.`);
      }
    }
    const activeStats = current.statProgression.filter((metric) => metric.investmentSecondsMedian >= 1);
    const productiveStats = activeStats.filter(
      (metric): metric is StatProgressionMetric & { secondsPerOnePercentPower: number } =>
        metric.secondsPerOnePercentPower !== null && metric.rewardPowerGainMedian > 0,
    );
    if (productiveStats.length >= 2) {
      const fastest = [...productiveStats].sort(
        (left, right) => left.secondsPerOnePercentPower - right.secondsPerOnePercentPower,
      )[0];
      const slowest = [...productiveStats].sort(
        (left, right) => right.secondsPerOnePercentPower - left.secondsPerOnePercentPower,
      )[0];
      const efficiencyGap = slowest.secondsPerOnePercentPower / Math.max(.01, fastest.secondsPerOnePercentPower);
      if (efficiencyGap >= 4 && slowest.investmentSharePercent >= 8) {
        diagnostics.push(`${current.name}: ${progressionStatLabel(slowest.stat)} takes ${formatDiagnosticDuration(slowest.secondsPerOnePercentPower)} per +1% entry power versus ${formatDiagnosticDuration(fastest.secondsPerOnePercentPower)} for ${progressionStatLabel(fastest.stat)}, while consuming ${slowest.investmentSharePercent.toFixed(0)}% of pursued-stat time.`);
      }
    }
    const lowReturn = [...activeStats].sort(
      (left, right) =>
        (right.investmentSharePercent - right.rewardGrowthSharePercent) -
        (left.investmentSharePercent - left.rewardGrowthSharePercent),
    )[0];
    if (lowReturn && lowReturn.investmentSharePercent - lowReturn.rewardGrowthSharePercent >= 20) {
      diagnostics.push(`${current.name}: ${progressionStatLabel(lowReturn.stat)} uses ${lowReturn.investmentSharePercent.toFixed(0)}% of pursued-stat time but supplies only ${lowReturn.rewardGrowthSharePercent.toFixed(0)}% of measured map power growth.`);
    }
    const zeroReturn = activeStats.find((metric) => metric.rewardPowerGainMedian <= Number.EPSILON);
    if (zeroReturn) {
      diagnostics.push(`${current.name}: ${progressionStatLabel(zeroReturn.stat)} is still pursued for ${formatDiagnosticDuration(zeroReturn.investmentSecondsMedian)} after its direct reward has stopped increasing canonical power.`);
    }
    if (current.exitPowerComponentsMedian) {
      const equipmentShare = current.exitPowerComponentsMedian.equipmentSharePercent;
      const entryShare = current.entryPowerComponentsMedian?.equipmentSharePercent ?? 0;
      if (equipmentShare > 50) {
        diagnostics.push(`${current.name} exits with ${equipmentShare.toFixed(0)}% of canonical power supplied by equipment bonuses; test a lower equipment-strength what-if before changing enemy stats.`);
      } else if (equipmentShare - entryShare > 20) {
        diagnostics.push(`${current.name}'s equipment share jumps ${entryShare.toFixed(0)}% → ${equipmentShare.toFixed(0)}%; a drop may be acting as the map's dominant power spike.`);
      }
    }
    if (current.hasBoss && current.bossFightMedianSeconds !== null && current.durationMedianSeconds) {
      const bossShare = current.bossFightMedianSeconds / current.durationMedianSeconds;
      if (bossShare > .25) diagnostics.push(`${current.name}'s boss consumes ${(bossShare * 100).toFixed(0)}% of median map time; keep the boss as a capstone rather than the whole progression wall.`);
      if (!durationIsCensored && current.timeBudgetMedian) {
        measuredEncounterRhythmMaps += 1;
        const measuredTime = Object.values(current.timeBudgetMedian).reduce((sum, seconds) => sum + seconds, 0);
        const travelShare = current.timeBudgetMedian.travelSeconds / Math.max(1, measuredTime);
        let rhythmIsOnTrack = true;
        if (bossShare < .025) {
          diagnostics.push(`${current.name}'s boss is only ${(bossShare * 100).toFixed(1)}% of median map time; it has stopped reading as a capstone.`);
          rhythmIsOnTrack = false;
        }
        if (travelShare < .03) {
          diagnostics.push(`${current.name} spends only ${(travelShare * 100).toFixed(1)}% of measured map time traveling; shorten encounter walls or require more reward cycles so the world does not disappear.`);
          rhythmIsOnTrack = false;
        }
        if (rhythmIsOnTrack) encounterRhythmMapsOnTrack += 1;
      }
    }
    if (current.bossRewardGrowthSharePercent !== null && current.bossRewardGrowthSharePercent > 25) {
      diagnostics.push(`${current.name}'s boss reward or drop supplies ${current.bossRewardGrowthSharePercent.toFixed(0)}% of the map's total power gain; move more of that growth into regular encounters.`);
    }
    if (current.hasBoss && current.bossTtkAtExitMedianSeconds !== null) {
      const readinessTarget = bossReadinessTargetSeconds(current.mapId, config);
      const readinessRatio = current.bossTtkAtExitMedianSeconds / Math.max(1, readinessTarget);
      if (readinessRatio > 1.1) {
        diagnostics.push(`${current.name} ends at ${formatDiagnosticDuration(current.bossTtkAtExitMedianSeconds)} boss TTK, ${readinessRatio.toFixed(1)}× its ${formatDiagnosticDuration(readinessTarget)} readiness target; regular rewards are not keeping damage on pace.`);
      }
    }
    if (current.bossFirstClearEfficiencyRatioMedian !== null && current.bossFirstClearEfficiencyRatioMedian >= 1.5) {
      diagnostics.push(`${current.name}: the first-clear boss reward is ${current.bossFirstClearEfficiencyRatioMedian.toFixed(1)}× the best regular reward rate; every clear uses the full authored payout, so repeats remain a deliberate power spike.`);
    }
    if (current.repeatBossKillsMedian !== null && current.repeatBossKillsMedian > 0) {
      const repeatPower = current.repeatBossPowerGainMedian ?? 0;
      const repeatRatio = current.bossRepeatEfficiencyRatioMedian;
      diagnostics.push(repeatPower > Number.EPSILON
        ? `${current.name}: modeled repeat clears add ${formatCompactNumber(repeatPower)} median canonical power at ${(repeatRatio ?? 0).toFixed(1)}× the best regular rate; every clear pays the full authored reward and repeat time is reported separately.`
        : `${current.name}: no repeat power was measured in the selected window; the full authored reward remains available on every clear.`);
    }
  }
  const onboardingFarm = maps[0];
  if (onboardingFarm?.repeatBossKillsMedian !== null && onboardingFarm.repeatBossKillsMedian > 0) {
    const repeatPower = onboardingFarm.repeatBossPowerGainMedian ?? 0;
    diagnostics.push(repeatPower > Number.EPSILON
      ? `${onboardingFarm.name}: modeled repeat clears add ${formatCompactNumber(repeatPower)} median canonical power at ${(onboardingFarm.bossRepeatEfficiencyRatioMedian ?? 0).toFixed(1)}× the best regular rate; every clear pays the full authored reward and repeat time is reported separately.`
      : `${onboardingFarm.name}: no repeat power was measured in the selected window; the full authored reward remains available on every clear.`);
  }
  if (measuredPacingTargets > 0) {
    diagnostics.unshift(`Pacing curve: ${pacingTargetsOnTrack}/${measuredPacingTargets} measured maps land within ±25% of their explicit duration targets.`);
  }
  const powerCurveOnTrack = measuredPowerTargets > 0 && measuredPowerTargets === powerTargetsOnTrack;
  if (powerCurveOnTrack) {
    diagnostics.splice(measuredPacingTargets > 0 ? 1 : 0, 0, `Power curve: ${powerTargetsOnTrack}/${measuredPowerTargets} measured maps stay near the ${config.targetMapPowerMultiplier.toFixed(1)}× per-map growth budget.`);
  }
  if (measuredStatMixes > 0 && measuredStatMixes === statMixesOnTrack) {
    diagnostics.splice((measuredPacingTargets > 0 ? 1 : 0) + (powerCurveOnTrack ? 1 : 0), 0, `Stat mix: ${statMixesOnTrack}/${measuredStatMixes} maps keep damage and health inside the authored combat envelope.`);
  }
  if (measuredStatTimeBalances > 0) {
    diagnostics.push(
      "Stat farming: " + statTimeBalancesOnTrack + "/" + measuredStatTimeBalances +
      " measured maps keep defensive tracks within equal-time range and damage at or below two equal-share tracks.",
    );
  }
  if (measuredHeadroomMaps > 0) {
    diagnostics.unshift(`Future-system reserve: ${headroomMapsOnTrack}/${measuredHeadroomMaps} measured maps stay above the 75% duration floor under a uniform ${((config.futureSpeedupReserveMultiplier - 1) * 100).toFixed(0)}% progression speed-up.`);
  }
  if (measuredEncounterRhythmMaps > 0) {
    diagnostics.unshift(`Encounter rhythm: ${encounterRhythmMapsOnTrack}/${measuredEncounterRhythmMaps} completed post-Forest maps keep bosses visible (≥2.5% of time) and travel present (≥3%).`);
  }
  const spread = finalPower.p10 > 0 ? finalPower.p90 / finalPower.p10 : 1;
  if (spread > 3) {
    diagnostics.push(`Random equipment drops create a ${spread.toFixed(1)}× P90-to-P10 final-power spread, above the current 3× hard band; inspect loot timing before changing base rewards.`);
  } else if (spread > 1.75) {
    diagnostics.push(`Random equipment drops create a ${spread.toFixed(1)}× P90-to-P10 final-power spread; this is playable but remains above the 1.75× long-term ideal.`);
  }
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
    const wall = [...metrics].sort((left, right) => right.ttkVsMapMedian - left.ttkVsMapMedian)[0];
    if (wall && wall.ttkVsMapMedian >= 2.5) {
      diagnostics.push(`${map.name}: ${wall.enemy}${wall.elite ? " (elite)" : ""} takes ${wall.ttkVsMapMedian.toFixed(1)}× the map's median enemy TTK and consumes ${wall.fullClearCombatSharePercent.toFixed(0)}% of a full clear's combat time.`);
    }
    const eliteTtks = metrics.filter((metric) => metric.elite).map((metric) => metric.timeToKillSeconds);
    const regularTtks = metrics.filter((metric) => !metric.elite).map((metric) => metric.timeToKillSeconds);
    if (eliteTtks.length && regularTtks.length) {
      const eliteGap = numericQuantile(eliteTtks, .5) / Math.max(.01, numericQuantile(regularTtks, .5));
      if (eliteGap >= 3) {
        diagnostics.push(`${map.name}'s median elite takes ${eliteGap.toFixed(1)}× as long to defeat as its median regular enemy; narrow that gap if elites feel like health walls.`);
      }
    }
    const referenceHitSizes = metrics.flatMap((metric) => metric.referenceHitPercentOfHealth === null ? [] : [metric.referenceHitPercentOfHealth]);
    if (referenceHitSizes.length) {
      const weakestReferenceHit = Math.min(...referenceHitSizes);
      const strongestReferenceHit = Math.max(...referenceHitSizes);
      if (weakestReferenceHit < 6) {
        diagnostics.push(`${map.name}: the weakest regular hit is only ${weakestReferenceHit.toFixed(1)}% of the calibrated reference build's HP after armor; this map may feel harmless even when its raw damage looks large.`);
      }
      if (strongestReferenceHit > 22) {
        diagnostics.push(`${map.name}: the strongest regular hit reaches ${strongestReferenceHit.toFixed(1)}% of the calibrated reference build's HP after armor; check for accidental one-shot pressure.`);
      }
    }
  }
  const lastReached = [...maps].reverse().find((map) => map.reachedPercent >= 50);
  if (lastReached) diagnostics.push(`The median run reaches ${lastReached.name}; map durations include travel, respawns, farming, and a solo boss attempted at the map-aware readiness target (${(config.bossTargetSeconds / 60).toFixed(1)}m minimum, ${(BALANCE_LATE_BOSS_TARGET_MAX_SECONDS / 60).toFixed(0)}m late-map cap).`);
  diagnostics.push("Regular-enemy damage is reported as hit size and hits-to-defeat, but player dodging and boss attack patterns are intentionally not guessed by the progression clock.");
  return diagnostics;
}

function progressionStatLabel(stat: ProgressionStat) {
  if (stat === "attackSpeed") return "attack speed";
  if (stat === "regeneration") return "regeneration";
  return stat;
}

function formatDiagnosticDuration(seconds: number | null) {
  if (seconds === null) return "selected";
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  if (seconds < 3_600) return `${(seconds / 60).toFixed(0)}m`;
  return `${(seconds / 3_600).toFixed(seconds < 36_000 ? 2 : 1)}h`;
}

type BalanceSimulationProgressListener = (progress: BalanceSimulationProgress) => void;

function timelineForTrials(trials: TrialResult[]): TimelinePoint[] {
  return trials[0].samples.map((sample, index): TimelinePoint => {
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
}

function runBalanceSimulationInternal(
  input: Partial<BalanceSimulationConfig> = {},
  onProgress?: BalanceSimulationProgressListener,
): BalanceSimulationResult {
  const config = normalizeConfig(input);
  const trials: TrialResult[] = [];
  for (let index = 0; index < config.trials; index += 1) {
    trials.push(simulateTrial(config, index));
    onProgress?.({
      config,
      completedTrials: index + 1,
      totalTrials: config.trials,
      timeline: timelineForTrials(trials),
    });
  }
  const timeline = timelineForTrials(trials);
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
      config.targetPowerArcBlend,
      config.mapAdjustments[map.id],
    );
  });
  for (let index = 1; index < maps.length; index += 1) {
    const previous = maps[index - 1].durationMedianSeconds;
    const current = maps[index].durationMedianSeconds;
    const reliable = maps[index].hasBoss && maps[index].completedPercent >= 50 && maps[index - 1].completedPercent >= 50;
    maps[index].durationVsPrevious = reliable && previous && current ? current / previous : null;
  }
  for (const map of maps) {
    map.futureHeadroom = progressionHeadroomForMap(map, config.futureSpeedupReserveMultiplier);
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
  const strategyMix = Object.fromEntries([
    ...GUIDED_FARMING_STRATEGIES,
    "boss-farm",
  ].map((strategy) => [strategy, trials.filter((trial) => trial.primaryStrategy === strategy).length])) as BalanceSimulationResult["strategyMix"];
  return {
    config,
    timeline,
    maps,
    enemyMetrics,
    diagnostics: buildDiagnostics(config, maps, finalPower, enemyMetrics),
    finalPower,
    finalDps,
    simulatedCampaigns: trials.length,
    strategyMix,
  };
}

export function runBalanceSimulation(
  input: Partial<BalanceSimulationConfig> = {},
  onProgress?: BalanceSimulationProgressListener,
): BalanceSimulationResult {
  return runBalanceSimulationInternal(input, onProgress);
}

const STRATEGY_COMPARISON_TRIAL_CAP = 8;

export function runBalanceSimulationWithStrategyComparisons(
  input: Partial<BalanceSimulationConfig> = {},
  onProgress?: BalanceSimulationProgressListener,
): BalanceSimulationResult {
  const primary = runBalanceSimulationInternal(input, onProgress);
  const comparisonTrials = Math.min(primary.config.trials, STRATEGY_COMPARISON_TRIAL_CAP);
  const strategyTimelines = GUIDED_FARMING_STRATEGIES.map((strategy): StrategyTimeline => ({
    strategy,
    timeline: runBalanceSimulationInternal({
      ...primary.config,
      strategy,
      trials: comparisonTrials,
    }).timeline,
  }));
  return { ...primary, strategyTimelines, strategyComparisonTrials: comparisonTrials };
}
