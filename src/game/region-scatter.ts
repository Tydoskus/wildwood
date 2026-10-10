import { mapRandom } from "../../shared/procedural-maps";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../../shared/rules";

/** A camp's region: its enemies spawn anywhere inside this circle. */
export type SpawnRegion = {
  name: string; x: number; y: number; radius: number; count: number;
  /** Spots no enemy may spawn within `r` of (a map's arrival and portals): candidates there are passed over. */
  keepClear?: readonly { x: number; y: number; r: number }[];
  /** Laid out evenly this far apart (evenCampSpacing), not scattered: `radius` is then the layout's own. */
  spacing?: number;
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

/** A sunflower spiral: point i at sqrt(i + .5) steps out, turned by the golden angle. Its closest pair is 1.55 steps apart. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const SPIRAL_CLOSEST = 1.55;
/** How far out an even camp of `count` reaches at `spacing`: its outermost point. */
export const evenCampRadius = (count: number, spacing: number) => spacing / SPIRAL_CLOSEST * Math.sqrt(Math.max(1, count) - .5);
/** Even camps keep this far apart, and this far between their enemies at most and at least (Ryan: as spread as can be, all equal). */
export const EVEN_CAMP_GAP = 120;
export const EVEN_SPACING_MAX = 340;
export const EVEN_SPACING_MIN = 150;

/**
 * One spacing for a whole map's camps: the widest at which no two camps' layouts come within EVEN_CAMP_GAP
 * of each other, so every enemy on the map sits the same distance from its campmates. Each camp's radius
 * becomes its layout's.
 */
export function evenCampSpacing<T extends SpawnRegion>(camps: readonly T[]): T[] {
  let spacing = EVEN_SPACING_MAX;
  for (let a = 0; a < camps.length; a++) for (let b = a + 1; b < camps.length; b++) {
    const room = Math.hypot(camps[a].x - camps[b].x, camps[a].y - camps[b].y) - EVEN_CAMP_GAP;
    const reach = (Math.sqrt(Math.max(1, camps[a].count) - .5) + Math.sqrt(Math.max(1, camps[b].count) - .5)) / SPIRAL_CLOSEST;
    spacing = Math.min(spacing, room / reach);
  }
  spacing = Math.max(EVEN_SPACING_MIN, spacing);
  return camps.map(camp => ({ ...camp, spacing, radius: evenCampRadius(camp.count, spacing) }));
}

/** An even camp: the spiral from its centre, skipping spots off the map or kept clear, so a blocked camp grows round them, never tighter. */
function evenPoints(region: SpawnRegion & { spacing: number }, inside: (x: number, y: number) => boolean) {
  const step = region.spacing / SPIRAL_CLOSEST, turn = mapRandom(regionSeed(region))() * Math.PI * 2;
  const points: RegionPoint[] = [];
  for (let index = 0; points.length < region.count && index < region.count * 40; index += 1) {
    const distance = step * Math.sqrt(index + .5), angle = turn + index * GOLDEN_ANGLE;
    const x = region.x + Math.cos(angle) * distance, y = region.y + Math.sin(angle) * distance;
    if (!inside(x, y) || region.keepClear?.some(spot => Math.hypot(spot.x - x, spot.y - y) < spot.r)) continue;
    // A skipped spot can leave the next one close to an earlier point: keep the camp's own spacing.
    if (points.some(point => Math.hypot(point.x - x, point.y - y) < region.spacing * .9)) continue;
    points.push({ x, y });
  }
  return points;
}

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
  if (region.spacing) {
    const even = evenPoints(region as SpawnRegion & { spacing: number }, inside);
    if (even.length === region.count) { scattered.set(region, even); return even; }
  }
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
