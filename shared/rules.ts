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
export const ATTACK_BALANCE_VERSION = 6;
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
// Progression is budgeted around a two-hour Desert, then 1.35x longer per map.
// Health and reward scales keep each later map near 8.5x relative power growth
// without changing the authored archetype ratios inside that map.
export const BALANCE_TARGET_DESERT_DURATION_SECONDS = 2 * 60 * 60;
export const BALANCE_TARGET_MAP_DURATION_MULTIPLIER = 1.35;
// Forest currently exits near 7k canonical power. An 8.5x map step places the
// first global slowdown knee near 500k at the Snowlands -> Lava Lake handoff,
// then restarts a smaller logarithmic surge inside each longer map.
export const BALANCE_TARGET_MAP_POWER_MULTIPLIER = 8.5;
export const BALANCE_FIRST_SLOWDOWN_POWER = 500_000;
// Blend the old straight line on a log chart (0) with a full logarithmic
// reward arc (1). Wildstat deliberately sits between the two: each map opens
// with visible momentum, eases into a runway, then hands off to the next map's
// breakthrough without Cookie Clicker-sized walls or vertical jumps.
export const BALANCE_TARGET_POWER_ARC_BLEND = .35;
// Bosses should remain a visible capstone as maps lengthen. The simulator
// keeps the familiar five-minute readiness target through Snowlands, then
// grows the late-map target toward 5% of authored map time, capped at fifteen
// minutes so a boss never becomes another multi-hour health wall.
export const BALANCE_LATE_BOSS_TARGET_DURATION_SHARE = .05;
export const BALANCE_LATE_BOSS_TARGET_MAX_SECONDS = 15 * 60;
export const BEGINNER_DESERT_HEALTH_SCALE = .77;
export const BEGINNER_DESERT_REWARD_SCALE = 1;
// Regular-enemy runway multipliers redistribute early boss power into the map
// without changing boss health. The small health additions preserve the
// authored duration after those earlier, more frequent rewards speed farming.
export const BEGINNER_DESERT_REGULAR_HEALTH_MULTIPLIER = .052;
export const BEGINNER_DESERT_BOSS_HEALTH_MULTIPLIER = .08;
export const BEGINNER_DESERT_REGULAR_REWARD_MULTIPLIER = .0495;
export const BEGINNER_DESERT_BOSS_REWARD_MULTIPLIER = .02;
export const BEGINNER_DESERT_DAMAGE_REWARD_MULTIPLIER = .5;
export const BEGINNER_DESERT_HEALTH_REWARD_MULTIPLIER = 1.3;
export const BEGINNER_DESERT_ARMOR_REWARD_MULTIPLIER = 15;
export const BEGINNER_DESERT_REGEN_REWARD_MULTIPLIER = 4;
// Keep the elite's long-run reward efficiency while paying it out in smaller,
// faster increments so early Desert power does not sit flat for half an hour.
export const WASTES_REAPER_CADENCE_SCALE = .2;
export const INTERMEDIATE_SNOWLANDS_HEALTH_SCALE = .0298;
export const INTERMEDIATE_SNOWLANDS_REWARD_SCALE = .2;
export const INTERMEDIATE_SNOWLANDS_REGULAR_HEALTH_MULTIPLIER = .0045;
export const INTERMEDIATE_SNOWLANDS_BOSS_HEALTH_MULTIPLIER = .003;
export const INTERMEDIATE_SNOWLANDS_REGULAR_REWARD_MULTIPLIER = .00265;
export const INTERMEDIATE_SNOWLANDS_BOSS_REWARD_MULTIPLIER = .00065;
export const INTERMEDIATE_SNOWLANDS_DAMAGE_REWARD_MULTIPLIER = .5;
export const INTERMEDIATE_SNOWLANDS_HEALTH_REWARD_MULTIPLIER = 2.4;
export const INTERMEDIATE_SNOWLANDS_REGEN_REWARD_MULTIPLIER = 5;
export const ADVANCED_LAVA_WASTES_HEALTH_SCALE = .0015;
export const ADVANCED_LAVA_WASTES_REWARD_SCALE = .041;
// Completed late maps spend their macro budget across many compact encounter
// cycles. Health cadence controls individual fight length; reward cadence
// controls how many of those fights are needed to reach the next boss. Keeping
// them explicit prevents total duration, travel, and progression from being
// accidentally coupled again.
export const ADVANCED_LAVA_WASTES_ENCOUNTER_HEALTH_SCALE = .015;
export const ADVANCED_LAVA_WASTES_ENCOUNTER_REWARD_SCALE = .03125;
export const ADVANCED_LAVA_WASTES_REGULAR_HEALTH_MULTIPLIER = .0054;
export const ADVANCED_LAVA_WASTES_BOSS_HEALTH_MULTIPLIER = .0001716;
export const ADVANCED_LAVA_WASTES_REGULAR_REWARD_MULTIPLIER = .001725;
export const ADVANCED_LAVA_WASTES_BOSS_REWARD_MULTIPLIER = .0000275;
// Late-map reward tracks keep raw damage and max health near parity. Damage
// otherwise accelerates its own farming rate and outruns defensive growth.
export const ADVANCED_LAVA_WASTES_DAMAGE_REWARD_MULTIPLIER = 1;
export const ADVANCED_LAVA_WASTES_HEALTH_REWARD_MULTIPLIER = 2;
export const ADVANCED_LAVA_WASTES_REGEN_REWARD_MULTIPLIER = 3;
export const INFERNAL_DEPTHS_HEALTH_SCALE = .00001;
export const INFERNAL_DEPTHS_REWARD_SCALE = .00115;
export const INFERNAL_DEPTHS_ENCOUNTER_HEALTH_SCALE = .024375;
export const INFERNAL_DEPTHS_ENCOUNTER_REWARD_SCALE = .05;
export const INFERNAL_DEPTHS_INCOMING_DAMAGE_SCALE = .85;
export const INFERNAL_DEPTHS_DAMAGE_REWARD_MULTIPLIER = 1;
export const INFERNAL_DEPTHS_HEALTH_REWARD_MULTIPLIER = 3;
export const INFERNAL_DEPTHS_REGEN_REWARD_MULTIPLIER = 5;
export const INFERNAL_DEPTHS_REGULAR_HEALTH_MULTIPLIER = .0011;
export const INFERNAL_DEPTHS_BOSS_HEALTH_MULTIPLIER = .0000099;
export const INFERNAL_DEPTHS_REGULAR_REWARD_MULTIPLIER = .00025;
export const INFERNAL_DEPTHS_BOSS_REWARD_MULTIPLIER = .000002;
// Armor is logarithmic in combat, but its old reward amounts did not follow
// the campaign's map-power steps. These explicit corrections put one Guardian
// payout back on the same broad ladder as health and damage.
export const SNOWLANDS_ARMOR_REWARD_MULTIPLIER = 80;
export const LAVA_ARMOR_REWARD_MULTIPLIER = 200;
export const NIGHT_FOREST_ARMOR_REWARD_MULTIPLIER = 8_000;
export const WATER_REACH_ARMOR_REWARD_MULTIPLIER = 16_000;
// Water Reach starts from the measured Night Forest exit build. Keep the
// authored values readable here; the Balance Lab owns any future whole-map
// correction through these shared multipliers rather than hidden client math.
export const WATER_REACH_HEALTH_SCALE = 1;
export const WATER_REACH_REWARD_SCALE = .73;
export const WATER_REACH_DAMAGE_REWARD_MULTIPLIER = 1.2;
export const WATER_REACH_HEALTH_REWARD_MULTIPLIER = 1.5;
export const WATER_REACH_REGEN_REWARD_MULTIPLIER = 8;
export const WATER_REACH_ENCOUNTER_HEALTH_SCALE = .025;
export const WATER_REACH_ENCOUNTER_REWARD_SCALE = .0325;
export const WATER_REACH_REGULAR_HEALTH_MULTIPLIER = .0000375;
export const WATER_REACH_REGULAR_REWARD_MULTIPLIER = .0000075;
// Tidewyrm originally inherited Gloomroot's boss-health constant. This factor
// keeps Water Reach at 34.5x its former boss budget while Night Forest uses 55x.
export const WATER_REACH_BOSS_HEALTH_MULTIPLIER = 34.5 / 55;
export const SAMURAI_GARDEN_HEALTH_SCALE = BALANCE_TARGET_MAP_POWER_MULTIPLIER * BALANCE_TARGET_MAP_DURATION_MULTIPLIER;
// Incoming hit damage has its own health-and-armor curve in incoming-damage.ts.
// Do not reuse it for enemy/boss HP or permanent reward budgets.
export const SAMURAI_GARDEN_REWARD_SCALE = BALANCE_TARGET_MAP_POWER_MULTIPLIER;
// Samurai Garden uses compact regular-enemy clears so its final-map travel and
// combat cadence remain readable around the Koi Shogun arena.
export const SAMURAI_GARDEN_ENCOUNTER_CADENCE_SCALE = .02;
// Keep the existing open-map regular payout alongside the repeatable capstone.
// This preserves established Samurai Garden progression for current players.
export const SAMURAI_GARDEN_OPEN_MAP_REWARD_MULTIPLIER = 2.5;
// Cloudspire continues the established late-map macro step from Samurai
// Garden while retaining its compact encounter rhythm.
export const CLOUDSPIRE_HEALTH_SCALE = BALANCE_TARGET_MAP_POWER_MULTIPLIER * BALANCE_TARGET_MAP_DURATION_MULTIPLIER;
export const CLOUDSPIRE_REWARD_SCALE = BALANCE_TARGET_MAP_POWER_MULTIPLIER;
export const CLOUDSPIRE_DAMAGE_REWARD_MULTIPLIER = 3.7;
export const CLOUDSPIRE_HEALTH_REWARD_MULTIPLIER = .75;
// Moonfen continues the late-map ladder with a sturdier, defense-forward
// enemy mix after Cloudspire's unusually damage-heavy reward profile.
export const MOONFEN_HEALTH_SCALE = BALANCE_TARGET_MAP_POWER_MULTIPLIER * BALANCE_TARGET_MAP_DURATION_MULTIPLIER;
export const MOONFEN_REWARD_SCALE = BALANCE_TARGET_MAP_POWER_MULTIPLIER;
// Crystal Hollows adds one complete late-map step without rebalancing saves.
export const CRYSTAL_HOLLOWS_HEALTH_SCALE = BALANCE_TARGET_MAP_POWER_MULTIPLIER * BALANCE_TARGET_MAP_DURATION_MULTIPLIER;
export const CRYSTAL_HOLLOWS_REWARD_SCALE = BALANCE_TARGET_MAP_POWER_MULTIPLIER;
// Compact clears preserve travel time; the lighter health slice compensates
// for the defense-heavy reward mix in the measured Moonfen-to-cavern campaign.
export const CRYSTAL_HOLLOWS_ENCOUNTER_HEALTH_SCALE = .48;
export const CRYSTAL_HOLLOWS_ENCOUNTER_REWARD_SCALE = .6;
// Relative per-enemy health shapes. enemies.ts centers each profile against
// the authored clear counts, so encounter texture can change without silently
// changing the map's aggregate health budget.
export const BEGINNER_DESERT_CLEAR_ARCHETYPE_COUNTS = {
  raider: 6,
  archer: 6,
  guardian: 14,
  reaper: 1,
  oracle: 3,
} as const;
export const INTERMEDIATE_SNOWLANDS_CLEAR_ARCHETYPE_COUNTS = {
  raider: 6,
  archer: 6,
  guardian: 7,
  reaper: 1,
  oracle: 5,
} as const;
// Late maps keep the macro curve exact while giving individual archetypes a
// small amount of texture. enemies.ts centers these readable profile values
// against one complete 30-enemy clear, so total health, incoming DPS, and
// reward power do not drift from the explicit macro/cadence budget.
export const LATE_MAP_CLEAR_ARCHETYPE_COUNTS = {
  raider: 6,
  archer: 6,
  guardian: 7,
  reaper: 7,
  oracle: 4,
} as const;
export const BEGINNER_DESERT_ARCHETYPE_HEALTH_PROFILE = {
  raider: .9,
  archer: .82,
  guardian: .9,
  reaper: 1.05,
  oracle: 1.35,
} as const;
export const INTERMEDIATE_SNOWLANDS_ARCHETYPE_HEALTH_PROFILE = {
  raider: .78,
  archer: .72,
  guardian: 1.05,
  reaper: 1.58,
  oracle: 1.16,
} as const;
export const ADVANCED_LAVA_WASTES_ARCHETYPE_HEALTH_PROFILE = {
  raider: .74,
  archer: .82,
  guardian: 1.08,
  reaper: 1.57,
  oracle: 1.12,
} as const;
export const INFERNAL_DEPTHS_ARCHETYPE_HEALTH_PROFILE = {
  raider: .7,
  archer: .88,
  guardian: 1.1,
  reaper: 1.6,
  oracle: 1.14,
} as const;
export const WATER_REACH_ARCHETYPE_HEALTH_PROFILE = {
  raider: .76,
  archer: .86,
  guardian: 1.15,
  reaper: 1.52,
  oracle: 1.12,
} as const;
export const SAMURAI_GARDEN_ARCHETYPE_PROFILE = {
  raider: { health: .94, damage: 1.08, reward: 1.12, attackSpeed: .7 },
  archer: { health: 1.05, damage: 1.02, reward: .96, attackSpeed: .52 },
  guardian: { health: 1.06, damage: .94, reward: 1.08, attackSpeed: .5 },
  reaper: { health: .96, damage: 1.01, reward: 1, attackSpeed: .74 },
  oracle: { health: 1.02, damage: .98, reward: 1.07, attackSpeed: .58 },
} as const;
export const SAMURAI_GARDEN_REWARD_TRACK_PROFILE = {
  damage: .7,
  health: 2,
  armor: 1.15,
  regen: 1.4,
  speed: 1,
} as const;
export const CLOUDSPIRE_ARCHETYPE_PROFILE = {
  raider: { health: .88, damage: 1.1, reward: 1.08, attackSpeed: .72 },
  archer: { health: .98, damage: 1.04, reward: .98, attackSpeed: .54 },
  guardian: { health: 1.2, damage: .92, reward: 1.12, attackSpeed: .48 },
  reaper: { health: 1.04, damage: 1.03, reward: 1.02, attackSpeed: .76 },
  oracle: { health: .96, damage: .97, reward: 1.1, attackSpeed: .6 },
} as const;
export const CLOUDSPIRE_REWARD_TRACK_PROFILE = {
  damage: 1.7,
  health: .8,
  armor: 1.22,
  regen: 1.5,
  speed: 1,
} as const;
export const MOONFEN_ARCHETYPE_PROFILE = {
  raider: { health: .92, damage: 1.04, reward: 1.06, attackSpeed: .68 },
  archer: { health: .96, damage: 1.08, reward: .98, attackSpeed: .55 },
  guardian: { health: 1.22, damage: .9, reward: 1.12, attackSpeed: .47 },
  reaper: { health: 1.02, damage: 1.06, reward: 1.02, attackSpeed: .73 },
  oracle: { health: .94, damage: 1, reward: 1.1, attackSpeed: .62 },
} as const;
export const CRYSTAL_HOLLOWS_ARCHETYPE_PROFILE = {
  raider: { health: .85, damage: 1.06, reward: 1.03, attackSpeed: .74 },
  archer: { health: .96, damage: 1.09, reward: 1, attackSpeed: .59 },
  guardian: { health: 1.28, damage: .88, reward: 1.14, attackSpeed: .45 },
  reaper: { health: 1.05, damage: 1.08, reward: 1.04, attackSpeed: .76 },
  oracle: { health: .95, damage: 1.02, reward: 1.08, attackSpeed: .64 },
} as const;
export const MOONFEN_REWARD_TRACK_PROFILE = {
  damage: 1,
  health: 1.75,
  armor: 1.25,
  regen: 1.65,
  speed: 1,
} as const;
export const CRYSTAL_HOLLOWS_REWARD_TRACK_PROFILE = {
  damage: 1.25,
  health: 1.7,
  armor: 1.6,
  regen: 1.25,
  speed: 1,
} as const;

export const SPIDER_MAX_HP = 150_000_000 * BEGINNER_DESERT_HEALTH_SCALE * BEGINNER_DESERT_BOSS_HEALTH_MULTIPLIER;
export const FROSTCLAW_MAX_HP = 750_000_000_000 * INTERMEDIATE_SNOWLANDS_HEALTH_SCALE * INTERMEDIATE_SNOWLANDS_BOSS_HEALTH_MULTIPLIER;
export const MAGMALISK_MAX_HP = 3_750_000_000_000_000 * ADVANCED_LAVA_WASTES_HEALTH_SCALE * ADVANCED_LAVA_WASTES_BOSS_HEALTH_MULTIPLIER;
export const SPIDER_REWARD_DAMAGE = 75_000 * BEGINNER_DESERT_REWARD_SCALE * BEGINNER_DESERT_BOSS_REWARD_MULTIPLIER * BEGINNER_DESERT_DAMAGE_REWARD_MULTIPLIER;
export const SPIDER_REWARD_HEALTH = 200_000 * BEGINNER_DESERT_REWARD_SCALE * BEGINNER_DESERT_BOSS_REWARD_MULTIPLIER * BEGINNER_DESERT_HEALTH_REWARD_MULTIPLIER;
export const DRAGON_MAX_HP = 300_000;
export const DRAGON_REWARD_DAMAGE = 650;
export const FROSTCLAW_REWARD_DAMAGE = 72_000_000 * INTERMEDIATE_SNOWLANDS_REWARD_SCALE * INTERMEDIATE_SNOWLANDS_BOSS_REWARD_MULTIPLIER * INTERMEDIATE_SNOWLANDS_DAMAGE_REWARD_MULTIPLIER;
export const FROSTCLAW_REWARD_HEALTH = 270_000_000 * INTERMEDIATE_SNOWLANDS_REWARD_SCALE * INTERMEDIATE_SNOWLANDS_BOSS_REWARD_MULTIPLIER * INTERMEDIATE_SNOWLANDS_HEALTH_REWARD_MULTIPLIER;
export const FROSTCLAW_REWARD_ARMOR = 75_000 * INTERMEDIATE_SNOWLANDS_REWARD_SCALE * INTERMEDIATE_SNOWLANDS_BOSS_REWARD_MULTIPLIER;
export const MAGMALISK_REWARD_DAMAGE = 14_400_000_000 * ADVANCED_LAVA_WASTES_REWARD_SCALE * ADVANCED_LAVA_WASTES_DAMAGE_REWARD_MULTIPLIER * ADVANCED_LAVA_WASTES_BOSS_REWARD_MULTIPLIER;
export const MAGMALISK_REWARD_HEALTH = 81_945_000_000 * ADVANCED_LAVA_WASTES_REWARD_SCALE * ADVANCED_LAVA_WASTES_HEALTH_REWARD_MULTIPLIER * ADVANCED_LAVA_WASTES_BOSS_REWARD_MULTIPLIER;
export const MAGMALISK_REWARD_ARMOR = 7_000_000 * ADVANCED_LAVA_WASTES_REWARD_SCALE * ADVANCED_LAVA_WASTES_BOSS_REWARD_MULTIPLIER;
export const MAGMALISK_REWARD_REGEN = 405_015_625 * ADVANCED_LAVA_WASTES_REWARD_SCALE * ADVANCED_LAVA_WASTES_BOSS_REWARD_MULTIPLIER;
export const GLOOMROOT_MAX_HP = 1_150_000_000_000_000 * INFERNAL_DEPTHS_BOSS_HEALTH_MULTIPLIER;
export const GLOOMROOT_REWARD_DAMAGE = 120_000_000_000 * INFERNAL_DEPTHS_BOSS_REWARD_MULTIPLIER * INFERNAL_DEPTHS_DAMAGE_REWARD_MULTIPLIER;
export const GLOOMROOT_REWARD_HEALTH = 250_000_000_000 * INFERNAL_DEPTHS_BOSS_REWARD_MULTIPLIER * INFERNAL_DEPTHS_HEALTH_REWARD_MULTIPLIER;
export const GLOOMROOT_REWARD_ARMOR = 10_000_000 * INFERNAL_DEPTHS_BOSS_REWARD_MULTIPLIER;
export const GLOOMROOT_REWARD_REGEN = 2_000_000_000 * INFERNAL_DEPTHS_BOSS_REWARD_MULTIPLIER;
export const TIDEWYRM_MAX_HP = GLOOMROOT_MAX_HP * SAMURAI_GARDEN_HEALTH_SCALE * WATER_REACH_BOSS_HEALTH_MULTIPLIER;
export const TIDEWYRM_REWARD_DAMAGE = GLOOMROOT_REWARD_DAMAGE * SAMURAI_GARDEN_REWARD_SCALE * WATER_REACH_DAMAGE_REWARD_MULTIPLIER;
export const TIDEWYRM_REWARD_HEALTH = GLOOMROOT_REWARD_HEALTH * SAMURAI_GARDEN_REWARD_SCALE * WATER_REACH_HEALTH_REWARD_MULTIPLIER;
export const TIDEWYRM_REWARD_ARMOR = GLOOMROOT_REWARD_ARMOR * SAMURAI_GARDEN_REWARD_SCALE;
export const TIDEWYRM_REWARD_REGEN = GLOOMROOT_REWARD_REGEN * SAMURAI_GARDEN_REWARD_SCALE;
// Samurai's compact encounter cadence reaches its intended exit damage before
// the full map-health multiplier. This keeps the capstone near the late-map
// 15-minute readiness target instead of turning it into another farm wall.
export const KOI_SHOGUN_MAX_HP = TIDEWYRM_MAX_HP * BALANCE_TARGET_MAP_POWER_MULTIPLIER * .75;
export const KOI_SHOGUN_REWARD_DAMAGE = TIDEWYRM_REWARD_DAMAGE * SAMURAI_GARDEN_REWARD_SCALE;
export const KOI_SHOGUN_REWARD_HEALTH = TIDEWYRM_REWARD_HEALTH * SAMURAI_GARDEN_REWARD_SCALE;
export const KOI_SHOGUN_REWARD_ARMOR = TIDEWYRM_REWARD_ARMOR * SAMURAI_GARDEN_REWARD_SCALE;
export const KOI_SHOGUN_REWARD_REGEN = TIDEWYRM_REWARD_REGEN * SAMURAI_GARDEN_REWARD_SCALE;
// Cloudspire's damage-forward camps reach boss readiness quickly; this keeps
// the first Tempest Kirin clear near the late-map campaign target.
export const TEMPEST_KIRIN_MAX_HP = KOI_SHOGUN_MAX_HP * BALANCE_TARGET_MAP_POWER_MULTIPLIER * 1.1;
export const TEMPEST_KIRIN_REWARD_DAMAGE = KOI_SHOGUN_REWARD_DAMAGE * CLOUDSPIRE_REWARD_SCALE * CLOUDSPIRE_DAMAGE_REWARD_MULTIPLIER;
export const TEMPEST_KIRIN_REWARD_HEALTH = KOI_SHOGUN_REWARD_HEALTH * CLOUDSPIRE_REWARD_SCALE * CLOUDSPIRE_HEALTH_REWARD_MULTIPLIER;
export const TEMPEST_KIRIN_REWARD_ARMOR = KOI_SHOGUN_REWARD_ARMOR * CLOUDSPIRE_REWARD_SCALE;
export const TEMPEST_KIRIN_REWARD_REGEN = KOI_SHOGUN_REWARD_REGEN * CLOUDSPIRE_REWARD_SCALE;
// Miremaw is the capstone for the next complete 8.5x progression step.
export const MIREMAW_MAX_HP = TEMPEST_KIRIN_MAX_HP * BALANCE_TARGET_MAP_POWER_MULTIPLIER * 1.1;
export const PRISMSHELL_MAX_HP = MIREMAW_MAX_HP * BALANCE_TARGET_MAP_POWER_MULTIPLIER * 1.1;
export const MIREMAW_REWARD_DAMAGE = TEMPEST_KIRIN_REWARD_DAMAGE * MOONFEN_REWARD_SCALE;
export const PRISMSHELL_REWARD_DAMAGE = MIREMAW_REWARD_DAMAGE * CRYSTAL_HOLLOWS_REWARD_SCALE;
export const MIREMAW_REWARD_HEALTH = TEMPEST_KIRIN_REWARD_HEALTH * MOONFEN_REWARD_SCALE;
export const PRISMSHELL_REWARD_HEALTH = MIREMAW_REWARD_HEALTH * CRYSTAL_HOLLOWS_REWARD_SCALE;
export const MIREMAW_REWARD_ARMOR = TEMPEST_KIRIN_REWARD_ARMOR * MOONFEN_REWARD_SCALE;
export const PRISMSHELL_REWARD_ARMOR = MIREMAW_REWARD_ARMOR * CRYSTAL_HOLLOWS_REWARD_SCALE;
export const MIREMAW_REWARD_REGEN = TEMPEST_KIRIN_REWARD_REGEN * MOONFEN_REWARD_SCALE;
export const PRISMSHELL_REWARD_REGEN = MIREMAW_REWARD_REGEN * CRYSTAL_HOLLOWS_REWARD_SCALE;

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

export const PROTOCOL_VERSION = 85;
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
