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
export const MIN_ATTACK_INTERVAL = .32;
// Scalable combat stats use f32 storage. One undecillion stays below f32's
// finite limit with room for research and power multipliers. Movement and
// attack speed retain their separate gameplay caps.
export const MAX_PLAYER_STAT = 1e36;
export const MAX_ARMOR = MAX_PLAYER_STAT;
export const ATTACK_BALANCE_VERSION = 1;
export {
  BASIC_PAPER_HAT,
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
export const SPIDER_REWARD_DAMAGE = 75_000;
export const SPIDER_REWARD_HEALTH = 200_000;
export const DRAGON_MAX_HP = 300_000;
export const DRAGON_REWARD_DAMAGE = 650;
export const FROSTCLAW_REWARD_DAMAGE = 72_000_000;
export const FROSTCLAW_REWARD_HEALTH = 270_000_000;
export const FROSTCLAW_REWARD_ARMOR = 75_000;
export const MAGMALISK_REWARD_DAMAGE = 14_400_000_000;
export const MAGMALISK_REWARD_HEALTH = 81_945_000_000;
export const MAGMALISK_REWARD_ARMOR = 7_000_000;
export const MAGMALISK_REWARD_REGEN = 405_015_625;

export const TUTORIAL_FOREST_MAP_ID = "tutorial_forest";
export const BEGINNER_DESERT_MAP_ID = "beginner_desert";
export const INTERMEDIATE_SNOWLANDS_MAP_ID = "intermediate_snowlands";
export const ADVANCED_LAVA_WASTES_MAP_ID = "advanced_lava_wastes";
export const MAP_DISPLAY_NAMES = {
  [TUTORIAL_FOREST_MAP_ID]: "Tutorial Forest",
  [BEGINNER_DESERT_MAP_ID]: "Beginner Desert",
  [INTERMEDIATE_SNOWLANDS_MAP_ID]: "Intermediate Snowlands",
  [ADVANCED_LAVA_WASTES_MAP_ID]: "Advanced Lava Lake",
} as const;
export const MAP_IDS: readonly string[] = [
  TUTORIAL_FOREST_MAP_ID,
  BEGINNER_DESERT_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  ADVANCED_LAVA_WASTES_MAP_ID,
];

export const PROTOCOL_VERSION = 64;
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
