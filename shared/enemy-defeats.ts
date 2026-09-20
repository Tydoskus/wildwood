import type { MapBalanceSnapshot } from "./map-balance-types";
import { personalBossDefinition } from "./personal-bosses";
import { ENEMY_TYPES, type EnemyKind } from "./enemy-definitions";
import * as camps from "./enemy-camps";
import designs from "../src/game/map-designs.json";
import { generateMap, generatedEnemyStats, isProceduralMap } from "./procedural-maps";
import { MAX_ARMOR, MAX_PLAYER_STAT, MIN_ATTACK_INTERVAL, REGULAR_KILL_REPORT_SECONDS } from "./rules";

export type EnemyDefeat = { enemy: string; count: number };
export const ENEMY_DEFEAT_BATCH_MAX = 100;
/**
 * How much unclaimed allowance a player can bank: one client report. The
 * client sends regular kills every `REGULAR_KILL_REPORT_SECONDS`, so a smaller
 * bank clips honest players (seen locally at sixty seconds: a five-minute
 * report paid at a fifth). Autofarm stops when the socket drops, so there is
 * no longer backlog to honour, and banking more only lets a script claim more
 * than one report could hold.
 */
export const DEFEAT_BUDGET_WINDOW_SECONDS = REGULAR_KILL_REPORT_SECONDS;
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

// Each species can clear its entire population immediately. Five minutes of
// capacity tolerate periodic save batches. Refill allows the fastest rewarded
// respawn plus the local test multiplier (10 / 3 seconds), never a ban.
export const DEFEAT_MIN_RESPAWN_SECONDS = 10 / 3;
export function defeatBudget(population: number, minRespawnSeconds = DEFEAT_MIN_RESPAWN_SECONDS) {
  const perSecond = population / minRespawnSeconds;
  return { capacity: population + perSecond * DEFEAT_BUDGET_WINDOW_SECONDS, perSecond };
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
