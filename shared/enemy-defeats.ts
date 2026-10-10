import { CAMPAIGN_MAPS } from "./campaign-registry";
import type { MapBalanceSnapshot } from "./map-balance-types";
import { ENEMY_TYPES, type EnemyKind } from "./enemy-definitions";
import * as camps from "./enemy-camps";
import designs from "./map-designs.json";
import { endlessSiteLane, generateMap, generatedEnemyStats, isProceduralMap } from "./procedural-maps";
import { isSoulMap, soulRewardType, soulStatFromEnemyId, SOUL_POPULATION, SOUL_STAT_DETAILS, SOUL_STAT_ORDER } from "./soul-dimension";
import { MAX_ARMOR, MAX_PLAYER_STAT, MIN_ATTACK_INTERVAL, REGULAR_ENEMY_RESPAWN_SECONDS, REGULAR_KILL_REPORT_SECONDS } from "./rules";
import { addAttackSpeedRating, cleanRating, type AttackCapArg } from "./stat-rating";

export type EnemyDefeat = { enemy: string; count: number };
export const ENEMY_DEFEAT_BATCH_MAX = 100;
/**
 * How much unclaimed allowance a player can bank. This stays generous on
 * purpose: a bank smaller than one report clips honest players, and a report
 * can carry a hundred kills after a dropped socket or a tab left hidden. It is
 * not the anti-script lever either way, because a single report can never
 * claim more than ENEMY_DEFEAT_BATCH_MAX. The sustained ceiling below is what
 * bounds a script, and that is the number worth tuning.
 */
export const DEFEAT_BUDGET_WINDOW_SECONDS = 300;
/**
 * How far a client's game simulation may run ahead of the server's clock
 * before its kills are scaled back to the real-time share. An honest client
 * cannot run ahead at all (its fixed-step loop is capped per frame and per
 * background wake), so this is only slack for network jitter and a backlog
 * delivered late. Late is the case that sets it: a report sealed just before
 * an outage arrives after it and tops the bank up to the cap, and the report
 * behind it, carrying the whole outage's play, arrives a moment later with
 * nothing but the bank to cover it. So up to ten minutes of play that could
 * not be reported is paid in full, and beyond that it is paid at the
 * real-time share; a disconnect the client notices pauses play, so this
 * needs reports refused while the game keeps running. A cheater gets the same
 * ten minutes once per ten minutes away.
 */
export const SIM_CLOCK_BANK_SECONDS = 2 * DEFEAT_BUDGET_WINDOW_SECONDS;
const CAMPS: Record<string, readonly camps.SpawnCamp[]> = {
  tutorial_forest: camps.CAMPS, beginner_desert: camps.DESERT_CAMPS,
  intermediate_snowlands: camps.SNOW_CAMPS, advanced_lava_wastes: camps.LAVA_CAMPS,
  infernal_depths: camps.INFERNAL_CAMPS, water_reach: camps.WATER_CAMPS,
  samurai_garden: camps.SAMURAI_CAMPS, cloudspire: camps.CLOUDSPIRE_CAMPS,
  moonfen: camps.MOONFEN_CAMPS, crystal_hollows: camps.CRYSTAL_HOLLOWS_CAMPS,
  clockwork_ruins: camps.CLOCKWORK_RUINS_CAMPS, duskfall_orchard: camps.DUSKFALL_ORCHARD_CAMPS,
  neon_bastion: camps.NEON_BASTION_CAMPS, verdant_catacombs: camps.VERDANT_CATACOMBS_CAMPS,
  ion_citadel: camps.ION_CITADEL_CAMPS,
};
const generatedMaps = new Map<string, ReturnType<typeof generateMap>>();
const campaignPopulations = new Map<string, Map<string, number>>();
function campaignPopulation(mapId: string) {
  let populations = campaignPopulations.get(mapId);
  if (populations) return populations;
  const saved = (designs.maps as Record<string, { status: string; spawnCamps: camps.SpawnCamp[] }>)[mapId];
  const rows = saved?.status === "live" && saved.spawnCamps.length ? saved.spawnCamps : CAMPS[mapId];
  if (!rows) return null;
  populations = new Map();
  for (const camp of rows) for (let i = 0; i < camp.count; i++) {
    const kind = camp.types[i % camp.types.length];
    populations.set(kind, (populations.get(kind) ?? 0) + 1);
  }
  campaignPopulations.set(mapId, populations);
  return populations;
}
function generatedDefinition(mapId: `endless_${number}`) {
  let map = generatedMaps.get(mapId);
  if (!map) {
    if (generatedMaps.size >= 8) generatedMaps.delete(generatedMaps.keys().next().value!);
    map = generateMap(mapId); generatedMaps.set(mapId, map);
  }
  return map;
}
export function enemyDefeatDefinition(mapId: string, enemy: string, balance?: MapBalanceSnapshot) {
  if (isSoulMap(mapId)) {
    // Each player's soul enemies are built at their own strength, so health is
    // left for the kill bound to set from the player's damage (soulEnemyBoundHp).
    const stat = soulStatFromEnemyId(enemy);
    return stat ? { reward: { type: soulRewardType(stat), amount: SOUL_STAT_DETAILS[stat].reward }, hp: Number.NaN, population: SOUL_POPULATION, loot: false } : null;
  }
  // A compatibility marker for a gate, without constructing combat/geometry.
  if (enemy === "boss") return (isProceduralMap(mapId) || CAMPAIGN_MAPS.some(map => map.id === mapId))
    ? { reward: { type: "boss", amount: 0 }, hp: 0, population: 1, loot: false } : null;
  if (isProceduralMap(mapId)) {
    // Generated art is cosmetic. A stable spawn index identifies its actual reward lane.
    if (!/^site:\d+$/.test(enemy)) return null;
    let site = Number(enemy.slice(5));
    const map = generatedDefinition(mapId);
    for (const camp of map.camps) {
      if (site < camp.count) {
        const lane = endlessSiteLane(camp, site);
        const stats = balance?.lanes[lane] ?? generatedEnemyStats(map, lane);
        return { reward: stats.reward, hp: stats.hp, population: 1, loot: true };
      }
      site -= camp.count;
    }
    return null;
  }
  if (!Object.prototype.hasOwnProperty.call(ENEMY_TYPES, enemy)) return null;
  // Shuffling changes positions, never the number of each species.
  const population = campaignPopulation(mapId)?.get(enemy) ?? 0;
  if (!population) return null;
  const definition = balance?.enemies[enemy] ?? ENEMY_TYPES[enemy as EnemyKind];
  return { reward: definition.reward, hp: definition.hp, population, loot: !(mapId === "beginner_desert" && definition.elite) };
}
const mapPopulations = new Map<string, number>();
/**
 * Every claimable enemy on a map at once: all species of a campaign map, or
 * every spawn site of an Endless level. Divided into the respawn, this is how
 * many seconds of the account's combat clock one kill on the map is worth at
 * the least (see acceptEnemyDefeats). Cached: it depends on the map alone.
 */
export function mapEnemyPopulation(mapId: string) {
  let population = mapPopulations.get(mapId);
  if (population !== undefined) return population;
  if (isSoulMap(mapId)) population = SOUL_POPULATION * SOUL_STAT_ORDER.length;
  else if (isProceduralMap(mapId)) {
    population = generatedDefinition(mapId as `endless_${number}`).camps.reduce((sum, camp) => sum + camp.count, 0);
  } else {
    population = Object.keys(ENEMY_TYPES).reduce((sum, kind) => sum + (enemyDefeatDefinition(mapId, kind)?.population ?? 0), 0);
  }
  // Endless levels are unbounded in number; a player only visits a handful.
  if (mapPopulations.size >= 256) mapPopulations.clear();
  mapPopulations.set(mapId, population);
  return population;
}
export function combatMap(mapId: string) { return CAMPAIGN_MAPS.some(map => map.id === mapId) || isProceduralMap(mapId); }
/** Maps whose kills are reported: the combat maps and the Soul Dimension. */
export function killReportMap(mapId: string) { return combatMap(mapId) || isSoulMap(mapId); }

/**
 * Nobody can kill a species faster than it comes back, and the fastest it
 * comes back is the player's own respawn: the map's tuned one, less up to 2.5
 * seconds of research. A campaign map is thirty enemies (the forest has more), so this
 * ceiling is three kills a second against a lap that really takes about
 * twenty-eight: room for a fast player, and nowhere near enough for a script.
 *
 * This bound holds however fast a client claims to move or hit, which is why
 * movement checks can stay loose enough never to trouble an honest player. It
 * is per map, and each map's buckets refill while the player is elsewhere, so
 * the account's combat clock also charges every kill at least respawn /
 * mapEnemyPopulation seconds: hopping maps sustains one map's wall, no more.
 */
export const DEFEAT_MIN_RESPAWN_SECONDS = REGULAR_ENEMY_RESPAWN_SECONDS;
/**
 * The ceiling basis for a map whose respawn has been tuned, after research.
 * Until 0.807 the rewarded ad halved the wait and this halved it too; the ad
 * pays Gems now, so the tuned respawn is itself the fastest a camp can
 * legitimately come back. Every player carrying a pinned balance snapshot
 * resolves through here, so it has to agree with DEFEAT_MIN_RESPAWN_SECONDS or
 * the ceiling only applies to the handful of accounts without one.
 */
export function defeatMinRespawnSeconds(regularRespawnSeconds: number) {
  return Math.max(1e-6, regularRespawnSeconds);
}
export function defeatBudget(population: number, minRespawnSeconds = DEFEAT_MIN_RESPAWN_SECONDS) {
  const perSecond = population / minRespawnSeconds;
  return {
    capacity: population + perSecond * DEFEAT_BUDGET_WINDOW_SECONDS,
    /**
     * What the first sight of a species is worth: everything standing there
     * plus one report window of respawns. The full bank has to be earned by
     * staying, because the budget is keyed per map and a full bank on arrival
     * is farmable by hopping between maps. The boss clock has always worked
     * this way; regular enemies now match it.
     */
    initial: population + perSecond * REGULAR_KILL_REPORT_SECONDS,
    perSecond,
  };
}
/**
 * Kill rewards onto a run's stats. Attack speed and crit damage are ratings
 * (stat-rating.ts): speed adds to the rating behind the stored attack interval,
 * crit to `critRating`, which a caller that tracks it carries on `base`.
 */
export function applyEnemyRewards<T extends { damage: number; maxHp: number; attackRate: number; armor: number; regen: number; critRating?: number }>(
  base: T, rewards: { type: string; amount: number; count: number }[], multiplier: number, minAttackInterval: AttackCapArg = MIN_ATTACK_INTERVAL,
): T {
  const next = { ...base };
  for (const reward of rewards) {
    const amount = reward.amount * reward.count * multiplier;
    switch (reward.type) {
      case "damage": next.damage = Math.min(MAX_PLAYER_STAT, next.damage + amount); break;
      case "health": next.maxHp = Math.min(MAX_PLAYER_STAT, next.maxHp + amount); break;
      case "armor": next.armor = Math.min(MAX_ARMOR, next.armor + amount); break;
      case "regen": next.regen = Math.min(MAX_PLAYER_STAT, next.regen + amount); break;
      case "speed": next.attackRate = addAttackSpeedRating(next.attackRate, amount, minAttackInterval); break;
      case "crit": next.critRating = cleanRating((next.critRating ?? 0) + amount); break;
    }
  }
  return next;
}
