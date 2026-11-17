import { TOWN_CENTER, TOWN_EXCHANGE_ROAD, TOWN_EXCHANGE_ROAD_JOIN, TOWN_EAST_BRIDGE, TOWN_EAST_BRIDGE_APPROACHES, TOWN_EAST_FENCE_GAP, TOWN_EAST_FENCE_GAP_OUTSIDE, TOWN_INTERIORS, TOWN_WEST_BRIDGE } from "../../shared/town";
import { MINING_TRACK_HALF_WIDTH, miningTrackDistanceSquared } from "../../shared/mining";
import atlas from "./soul-atlas.json";
import scene from "./town-village-scene.json";
import type { WorldDecor } from "./world";

/**
 * The Town's village: ForestVillage's own demo village, baked from the pack's
 * scene by scripts/art/bake-forest-village-scene.mjs (its ground, every house,
 * tree, fence and prop where the pack put them), centred on its fountain. The
 * countryside around it uses soul-atlas.json. The art files carry Soul Dimension
 * names (soul-dimension/village-*.webp).
 */
export type SoulFrame = keyof typeof atlas.frames;
export const SOUL_ATLAS = atlas;
export const TOWN_VILLAGE_SCENE = scene;
export const TOWN_VILLAGE_PROPS_SOURCE = "assets/wildstat/soul-dimension/village-props.webp";
export const TOWN_VILLAGE_GROUND_SOURCE = "assets/wildstat/soul-dimension/village-ground.webp";
export const SOUL_INTERIORS_SOURCE = "assets/wildstat/soul-dimension/village-interiors.webp";

/** Where the scene's own origin lands in the world: the fountain on the Town's centre. */
const originX = TOWN_CENTER.x - scene.fountain[0], originY = TOWN_CENTER.y - scene.fountain[1];

/** The ground image's rectangle in world units. */
export const TOWN_VILLAGE_GROUND = Object.freeze({
  x: originX + scene.ground.left, y: originY + scene.ground.top, w: scene.ground.width, h: scene.ground.height,
});

/** Every village prop as world decor: drawn at its own point, sorted by its group's depth. */
const animations = scene.animations as Record<string, { frames?: number[]; times?: number[]; length?: number; spin?: number } | undefined>;
/**
 * Inside the gap cut in the fence east of the Inn (TOWN_EAST_FENCE_GAP): nothing stands or blocks there. Just
 * outside it (TOWN_EAST_FENCE_GAP_OUTSIDE), and on the way up to the east bridge and off it, nothing stands
 * either, shadows and all: the trees that grew there hid whoever walked the track. Nothing grows on the track.
 */
type Area = { left: number; right: number; top: number; bottom: number };
const inside = (area: Area, x: number, y: number) => x > area.left && x < area.right && y > area.top && y < area.bottom;
const CLEARINGS: readonly Area[] = [TOWN_EAST_FENCE_GAP_OUTSIDE, ...TOWN_EAST_BRIDGE_APPROACHES];
const CLEARED: readonly Area[] = [TOWN_EAST_FENCE_GAP, ...CLEARINGS];
const TRACK_REACH = MINING_TRACK_HALF_WIDTH + 10;
const onTrack = (x: number, y: number) => miningTrackDistanceSquared(x, y, TRACK_REACH) < TRACK_REACH * TRACK_REACH;
/** The road to the Trade Chrysanthemum where it leaves the village's own: nothing lies on it. */
const onMarketBranch = (x: number, y: number) => x > TOWN_EXCHANGE_ROAD_JOIN && TOWN_EXCHANGE_ROAD.some(road => x > road.x - 10 && x < road.x + road.w + 10 && y > road.y - 10 && y < road.y + road.h + 10);
/**
 * The east bridge (TOWN_EAST_BRIDGE): the deck of the village's own west bridge, its two halves, over the river.
 * The water under it is open ground, and its railings, out to the water, hold the walk between them.
 */
const DECK = { left: TOWN_EAST_BRIDGE.x - TOWN_EAST_BRIDGE.halfWidth, right: TOWN_EAST_BRIDGE.x + TOWN_EAST_BRIDGE.halfWidth,
  top: TOWN_EAST_BRIDGE.y - TOWN_EAST_BRIDGE.halfHeight, bottom: TOWN_EAST_BRIDGE.y + TOWN_EAST_BRIDGE.halfHeight };
const EAST_BRIDGE_DECK: readonly WorldDecor[] = ([["168", -77], ["169", 77]] as const).map(([frame, dx]): WorldDecor => ({
  type: "soulProp", sheet: "village", frame, s: 1, x: TOWN_EAST_BRIDGE.x + dx, y: TOWN_EAST_BRIDGE.y, dy: 0, ground: true, shadow: false,
}));
/** A railing filled from its rail out to the water, end posts and all, so no one walks along on top of it. */
const railing = (at: { x: number; y: number }, left: number, right: number, from: number, to: number) =>
  solid([left, from, right, from, right, to, left, to], at.x, at.y);
/** The village's own stone bridge, west of the square, and its wooden one on the road to the Soul portal. */
const WEST_BRIDGE = TOWN_WEST_BRIDGE;
const SOUTH_BRIDGE = { x: TOWN_CENTER.x - 606, y: TOWN_CENTER.y + 1_224.5 };
const STONE_RAILINGS = (at: { x: number; y: number }) => [railing(at, -130, 130, -TOWN_EAST_BRIDGE.halfHeight, -34), railing(at, -130, 130, 33, TOWN_EAST_BRIDGE.halfHeight)];
export const TOWN_VILLAGE_DECOR: readonly WorldDecor[] = [...scene.props.flatMap(([frame, x, y, depth, flags, open, door], index): WorldDecor[] => {
  if ((flags & 3) === 0 && CLEARED.some(area => inside(area, originX + x, originY + depth))) return [];
  if ((flags & 2) === 2 && CLEARINGS.some(area => inside(area, originX + x, originY + depth))) return [];
  if ((flags & 1) === 1 && onTrack(originX + x, originY + depth)) return [];
  if ((flags & 1) === 1 && onMarketBranch(originX + x, originY + depth)) return [];
  const clip = animations[index];
  return [{
    type: "soulProp", sheet: "village", frame: String(frame), s: 1, x: originX + x, y: originY + depth, dy: y - depth,
    ground: (flags & 1) === 1, shadow: (flags & 2) === 2,
    ...((flags & 4) === 4 ? { door, openFrame: String(open) } : {}),
    ...(clip?.frames ? { anim: { frames: clip.frames, times: clip.times ?? [], length: clip.length ?? 1 } } : {}),
    ...(clip?.spin ? { spin: clip.spin } : {}),
  }];
}), ...EAST_BRIDGE_DECK];

export type SoulEmitter = (typeof scene.emitters)[number];
/** The village's particle emitters (chimney smoke, campfire smoke and sparks), in world units. */
export const TOWN_VILLAGE_EMITTERS: readonly SoulEmitter[] = scene.emitters.map(emitter => ({ ...emitter, x: originX + emitter.x, y: originY + emitter.y }));

/** The openings of the village wells, used to discover the chamber below. */
export const TOWN_VILLAGE_PITS: readonly SoulSolid[] = (scene.pits ?? []).map(flat => solid(flat, originX, originY));
export type SoulSolid = { xs: number[]; ys: number[]; left: number; top: number; right: number; bottom: number };
function solid(flat: readonly number[], dx: number, dy: number): SoulSolid {
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) { xs.push(dx + flat[i]); ys.push(dy + flat[i + 1]); }
  return { xs, ys, left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}
/** What a player cannot walk through: the pack's own colliders, as drawn (a round fountain stays round). */
export const TOWN_VILLAGE_SOLIDS: readonly SoulSolid[] = [...scene.solids.map(flat => solid(flat, originX, originY))
  .filter(wall => ![...CLEARED, DECK].some(area => inside(area, wall.left + 1, wall.top + 1) && inside(area, wall.right - 1, wall.bottom - 1))),
  ...STONE_RAILINGS(TOWN_EAST_BRIDGE), ...STONE_RAILINGS(WEST_BRIDGE),
  railing(SOUTH_BRIDGE, -77, -50, -105.5, 103.5), railing(SOUTH_BRIDGE, 51, 76, -105.5, 103.5)];

/** Which doors stand open now: the Town's runtime opens one as someone walks up, the renderer draws it so. */
export const SOUL_DOORS_OPEN = new Set<number>();

/** The rooms behind the doors (shared/town.ts places them): each one's picture, in village-interiors.webp. */
export const SOUL_INTERIOR_ROOMS = scene.interiors.rooms.map(([sx, sy, w, h, x, y]) => ({ sx, sy, w, h, x: TOWN_INTERIORS.x + x, y: TOWN_INTERIORS.y + y }));
/** The rooms' furniture, standing and sorting like the village's props. */
export const SOUL_INTERIOR_DECOR: readonly WorldDecor[] = scene.interiors.props.map(([frame, x, y, depth, flags]) => ({
  type: "soulProp", sheet: "village", frame: String(frame), s: 1, x: TOWN_INTERIORS.x + x, y: TOWN_INTERIORS.y + depth, dy: y - depth,
  shadow: (flags & 2) === 2,
}));
/** The rooms' walls (all but the doorway) and furniture. */
export const SOUL_INTERIOR_SOLIDS: readonly SoulSolid[] = scene.interiors.solids.map(flat => solid(flat, TOWN_INTERIORS.x, TOWN_INTERIORS.y));
