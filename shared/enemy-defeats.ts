import type { MapBalanceSnapshot } from "./map-balance-types";
import { personalBossDefinition } from "./personal-bosses";
import { ENEMY_TYPES, type EnemyKind } from "./enemy-definitions";
import * as camps from "./enemy-camps";
import designs from "../src/game/map-designs.json";
import { generateMap, generatedEnemyStats, isProceduralMap } from "./procedural-maps";
import { MAX_ARMOR, MAX_PLAYER_STAT, MIN_ATTACK_INTERVAL, REGULAR_KILL_REPORT_SECONDS, REWARDED_REGULAR_ENEMY_RESPAWN_SECONDS } from "./rules";

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
function generatedDefinition(mapId: `endless_${number}`) {
  let map = generatedMaps.get(mapId);
  if (!map) {
    if (generatedMaps.size >= 8) generatedMaps.delete(generatedMaps.keys().next().value!);
    map = generateMap(mapId); generatedMaps.set(mapId, map);
  }
  return map;
}
export function enemyDefeatDefinition(mapId: string, enemy: string, balance?: MapBalanceSnapshot) {
  if (enemy === "boss") return personalBossDefinition(mapId) ? { reward: { type: "boss", amount: 0 }, hp: 0, population: 1, loot: false } : null;
  if (isProceduralMap(mapId)) {
    // Generated art is cosmetic. A stable spawn index identifies its actual reward lane.
    if (!/^site:\d+$/.test(enemy)) return null;
    let site = Number(enemy.slice(5));
    const map = generatedDefinition(mapId);
    for (const camp of map.camps) {
      if (site < camp.count) {
        const lane = camp.stat === "damage" && site >= 6 ? "Dread Warden" : camp.lane;
        const stats = balance?.lanes[lane] ?? generatedEnemyStats(map, lane);
        return { reward: stats.reward, hp: stats.hp, population: 1, loot: true };
      }
      site -= camp.count;
    }
    return null;
  }
  const fallback = CAMPS[mapId];
  if (!fallback || !Object.prototype.hasOwnProperty.call(ENEMY_TYPES, enemy)) return null;
  const saved = (designs.maps as Record<string, { status: string; spawnCamps: camps.SpawnCamp[] }>)[mapId];
  const rows = saved?.status === "live" && saved.spawnCamps.length ? saved.spawnCamps : fallback;
  // Shuffling changes positions, never the number of each species.
  const population = rows.reduce((sum, camp) => sum + Array.from({ length: camp.count }, (_, i) => camp.types[i % camp.types.length]).filter(type => type === enemy).length, 0);
  if (!population) return null;
  const definition = balance?.enemies[enemy] ?? ENEMY_TYPES[enemy as EnemyKind];
  return { reward: definition.reward, hp: definition.hp, population, loot: !(mapId === "beginner_desert" && definition.elite) };
}
export function combatMap(mapId: string) { return Object.prototype.hasOwnProperty.call(CAMPS, mapId) || isProceduralMap(mapId); }

/**
 * Nobody can kill a species faster than it comes back, and the fastest it
 * comes back is the ad-boosted respawn. A whole map is thirty enemies, so this
 * ceiling is three kills a second against a lap that really takes about
 * twenty-eight: room for a fast player, and nowhere near enough for a script.
 *
 * This is the bound that matters. It holds however fast a client claims to
 * move or hit, which is why movement checks can stay loose enough never to
 * trouble an honest player.
 */
export const DEFEAT_MIN_RESPAWN_SECONDS = REWARDED_REGULAR_ENEMY_RESPAWN_SECONDS;
/**
 * The ceiling basis for a map whose respawn has been tuned. The rewarded ad
 * halves the wait, and that is the fastest a camp can legitimately come back.
 * Every player carrying a pinned balance snapshot resolves through here, so it
 * has to agree with DEFEAT_MIN_RESPAWN_SECONDS or the ceiling only applies to
 * the handful of accounts without one.
 */
export function defeatMinRespawnSeconds(regularRespawnSeconds: number) {
  return Math.max(1e-6, regularRespawnSeconds) / 2;
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
export function applyEnemyRewards<T extends { damage: number; maxHp: number; attackRate: number; armor: number; regen: number }>(
  base: T, rewards: { type: string; amount: number; count: number }[], multiplier: number,
): T {
  const next = { ...base };
  for (const reward of rewards) {
    const amount = reward.amount * reward.count * multiplier;
    switch (reward.type) {
      case "damage": next.damage = Math.min(MAX_PLAYER_STAT, next.damage + amount); break;
      case "health": next.maxHp = Math.min(MAX_PLAYER_STAT, next.maxHp + amount); break;
      case "armor": next.armor = Math.min(MAX_ARMOR, next.armor + amount); break;
      case "regen": next.regen = Math.min(MAX_PLAYER_STAT, next.regen + amount); break;
      case "speed": next.attackRate = 1 / Math.min(1 / MIN_ATTACK_INTERVAL, 1 / next.attackRate + amount); break;
    }
  }
  return next;
}
