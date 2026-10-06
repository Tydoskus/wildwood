import { SOUL_CENTER, SOUL_INTERIORS } from "../../shared/soul-dimension";
import atlas from "./soul-atlas.json";
import scene from "./soul-village-scene.json";
import type { WorldDecor } from "./world";

/**
 * The Soul Dimension's village: ForestVillage's own demo village, baked from
 * the pack's scene by scripts/art/bake-forest-village-scene.mjs (its ground,
 * every house, tree, fence and prop where the pack put them), centred on its
 * fountain. The wilds around it use soul-atlas.json.
 */
export type SoulFrame = keyof typeof atlas.frames;
export const SOUL_ATLAS = atlas;
export const SOUL_VILLAGE_SCENE = scene;
export const SOUL_VILLAGE_PROPS_SOURCE = "assets/wildstat/soul-dimension/village-props.webp";
export const SOUL_VILLAGE_GROUND_SOURCE = "assets/wildstat/soul-dimension/village-ground.webp";
export const SOUL_INTERIORS_SOURCE = "assets/wildstat/soul-dimension/village-interiors.webp";

/** Where the scene's own origin lands in the world: the fountain on the dimension's centre. */
const originX = SOUL_CENTER.x - scene.fountain[0], originY = SOUL_CENTER.y - scene.fountain[1];

/** The ground image's rectangle in world units. */
export const SOUL_VILLAGE_GROUND = Object.freeze({
  x: originX + scene.ground.left, y: originY + scene.ground.top, w: scene.ground.width, h: scene.ground.height,
});

/** Every village prop as world decor: drawn at its own point, sorted by its group's depth. */
const animations = scene.animations as Record<string, { frames?: number[]; times?: number[]; length?: number; spin?: number } | undefined>;
export const SOUL_VILLAGE_DECOR: readonly WorldDecor[] = scene.props.map(([frame, x, y, depth, flags, open, door], index) => {
  const clip = animations[index];
  return {
    type: "soulProp", sheet: "village", frame: String(frame), s: 1, x: originX + x, y: originY + depth, dy: y - depth,
    ground: (flags & 1) === 1, shadow: (flags & 2) === 2,
    ...((flags & 4) === 4 ? { door, openFrame: String(open) } : {}),
    ...(clip?.frames ? { anim: { frames: clip.frames, times: clip.times ?? [], length: clip.length ?? 1 } } : {}),
    ...(clip?.spin ? { spin: clip.spin } : {}),
  };
});

export type SoulEmitter = (typeof scene.emitters)[number];
/** The village's particle emitters (chimney smoke, campfire smoke and sparks), in world units. */
export const SOUL_VILLAGE_EMITTERS: readonly SoulEmitter[] = scene.emitters.map(emitter => ({ ...emitter, x: originX + emitter.x, y: originY + emitter.y }));

/** The wells, as polygons: walk into one and you fall in. */
export const SOUL_VILLAGE_PITS: readonly SoulSolid[] = (scene.pits ?? []).map(flat => solid(flat, originX, originY));
export type SoulSolid = { xs: number[]; ys: number[]; left: number; top: number; right: number; bottom: number };
function solid(flat: readonly number[], dx: number, dy: number): SoulSolid {
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) { xs.push(dx + flat[i]); ys.push(dy + flat[i + 1]); }
  return { xs, ys, left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}
/** What a player cannot walk through: the pack's own colliders, as drawn (a round fountain stays round). */
export const SOUL_VILLAGE_SOLIDS: readonly SoulSolid[] = scene.solids.map(flat => solid(flat, originX, originY));

/** Which doors stand open now: the Soul Dimension's runtime opens one as someone walks up, the renderer draws it so. */
export const SOUL_DOORS_OPEN = new Set<number>();

/** The rooms behind the doors (shared/soul-dimension.ts places them): each one's picture, in village-interiors.webp. */
export const SOUL_INTERIOR_ROOMS = scene.interiors.rooms.map(([sx, sy, w, h, x, y]) => ({ sx, sy, w, h, x: SOUL_INTERIORS.x + x, y: SOUL_INTERIORS.y + y }));
/** The rooms' furniture, standing and sorting like the village's props. */
export const SOUL_INTERIOR_DECOR: readonly WorldDecor[] = scene.interiors.props.map(([frame, x, y, depth, flags]) => ({
  type: "soulProp", sheet: "village", frame: String(frame), s: 1, x: SOUL_INTERIORS.x + x, y: SOUL_INTERIORS.y + depth, dy: y - depth,
  shadow: (flags & 2) === 2,
}));
/** The rooms' walls (all but the doorway) and furniture. */
export const SOUL_INTERIOR_SOLIDS: readonly SoulSolid[] = scene.interiors.solids.map(flat => solid(flat, SOUL_INTERIORS.x, SOUL_INTERIORS.y));
