// Browser- and server-safe values. Keep this module free of DOM, Node, and
// SpacetimeDB imports so both runtime targets use one gameplay contract.
import {
  BOSS_BASE_MAX_HP,
  bossRewardValue,
  desertBossHealthAt,
  DRAGON_REWARD_DAMAGE as TUTORIAL_DRAGON_REWARD,
  MAP_STAT_GROWTH, MAP_TARGET_SECONDS, BOSS_TARGET_SECONDS,
} from "./progression";

export const WORLD_WIDTH = 4800;
export const WORLD_HEIGHT = 4800;
export const PLAYER_SPAWN = { x: 360, y: 360 } as const;
export const PLAYER_RADIUS = 17;
export const PLAYER_BASE_HP = 100;
export const PLAYER_SPEED = 180;
export const BOOTS_SPEED_BONUS = 25;
export const MOVE_SPEED_RESEARCH_BONUS_PER_RANK = .02;
export const MAX_MOVEMENT_SPEED_OVERRIDE = 2_000;
export const MOVEMENT_SPEED_EPSILON = .01;
export const PLAYER_PROJECTILE_SPEED = 1_000;
export const DEFAULT_ATTACK_RANGE = 200;
export const DEFAULT_ATTACK_INTERVAL = 1.56;
export const MAX_BASE_ATTACKS_PER_SECOND = 2.625;
export const MIN_ATTACK_INTERVAL = 1 / MAX_BASE_ATTACKS_PER_SECOND;
export const BOSS_RESPAWN_SECONDS = 30;
// Scalable combat stats use f32 storage. One undecillion stays below f32's
// finite limit with room for research and power multipliers. Movement and
// attack speed retain their separate gameplay caps.
export const MAX_PLAYER_STAT = 1e36;
export const MAX_ARMOR = MAX_PLAYER_STAT;
export const ATTACK_BALANCE_VERSION = 7;
export {
  BASIC_PAPER_HAT,
  DARK_METAL_HELMET,
  FIRE_METAL_BOW,
  FIRE_METAL_HELMET,
  FROST_ARMOR,
  FROST_BOW,
  IRON_BOW,
  LEGENDARY_WHITE_GOLD_ARMOR,
  STARTER_BOW,
  STARTER_STONE,
  NIGHT_BOW,
  SNOW_BOW,
  SUPERIOR_GOLDEN_HELMET,
  TRAILBLAZER_BOOTS,
  WOOD_FULL_HELM,
  WOODEN_ARMOR,
} from "./items";
// Targets are playtest hypotheses. The encounter generator owns combat stats.
export const BALANCE_TARGET_DESERT_DURATION_SECONDS = MAP_TARGET_SECONDS;
export const BALANCE_TARGET_MAP_DURATION_MULTIPLIER = 1;
export const BALANCE_TARGET_MAP_POWER_MULTIPLIER = MAP_STAT_GROWTH;
export const BALANCE_FIRST_SLOWDOWN_POWER = 400_000; // historical chart marker only
export const BALANCE_TARGET_POWER_ARC_BLEND = .35;
export const BALANCE_LATE_BOSS_TARGET_DURATION_SHARE = .05;
export const BALANCE_LATE_BOSS_TARGET_MAX_SECONDS = BOSS_TARGET_SECONDS;
// Historical diagnostics only; no active encounter derives its stats here.
export * from "./legacy-balance";

// The claim mask is retained as append-only save metadata. It identifies a
// boss that has been cleared while preserving the published player_progress
// column; it no longer changes the reward amount.
//
// Keep the historical export name for source compatibility. A value of 1
// means every clear, including repeats, pays the full authored reward.
export const BOSS_REPEAT_REWARD_FRACTION = 1;
export const BOSS_REWARD_CLAIM_BITS = {
  dragon: 1 << 0,
  spider: 1 << 1,
  frostclaw: 1 << 2,
  magmalisk: 1 << 3,
  gloomroot: 1 << 4,
  tidewyrm: 1 << 5,
  koiShogun: 1 << 6,
  tempestKirin: 1 << 7,
  miremaw: 1 << 8,
  prismshell: 1 << 9,
} as const;

// Forest owns its tutorial boss; campaign bosses use Desert-relative tiers.
// Every clear pays the same modest capstone reward, including repeat clears.
const bossHealthAt = (mapIndex: number) => mapIndex === 0 ? BOSS_BASE_MAX_HP : desertBossHealthAt(mapIndex - 1);
const bossRewardAt = (stat: "damage" | "health" | "armor" | "regen", mapIndex: number) =>
  bossRewardValue(stat, mapIndex - 1);

export const DRAGON_MAX_HP = bossHealthAt(0);
export const SPIDER_MAX_HP = bossHealthAt(1);
export const FROSTCLAW_MAX_HP = bossHealthAt(2);
export const MAGMALISK_MAX_HP = bossHealthAt(3);
export const GLOOMROOT_MAX_HP = bossHealthAt(4);
export const TIDEWYRM_MAX_HP = bossHealthAt(5);
export const KOI_SHOGUN_MAX_HP = bossHealthAt(6);
export const TEMPEST_KIRIN_MAX_HP = bossHealthAt(7);
export const MIREMAW_MAX_HP = bossHealthAt(8);
export const PRISMSHELL_MAX_HP = bossHealthAt(9);
// Retained solely for source compatibility with older balance-test imports.
export const CRYSTAL_HOLLOWS_BOSS_HEALTH_CORRECTION = 1;

export const DRAGON_REWARD_DAMAGE = TUTORIAL_DRAGON_REWARD;
export const SPIDER_REWARD_DAMAGE = bossRewardAt("damage", 1);
export const SPIDER_REWARD_HEALTH = bossRewardAt("health", 1);
export const FROSTCLAW_REWARD_DAMAGE = bossRewardAt("damage", 2);
export const FROSTCLAW_REWARD_HEALTH = bossRewardAt("health", 2);
export const FROSTCLAW_REWARD_ARMOR = bossRewardAt("armor", 2);
export const MAGMALISK_REWARD_DAMAGE = bossRewardAt("damage", 3);
export const MAGMALISK_REWARD_HEALTH = bossRewardAt("health", 3);
export const MAGMALISK_REWARD_ARMOR = bossRewardAt("armor", 3);
export const MAGMALISK_REWARD_REGEN = bossRewardAt("regen", 3);
export const GLOOMROOT_REWARD_DAMAGE = bossRewardAt("damage", 4);
export const GLOOMROOT_REWARD_HEALTH = bossRewardAt("health", 4);
export const GLOOMROOT_REWARD_ARMOR = bossRewardAt("armor", 4);
export const GLOOMROOT_REWARD_REGEN = bossRewardAt("regen", 4);
export const TIDEWYRM_REWARD_DAMAGE = bossRewardAt("damage", 5);
export const TIDEWYRM_REWARD_HEALTH = bossRewardAt("health", 5);
export const TIDEWYRM_REWARD_ARMOR = bossRewardAt("armor", 5);
export const TIDEWYRM_REWARD_REGEN = bossRewardAt("regen", 5);
export const KOI_SHOGUN_REWARD_DAMAGE = bossRewardAt("damage", 6);
export const KOI_SHOGUN_REWARD_HEALTH = bossRewardAt("health", 6);
export const KOI_SHOGUN_REWARD_ARMOR = bossRewardAt("armor", 6);
export const KOI_SHOGUN_REWARD_REGEN = bossRewardAt("regen", 6);
export const TEMPEST_KIRIN_REWARD_DAMAGE = bossRewardAt("damage", 7);
export const TEMPEST_KIRIN_REWARD_HEALTH = bossRewardAt("health", 7);
export const TEMPEST_KIRIN_REWARD_ARMOR = bossRewardAt("armor", 7);
export const TEMPEST_KIRIN_REWARD_REGEN = bossRewardAt("regen", 7);
export const MIREMAW_REWARD_DAMAGE = bossRewardAt("damage", 8);
export const MIREMAW_REWARD_HEALTH = bossRewardAt("health", 8);
export const MIREMAW_REWARD_ARMOR = bossRewardAt("armor", 8);
export const MIREMAW_REWARD_REGEN = bossRewardAt("regen", 8);
export const PRISMSHELL_REWARD_DAMAGE = bossRewardAt("damage", 9);
export const PRISMSHELL_REWARD_HEALTH = bossRewardAt("health", 9);
export const PRISMSHELL_REWARD_ARMOR = bossRewardAt("armor", 9);
export const PRISMSHELL_REWARD_REGEN = bossRewardAt("regen", 9);

export const TUTORIAL_FOREST_MAP_ID = "tutorial_forest";
export const BEGINNER_DESERT_MAP_ID = "beginner_desert";
export const INTERMEDIATE_SNOWLANDS_MAP_ID = "intermediate_snowlands";
export const ADVANCED_LAVA_WASTES_MAP_ID = "advanced_lava_wastes";
export const INFERNAL_DEPTHS_MAP_ID = "infernal_depths";
export const WATER_REACH_MAP_ID = "water_reach";
export const SAMURAI_GARDEN_MAP_ID = "samurai_garden";
export const CLOUDSPIRE_MAP_ID = "cloudspire";
export const MOONFEN_MAP_ID = "moonfen";
export const CRYSTAL_HOLLOWS_MAP_ID = "crystal_hollows";
export const MAP_DISPLAY_NAMES = {
  [TUTORIAL_FOREST_MAP_ID]: "Tutorial Forest",
  [BEGINNER_DESERT_MAP_ID]: "Beginner Desert",
  [INTERMEDIATE_SNOWLANDS_MAP_ID]: "Intermediate Snowlands",
  [ADVANCED_LAVA_WASTES_MAP_ID]: "Advanced Lava Lake",
  [INFERNAL_DEPTHS_MAP_ID]: "Night Forest",
  [WATER_REACH_MAP_ID]: "Water Reach",
  [SAMURAI_GARDEN_MAP_ID]: "Samurai Garden",
  [CLOUDSPIRE_MAP_ID]: "Cloudspire",
  [MOONFEN_MAP_ID]: "Moonfen",
  [CRYSTAL_HOLLOWS_MAP_ID]: "Crystal Hollows",
} as const;
export const MAP_IDS: readonly string[] = [
  TUTORIAL_FOREST_MAP_ID,
  BEGINNER_DESERT_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  ADVANCED_LAVA_WASTES_MAP_ID,
  INFERNAL_DEPTHS_MAP_ID,
  WATER_REACH_MAP_ID,
  SAMURAI_GARDEN_MAP_ID,
  CLOUDSPIRE_MAP_ID,
  MOONFEN_MAP_ID,
  CRYSTAL_HOLLOWS_MAP_ID,
];

export const PROTOCOL_VERSION = 87;
export const SPACETIME_AUTH_ISSUER = "https://auth.spacetimedb.com/oidc";
export const SPACETIME_AUTH_CLIENT_ID = "client_03426HMgkAEmdC23XTZRKZ";

export const NAME_ADJECTIVES: readonly string[] = ["Mossy", "Bright", "Quiet", "Brave", "Dusky", "Lucky", "Wild", "Clever"];
export const NAME_CREATURES: readonly string[] = ["Fox", "Owl", "Badger", "Hare", "Raven", "Wolf", "Deer", "Moth"];

/** Server-owned base movement speed, including equipment or an explicit developer override. */
export function playerBaseMovementSpeed(bootsEquipped: boolean, speedOverride = 0) {
  const override = Number.isFinite(speedOverride)
    ? Math.max(0, Math.min(MAX_MOVEMENT_SPEED_OVERRIDE, speedOverride))
    : 0;
  return override > 0 ? override : PLAYER_SPEED + (bootsEquipped ? BOOTS_SPEED_BONUS : 0);
}

export function movementSpeedMultiplier(moveSpeedRank: number) {
  const rank = Number.isFinite(moveSpeedRank) ? Math.max(0, Math.floor(moveSpeedRank)) : 0;
  return 1 + rank * MOVE_SPEED_RESEARCH_BONUS_PER_RANK;
}

export function effectivePlayerMovementSpeed(bootsEquipped: boolean, moveSpeedRank: number, speedOverride = 0) {
  return playerBaseMovementSpeed(bootsEquipped, speedOverride) * movementSpeedMultiplier(moveSpeedRank);
}

export function movementSpeedsMatch(left: number | null | undefined, right: number | null | undefined) {
  return Number.isFinite(left) && Number.isFinite(right) &&
    Math.abs(Number(left) - Number(right)) < MOVEMENT_SPEED_EPSILON;
}
