import { SOUL_CENTER } from "../../shared/soul-dimension";
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

/** Where the scene's own origin lands in the world: the fountain on the dimension's centre. */
const originX = SOUL_CENTER.x - scene.fountain[0], originY = SOUL_CENTER.y - scene.fountain[1];

/** The ground image's rectangle in world units. */
export const SOUL_VILLAGE_GROUND = Object.freeze({
  x: originX + scene.ground.left, y: originY + scene.ground.top, w: scene.ground.width, h: scene.ground.height,
});

/** Every village prop as world decor: drawn at its own point, sorted by its group's depth. */
const animations = scene.animations as Record<string, { frames?: number[]; times?: number[]; length?: number; spin?: number } | undefined>;
export const SOUL_VILLAGE_DECOR: readonly WorldDecor[] = scene.props.map(([frame, x, y, depth, ground], index) => {
  const clip = animations[index];
  return {
    type: "soulProp", sheet: "village", frame: String(frame), s: 1, x: originX + x, y: originY + depth, dy: y - depth, ground: ground === 1,
    ...(clip?.frames ? { anim: { frames: clip.frames, times: clip.times ?? [], length: clip.length ?? 1 } } : {}),
    ...(clip?.spin ? { spin: clip.spin } : {}),
  };
});

export type SoulEmitter = (typeof scene.emitters)[number];
/** The village's particle emitters (chimney smoke, campfire smoke and sparks), in world units. */
export const SOUL_VILLAGE_EMITTERS: readonly SoulEmitter[] = scene.emitters.map(emitter => ({ ...emitter, x: originX + emitter.x, y: originY + emitter.y }));

/** What a player cannot walk through: the pack's own colliders (river banks, fences, trees, house bases, wells, bridge rails). */
export const SOUL_VILLAGE_SOLIDS: readonly { left: number; top: number; right: number; bottom: number }[] = scene.solids
  .map(([x, y, w, h]) => ({ left: originX + x, top: originY + y, right: originX + x + w, bottom: originY + y + h }));
