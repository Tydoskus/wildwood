import { formatCompactNumber } from "../ui/number-format";
import {
  ADVANCED_LAVA_WASTES_ARCHETYPE_HEALTH_PROFILE,
  ADVANCED_LAVA_WASTES_ENCOUNTER_HEALTH_SCALE,
  ADVANCED_LAVA_WASTES_ENCOUNTER_REWARD_SCALE,
  ADVANCED_LAVA_WASTES_HEALTH_SCALE,
  ADVANCED_LAVA_WASTES_DAMAGE_REWARD_MULTIPLIER,
  ADVANCED_LAVA_WASTES_HEALTH_REWARD_MULTIPLIER,
  ADVANCED_LAVA_WASTES_REGULAR_HEALTH_MULTIPLIER,
  ADVANCED_LAVA_WASTES_REGULAR_REWARD_MULTIPLIER,
  ADVANCED_LAVA_WASTES_REGEN_REWARD_MULTIPLIER,
  ADVANCED_LAVA_WASTES_REWARD_SCALE,
  BEGINNER_DESERT_ARCHETYPE_HEALTH_PROFILE,
  BEGINNER_DESERT_ARMOR_REWARD_MULTIPLIER,
  BEGINNER_DESERT_CLEAR_ARCHETYPE_COUNTS,
  BEGINNER_DESERT_DAMAGE_REWARD_MULTIPLIER,
  BEGINNER_DESERT_HEALTH_SCALE,
  BEGINNER_DESERT_HEALTH_REWARD_MULTIPLIER,
  BEGINNER_DESERT_REGULAR_HEALTH_MULTIPLIER,
  BEGINNER_DESERT_REGULAR_REWARD_MULTIPLIER,
  BEGINNER_DESERT_REGEN_REWARD_MULTIPLIER,
  BEGINNER_DESERT_REWARD_SCALE,
  INFERNAL_DEPTHS_ARCHETYPE_HEALTH_PROFILE,
  INFERNAL_DEPTHS_ENCOUNTER_HEALTH_SCALE,
  INFERNAL_DEPTHS_ENCOUNTER_REWARD_SCALE,
  INFERNAL_DEPTHS_HEALTH_SCALE,
  INFERNAL_DEPTHS_DAMAGE_REWARD_MULTIPLIER,
  INFERNAL_DEPTHS_HEALTH_REWARD_MULTIPLIER,
  INFERNAL_DEPTHS_REGULAR_HEALTH_MULTIPLIER,
  INFERNAL_DEPTHS_REGULAR_REWARD_MULTIPLIER,
  INFERNAL_DEPTHS_REGEN_REWARD_MULTIPLIER,
  INFERNAL_DEPTHS_REWARD_SCALE,
  INTERMEDIATE_SNOWLANDS_ARCHETYPE_HEALTH_PROFILE,
  INTERMEDIATE_SNOWLANDS_CLEAR_ARCHETYPE_COUNTS,
  INTERMEDIATE_SNOWLANDS_DAMAGE_REWARD_MULTIPLIER,
  INTERMEDIATE_SNOWLANDS_HEALTH_SCALE,
  INTERMEDIATE_SNOWLANDS_HEALTH_REWARD_MULTIPLIER,
  INTERMEDIATE_SNOWLANDS_REGULAR_HEALTH_MULTIPLIER,
  INTERMEDIATE_SNOWLANDS_REGULAR_REWARD_MULTIPLIER,
  INTERMEDIATE_SNOWLANDS_REGEN_REWARD_MULTIPLIER,
  INTERMEDIATE_SNOWLANDS_REWARD_SCALE,
  LAVA_ARMOR_REWARD_MULTIPLIER,
  LATE_MAP_CLEAR_ARCHETYPE_COUNTS,
  NIGHT_FOREST_ARMOR_REWARD_MULTIPLIER,
  SAMURAI_GARDEN_ARCHETYPE_PROFILE,
  SAMURAI_GARDEN_DAMAGE_SCALE,
  SAMURAI_GARDEN_ENCOUNTER_CADENCE_SCALE,
  SAMURAI_GARDEN_HEALTH_SCALE,
  SAMURAI_GARDEN_OPEN_MAP_REWARD_MULTIPLIER,
  SAMURAI_GARDEN_REWARD_TRACK_PROFILE,
  SAMURAI_GARDEN_REWARD_SCALE,
  SNOWLANDS_ARMOR_REWARD_MULTIPLIER,
  WATER_REACH_ARCHETYPE_HEALTH_PROFILE,
  WATER_REACH_ARMOR_REWARD_MULTIPLIER,
  WATER_REACH_DAMAGE_REWARD_MULTIPLIER,
  WATER_REACH_ENCOUNTER_HEALTH_SCALE,
  WATER_REACH_ENCOUNTER_REWARD_SCALE,
  WATER_REACH_HEALTH_REWARD_MULTIPLIER,
  WATER_REACH_HEALTH_SCALE,
  WATER_REACH_REGULAR_HEALTH_MULTIPLIER,
  WATER_REACH_REGULAR_REWARD_MULTIPLIER,
  WATER_REACH_REGEN_REWARD_MULTIPLIER,
  WATER_REACH_REWARD_SCALE,
  WASTES_REAPER_CADENCE_SCALE,
} from "../../shared/rules";
import { ENEMY_BOW_AIM_OFFSET_RADIANS, ENEMY_SPRITE_LAYOUTS } from "./enemy-sprite-layouts.mjs";

export { ENEMY_BOW_AIM_OFFSET_RADIANS };

export type RewardType = "damage" | "health" | "speed" | "armor" | "regen";

export type EnemyDefinition = {
  hp: number;
  speed: number;
  damage: number;
  attackSpeed: number; // Attacks per second.
  r: number;
  color: string;
  outline: string;
  reward: { type: RewardType; amount: number };
  aggro?: number;
  ranged?: boolean;
  elite?: boolean;
};

function repeatTierMultiplier(previous: number, current: number) {
  return current * (current / previous);
}

type LateMapArchetype = keyof typeof SAMURAI_GARDEN_ARCHETYPE_PROFILE;
type EnemyBalance = Pick<EnemyDefinition, "hp" | "damage" | "attackSpeed" | "reward">;
type ArchetypeVector = { readonly [Archetype in LateMapArchetype]: number };

const LATE_MAP_ARCHETYPES = ["raider", "archer", "guardian", "reaper", "oracle"] as const satisfies readonly LateMapArchetype[];

function centeredHealthBudget(
  source: ArchetypeVector,
  counts: ArchetypeVector,
  profile: ArchetypeVector,
) {
  const sourceTotal = LATE_MAP_ARCHETYPES.reduce((total, archetype) =>
    total + source[archetype] * counts[archetype], 0);
  const profileTotal = LATE_MAP_ARCHETYPES.reduce((total, archetype) =>
    total + profile[archetype] * counts[archetype], 0);
  const profileUnit = sourceTotal / profileTotal;
  return Object.fromEntries(LATE_MAP_ARCHETYPES.map((archetype) => [
    archetype,
    profile[archetype] * profileUnit,
  ])) as Record<LateMapArchetype, number>;
}

const BEGINNER_DESERT_HEALTH = centeredHealthBudget({
  raider: 1_200_000 * BEGINNER_DESERT_HEALTH_SCALE * BEGINNER_DESERT_REGULAR_HEALTH_MULTIPLIER,
  archer: 900_000 * BEGINNER_DESERT_HEALTH_SCALE * BEGINNER_DESERT_REGULAR_HEALTH_MULTIPLIER,
  guardian: 2_600_000 * BEGINNER_DESERT_HEALTH_SCALE * BEGINNER_DESERT_REGULAR_HEALTH_MULTIPLIER,
  reaper: 5_000_000 * BEGINNER_DESERT_HEALTH_SCALE * WASTES_REAPER_CADENCE_SCALE * BEGINNER_DESERT_REGULAR_HEALTH_MULTIPLIER,
  oracle: 4_000_000 * BEGINNER_DESERT_HEALTH_SCALE * BEGINNER_DESERT_REGULAR_HEALTH_MULTIPLIER,
}, BEGINNER_DESERT_CLEAR_ARCHETYPE_COUNTS, BEGINNER_DESERT_ARCHETYPE_HEALTH_PROFILE);

const INTERMEDIATE_SNOWLANDS_HEALTH = centeredHealthBudget({
  raider: 2_700_000_000 * INTERMEDIATE_SNOWLANDS_HEALTH_SCALE * INTERMEDIATE_SNOWLANDS_REGULAR_HEALTH_MULTIPLIER,
  archer: 2_280_000_000 * INTERMEDIATE_SNOWLANDS_HEALTH_SCALE * INTERMEDIATE_SNOWLANDS_REGULAR_HEALTH_MULTIPLIER,
  guardian: 17_790_000_000 * INTERMEDIATE_SNOWLANDS_HEALTH_SCALE * INTERMEDIATE_SNOWLANDS_REGULAR_HEALTH_MULTIPLIER,
  reaper: 25_000_000_000 * INTERMEDIATE_SNOWLANDS_HEALTH_SCALE * INTERMEDIATE_SNOWLANDS_REGULAR_HEALTH_MULTIPLIER,
  oracle: 16_000_000_000 * INTERMEDIATE_SNOWLANDS_HEALTH_SCALE * INTERMEDIATE_SNOWLANDS_REGULAR_HEALTH_MULTIPLIER,
}, INTERMEDIATE_SNOWLANDS_CLEAR_ARCHETYPE_COUNTS, INTERMEDIATE_SNOWLANDS_ARCHETYPE_HEALTH_PROFILE);

const ADVANCED_LAVA_WASTES_HEALTH = centeredHealthBudget({
  raider: 6_075_000_000_000 * ADVANCED_LAVA_WASTES_HEALTH_SCALE * ADVANCED_LAVA_WASTES_REGULAR_HEALTH_MULTIPLIER * ADVANCED_LAVA_WASTES_ENCOUNTER_HEALTH_SCALE,
  archer: 5_776_000_000_000 * ADVANCED_LAVA_WASTES_HEALTH_SCALE * ADVANCED_LAVA_WASTES_REGULAR_HEALTH_MULTIPLIER * ADVANCED_LAVA_WASTES_ENCOUNTER_HEALTH_SCALE,
  guardian: 121_725_000_000_000 * ADVANCED_LAVA_WASTES_HEALTH_SCALE * ADVANCED_LAVA_WASTES_REGULAR_HEALTH_MULTIPLIER * ADVANCED_LAVA_WASTES_ENCOUNTER_HEALTH_SCALE,
  reaper: 125_000_000_000_000 * ADVANCED_LAVA_WASTES_HEALTH_SCALE * ADVANCED_LAVA_WASTES_REGULAR_HEALTH_MULTIPLIER * ADVANCED_LAVA_WASTES_ENCOUNTER_HEALTH_SCALE,
  oracle: 64_000_000_000_000 * ADVANCED_LAVA_WASTES_HEALTH_SCALE * ADVANCED_LAVA_WASTES_REGULAR_HEALTH_MULTIPLIER * ADVANCED_LAVA_WASTES_ENCOUNTER_HEALTH_SCALE,
}, LATE_MAP_CLEAR_ARCHETYPE_COUNTS, ADVANCED_LAVA_WASTES_ARCHETYPE_HEALTH_PROFILE);

const INFERNAL_DEPTHS_HEALTH = centeredHealthBudget({
  raider: (repeatTierMultiplier(2_700_000_000, 6_075_000_000_000) - 10_000_000_000_000_000) * INFERNAL_DEPTHS_HEALTH_SCALE * INFERNAL_DEPTHS_REGULAR_HEALTH_MULTIPLIER * INFERNAL_DEPTHS_ENCOUNTER_HEALTH_SCALE,
  archer: repeatTierMultiplier(2_280_000_000, 5_776_000_000_000) * INFERNAL_DEPTHS_HEALTH_SCALE * INFERNAL_DEPTHS_REGULAR_HEALTH_MULTIPLIER * INFERNAL_DEPTHS_ENCOUNTER_HEALTH_SCALE,
  guardian: repeatTierMultiplier(17_790_000_000, 121_725_000_000_000) * INFERNAL_DEPTHS_HEALTH_SCALE * INFERNAL_DEPTHS_REGULAR_HEALTH_MULTIPLIER * INFERNAL_DEPTHS_ENCOUNTER_HEALTH_SCALE,
  reaper: repeatTierMultiplier(25_000_000_000, 125_000_000_000_000) * INFERNAL_DEPTHS_HEALTH_SCALE * INFERNAL_DEPTHS_REGULAR_HEALTH_MULTIPLIER * INFERNAL_DEPTHS_ENCOUNTER_HEALTH_SCALE,
  oracle: repeatTierMultiplier(16_000_000_000, 64_000_000_000_000) * INFERNAL_DEPTHS_HEALTH_SCALE * INFERNAL_DEPTHS_REGULAR_HEALTH_MULTIPLIER * INFERNAL_DEPTHS_ENCOUNTER_HEALTH_SCALE,
}, LATE_MAP_CLEAR_ARCHETYPE_COUNTS, INFERNAL_DEPTHS_ARCHETYPE_HEALTH_PROFILE);

const WATER_REACH_HEALTH = centeredHealthBudget({
  raider: 10_000_000_000_000 * WATER_REACH_HEALTH_SCALE * WATER_REACH_REGULAR_HEALTH_MULTIPLIER * WATER_REACH_ENCOUNTER_HEALTH_SCALE,
  archer: 40_000_000_000_000 * WATER_REACH_HEALTH_SCALE * WATER_REACH_REGULAR_HEALTH_MULTIPLIER * WATER_REACH_ENCOUNTER_HEALTH_SCALE,
  guardian: 2_250_000_000_000_000 * WATER_REACH_HEALTH_SCALE * WATER_REACH_REGULAR_HEALTH_MULTIPLIER * WATER_REACH_ENCOUNTER_HEALTH_SCALE,
  reaper: 1_700_000_000_000_000 * WATER_REACH_HEALTH_SCALE * WATER_REACH_REGULAR_HEALTH_MULTIPLIER * WATER_REACH_ENCOUNTER_HEALTH_SCALE,
  oracle: 700_000_000_000_000 * WATER_REACH_HEALTH_SCALE * WATER_REACH_REGULAR_HEALTH_MULTIPLIER * WATER_REACH_ENCOUNTER_HEALTH_SCALE,
}, LATE_MAP_CLEAR_ARCHETYPE_COUNTS, WATER_REACH_ARCHETYPE_HEALTH_PROFILE);

type DamageRewardVector = { readonly raider: number; readonly reaper: number };

// Keeps the full Night Forest roster inside the 12+ hit curve-entry envelope
// after damage rewards are restored to the regular < elite ordering.
const INFERNAL_DEPTHS_INCOMING_DAMAGE_SCALE = .65;

// Preserve each map's complete damage-reward budget while moving the payout
// out of one jackpot-like elite. The elite is still worth 25% more per kill,
// but ordinary raiders now create visible progress throughout the runway.
function centeredDamageRewardBudget(
  source: DamageRewardVector,
  counts: DamageRewardVector,
  profile: DamageRewardVector = { raider: 1, reaper: 1.25 },
) {
  const sourceTotal = source.raider * counts.raider + source.reaper * counts.reaper;
  const unit = sourceTotal / (profile.raider * counts.raider + profile.reaper * counts.reaper);
  return { raider: unit * profile.raider, reaper: unit * profile.reaper };
}

const BEGINNER_DESERT_DAMAGE_REWARDS = centeredDamageRewardBudget({
  raider: 1_200 * BEGINNER_DESERT_REWARD_SCALE * BEGINNER_DESERT_REGULAR_REWARD_MULTIPLIER,
  reaper: 5_000 * BEGINNER_DESERT_REWARD_SCALE * WASTES_REAPER_CADENCE_SCALE * BEGINNER_DESERT_REGULAR_REWARD_MULTIPLIER,
}, BEGINNER_DESERT_CLEAR_ARCHETYPE_COUNTS);
const INTERMEDIATE_SNOWLANDS_DAMAGE_REWARDS = centeredDamageRewardBudget({
  raider: 240_000 * INTERMEDIATE_SNOWLANDS_REWARD_SCALE * INTERMEDIATE_SNOWLANDS_REGULAR_REWARD_MULTIPLIER,
  reaper: 3_150_000 * INTERMEDIATE_SNOWLANDS_REWARD_SCALE * INTERMEDIATE_SNOWLANDS_REGULAR_REWARD_MULTIPLIER,
}, INTERMEDIATE_SNOWLANDS_CLEAR_ARCHETYPE_COUNTS);
const ADVANCED_LAVA_WASTES_DAMAGE_REWARDS = centeredDamageRewardBudget({
  raider: 48_000_000 * ADVANCED_LAVA_WASTES_REWARD_SCALE * ADVANCED_LAVA_WASTES_REGULAR_REWARD_MULTIPLIER * ADVANCED_LAVA_WASTES_ENCOUNTER_REWARD_SCALE,
  reaper: 1_984_500_000 * ADVANCED_LAVA_WASTES_REWARD_SCALE * ADVANCED_LAVA_WASTES_REGULAR_REWARD_MULTIPLIER * ADVANCED_LAVA_WASTES_ENCOUNTER_REWARD_SCALE,
}, LATE_MAP_CLEAR_ARCHETYPE_COUNTS);
const INFERNAL_DEPTHS_DAMAGE_REWARDS = centeredDamageRewardBudget({
  raider: repeatTierMultiplier(240_000, 48_000_000) * 6 * INFERNAL_DEPTHS_REWARD_SCALE * INFERNAL_DEPTHS_REGULAR_REWARD_MULTIPLIER * INFERNAL_DEPTHS_ENCOUNTER_REWARD_SCALE,
  reaper: repeatTierMultiplier(3_150_000, 1_984_500_000) * 2 * INFERNAL_DEPTHS_REWARD_SCALE * INFERNAL_DEPTHS_REGULAR_REWARD_MULTIPLIER * INFERNAL_DEPTHS_ENCOUNTER_REWARD_SCALE,
}, LATE_MAP_CLEAR_ARCHETYPE_COUNTS);
const WATER_REACH_DAMAGE_REWARDS = centeredDamageRewardBudget({
  raider: 18_000_000_000 * WATER_REACH_REWARD_SCALE * WATER_REACH_REGULAR_REWARD_MULTIPLIER * WATER_REACH_ENCOUNTER_REWARD_SCALE,
  reaper: 830_000_000_000 * WATER_REACH_REWARD_SCALE * WATER_REACH_REGULAR_REWARD_MULTIPLIER * WATER_REACH_ENCOUNTER_REWARD_SCALE,
}, LATE_MAP_CLEAR_ARCHETYPE_COUNTS);

const WATER_REACH_BALANCE = {
  raider: {
    hp: WATER_REACH_HEALTH.raider,
    damage: 1_870_000,
    attackSpeed: .65,
    reward: { type: "damage", amount: WATER_REACH_DAMAGE_REWARDS.raider * WATER_REACH_DAMAGE_REWARD_MULTIPLIER },
  },
  archer: {
    hp: WATER_REACH_HEALTH.archer,
    damage: 2_160_000,
    attackSpeed: .55,
    reward: { type: "health", amount: 295_000_000_000 * WATER_REACH_REWARD_SCALE * WATER_REACH_HEALTH_REWARD_MULTIPLIER * WATER_REACH_REGULAR_REWARD_MULTIPLIER * WATER_REACH_ENCOUNTER_REWARD_SCALE },
  },
  guardian: {
    hp: WATER_REACH_HEALTH.guardian,
    damage: 2_700_000,
    attackSpeed: .55,
    reward: { type: "armor", amount: 40_000_000 * WATER_REACH_REWARD_SCALE * WATER_REACH_ARMOR_REWARD_MULTIPLIER * WATER_REACH_REGULAR_REWARD_MULTIPLIER * WATER_REACH_ENCOUNTER_REWARD_SCALE },
  },
  reaper: {
    hp: WATER_REACH_HEALTH.reaper,
    damage: 2_490_000,
    attackSpeed: .7,
    reward: { type: "damage", amount: WATER_REACH_DAMAGE_REWARDS.reaper * WATER_REACH_DAMAGE_REWARD_MULTIPLIER },
  },
  oracle: {
    hp: WATER_REACH_HEALTH.oracle,
    damage: 2_580_000,
    attackSpeed: .6,
    reward: { type: "regen", amount: 13_000_000_000 * WATER_REACH_REWARD_SCALE * WATER_REACH_REGULAR_REWARD_MULTIPLIER * WATER_REACH_REGEN_REWARD_MULTIPLIER * WATER_REACH_ENCOUNTER_REWARD_SCALE },
  },
} satisfies Record<LateMapArchetype, EnemyBalance>;

function rewardPower(reward: EnemyDefinition["reward"]) {
  if (reward.type === "armor") return reward.amount * 3;
  if (reward.type === "regen") return reward.amount * 10;
  return reward.amount;
}

function centeredLateMapFactors(
  rawFactor: (archetype: LateMapArchetype) => number,
  shapedWeight: (archetype: LateMapArchetype) => number,
  targetWeight: (archetype: LateMapArchetype) => number = shapedWeight,
) {
  const targetTotal = LATE_MAP_ARCHETYPES.reduce((total, archetype) =>
    total + LATE_MAP_CLEAR_ARCHETYPE_COUNTS[archetype] * targetWeight(archetype), 0);
  const shapedTotal = LATE_MAP_ARCHETYPES.reduce((total, archetype) =>
    total + LATE_MAP_CLEAR_ARCHETYPE_COUNTS[archetype] * shapedWeight(archetype) * rawFactor(archetype), 0);
  const center = shapedTotal / targetTotal;
  return Object.fromEntries(LATE_MAP_ARCHETYPES.map((archetype) => [
    archetype,
    rawFactor(archetype) / center,
  ])) as Record<LateMapArchetype, number>;
}

const SAMURAI_HEALTH_FACTORS = centeredLateMapFactors(
  (archetype) => SAMURAI_GARDEN_ARCHETYPE_PROFILE[archetype].health,
  (archetype) => WATER_REACH_BALANCE[archetype].hp,
);
const SAMURAI_DAMAGE_FACTORS = centeredLateMapFactors(
  (archetype) => SAMURAI_GARDEN_ARCHETYPE_PROFILE[archetype].damage,
  (archetype) => WATER_REACH_BALANCE[archetype].damage * SAMURAI_GARDEN_ARCHETYPE_PROFILE[archetype].attackSpeed,
  (archetype) => WATER_REACH_BALANCE[archetype].damage * WATER_REACH_BALANCE[archetype].attackSpeed,
);
const SAMURAI_REWARD_FACTORS = centeredLateMapFactors(
  (archetype) => {
    const reward = WATER_REACH_BALANCE[archetype].reward;
    return SAMURAI_GARDEN_ARCHETYPE_PROFILE[archetype].reward * SAMURAI_GARDEN_REWARD_TRACK_PROFILE[reward.type];
  },
  (archetype) => rewardPower(WATER_REACH_BALANCE[archetype].reward),
);

function samuraiGardenBalance(archetype: LateMapArchetype): EnemyBalance {
  const water = WATER_REACH_BALANCE[archetype];
  return {
    hp: water.hp / WATER_REACH_ENCOUNTER_HEALTH_SCALE * SAMURAI_GARDEN_HEALTH_SCALE * SAMURAI_GARDEN_ENCOUNTER_CADENCE_SCALE * SAMURAI_HEALTH_FACTORS[archetype],
    damage: water.damage * SAMURAI_GARDEN_DAMAGE_SCALE * SAMURAI_DAMAGE_FACTORS[archetype],
    attackSpeed: SAMURAI_GARDEN_ARCHETYPE_PROFILE[archetype].attackSpeed,
    reward: {
      ...water.reward,
      amount: water.reward.amount / WATER_REACH_ENCOUNTER_REWARD_SCALE * SAMURAI_GARDEN_REWARD_SCALE * SAMURAI_GARDEN_ENCOUNTER_CADENCE_SCALE * SAMURAI_GARDEN_OPEN_MAP_REWARD_MULTIPLIER * SAMURAI_REWARD_FACTORS[archetype],
    },
  };
}

const enemyTypes = {
  // TUTORIAL FOREST ENEMIES
  // Movement speeds are the original balance values reduced by 50%.
  Bramble: {
    hp: 42, speed: 105, damage: 14, attackSpeed: 1, r: 14,
    color: "#d95738", outline: "#5c1b13", reward: { type: "health", amount: 28 },
  },
  Needle: {
    hp: 90, speed: 105, damage: 24, attackSpeed: 1, r: 10,
    color: "#ffd34d", outline: "#6f4a12", reward: { type: "speed", amount: .02 },
  },
  Mossback: {
    hp: 380, speed: 105, damage: 29, attackSpeed: 1, r: 22,
    color: "#768d51", outline: "#2c3b20", reward: { type: "armor", amount: 5 },
  },
  Spitter: {
    hp: 24, speed: 105, damage: 48, attackSpeed: 1, r: 15,
    color: "#b16ac8", outline: "#4b235d", reward: { type: "damage", amount: 1 },
  },
  Brood: {
    hp: 220, speed: 90, damage: 56, attackSpeed: .69, r: 16,
    color: "#45b6c2", outline: "#174a54", reward: { type: "regen", amount: .3 }, ranged: true,
  },
  Cindermaw: {
    hp: 360, speed: 105, damage: 86, attackSpeed: 1, r: 19,
    color: "#d95738", outline: "#5c1b13", reward: { type: "damage", amount: 6 },
  },
  "King Slime": {
    hp: 920, speed: 95, damage: 143, attackSpeed: 1, r: 27,
    color: "#70a94f", outline: "#2d5127", reward: { type: "health", amount: 352 },
    elite: true, aggro: 300,
  },
  "Dread Warden": {
    hp: 1000, speed: 110, damage: 275, attackSpeed: 1, r: 36,
    color: "#a52e3a", outline: "#47101a", reward: { type: "damage", amount: 83 },
    elite: true, aggro: 350,
  },

  // BEGINNER DESERT ENEMIES
  // Movement speeds are the original balance values reduced by 25%.
  // Balance hp, damage, attackSpeed, and reward directly.
  "Dune Raider": {
    hp: BEGINNER_DESERT_HEALTH.raider, speed: 165, damage: 425, attackSpeed: .65, r: 19,
    color: "#d6a13a", outline: "#5f3c18", reward: { type: "damage", amount: BEGINNER_DESERT_DAMAGE_REWARDS.raider * BEGINNER_DESERT_DAMAGE_REWARD_MULTIPLIER },
  },
  "Dune Archer": {
    hp: BEGINNER_DESERT_HEALTH.archer, speed: 153.75, damage: 490, attackSpeed: .55, r: 17,
    color: "#d5b04d", outline: "#61481d", reward: { type: "health", amount: 8_500 * BEGINNER_DESERT_REWARD_SCALE * BEGINNER_DESERT_REGULAR_REWARD_MULTIPLIER * BEGINNER_DESERT_HEALTH_REWARD_MULTIPLIER },
    ranged: true,
  },
  "Venom Guard": {
    hp: BEGINNER_DESERT_HEALTH.guardian, speed: 146.25, damage: 610, attackSpeed: .55, r: 24,
    color: "#79d18b", outline: "#285a37", reward: { type: "armor", amount: 150 * BEGINNER_DESERT_REWARD_SCALE * BEGINNER_DESERT_REGULAR_REWARD_MULTIPLIER * BEGINNER_DESERT_ARMOR_REWARD_MULTIPLIER },
  },
  "Wastes Reaper": {
    hp: BEGINNER_DESERT_HEALTH.reaper, speed: 168.75, damage: 670, attackSpeed: .7, r: 31,
    color: "#8fe09a", outline: "#294f34", reward: { type: "damage", amount: BEGINNER_DESERT_DAMAGE_REWARDS.reaper * BEGINNER_DESERT_DAMAGE_REWARD_MULTIPLIER },
    ranged: true, elite: true, aggro: 300,
  },
  "Blight Oracle": {
    hp: BEGINNER_DESERT_HEALTH.oracle, speed: 157.5, damage: 550, attackSpeed: .6, r: 29,
    color: "#a5df79", outline: "#345426", reward: { type: "regen", amount: 320 * BEGINNER_DESERT_REWARD_SCALE * BEGINNER_DESERT_REGULAR_REWARD_MULTIPLIER * BEGINNER_DESERT_REGEN_REWARD_MULTIPLIER },
    elite: true, aggro: 300,
  },

  // INTERMEDIATE SNOWLANDS ENEMIES
  // Desert-to-snow uses the same archetype multipliers as forest-to-desert.
  "Frost Raider": {
    hp: INTERMEDIATE_SNOWLANDS_HEALTH.raider, speed: 230, damage: 1_590, attackSpeed: .65, r: 21,
    color: "#8fc7ea", outline: "#315778", reward: { type: "damage", amount: INTERMEDIATE_SNOWLANDS_DAMAGE_REWARDS.raider * INTERMEDIATE_SNOWLANDS_DAMAGE_REWARD_MULTIPLIER },
  },
  "Glacier Archer": {
    hp: INTERMEDIATE_SNOWLANDS_HEALTH.archer, speed: 215, damage: 1_860, attackSpeed: .55, r: 19,
    color: "#b9e4f4", outline: "#3c6e87", reward: { type: "health", amount: 2_580_000 * INTERMEDIATE_SNOWLANDS_REWARD_SCALE * INTERMEDIATE_SNOWLANDS_REGULAR_REWARD_MULTIPLIER * INTERMEDIATE_SNOWLANDS_HEALTH_REWARD_MULTIPLIER },
    ranged: true,
  },
  "Rime Guard": {
    hp: INTERMEDIATE_SNOWLANDS_HEALTH.guardian, speed: 205, damage: 2_390, attackSpeed: .55, r: 27,
    color: "#80d8db", outline: "#23626d", reward: { type: "armor", amount: 14_000 * INTERMEDIATE_SNOWLANDS_REWARD_SCALE * INTERMEDIATE_SNOWLANDS_REGULAR_REWARD_MULTIPLIER * SNOWLANDS_ARMOR_REWARD_MULTIPLIER },
  },
  "Whiteout Reaper": {
    hp: INTERMEDIATE_SNOWLANDS_HEALTH.reaper, speed: 235, damage: 2_120, attackSpeed: .7, r: 34,
    color: "#d3ecfb", outline: "#46677f", reward: { type: "damage", amount: INTERMEDIATE_SNOWLANDS_DAMAGE_REWARDS.reaper * INTERMEDIATE_SNOWLANDS_DAMAGE_REWARD_MULTIPLIER },
    ranged: true, elite: true, aggro: 340,
  },
  "Aurora Oracle": {
    hp: INTERMEDIATE_SNOWLANDS_HEALTH.oracle, speed: 220, damage: 2_255, attackSpeed: .6, r: 32,
    color: "#b5a7f0", outline: "#514783", reward: { type: "regen", amount: 161_000 * INTERMEDIATE_SNOWLANDS_REWARD_SCALE * INTERMEDIATE_SNOWLANDS_REGULAR_REWARD_MULTIPLIER * INTERMEDIATE_SNOWLANDS_REGEN_REWARD_MULTIPLIER },
    elite: true, aggro: 340,
  },

  // ADVANCED LAVA LAKE ENEMIES
  // Snow-to-lava continues each archetype's desert-to-snow multiplier.
  // Movement and aggro reach stop increasing after Snowlands.
  "Ember Raider": {
    hp: ADVANCED_LAVA_WASTES_HEALTH.raider, speed: 230, damage: 7_760, attackSpeed: .65, r: 23,
    color: "#ff8a3d", outline: "#6d2418", reward: { type: "damage", amount: ADVANCED_LAVA_WASTES_DAMAGE_REWARDS.raider * ADVANCED_LAVA_WASTES_DAMAGE_REWARD_MULTIPLIER },
  },
  "Cinder Archer": {
    hp: ADVANCED_LAVA_WASTES_HEALTH.archer, speed: 215, damage: 9_320, attackSpeed: .55, r: 21,
    color: "#ffb347", outline: "#71311c", reward: { type: "health", amount: 783_000_000 * ADVANCED_LAVA_WASTES_REWARD_SCALE * ADVANCED_LAVA_WASTES_HEALTH_REWARD_MULTIPLIER * ADVANCED_LAVA_WASTES_REGULAR_REWARD_MULTIPLIER * ADVANCED_LAVA_WASTES_ENCOUNTER_REWARD_SCALE },
    ranged: true,
  },
  "Magma Guard": {
    hp: ADVANCED_LAVA_WASTES_HEALTH.guardian, speed: 205, damage: 12_420, attackSpeed: .55, r: 30,
    color: "#e86132", outline: "#602016", reward: { type: "armor", amount: 1_307_000 * ADVANCED_LAVA_WASTES_REWARD_SCALE * ADVANCED_LAVA_WASTES_REGULAR_REWARD_MULTIPLIER * LAVA_ARMOR_REWARD_MULTIPLIER * ADVANCED_LAVA_WASTES_ENCOUNTER_REWARD_SCALE },
  },
  "Ash Reaper": {
    hp: ADVANCED_LAVA_WASTES_HEALTH.reaper, speed: 235, damage: 10_870, attackSpeed: .7, r: 37,
    color: "#ed7042", outline: "#54221e", reward: { type: "damage", amount: ADVANCED_LAVA_WASTES_DAMAGE_REWARDS.reaper * ADVANCED_LAVA_WASTES_DAMAGE_REWARD_MULTIPLIER },
    ranged: true, elite: true, aggro: 340,
  },
  "Inferno Oracle": {
    hp: ADVANCED_LAVA_WASTES_HEALTH.oracle, speed: 220, damage: 11_650, attackSpeed: .6, r: 35,
    color: "#ffc34f", outline: "#6b2c1d", reward: { type: "regen", amount: 81_003_125 * ADVANCED_LAVA_WASTES_REWARD_SCALE * ADVANCED_LAVA_WASTES_REGULAR_REWARD_MULTIPLIER * ADVANCED_LAVA_WASTES_REGEN_REWARD_MULTIPLIER * ADVANCED_LAVA_WASTES_ENCOUNTER_REWARD_SCALE },
    elite: true, aggro: 340,
  },

  // NIGHT FOREST ENEMIES
  // Base health repeats each archetype's Snowlands-to-Lava growth before the
  // shared Night Forest progression budget. Depth Raider keeps its 10qd cut.
  // Damage is tuned against the simulated curve-entry build so ordinary hits
  // stay readable instead of inheriting the obsolete pre-curve one-shots.
  // The damage budget still includes Depth Raider's requested 6× source value,
  // then pays it out steadily across Raiders and Reapers.
  "Depth Raider": {
    hp: INFERNAL_DEPTHS_HEALTH.raider, speed: 230,
    damage: 296_000 * INFERNAL_DEPTHS_INCOMING_DAMAGE_SCALE, attackSpeed: .65, r: 25,
    color: "#e75a35", outline: "#4a1717", reward: { type: "damage", amount: INFERNAL_DEPTHS_DAMAGE_REWARDS.raider * INFERNAL_DEPTHS_DAMAGE_REWARD_MULTIPLIER },
  },
  "Abyss Archer": {
    hp: INFERNAL_DEPTHS_HEALTH.archer, speed: 215,
    damage: 342_000 * INFERNAL_DEPTHS_INCOMING_DAMAGE_SCALE, attackSpeed: .55, r: 23,
    color: "#ef7840", outline: "#50191a", reward: { type: "health", amount: repeatTierMultiplier(2_580_000, 783_000_000) * 2 * INFERNAL_DEPTHS_REWARD_SCALE * INFERNAL_DEPTHS_HEALTH_REWARD_MULTIPLIER * INFERNAL_DEPTHS_REGULAR_REWARD_MULTIPLIER * INFERNAL_DEPTHS_ENCOUNTER_REWARD_SCALE },
    ranged: true,
  },
  "Obsidian Colossus": {
    hp: INFERNAL_DEPTHS_HEALTH.guardian, speed: 205,
    damage: 428_000 * INFERNAL_DEPTHS_INCOMING_DAMAGE_SCALE, attackSpeed: .55, r: 32,
    color: "#b83f32", outline: "#3c1115", reward: { type: "armor", amount: repeatTierMultiplier(14_000, 1_307_000) * INFERNAL_DEPTHS_REWARD_SCALE * NIGHT_FOREST_ARMOR_REWARD_MULTIPLIER * INFERNAL_DEPTHS_REGULAR_REWARD_MULTIPLIER * INFERNAL_DEPTHS_ENCOUNTER_REWARD_SCALE },
  },
  "Doom Reaper": {
    hp: INFERNAL_DEPTHS_HEALTH.reaper, speed: 235,
    damage: 395_000 * INFERNAL_DEPTHS_INCOMING_DAMAGE_SCALE, attackSpeed: .7, r: 39,
    color: "#cc4938", outline: "#3b1318", reward: { type: "damage", amount: INFERNAL_DEPTHS_DAMAGE_REWARDS.reaper * INFERNAL_DEPTHS_DAMAGE_REWARD_MULTIPLIER },
    ranged: true, elite: true, aggro: 340,
  },
  "Nether Oracle": {
    hp: INFERNAL_DEPTHS_HEALTH.oracle, speed: 220,
    damage: 408_000 * INFERNAL_DEPTHS_INCOMING_DAMAGE_SCALE, attackSpeed: .6, r: 37,
    color: "#e7843f", outline: "#4d191a", reward: { type: "regen", amount: repeatTierMultiplier(161_000, 81_003_125) * INFERNAL_DEPTHS_REWARD_SCALE * INFERNAL_DEPTHS_REGULAR_REWARD_MULTIPLIER * INFERNAL_DEPTHS_REGEN_REWARD_MULTIPLIER * INFERNAL_DEPTHS_ENCOUNTER_REWARD_SCALE },
    elite: true, aggro: 340,
  },

  // WATER REACH ENEMIES
  // This tier begins at the measured Night Forest exit build. Incoming damage
  // stays in one narrow band; archetype identity comes from range, health,
  // cadence, and rewards rather than surprise one-shots.
  "Tide Raider": {
    ...WATER_REACH_BALANCE.raider, speed: 230, r: 27,
    color: "#49c9d4", outline: "#123b58",
  },
  "Reef Archer": {
    ...WATER_REACH_BALANCE.archer, speed: 215, r: 25,
    color: "#69dce3", outline: "#17465d",
    ranged: true,
  },
  "Coral Colossus": {
    ...WATER_REACH_BALANCE.guardian, speed: 205, r: 35,
    color: "#ff7f83", outline: "#573049",
  },
  "Drowned Reaper": {
    ...WATER_REACH_BALANCE.reaper, speed: 235, r: 42,
    color: "#3f93bd", outline: "#172c50",
    ranged: true, elite: true, aggro: 340,
  },
  "Tidal Oracle": {
    ...WATER_REACH_BALANCE.oracle, speed: 220, r: 39,
    color: "#7e9ee9", outline: "#29315d",
    elite: true, aggro: 340,
  },

  // SAMURAI GARDEN ENEMIES
  // Individual ratios vary around the Water Reach baseline so the tier does
  // not feel copied. The centered profiles above keep one full clear exactly
  // at one fifth of the 11.475× health and 8.5× reward budgets, while incoming
  // DPS remains 8.5×. Five smaller clears deliver the full macro runway.
  "Sakura Ronin": {
    ...samuraiGardenBalance("raider"), speed: 230, r: 29,
    color: "#ef75aa", outline: "#54233f",
  },
  "Petal Archer": {
    ...samuraiGardenBalance("archer"), speed: 215, r: 27,
    color: "#ff9fc7", outline: "#60304d",
    ranged: true,
  },
  "Bamboo Guardian": {
    ...samuraiGardenBalance("guardian"), speed: 205, r: 37,
    color: "#7cad70", outline: "#294936",
  },
  "Moonblade Reaper": {
    ...samuraiGardenBalance("reaper"), speed: 235, r: 44,
    color: "#8a70bd", outline: "#30264f",
    ranged: true, elite: true, aggro: 340,
  },
  "Shrine Oracle": {
    ...samuraiGardenBalance("oracle"), speed: 220, r: 41,
    color: "#eeb1d4", outline: "#52334f",
    elite: true, aggro: 340,
  },
} satisfies Record<string, EnemyDefinition>;

export type EnemyKind = keyof typeof enemyTypes;
export const ENEMY_TYPES: Record<EnemyKind, EnemyDefinition> = enemyTypes;

export type EnemyCamp = {
  name: string;
  x: number;
  y: number;
  minRadius: number;
  radius: number;
  count: number;
  types: EnemyKind[];
  ground: string;
  ring: string;
};

type SpriteLayerSource = {
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Optional map-family recolor applied once when the layer is cached. */
  tint?: string;
  /** Actor-local point held by the archer. The layer rotates around it while aiming. */
  aimPivot?: { x: number; y: number };
  /** Rotation needed to make the source art face actor-local right. */
  aimOffsetRadians?: number;
};
type SpriteSource = { src: string; size: number } | { size: number; height: number; layers: SpriteLayerSource[] };
export type LoadedSpriteLayer = SpriteLayerSource & { image: HTMLImageElement };
export type LoadedEnemySprite = {
  size: number;
  height?: number;
  image?: HTMLImageElement;
  layers?: LoadedSpriteLayer[];
};

const ENEMY_SPRITE_SOURCES = ENEMY_SPRITE_LAYOUTS as Record<EnemyKind, SpriteSource>;

export const REWARD_DATA: Record<RewardType, { color: string }> = {
  damage: { color: "#ff655a" },
  health: { color: "#66ed79" },
  speed: { color: "#ffe05d" },
  armor: { color: "#74d8ff" },
  regen: { color: "#ff7ccb" },
};

export const CAMPS: EnemyCamp[] = [
  // Every camp is one reward track. The health elites keep a separate late
  // destination instead of being folded into the fast starter-health route.
  { name: "Ember Fen", x: 850, y: 1450, minRadius: 230, radius: 420, count: 6, types: ["Bramble"], ground: "#5b3b28", ring: "#b66a37" },
  { name: "Thornshot Rise", x: 2300, y: 800, minRadius: 210, radius: 360, count: 5, types: ["Spitter"], ground: "#4b3545", ring: "#a86591" },
  { name: "Glass Thicket", x: 4000, y: 900, minRadius: 210, radius: 360, count: 5, types: ["Needle"], ground: "#244f53", ring: "#64bdc5" },
  { name: "Brine Marsh", x: 4150, y: 2300, minRadius: 220, radius: 380, count: 5, types: ["Brood"], ground: "#243e4d", ring: "#5f9eb5" },
  { name: "Mossfall Ruins", x: 850, y: 2850, minRadius: 230, radius: 400, count: 6, types: ["Mossback"], ground: "#33423a", ring: "#8d9b75" },
  { name: "Cinder Quarry", x: 2450, y: 2400, minRadius: 230, radius: 400, count: 6, types: ["Cindermaw", "Cindermaw", "Cindermaw", "Dread Warden"], ground: "#4b4039", ring: "#b5875c" },
  { name: "Moonroot Grove", x: 1150, y: 4200, minRadius: 200, radius: 360, count: 4, types: ["Mossback"], ground: "#3d3157", ring: "#9a79d5" },
  { name: "Sunken Yard", x: 2700, y: 4100, minRadius: 200, radius: 360, count: 4, types: ["Mossback"], ground: "#553334", ring: "#d37362" },
  { name: "Royal Hollow", x: 3750, y: 3550, minRadius: 150, radius: 260, count: 2, types: ["King Slime"], ground: "#405438", ring: "#82bc68" },
];

function loadEnemyImage(source: string, onSettled: () => void) {
  const image = new Image();
  image.decoding = "async";
  let retry = 0;
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    onSettled();
  };
  image.addEventListener("load", settle, { once: true });
  image.addEventListener("error", () => {
    if (retry >= 2) {
      settle();
      return;
    }
    retry += 1;
    globalThis.setTimeout(() => {
      image.src = `${source}?asset-retry=${retry}`;
    }, retry * 500);
  });
  image.src = source;
  return image;
}

export function loadEnemySprites(onAssetSettled: () => void = () => {}) {
  const assetSources = Object.values(ENEMY_SPRITE_SOURCES).flatMap((source) =>
    "layers" in source ? source.layers.map((layer) => layer.src) : [source.src]);
  const uniqueAssetSources = [...new Set(assetSources)];
  const expectedAssets = uniqueAssetSources.length;
  let settledAssets = 0;
  const settleAsset = () => {
    settledAssets += 1;
    onAssetSettled();
  };
  const images = new Map(uniqueAssetSources.map((source) => [source, loadEnemyImage(source, settleAsset)]));
  const sprites = Object.fromEntries(Object.entries(ENEMY_SPRITE_SOURCES).map(([kind, source]) => {
    if ("layers" in source) {
      const layers = source.layers.map((layer) => ({ ...layer, image: images.get(layer.src)! }));
      return [kind, { size: source.size, height: source.height, layers }];
    }
    const image = images.get(source.src)!;
    return [kind, { size: source.size, image }];
  })) as Record<EnemyKind, LoadedEnemySprite>;
  return {
    sprites,
    ready: () => settledAssets >= expectedAssets,
  };
}

export function loadActorShadowSprite(onAssetSettled: () => void = () => {}) {
  return loadEnemyImage("assets/wildstat/2D Character - Casual Monsters/_PNG/slime/shadow.png", onAssetSettled);
}

export function rewardLabel(reward: EnemyDefinition["reward"]) {
  return `${rewardAmountLabel(reward)} ${rewardStatLabel(reward)}`;
}

export function rewardAmountLabel(reward: EnemyDefinition["reward"]) {
  if (reward.type === "speed") return `+${reward.amount.toFixed(2)}`;
  if (Math.abs(reward.amount) < 1_000 && !Number.isInteger(reward.amount)) return `+${reward.amount.toFixed(2)}`;
  return `+${formatCompactNumber(reward.amount)}`;
}

export function rewardStatLabel(reward: EnemyDefinition["reward"]) {
  if (reward.type === "damage") return "DAMAGE";
  if (reward.type === "health") return "MAX HEALTH";
  if (reward.type === "speed") return "ATK/SEC";
  if (reward.type === "armor") return "ARMOR";
  return "HP/SEC";
}
