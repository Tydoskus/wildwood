import { CAMPAIGN_MAPS } from "./campaign-registry";
// Browser- and server-safe values. Keep this module free of DOM, Node, and
// SpacetimeDB imports so both runtime targets use one gameplay contract.
import { utilityMovementSpeedBonus } from "./research";
import {
  MAP_STAT_GROWTH, MAP_TARGET_SECONDS, BOSS_TARGET_SECONDS,
} from "./progression";

export const WORLD_WIDTH = 4800;
export const WORLD_HEIGHT = 4800;
/**
 * Where a new character starts, and where the dead respawn on Tutorial Forest:
 * between Thornshot Rise's Spitters and Ember Fen's Brambles, the forest's easiest enemies, away
 * from the portal in the middle, among Needles and Mossbacks a fresh character
 * cannot beat. Portal travellers arrive by the portal (shared/map-gateways.ts).
 */
export const PLAYER_SPAWN: Readonly<{ x: number; y: number }> = Object.freeze({ x: 1025, y: 850 });
export const PLAYER_RADIUS = 17;
export const PLAYER_BASE_HP = 100;
export const PLAYER_BASE_DAMAGE = 3;
export const PLAYER_BASE_REGEN = 0.2;
export const PLAYER_SPEED = 250;
/**
 * Movement comes from PLAYER_SPEED, not the speed a save stores, but the
 * untouched-save checks compare that stored copy: saves made at the old 180
 * and 200 still count as untouched.
 */
export function isBaseStoredSpeed(speed: unknown) {
  return speed === PLAYER_SPEED || speed === 200 || speed === 180;
}
export const BOOTS_SPEED_BONUS = 0;
export const MOVE_SPEED_RESEARCH_BONUS_PER_RANK = .02;
/** Move Speed research: five ranks per band across four bands. */
export const MAX_MOVE_SPEED_RESEARCH_RANK = 20;
/** A fully researched build wearing no speed boots. */
export const MAX_PLAYER_MOVEMENT_SPEED = Math.round(PLAYER_SPEED * (1 + MAX_MOVE_SPEED_RESEARCH_RANK * MOVE_SPEED_RESEARCH_BONUS_PER_RANK));
/** Baseline chase speed against a fully researched player without equipment. */
export const ENEMY_CHASE_SPEED_MARGIN = 25;
export const ENEMY_TOP_CHASE_SPEED = MAX_PLAYER_MOVEMENT_SPEED + ENEMY_CHASE_SPEED_MARGIN;
/**
 * The speed an enemy actually chases at, against the player in front of it.
 * Every regular, elite, and ranged chaser reaches the target player's actual
 * movement speed plus the margin, including equipment bonuses and overrides.
 * Authored speed remains the fallback when no player speed is available.
 */
export function enemyChaseSpeed(authoredSpeed: number, playerMovementSpeed: number) {
  if (!Number.isFinite(playerMovementSpeed) || playerMovementSpeed <= 0) return authoredSpeed;
  if (!Number.isFinite(authoredSpeed) || authoredSpeed <= 0) return 0;
  return Math.max(1, playerMovementSpeed + ENEMY_CHASE_SPEED_MARGIN);
}
export const MAX_MOVEMENT_SPEED_OVERRIDE = 2_000;
export const MOVEMENT_SPEED_EPSILON = .01;
export const PLAYER_PROJECTILE_SPEED = 1_000;
export const DEFAULT_ATTACK_RANGE = 200;
export const DEFAULT_ATTACK_INTERVAL = 1.56;
/**
 * How often the client reports regular kills, and therefore how many seconds
 * of kills one honest report can hold. The server banks exactly this much per
 * species; a shorter bank clips honest reports, a longer one lets a script
 * claim more in one go than the client could have gathered.
 */
// Kills are only real once the server has the report; until then they live in
// one browser tab, which drains them when hidden or closed. A report is the
// busiest reducer the game has and costs the same however many kills it holds,
// so a minute halves the server's largest cost.
export const REGULAR_KILL_REPORT_SECONDS = 60;
/**
 * The server's limit on kill reports per account: a bucket of this many that
 * refills one report every KILL_REPORT_REFILL_SECONDS. A report over it gets
 * "Enemy rewards are catching up." and the client keeps the kills queued and
 * retries in 60 seconds. It is a cost bound, not an anti-cheat one: every
 * report runs the whole kill reducer, whatever it ends up paying.
 */
export const KILL_REPORT_BURST = 16;
export const KILL_REPORT_REFILL_SECONDS = 3;
/**
 * How long a cleared camp takes to come back. Both the client's respawn clock
 * and the server's kill ceiling are derived from this, so they have to agree.
 */
export const REGULAR_ENEMY_RESPAWN_SECONDS = 10;
/** The base attack speed cap. Reflect Only wins and Quick Draw raise it. */
export const MAX_BASE_ATTACKS_PER_SECOND = 3;
/** Quick Draw (prestige perk): the attack speed cap, 0.2 attacks a second higher a rank, five ranks. */
export const QUICK_DRAW_CAP_PER_RANK = .2;
export const QUICK_DRAW_MAX_CAP_RAISE = 1;
export const MIN_ATTACK_INTERVAL = 1 / MAX_BASE_ATTACKS_PER_SECOND;
export const BOSS_RESPAWN_SECONDS = 45;
// Scalable combat stats are f64 (player_progress's wide columns past f32's range),
// so the ceiling sits far below f64's 1.8e308 with room for research and power
// multipliers. Columns still stored as f32 clamp at F32_STAT_LIMIT
// (shared/wide-stats.ts). Movement and attack speed keep their own caps.
export const MAX_PLAYER_STAT = 1e300;
export const MAX_ARMOR = MAX_PLAYER_STAT;
export const ATTACK_BALANCE_VERSION = 9;
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
  WOOD_FULL_HELM,
  WOODEN_ARMOR,
} from "./items";
// Targets are playtest hypotheses. The encounter generator owns combat stats.
export const BALANCE_TARGET_DESERT_DURATION_SECONDS = MAP_TARGET_SECONDS;
export const BALANCE_TARGET_MAP_DURATION_MULTIPLIER = 1;
export const BALANCE_TARGET_MAP_DURATION_STEP_SECONDS = 76 * 60;
export const BALANCE_TARGET_MAP_POWER_MULTIPLIER = MAP_STAT_GROWTH;
export const BALANCE_TARGET_POWER_ARC_BLEND = .35;
export const BALANCE_LATE_BOSS_TARGET_DURATION_SHARE = .05;
export const BALANCE_LATE_BOSS_TARGET_MAX_SECONDS = BOSS_TARGET_SECONDS;

// The claim mask is append-only save metadata in a published player_progress
// column: it marks which bosses were cleared and does not change the reward.
export const BOSS_REWARD_CLAIM_BITS: Record<string, number> = Object.fromEntries(CAMPAIGN_MAPS.map(map => [map.bossKind, 2 ** map.claimIndex]));

// Campaign boss values, reward boosts already included.
// Keyed `${bossArt}_MAX_HP` and `${bossArt}_REWARD_<STAT>` (bossArt from the
// campaign registry), which is how every reader looks them up.
export const AUTHORED_BOSS_RULES: Readonly<Record<string, number>> = Object.freeze({
  DRAGON_MAX_HP: 70000, SPIDER_MAX_HP: 160000, FROSTCLAW_MAX_HP: 3790800,
  MAGMALISK_MAX_HP: 15163200.000000002, GLOOMROOT_MAX_HP: 45489600.00000001, TIDEWYRM_MAX_HP: 136468800.00000003,
  KOI_SHOGUN_MAX_HP: 409406400.00000006, TEMPEST_KIRIN_MAX_HP: 1228219200, MIREMAW_MAX_HP: 3684657600.0000005,
  PRISMSHELL_MAX_HP: 11053972800, IRONHORN_MAX_HP: 33161918400.000004, DREADREAPER_MAX_HP: 99485755200.00002,
  VOLTWARDEN_MAX_HP: 298457265600, GRAVEBLOOM_MAX_HP: 895371796800.0001, AEGIS_PRIME_MAX_HP: 2686115390400,
  DRAGON_REWARD_DAMAGE: 20, SPIDER_REWARD_DAMAGE: 50, SPIDER_REWARD_HEALTH: 1500,
  FROSTCLAW_REWARD_DAMAGE: 115.5, FROSTCLAW_REWARD_HEALTH: 3465, FROSTCLAW_REWARD_ARMOR: 64.96875,
  MAGMALISK_REWARD_DAMAGE: 326.304, MAGMALISK_REWARD_HEALTH: 9789.119999999999, MAGMALISK_REWARD_ARMOR: 183.546,
  MAGMALISK_REWARD_REGEN: 97.8912, GLOOMROOT_REWARD_DAMAGE: 670.7475000000001, GLOOMROOT_REWARD_HEALTH: 20122.425,
  GLOOMROOT_REWARD_ARMOR: 377.29546875, GLOOMROOT_REWARD_REGEN: 201.22425, TIDEWYRM_REWARD_DAMAGE: 2108.511,
  TIDEWYRM_REWARD_HEALTH: 63255.329999999994, TIDEWYRM_REWARD_ARMOR: 1186.0374375, TIDEWYRM_REWARD_REGEN: 632.5532999999999,
  KOI_SHOGUN_REWARD_DAMAGE: 5857.8795, KOI_SHOGUN_REWARD_HEALTH: 175736.385, KOI_SHOGUN_REWARD_ARMOR: 3295.05721875,
  KOI_SHOGUN_REWARD_REGEN: 1757.36385, TEMPEST_KIRIN_REWARD_DAMAGE: 17082.2925, TEMPEST_KIRIN_REWARD_HEALTH: 512468.775,
  TEMPEST_KIRIN_REWARD_ARMOR: 9608.78953125, TEMPEST_KIRIN_REWARD_REGEN: 5124.68775, MIREMAW_REWARD_DAMAGE: 55182.384,
  MIREMAW_REWARD_HEALTH: 1655471.52, MIREMAW_REWARD_ARMOR: 31040.091, MIREMAW_REWARD_REGEN: 16554.7152,
  PRISMSHELL_REWARD_DAMAGE: 157729.7205, IRONHORN_REWARD_DAMAGE: 460080.2835, DREADREAPER_REWARD_DAMAGE: 1354170.717,
  VOLTWARDEN_REWARD_DAMAGE: 3865524.687, GRAVEBLOOM_REWARD_DAMAGE: 11261234.790000001, AEGIS_PRIME_REWARD_DAMAGE: 34672539.4425,
  PRISMSHELL_REWARD_HEALTH: 4731891.615, IRONHORN_REWARD_HEALTH: 13802408.505, DREADREAPER_REWARD_HEALTH: 40625121.51,
  VOLTWARDEN_REWARD_HEALTH: 115965740.61, GRAVEBLOOM_REWARD_HEALTH: 337837043.7, AEGIS_PRIME_REWARD_HEALTH: 1040176183.275,
  PRISMSHELL_REWARD_ARMOR: 88722.96778125, IRONHORN_REWARD_ARMOR: 258795.15946875, DREADREAPER_REWARD_ARMOR: 761721.0283125,
  VOLTWARDEN_REWARD_ARMOR: 2174357.6364375, GRAVEBLOOM_REWARD_ARMOR: 6334444.569375, AEGIS_PRIME_REWARD_ARMOR: 19503303.43640625,
  PRISMSHELL_REWARD_REGEN: 47318.916150000005, IRONHORN_REWARD_REGEN: 138024.08505, DREADREAPER_REWARD_REGEN: 406251.21510000003,
  VOLTWARDEN_REWARD_REGEN: 1159657.4061, GRAVEBLOOM_REWARD_REGEN: 3378370.437, AEGIS_PRIME_REWARD_REGEN: 10401761.83275,
});
/** The values in play: the authored ones until the browser installs a map visit's snapshot. */
export const BOSS_RULES: Record<string, number> = { ...AUTHORED_BOSS_RULES };

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
export const CLOCKWORK_RUINS_MAP_ID = "clockwork_ruins";
export const DUSKFALL_ORCHARD_MAP_ID = "duskfall_orchard";
export const NEON_BASTION_MAP_ID = "neon_bastion";
export const VERDANT_CATACOMBS_MAP_ID = "verdant_catacombs";
export const ION_CITADEL_MAP_ID = "ion_citadel";
export const MAP_DISPLAY_NAMES: Record<string, string> = {
  first_steps: "First Steps", home_exterior: "Base", town: "Town",
  ...Object.fromEntries(CAMPAIGN_MAPS.map((map, index) => [map.id, `${map.displayName.replace(/ - \d+$/, "")} - ${index + 1}`])),
};
export const MAP_IDS: readonly string[] = CAMPAIGN_MAPS.map(map => map.id);

/** Keep authored/custom map names and their progression suffix consistent. */
export function numberedMapName(mapId: string, name: string) {
  const index = MAP_IDS.indexOf(mapId);
  return index < 0 ? name : `${name.replace(/ - \d+$/, "")} - ${index + 1}`;
}

export const PROTOCOL_VERSION = 116;
// Add a previous version only after reviewing wire/schema and security compatibility.
// Flat equipment changes combat DPS and boss-claim validation. Percentage-based
// clients must update together with the servers, even though the wire is unchanged.
export const COMPATIBLE_PROTOCOL_VERSIONS: readonly number[] = [PROTOCOL_VERSION];
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

export function effectivePlayerMovementSpeed(bootsEquipped: boolean, moveSpeedRank: number, speedOverride = 0, utilityMoveSpeedRank = 0) {
  return playerBaseMovementSpeed(bootsEquipped, speedOverride) * movementSpeedMultiplier(moveSpeedRank) + utilityMovementSpeedBonus(utilityMoveSpeedRank);
}

export function movementSpeedsMatch(left: number | null | undefined, right: number | null | undefined) {
  return Number.isFinite(left) && Number.isFinite(right) &&
    Math.abs(Number(left) - Number(right)) < MOVEMENT_SPEED_EPSILON;
}

/** Browser installs the authoritative visit snapshot before spawning combat. */
export function installBossRuleValues(values: Record<string, number>) {
  for (const key of Object.keys(AUTHORED_BOSS_RULES)) if (values[key] !== undefined) BOSS_RULES[key] = values[key];
}
