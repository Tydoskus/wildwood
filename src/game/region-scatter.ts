import { mapRandom } from "../../shared/procedural-maps";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../../shared/rules";

/** A camp's region: its enemies spawn anywhere inside this circle. */
export type SpawnRegion = {
  name: string; x: number; y: number; radius: number; count: number;
  /** Spots no enemy may spawn within `r` of (a map's arrival and portals): candidates there are passed over. */
  keepClear?: readonly { x: number; y: number; r: number }[];
};
export type RegionPoint = { x: number; y: number };

/** Sites stay this far inside the map, as they always have. */
export const REGION_SPAWN_EDGE = 45;
/** Candidates tried per enemy; the one farthest from its campmates is kept, so a region fills evenly. */
const SCATTER_CANDIDATES = 16;
/** Decor keeps this far from every spawn point, plus the caller's own padding. */
export const SPAWN_DECOR_CLEARANCE = 90;

function regionSeed(region: SpawnRegion) {
  let seed = 2_166_136_261;
  const key = `wildwood-region-v1:${region.name}:${region.x}:${region.y}:${region.radius}:${region.count}`;
  for (let index = 0; index < key.length; index += 1) seed = Math.imul(seed ^ key.charCodeAt(index), 16_777_619);
  return seed >>> 0;
}

const scattered = new WeakMap<SpawnRegion, readonly RegionPoint[]>();

/**
 * Where a region's enemies spawn: seeded from the region itself, so every
 * client, the decor around it and every reload agree. Each point is the best
 * of several uniform draws inside the circle (and inside the map), which
 * spreads a camp across its whole region without a formation's pattern.
 */
export function regionSpawnPoints(region: SpawnRegion, width = WORLD_WIDTH, height = WORLD_HEIGHT): readonly RegionPoint[] {
  const cached = scattered.get(region);
  if (cached) return cached;
  const random = mapRandom(regionSeed(region));
  const inside = (x: number, y: number) => x >= REGION_SPAWN_EDGE && x <= width - REGION_SPAWN_EDGE
    && y >= REGION_SPAWN_EDGE && y <= height - REGION_SPAWN_EDGE;
  const points: RegionPoint[] = [];
  for (let index = 0; index < region.count; index += 1) {
    let best: RegionPoint | null = null, bestGap = -1;
    for (let attempt = 0; attempt < SCATTER_CANDIDATES * 8 && (attempt < SCATTER_CANDIDATES || !best); attempt += 1) {
      const angle = random() * Math.PI * 2, distance = region.radius * Math.sqrt(random());
      const x = region.x + Math.cos(angle) * distance, y = region.y + Math.sin(angle) * distance;
      if (!inside(x, y) || region.keepClear?.some(spot => Math.hypot(spot.x - x, spot.y - y) < spot.r)) continue;
      const gap = points.reduce((nearest, point) => Math.min(nearest, Math.hypot(point.x - x, point.y - y)), Infinity);
      if (gap > bestGap) { best = { x, y }; bestGap = gap; }
    }
    points.push(best ?? {
      x: Math.min(width - REGION_SPAWN_EDGE, Math.max(REGION_SPAWN_EDGE, region.x)),
      y: Math.min(height - REGION_SPAWN_EDGE, Math.max(REGION_SPAWN_EDGE, region.y)),
    });
  }
  scattered.set(region, points);
  return points;
}

/** True when (x, y) is within `padding` of where any of these regions spawns an enemy. */
export function isNearRegionSpawns(regions: readonly SpawnRegion[], x: number, y: number, padding: number) {
  const reach = SPAWN_DECOR_CLEARANCE + padding;
  return regions.some(region => Math.hypot(x - region.x, y - region.y) < region.radius + reach
    && regionSpawnPoints(region).some(point => Math.hypot(point.x - x, point.y - y) < reach));
}
