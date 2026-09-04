// Historical exports for compatibility with old diagnostic imports only.
// Active encounter authoring lives in progression.ts. Do not tune this file.
import { MAP_STAT_GROWTH } from "./progression";
const BALANCE_TARGET_MAP_POWER_MULTIPLIER = MAP_STAT_GROWTH;
const BALANCE_TARGET_MAP_DURATION_MULTIPLIER = 1;
// Keep Tutorial Forest as onboarding. From Beginner Desert onward, regular
// enemies are half as durable and each independent boss health root is twice
// as durable; derived later maps inherit the post-Forest factor once.
export const POST_FOREST_REGULAR_HEALTH_MULTIPLIER = .5;
export const POST_FOREST_BOSS_HEALTH_MULTIPLIER = 2;
export const BEGINNER_DESERT_HEALTH_SCALE = .77;
export const BEGINNER_DESERT_REWARD_SCALE = 1;
// Regular-enemy runway multipliers redistribute early boss power into the map
// without changing boss health. The post-Forest health retune is applied to
// each independent map root below; derived maps inherit it without multiplying
// the reduction again.
export const BEGINNER_DESERT_REGULAR_HEALTH_MULTIPLIER = .154 * POST_FOREST_REGULAR_HEALTH_MULTIPLIER;
export const BEGINNER_DESERT_BOSS_HEALTH_MULTIPLIER = .0288 * POST_FOREST_BOSS_HEALTH_MULTIPLIER;
export const BEGINNER_DESERT_REGULAR_REWARD_MULTIPLIER = .0495;
export const BEGINNER_DESERT_BOSS_REWARD_MULTIPLIER = .02;
export const BEGINNER_DESERT_DAMAGE_REWARD_MULTIPLIER = .9;
export const BEGINNER_DESERT_HEALTH_REWARD_MULTIPLIER = 1.3;
export const BEGINNER_DESERT_ARMOR_REWARD_MULTIPLIER = 15;
export const BEGINNER_DESERT_REGEN_REWARD_MULTIPLIER = 4;
// The opening map should teach positioning without making an unarmored new
// player lose the whole health bar to one contact. Boss ability damage keeps
// its own authored envelope in boss-damage.ts.
export const BEGINNER_DESERT_INCOMING_DAMAGE_SCALE = .35;
// Keep the elite's long-run reward efficiency while paying it out in smaller,
// faster increments so early Desert power does not sit flat for half an hour.
export const WASTES_REAPER_CADENCE_SCALE = .2;
export const INTERMEDIATE_SNOWLANDS_HEALTH_SCALE = .0298;
export const INTERMEDIATE_SNOWLANDS_REWARD_SCALE = .2;
export const INTERMEDIATE_SNOWLANDS_REGULAR_HEALTH_MULTIPLIER = .0091 * POST_FOREST_REGULAR_HEALTH_MULTIPLIER;
export const INTERMEDIATE_SNOWLANDS_BOSS_HEALTH_MULTIPLIER = .0012 * POST_FOREST_BOSS_HEALTH_MULTIPLIER;
export const INTERMEDIATE_SNOWLANDS_REGULAR_REWARD_MULTIPLIER = .00265;
export const INTERMEDIATE_SNOWLANDS_BOSS_REWARD_MULTIPLIER = .00045;
export const INTERMEDIATE_SNOWLANDS_DAMAGE_REWARD_MULTIPLIER = .9;
export const INTERMEDIATE_SNOWLANDS_HEALTH_REWARD_MULTIPLIER = 2.4;
export const INTERMEDIATE_SNOWLANDS_REGEN_REWARD_MULTIPLIER = 5;
export const ADVANCED_LAVA_WASTES_HEALTH_SCALE = .0015;
export const ADVANCED_LAVA_WASTES_REWARD_SCALE = .041;
// Completed late maps spend their macro budget across many compact encounter
// cycles. Health cadence controls individual fight length; reward cadence
// controls how many of those fights are needed to reach the next boss. Keeping
// them explicit prevents total duration, travel, and progression from being
// accidentally coupled again.
export const ADVANCED_LAVA_WASTES_ENCOUNTER_HEALTH_SCALE = .0231;
export const ADVANCED_LAVA_WASTES_ENCOUNTER_REWARD_SCALE = .0133;
export const ADVANCED_LAVA_WASTES_REGULAR_HEALTH_MULTIPLIER = .0054 * POST_FOREST_REGULAR_HEALTH_MULTIPLIER;
export const ADVANCED_LAVA_WASTES_BOSS_HEALTH_MULTIPLIER = .0000858 * POST_FOREST_BOSS_HEALTH_MULTIPLIER;
export const ADVANCED_LAVA_WASTES_REGULAR_REWARD_MULTIPLIER = .001725;
export const ADVANCED_LAVA_WASTES_BOSS_REWARD_MULTIPLIER = .0000275;
export const ADVANCED_LAVA_WASTES_BOSS_REWARD_SCALE = .45;
// Late-map reward tracks keep raw damage and max health near parity. Damage
// otherwise accelerates its own farming rate and outruns defensive growth.
export const ADVANCED_LAVA_WASTES_DAMAGE_REWARD_MULTIPLIER = 1;
export const ADVANCED_LAVA_WASTES_HEALTH_REWARD_MULTIPLIER = 8;
export const ADVANCED_LAVA_WASTES_REGEN_REWARD_MULTIPLIER = 3;
export const INFERNAL_DEPTHS_HEALTH_SCALE = .00001;
export const INFERNAL_DEPTHS_REWARD_SCALE = .00115;
export const INFERNAL_DEPTHS_ENCOUNTER_HEALTH_SCALE = .0374;
export const INFERNAL_DEPTHS_ENCOUNTER_REWARD_SCALE = .022;
export const INFERNAL_DEPTHS_INCOMING_DAMAGE_SCALE = .85;
export const INFERNAL_DEPTHS_DAMAGE_REWARD_MULTIPLIER = 1;
export const INFERNAL_DEPTHS_HEALTH_REWARD_MULTIPLIER = 4;
export const INFERNAL_DEPTHS_REGEN_REWARD_MULTIPLIER = 5;
export const INFERNAL_DEPTHS_REGULAR_HEALTH_MULTIPLIER = .0011 * POST_FOREST_REGULAR_HEALTH_MULTIPLIER;
export const INFERNAL_DEPTHS_BOSS_HEALTH_MULTIPLIER = .00000594 * POST_FOREST_BOSS_HEALTH_MULTIPLIER;
export const INFERNAL_DEPTHS_REGULAR_REWARD_MULTIPLIER = .00025;
export const INFERNAL_DEPTHS_BOSS_REWARD_MULTIPLIER = .000002;
export const INFERNAL_DEPTHS_BOSS_REWARD_SCALE = .75;
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
export const WATER_REACH_HEALTH_REWARD_MULTIPLIER = 3.8;
export const WATER_REACH_REGEN_REWARD_MULTIPLIER = 8;
export const WATER_REACH_ENCOUNTER_HEALTH_SCALE = .046875;
export const WATER_REACH_ENCOUNTER_REWARD_SCALE = .0188;
export const WATER_REACH_REGULAR_HEALTH_MULTIPLIER = .0000375 * POST_FOREST_REGULAR_HEALTH_MULTIPLIER;
export const WATER_REACH_REGULAR_REWARD_MULTIPLIER = .0000075;
// Tidewyrm inherits Gloomroot's already doubled post-Forest boss root. This
// factor keeps Water Reach at 34.5x its former boss budget while Night Forest
// uses 55x; do not apply POST_FOREST_BOSS_HEALTH_MULTIPLIER again here.
export const WATER_REACH_BOSS_HEALTH_MULTIPLIER = 34.5 / 55;
export const WATER_REACH_BOSS_REWARD_SCALE = .2;
export const SAMURAI_GARDEN_HEALTH_SCALE = BALANCE_TARGET_MAP_POWER_MULTIPLIER * BALANCE_TARGET_MAP_DURATION_MULTIPLIER;
// Incoming hit damage has its own health-and-armor curve in incoming-damage.ts.
// Do not reuse it for enemy/boss HP or permanent reward budgets.
export const SAMURAI_GARDEN_REWARD_SCALE = BALANCE_TARGET_MAP_POWER_MULTIPLIER;
// Samurai Garden uses compact regular-enemy clears so its final-map travel and
// combat cadence remain readable around the Koi Shogun arena.
export const SAMURAI_GARDEN_ENCOUNTER_CADENCE_SCALE = .033755;
// Regular reward cadence is deliberately separate from encounter health. The
// map needs several more reward decisions before its capstone without making
// every individual enemy a longer health wall.
export const SAMURAI_GARDEN_ENCOUNTER_REWARD_SCALE = .0078;
// Keep the existing open-map regular payout alongside the repeatable capstone.
// This preserves established Samurai Garden progression for current players.
export const SAMURAI_GARDEN_OPEN_MAP_REWARD_MULTIPLIER = 2.5;
export const SAMURAI_GARDEN_BOSS_REWARD_SCALE = .5;
// Cloudspire continues the established late-map macro step from Samurai
// Garden while retaining its compact encounter rhythm.
// Samurai's encounter cadence is part of Cloudspire's derived health base, so
// divide the desired Cloudspire correction by the Samurai correction here.
export const CLOUDSPIRE_HEALTH_SCALE = BALANCE_TARGET_MAP_POWER_MULTIPLIER * BALANCE_TARGET_MAP_DURATION_MULTIPLIER * .904;
export const CLOUDSPIRE_REWARD_SCALE = BALANCE_TARGET_MAP_POWER_MULTIPLIER;
export const CLOUDSPIRE_ENCOUNTER_REWARD_SCALE = .735;
export const CLOUDSPIRE_DAMAGE_REWARD_MULTIPLIER = 2.2;
export const CLOUDSPIRE_HEALTH_REWARD_MULTIPLIER = 1.8;
export const CLOUDSPIRE_BOSS_REWARD_SCALE = .3;
// Moonfen continues the late-map ladder with a sturdier, defense-forward
// enemy mix after Cloudspire's unusually damage-heavy reward profile.
// Cloudspire already carries the Samurai correction above, so this coefficient
// applies only Moonfen's incremental 1.82x campaign correction.
export const MOONFEN_HEALTH_SCALE = BALANCE_TARGET_MAP_POWER_MULTIPLIER * BALANCE_TARGET_MAP_DURATION_MULTIPLIER * .852;
export const MOONFEN_REWARD_SCALE = BALANCE_TARGET_MAP_POWER_MULTIPLIER;
export const MOONFEN_ENCOUNTER_REWARD_SCALE = 1;
export const MOONFEN_HEALTH_REWARD_MULTIPLIER = 3.5;
export const MOONFEN_BOSS_REWARD_SCALE = .3;
// Crystal Hollows adds one complete late-map step while retaining the
// balanced-tech-tree campaign runway.
export const CRYSTAL_HOLLOWS_HEALTH_SCALE = BALANCE_TARGET_MAP_POWER_MULTIPLIER * BALANCE_TARGET_MAP_DURATION_MULTIPLIER;
export const CRYSTAL_HOLLOWS_REWARD_SCALE = BALANCE_TARGET_MAP_POWER_MULTIPLIER;
// Compact clears preserve travel time while the encounter slice compensates
// for the defense-heavy reward mix in the measured Moonfen-to-cavern campaign.
// Moonfen carries the upstream correction; Crystal Hollows adds its own 1.85x
// encounter correction without multiplying the earlier tiers again.
export const CRYSTAL_HOLLOWS_ENCOUNTER_HEALTH_SCALE = .874;
export const CRYSTAL_HOLLOWS_ENCOUNTER_REWARD_SCALE = .8;
export const CRYSTAL_HOLLOWS_HEALTH_REWARD_MULTIPLIER = 3.4;
export const CRYSTAL_HOLLOWS_BOSS_REWARD_SCALE = .18;
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
  damage: 1.6,
  health: 1.1,
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

// Boss armor and regen should remain meaningful as the HP envelope grows.
// Deriving these two defensive payouts from chained reward scales made the
// late bosses pay less than ordinary defensive encounters in the same map.
export const BOSS_ARMOR_REWARD_FRACTION = .000002;
export const BOSS_REGEN_REWARD_FRACTION = .00000025;
