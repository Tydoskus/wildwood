// Browser- and server-safe values. Keep this module free of DOM, Node, and
// SpacetimeDB imports so both runtime targets use one gameplay contract.

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
// Scalable combat stats use f32 storage. One undecillion stays below f32's
// finite limit with room for research and power multipliers. Movement and
// attack speed retain their separate gameplay caps.
export const MAX_PLAYER_STAT = 1e36;
export const MAX_ARMOR = MAX_PLAYER_STAT;
export const ATTACK_BALANCE_VERSION = 4;
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
  SUPERIOR_GOLDEN_HELMET,
  TRAILBLAZER_BOOTS,
  WOOD_FULL_HELM,
  WOODEN_ARMOR,
} from "./items";
// Progression is budgeted around a two-hour Desert, then 1.35x longer per map.
// Health and reward scales keep each late map near 200x relative power growth
// without changing the authored archetype ratios inside that map.
export const BALANCE_TARGET_DESERT_DURATION_SECONDS = 2 * 60 * 60;
export const BALANCE_TARGET_MAP_DURATION_MULTIPLIER = 1.35;
export const BALANCE_TARGET_MAP_POWER_MULTIPLIER = 200;
export const BEGINNER_DESERT_HEALTH_SCALE = .77;
export const BEGINNER_DESERT_REWARD_SCALE = 1;
// Keep the elite's long-run reward efficiency while paying it out in smaller,
// faster increments so early Desert power does not sit flat for half an hour.
export const WASTES_REAPER_CADENCE_SCALE = .2;
export const INTERMEDIATE_SNOWLANDS_HEALTH_SCALE = .0298;
export const INTERMEDIATE_SNOWLANDS_REWARD_SCALE = .2;
export const ADVANCED_LAVA_WASTES_HEALTH_SCALE = .0015;
export const ADVANCED_LAVA_WASTES_REWARD_SCALE = .041;
// Late-map reward tracks keep raw damage and max health near parity. Damage
// otherwise accelerates its own farming rate and outruns defensive growth.
export const ADVANCED_LAVA_WASTES_DAMAGE_REWARD_MULTIPLIER = .7;
export const ADVANCED_LAVA_WASTES_HEALTH_REWARD_MULTIPLIER = 2;
export const INFERNAL_DEPTHS_HEALTH_SCALE = .00001;
export const INFERNAL_DEPTHS_REWARD_SCALE = .00115;
export const INFERNAL_DEPTHS_DAMAGE_REWARD_MULTIPLIER = .86;
export const INFERNAL_DEPTHS_HEALTH_REWARD_MULTIPLIER = 3;
// Water Reach starts from the measured Night Forest exit build. Keep the
// authored values readable here; the Balance Lab owns any future whole-map
// correction through these shared multipliers rather than hidden client math.
export const WATER_REACH_HEALTH_SCALE = 1;
export const WATER_REACH_REWARD_SCALE = .73;
export const WATER_REACH_DAMAGE_REWARD_MULTIPLIER = .8;
export const WATER_REACH_HEALTH_REWARD_MULTIPLIER = 1.5;
export const SAMURAI_GARDEN_HEALTH_SCALE = 270;
export const SAMURAI_GARDEN_DAMAGE_SCALE = 200;
export const SAMURAI_GARDEN_REWARD_SCALE = 200;
// Late maps keep the macro curve exact while giving individual archetypes a
// small amount of texture. enemies.ts centers these readable profile values
// against one complete 30-enemy clear, so total health, incoming DPS, and
// reward power do not drift from the 270x / 200x progression budget.
export const LATE_MAP_CLEAR_ARCHETYPE_COUNTS = {
  raider: 6,
  archer: 6,
  guardian: 7,
  reaper: 7,
  oracle: 4,
} as const;
export const SAMURAI_GARDEN_ARCHETYPE_PROFILE = {
  raider: { health: .94, damage: 1.08, reward: 1.12, attackSpeed: .7 },
  archer: { health: 1.05, damage: 1.02, reward: .96, attackSpeed: .52 },
  guardian: { health: 1.06, damage: .94, reward: 1.08, attackSpeed: .5 },
  reaper: { health: .96, damage: 1.01, reward: 1, attackSpeed: .74 },
  oracle: { health: 1.02, damage: .98, reward: 1.07, attackSpeed: .58 },
} as const;

export const SPIDER_MAX_HP = 150_000_000 * BEGINNER_DESERT_HEALTH_SCALE;
export const FROSTCLAW_MAX_HP = 750_000_000_000 * INTERMEDIATE_SNOWLANDS_HEALTH_SCALE;
export const MAGMALISK_MAX_HP = 3_750_000_000_000_000 * ADVANCED_LAVA_WASTES_HEALTH_SCALE;
export const SPIDER_REWARD_DAMAGE = 75_000 * BEGINNER_DESERT_REWARD_SCALE;
export const SPIDER_REWARD_HEALTH = 200_000 * BEGINNER_DESERT_REWARD_SCALE;
export const DRAGON_MAX_HP = 300_000;
export const DRAGON_REWARD_DAMAGE = 650;
export const FROSTCLAW_REWARD_DAMAGE = 72_000_000 * INTERMEDIATE_SNOWLANDS_REWARD_SCALE;
export const FROSTCLAW_REWARD_HEALTH = 270_000_000 * INTERMEDIATE_SNOWLANDS_REWARD_SCALE;
export const FROSTCLAW_REWARD_ARMOR = 75_000 * INTERMEDIATE_SNOWLANDS_REWARD_SCALE;
export const MAGMALISK_REWARD_DAMAGE = 14_400_000_000 * ADVANCED_LAVA_WASTES_REWARD_SCALE * ADVANCED_LAVA_WASTES_DAMAGE_REWARD_MULTIPLIER;
export const MAGMALISK_REWARD_HEALTH = 81_945_000_000 * ADVANCED_LAVA_WASTES_REWARD_SCALE * ADVANCED_LAVA_WASTES_HEALTH_REWARD_MULTIPLIER;
export const MAGMALISK_REWARD_ARMOR = 7_000_000 * ADVANCED_LAVA_WASTES_REWARD_SCALE;
export const MAGMALISK_REWARD_REGEN = 405_015_625 * ADVANCED_LAVA_WASTES_REWARD_SCALE;
export const GLOOMROOT_MAX_HP = 1_150_000_000_000_000;
export const GLOOMROOT_REWARD_DAMAGE = 120_000_000_000;
export const GLOOMROOT_REWARD_HEALTH = 250_000_000_000;
export const GLOOMROOT_REWARD_ARMOR = 10_000_000;
export const GLOOMROOT_REWARD_REGEN = 2_000_000_000;
export const TIDEWYRM_MAX_HP = GLOOMROOT_MAX_HP * SAMURAI_GARDEN_HEALTH_SCALE;
export const TIDEWYRM_REWARD_DAMAGE = GLOOMROOT_REWARD_DAMAGE * SAMURAI_GARDEN_REWARD_SCALE;
export const TIDEWYRM_REWARD_HEALTH = GLOOMROOT_REWARD_HEALTH * SAMURAI_GARDEN_REWARD_SCALE;
export const TIDEWYRM_REWARD_ARMOR = GLOOMROOT_REWARD_ARMOR * SAMURAI_GARDEN_REWARD_SCALE;
export const TIDEWYRM_REWARD_REGEN = GLOOMROOT_REWARD_REGEN * SAMURAI_GARDEN_REWARD_SCALE;

export const TUTORIAL_FOREST_MAP_ID = "tutorial_forest";
export const BEGINNER_DESERT_MAP_ID = "beginner_desert";
export const INTERMEDIATE_SNOWLANDS_MAP_ID = "intermediate_snowlands";
export const ADVANCED_LAVA_WASTES_MAP_ID = "advanced_lava_wastes";
export const INFERNAL_DEPTHS_MAP_ID = "infernal_depths";
export const WATER_REACH_MAP_ID = "water_reach";
export const SAMURAI_GARDEN_MAP_ID = "samurai_garden";
export const MAP_DISPLAY_NAMES = {
  [TUTORIAL_FOREST_MAP_ID]: "Tutorial Forest",
  [BEGINNER_DESERT_MAP_ID]: "Beginner Desert",
  [INTERMEDIATE_SNOWLANDS_MAP_ID]: "Intermediate Snowlands",
  [ADVANCED_LAVA_WASTES_MAP_ID]: "Advanced Lava Lake",
  [INFERNAL_DEPTHS_MAP_ID]: "Night Forest",
  [WATER_REACH_MAP_ID]: "Water Reach",
  [SAMURAI_GARDEN_MAP_ID]: "Samurai Garden",
} as const;
export const MAP_IDS: readonly string[] = [
  TUTORIAL_FOREST_MAP_ID,
  BEGINNER_DESERT_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  ADVANCED_LAVA_WASTES_MAP_ID,
  INFERNAL_DEPTHS_MAP_ID,
  WATER_REACH_MAP_ID,
  SAMURAI_GARDEN_MAP_ID,
];

export const PROTOCOL_VERSION = 77;
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
