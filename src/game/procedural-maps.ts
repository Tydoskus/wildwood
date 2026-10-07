import { runtimeMapBalance } from "../../shared/map-balance-runtime";
import {
  PROCEDURAL_FIRST_TIER,
  generateMap,
  generatedEnemyStats,
  isProceduralMap,
  mapRandom,
  type ProceduralMapId,
} from "../../shared/procedural-maps";
import { campaignMeleeChaseSpeed } from "../../shared/enemy-definitions";
import { isGuildHallMap } from "../../shared/guild-hall";
import { ENEMY_TYPES, type EnemyKind } from "./enemies";
import type { SpawnSite, SpawnCamp, WorldDecor } from "./world";
import { isNearRegionSpawns, regionSpawnPoints } from "./region-scatter";

export { GENERATED_ENEMY_ART, generatedEnemyArt } from "../../shared/procedural-enemy-art";
import { GENERATED_ENEMY_MAX_RADIUS, generatedEnemyArt } from "../../shared/procedural-enemy-art";
export function generatedMapContent(id: ProceduralMapId) {
  const map = generateMap(id);
  const random = mapRandom(map.seed ^ 0x34ac913);
  const kind = generatedEnemyArt(id);
  const kinds = [kind];
  const camps: SpawnCamp[] = map.camps.map(camp => ({ ...camp, types: kinds }));
  const sites: SpawnSite[] = [];
  for (let i = 0; i < map.camps.length; i++) {
    const camp = map.camps[i];
    // Anywhere in the region, like the campaign; site order and counts per
    // camp are what the server's site:N kill ids rely on, and they are unchanged.
    const points = regionSpawnPoints(camps[i]);
    for (let j = 0; j < camp.count; j++) {
      const elite = camp.stat === "damage" && j >= 6;
      sites.push({
        id: sites.length,
        x: points[j].x,
        y: points[j].y,
        type: kind,
        campName: camp.name,
        leashRange: 600,
        alive: false,
        respawnAt: 0,
        definition: {
          ...ENEMY_TYPES[kind],
          ...generatedEnemyStats(map, elite ? "Dread Warden" : camp.lane),
          r: Math.min(GENERATED_ENEMY_MAX_RADIUS, ENEMY_TYPES[kind].r),
          speed: runtimeMapBalance(id)?.enemies[kind]?.speed ?? campaignMeleeChaseSpeed(PROCEDURAL_FIRST_TIER),
          elite: false,
        },
      });
    }
  }
  const decor: WorldDecor[] = [];
  for (let i = 0; i < 280; i++) {
    const x = 80 + random() * 4640,
      y = 80 + random() * 4640;
    if (
      Math.hypot(x - map.arrival.x, y - map.arrival.y) < 400 ||
      Math.hypot(x - map.boss.x, y - map.boss.y) < 750
    )
      continue;
    if (isNearRegionSpawns(camps, x, y, 150))
      continue;
    if (
      map.paths.some(
        (p) =>
          x > p.x - 100 &&
          x < p.x + p.w + 100 &&
          y > p.y - 100 &&
          y < p.y + p.h + 100,
      )
    )
      continue;
    decor.push({
      type: i % 4 === 0 ? "rock" : "grass",
      x,
      y,
      s: 0.8 + random() * 0.6,
      variant: i % 3,
    });
  }
  return { map, camps, sites, decor, kinds };
}
/**
 * Lazy extension point for existing map-keyed consumers; bounded cache for long sessions. Every guild's hall
 * (guild_hall_<id>) is one map to these consumers: `hall`'s entry, when one is given.
 */
export function withGeneratedMaps<T>(
  authored: object,
  generate: (id: ProceduralMapId) => T,
  hall?: T,
): Record<string, T> {
  const cache = new Map<string, T>();
  return new Proxy(authored as Record<string, T>, {
    get(target, key, receiver) {
      if (hall !== undefined && isGuildHallMap(key)) return hall;
      if (typeof key !== "string" || !isProceduralMap(key))
        return Reflect.get(target, key, receiver);
      const cacheKey = `${key}:${runtimeMapBalance(key)?.revision ?? "authored"}`;
      if (!cache.has(cacheKey)) {
        if (cache.size >= 8) cache.delete(cache.keys().next().value!);
        cache.set(cacheKey, generate(key));
      }
      return cache.get(cacheKey);
    },
    has(target, key) {
      return (
        (typeof key === "string" && isProceduralMap(key)) || (hall !== undefined && isGuildHallMap(key)) ||
        Reflect.has(target, key)
      );
    },
  });
}

/** One species per map; camps supply stats independently of that species' original role. */
export function generatedBossArt(id: ProceduralMapId): EnemyKind {
  return generatedEnemyArt(id);
}
