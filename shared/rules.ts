import { CAMPAIGN_MAPS } from "./campaign-registry";
// Browser- and server-safe values. Keep this module free of DOM, Node, and
// SpacetimeDB imports so both runtime targets use one gameplay contract.
import { MAP_EDITOR_GAMEPLAY_OVERRIDES } from "./map-editor-overrides";
import { utilityMovementSpeedBonus } from "./research";
import {
  MAP_STAT_GROWTH, MAP_TARGET_SECONDS, BOSS_TARGET_SECONDS,
} from "./progression";

export const WORLD_WIDTH = 4800;
export const WORLD_HEIGHT = 4800;
export const PLAYER_SPAWN: Readonly<{ x: number; y: number }> =
  MAP_EDITOR_GAMEPLAY_OVERRIDES.tutorial_forest?.arrival ?? { x: 360, y: 360 };
export const PLAYER_RADIUS = 17;
export const PLAYER_BASE_HP = 100;
export const PLAYER_BASE_DAMAGE = 3;
export const PLAYER_BASE_REGEN = 0.2;
export const PLAYER_SPEED = 180;
export const BOOTS_SPEED_BONUS = 0;
export const MOVE_SPEED_RESEARCH_BONUS_PER_RANK = .02;
/** Move Speed research: five ranks per band across four bands. */
export const MAX_MOVE_SPEED_RESEARCH_RANK = 20;
/** A fully researched build wearing no speed boots. */
export const MAX_PLAYER_MOVEMENT_SPEED = Math.round(PLAYER_SPEED * (1 + MAX_MOVE_SPEED_RESEARCH_RANK * MOVE_SPEED_RESEARCH_BONUS_PER_RANK));
/** Baseline chase speed against a fully researched player without equipment. */
export const ENEMY_CHASE_SPEED_MARGIN = 10;
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
// one browser tab. Thirty seconds bounds what a closed tab can lose to half a
// minute, and the per-player cost of the report is small next to a view.
export const REGULAR_KILL_REPORT_SECONDS = 30;
/**
 * How long a cleared camp takes to come back. Both the client's respawn clock
 * and the server's kill ceiling are derived from this, so they have to agree.
 * It was 20 seconds, or 10 for thirty minutes after a rewarded ad; since 0.807
 * 10 seconds is simply the respawn, and the ad pays Gems instead.
 */
export const REGULAR_ENEMY_RESPAWN_SECONDS = 10;
export const MAX_BASE_ATTACKS_PER_SECOND = 2.625;
export const MIN_ATTACK_INTERVAL = 1 / MAX_BASE_ATTACKS_PER_SECOND;
export const BOSS_RESPAWN_SECONDS = 45;
// Scalable combat stats use f32 storage. One undecillion stays below f32's
// finite limit with room for research and power multipliers. Movement and
// attack speed retain their separate gameplay caps.
export const MAX_PLAYER_STAT = 1e36;
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
export const BALANCE_FIRST_SLOWDOWN_POWER = 400_000; // historical chart marker only
export const BALANCE_TARGET_POWER_ARC_BLEND = .35;
export const BALANCE_LATE_BOSS_TARGET_DURATION_SHARE = .05;
export const BALANCE_LATE_BOSS_TARGET_MAX_SECONDS = BOSS_TARGET_SECONDS;

// The claim mask is retained as append-only save metadata. It identifies a
// boss that has been cleared while preserving the published player_progress
// column; it no longer changes the reward amount.
export const BOSS_REWARD_CLAIM_BITS: Record<string, number> = Object.fromEntries(CAMPAIGN_MAPS.map(map => [map.bossKind, 2 ** map.claimIndex]));

// Campaign boss values baked at revision 73; reward boosts are already included.
export let DRAGON_MAX_HP = 70000;
export let SPIDER_MAX_HP = 160000;
export let FROSTCLAW_MAX_HP = 3790800;
export let MAGMALISK_MAX_HP = 15163200.000000002;
export let GLOOMROOT_MAX_HP = 45489600.00000001;
export let TIDEWYRM_MAX_HP = 136468800.00000003;
export let KOI_SHOGUN_MAX_HP = 409406400.00000006;
export let TEMPEST_KIRIN_MAX_HP = 1228219200;
export let MIREMAW_MAX_HP = 3684657600.0000005;
export let PRISMSHELL_MAX_HP = 11053972800;
export let IRONHORN_MAX_HP = 33161918400.000004;
export let DREADREAPER_MAX_HP = 99485755200.00002;
export let VOLTWARDEN_MAX_HP = 298457265600;
export let GRAVEBLOOM_MAX_HP = 895371796800.0001;
export let AEGIS_PRIME_MAX_HP = 2686115390400;

export let DRAGON_REWARD_DAMAGE = 20;
export let SPIDER_REWARD_DAMAGE = 50;
export let SPIDER_REWARD_HEALTH = 1500;
export let FROSTCLAW_REWARD_DAMAGE = 115.5;
export let FROSTCLAW_REWARD_HEALTH = 3465;
export let FROSTCLAW_REWARD_ARMOR = 64.96875;
export let MAGMALISK_REWARD_DAMAGE = 326.304;
export let MAGMALISK_REWARD_HEALTH = 9789.119999999999;
export let MAGMALISK_REWARD_ARMOR = 183.546;
export let MAGMALISK_REWARD_REGEN = 97.8912;
export let GLOOMROOT_REWARD_DAMAGE = 670.7475000000001;
export let GLOOMROOT_REWARD_HEALTH = 20122.425;
export let GLOOMROOT_REWARD_ARMOR = 377.29546875;
export let GLOOMROOT_REWARD_REGEN = 201.22425;
export let TIDEWYRM_REWARD_DAMAGE = 2108.511;
export let TIDEWYRM_REWARD_HEALTH = 63255.329999999994;
export let TIDEWYRM_REWARD_ARMOR = 1186.0374375;
export let TIDEWYRM_REWARD_REGEN = 632.5532999999999;
export let KOI_SHOGUN_REWARD_DAMAGE = 5857.8795;
export let KOI_SHOGUN_REWARD_HEALTH = 175736.385;
export let KOI_SHOGUN_REWARD_ARMOR = 3295.05721875;
export let KOI_SHOGUN_REWARD_REGEN = 1757.36385;
export let TEMPEST_KIRIN_REWARD_DAMAGE = 17082.2925;
export let TEMPEST_KIRIN_REWARD_HEALTH = 512468.775;
export let TEMPEST_KIRIN_REWARD_ARMOR = 9608.78953125;
export let TEMPEST_KIRIN_REWARD_REGEN = 5124.68775;
export let MIREMAW_REWARD_DAMAGE = 55182.384;
export let MIREMAW_REWARD_HEALTH = 1655471.52;
export let MIREMAW_REWARD_ARMOR = 31040.091;
export let MIREMAW_REWARD_REGEN = 16554.7152;
export let PRISMSHELL_REWARD_DAMAGE = 157729.7205;
export let IRONHORN_REWARD_DAMAGE = 460080.2835;
export let DREADREAPER_REWARD_DAMAGE = 1354170.717;
export let VOLTWARDEN_REWARD_DAMAGE = 3865524.687;
export let GRAVEBLOOM_REWARD_DAMAGE = 11261234.790000001;
export let AEGIS_PRIME_REWARD_DAMAGE = 34672539.4425;
export let PRISMSHELL_REWARD_HEALTH = 4731891.615;
export let IRONHORN_REWARD_HEALTH = 13802408.505;
export let DREADREAPER_REWARD_HEALTH = 40625121.51;
export let VOLTWARDEN_REWARD_HEALTH = 115965740.61;
export let GRAVEBLOOM_REWARD_HEALTH = 337837043.7;
export let AEGIS_PRIME_REWARD_HEALTH = 1040176183.275;
export let PRISMSHELL_REWARD_ARMOR = 88722.96778125;
export let IRONHORN_REWARD_ARMOR = 258795.15946875;
export let DREADREAPER_REWARD_ARMOR = 761721.0283125;
export let VOLTWARDEN_REWARD_ARMOR = 2174357.6364375;
export let GRAVEBLOOM_REWARD_ARMOR = 6334444.569375;
export let AEGIS_PRIME_REWARD_ARMOR = 19503303.43640625;
export let PRISMSHELL_REWARD_REGEN = 47318.916150000005;
export let IRONHORN_REWARD_REGEN = 138024.08505;
export let DREADREAPER_REWARD_REGEN = 406251.21510000003;
export let VOLTWARDEN_REWARD_REGEN = 1159657.4061;
export let GRAVEBLOOM_REWARD_REGEN = 3378370.437;
export let AEGIS_PRIME_REWARD_REGEN = 10401761.83275;

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
  first_steps: "First Steps", home_exterior: "Base",
  ...Object.fromEntries(CAMPAIGN_MAPS.map((map, index) => [map.id, `${map.displayName.replace(/ - \d+$/, "")} - ${index + 1}`])),
};
export const MAP_IDS: readonly string[] = CAMPAIGN_MAPS.map(map => map.id);

/** Keep authored/custom map names and their progression suffix consistent. */
export function numberedMapName(mapId: string, name: string) {
  const index = MAP_IDS.indexOf(mapId);
  return index < 0 ? name : `${name.replace(/ - \d+$/, "")} - ${index + 1}`;
}

export const PROTOCOL_VERSION = 107;
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
  if (values.DRAGON_MAX_HP !== undefined) DRAGON_MAX_HP = values.DRAGON_MAX_HP;
  if (values.SPIDER_MAX_HP !== undefined) SPIDER_MAX_HP = values.SPIDER_MAX_HP;
  if (values.FROSTCLAW_MAX_HP !== undefined) FROSTCLAW_MAX_HP = values.FROSTCLAW_MAX_HP;
  if (values.MAGMALISK_MAX_HP !== undefined) MAGMALISK_MAX_HP = values.MAGMALISK_MAX_HP;
  if (values.GLOOMROOT_MAX_HP !== undefined) GLOOMROOT_MAX_HP = values.GLOOMROOT_MAX_HP;
  if (values.TIDEWYRM_MAX_HP !== undefined) TIDEWYRM_MAX_HP = values.TIDEWYRM_MAX_HP;
  if (values.KOI_SHOGUN_MAX_HP !== undefined) KOI_SHOGUN_MAX_HP = values.KOI_SHOGUN_MAX_HP;
  if (values.TEMPEST_KIRIN_MAX_HP !== undefined) TEMPEST_KIRIN_MAX_HP = values.TEMPEST_KIRIN_MAX_HP;
  if (values.MIREMAW_MAX_HP !== undefined) MIREMAW_MAX_HP = values.MIREMAW_MAX_HP;
  if (values.PRISMSHELL_MAX_HP !== undefined) PRISMSHELL_MAX_HP = values.PRISMSHELL_MAX_HP;
  if (values.IRONHORN_MAX_HP !== undefined) IRONHORN_MAX_HP = values.IRONHORN_MAX_HP;
  if (values.DREADREAPER_MAX_HP !== undefined) DREADREAPER_MAX_HP = values.DREADREAPER_MAX_HP;
  if (values.VOLTWARDEN_MAX_HP !== undefined) VOLTWARDEN_MAX_HP = values.VOLTWARDEN_MAX_HP;
  if (values.GRAVEBLOOM_MAX_HP !== undefined) GRAVEBLOOM_MAX_HP = values.GRAVEBLOOM_MAX_HP;
  if (values.AEGIS_PRIME_MAX_HP !== undefined) AEGIS_PRIME_MAX_HP = values.AEGIS_PRIME_MAX_HP;
  if (values.DRAGON_REWARD_DAMAGE !== undefined) DRAGON_REWARD_DAMAGE = values.DRAGON_REWARD_DAMAGE;
  if (values.SPIDER_REWARD_DAMAGE !== undefined) SPIDER_REWARD_DAMAGE = values.SPIDER_REWARD_DAMAGE;
  if (values.SPIDER_REWARD_HEALTH !== undefined) SPIDER_REWARD_HEALTH = values.SPIDER_REWARD_HEALTH;
  if (values.FROSTCLAW_REWARD_DAMAGE !== undefined) FROSTCLAW_REWARD_DAMAGE = values.FROSTCLAW_REWARD_DAMAGE;
  if (values.FROSTCLAW_REWARD_HEALTH !== undefined) FROSTCLAW_REWARD_HEALTH = values.FROSTCLAW_REWARD_HEALTH;
  if (values.FROSTCLAW_REWARD_ARMOR !== undefined) FROSTCLAW_REWARD_ARMOR = values.FROSTCLAW_REWARD_ARMOR;
  if (values.MAGMALISK_REWARD_DAMAGE !== undefined) MAGMALISK_REWARD_DAMAGE = values.MAGMALISK_REWARD_DAMAGE;
  if (values.MAGMALISK_REWARD_HEALTH !== undefined) MAGMALISK_REWARD_HEALTH = values.MAGMALISK_REWARD_HEALTH;
  if (values.MAGMALISK_REWARD_ARMOR !== undefined) MAGMALISK_REWARD_ARMOR = values.MAGMALISK_REWARD_ARMOR;
  if (values.MAGMALISK_REWARD_REGEN !== undefined) MAGMALISK_REWARD_REGEN = values.MAGMALISK_REWARD_REGEN;
  if (values.GLOOMROOT_REWARD_DAMAGE !== undefined) GLOOMROOT_REWARD_DAMAGE = values.GLOOMROOT_REWARD_DAMAGE;
  if (values.GLOOMROOT_REWARD_HEALTH !== undefined) GLOOMROOT_REWARD_HEALTH = values.GLOOMROOT_REWARD_HEALTH;
  if (values.GLOOMROOT_REWARD_ARMOR !== undefined) GLOOMROOT_REWARD_ARMOR = values.GLOOMROOT_REWARD_ARMOR;
  if (values.GLOOMROOT_REWARD_REGEN !== undefined) GLOOMROOT_REWARD_REGEN = values.GLOOMROOT_REWARD_REGEN;
  if (values.TIDEWYRM_REWARD_DAMAGE !== undefined) TIDEWYRM_REWARD_DAMAGE = values.TIDEWYRM_REWARD_DAMAGE;
  if (values.TIDEWYRM_REWARD_HEALTH !== undefined) TIDEWYRM_REWARD_HEALTH = values.TIDEWYRM_REWARD_HEALTH;
  if (values.TIDEWYRM_REWARD_ARMOR !== undefined) TIDEWYRM_REWARD_ARMOR = values.TIDEWYRM_REWARD_ARMOR;
  if (values.TIDEWYRM_REWARD_REGEN !== undefined) TIDEWYRM_REWARD_REGEN = values.TIDEWYRM_REWARD_REGEN;
  if (values.KOI_SHOGUN_REWARD_DAMAGE !== undefined) KOI_SHOGUN_REWARD_DAMAGE = values.KOI_SHOGUN_REWARD_DAMAGE;
  if (values.KOI_SHOGUN_REWARD_HEALTH !== undefined) KOI_SHOGUN_REWARD_HEALTH = values.KOI_SHOGUN_REWARD_HEALTH;
  if (values.KOI_SHOGUN_REWARD_ARMOR !== undefined) KOI_SHOGUN_REWARD_ARMOR = values.KOI_SHOGUN_REWARD_ARMOR;
  if (values.KOI_SHOGUN_REWARD_REGEN !== undefined) KOI_SHOGUN_REWARD_REGEN = values.KOI_SHOGUN_REWARD_REGEN;
  if (values.TEMPEST_KIRIN_REWARD_DAMAGE !== undefined) TEMPEST_KIRIN_REWARD_DAMAGE = values.TEMPEST_KIRIN_REWARD_DAMAGE;
  if (values.TEMPEST_KIRIN_REWARD_HEALTH !== undefined) TEMPEST_KIRIN_REWARD_HEALTH = values.TEMPEST_KIRIN_REWARD_HEALTH;
  if (values.TEMPEST_KIRIN_REWARD_ARMOR !== undefined) TEMPEST_KIRIN_REWARD_ARMOR = values.TEMPEST_KIRIN_REWARD_ARMOR;
  if (values.TEMPEST_KIRIN_REWARD_REGEN !== undefined) TEMPEST_KIRIN_REWARD_REGEN = values.TEMPEST_KIRIN_REWARD_REGEN;
  if (values.MIREMAW_REWARD_DAMAGE !== undefined) MIREMAW_REWARD_DAMAGE = values.MIREMAW_REWARD_DAMAGE;
  if (values.MIREMAW_REWARD_HEALTH !== undefined) MIREMAW_REWARD_HEALTH = values.MIREMAW_REWARD_HEALTH;
  if (values.MIREMAW_REWARD_ARMOR !== undefined) MIREMAW_REWARD_ARMOR = values.MIREMAW_REWARD_ARMOR;
  if (values.MIREMAW_REWARD_REGEN !== undefined) MIREMAW_REWARD_REGEN = values.MIREMAW_REWARD_REGEN;
  if (values.PRISMSHELL_REWARD_DAMAGE !== undefined) PRISMSHELL_REWARD_DAMAGE = values.PRISMSHELL_REWARD_DAMAGE;
  if (values.IRONHORN_REWARD_DAMAGE !== undefined) IRONHORN_REWARD_DAMAGE = values.IRONHORN_REWARD_DAMAGE;
  if (values.DREADREAPER_REWARD_DAMAGE !== undefined) DREADREAPER_REWARD_DAMAGE = values.DREADREAPER_REWARD_DAMAGE;
  if (values.VOLTWARDEN_REWARD_DAMAGE !== undefined) VOLTWARDEN_REWARD_DAMAGE = values.VOLTWARDEN_REWARD_DAMAGE;
  if (values.GRAVEBLOOM_REWARD_DAMAGE !== undefined) GRAVEBLOOM_REWARD_DAMAGE = values.GRAVEBLOOM_REWARD_DAMAGE;
  if (values.AEGIS_PRIME_REWARD_DAMAGE !== undefined) AEGIS_PRIME_REWARD_DAMAGE = values.AEGIS_PRIME_REWARD_DAMAGE;
  if (values.PRISMSHELL_REWARD_HEALTH !== undefined) PRISMSHELL_REWARD_HEALTH = values.PRISMSHELL_REWARD_HEALTH;
  if (values.IRONHORN_REWARD_HEALTH !== undefined) IRONHORN_REWARD_HEALTH = values.IRONHORN_REWARD_HEALTH;
  if (values.DREADREAPER_REWARD_HEALTH !== undefined) DREADREAPER_REWARD_HEALTH = values.DREADREAPER_REWARD_HEALTH;
  if (values.VOLTWARDEN_REWARD_HEALTH !== undefined) VOLTWARDEN_REWARD_HEALTH = values.VOLTWARDEN_REWARD_HEALTH;
  if (values.GRAVEBLOOM_REWARD_HEALTH !== undefined) GRAVEBLOOM_REWARD_HEALTH = values.GRAVEBLOOM_REWARD_HEALTH;
  if (values.AEGIS_PRIME_REWARD_HEALTH !== undefined) AEGIS_PRIME_REWARD_HEALTH = values.AEGIS_PRIME_REWARD_HEALTH;
  if (values.PRISMSHELL_REWARD_ARMOR !== undefined) PRISMSHELL_REWARD_ARMOR = values.PRISMSHELL_REWARD_ARMOR;
  if (values.IRONHORN_REWARD_ARMOR !== undefined) IRONHORN_REWARD_ARMOR = values.IRONHORN_REWARD_ARMOR;
  if (values.DREADREAPER_REWARD_ARMOR !== undefined) DREADREAPER_REWARD_ARMOR = values.DREADREAPER_REWARD_ARMOR;
  if (values.VOLTWARDEN_REWARD_ARMOR !== undefined) VOLTWARDEN_REWARD_ARMOR = values.VOLTWARDEN_REWARD_ARMOR;
  if (values.GRAVEBLOOM_REWARD_ARMOR !== undefined) GRAVEBLOOM_REWARD_ARMOR = values.GRAVEBLOOM_REWARD_ARMOR;
  if (values.AEGIS_PRIME_REWARD_ARMOR !== undefined) AEGIS_PRIME_REWARD_ARMOR = values.AEGIS_PRIME_REWARD_ARMOR;
  if (values.PRISMSHELL_REWARD_REGEN !== undefined) PRISMSHELL_REWARD_REGEN = values.PRISMSHELL_REWARD_REGEN;
  if (values.IRONHORN_REWARD_REGEN !== undefined) IRONHORN_REWARD_REGEN = values.IRONHORN_REWARD_REGEN;
  if (values.DREADREAPER_REWARD_REGEN !== undefined) DREADREAPER_REWARD_REGEN = values.DREADREAPER_REWARD_REGEN;
  if (values.VOLTWARDEN_REWARD_REGEN !== undefined) VOLTWARDEN_REWARD_REGEN = values.VOLTWARDEN_REWARD_REGEN;
  if (values.GRAVEBLOOM_REWARD_REGEN !== undefined) GRAVEBLOOM_REWARD_REGEN = values.GRAVEBLOOM_REWARD_REGEN;
  if (values.AEGIS_PRIME_REWARD_REGEN !== undefined) AEGIS_PRIME_REWARD_REGEN = values.AEGIS_PRIME_REWARD_REGEN;
}
