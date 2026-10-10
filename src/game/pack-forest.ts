import { SOUL_ATLAS } from "./soul-village";
import { lowEnough, PROP_FRAMES } from "./town-world";
import { TUTORIAL_FOREST_MAP_ID, type MapId, type WorldDecor } from "./world";

/**
 * The tutorial forest in the Town's countryside look: its trees and grass are
 * ForestVillage's sprites (the Soul Dimension's atlas), each tree with its own
 * shadow, faded together with the ground's (forest-ground-tiles.ts), and short
 * grass lying flat while tall tufts stand and sort. The saved design keeps its
 * points; only the art changes. The Soul Dimension reuses this layout with its
 * night trees, so only the forest itself converts.
 */
const TREE_FRAMES = [...PROP_FRAMES.tree.frames, ...PROP_FRAMES.birch.frames, ...PROP_FRAMES.smallTree.frames];
const GRASS_FRAMES = PROP_FRAMES.grass.frames;
/** The forest's trees stood 154 units at s 1; the pack's are 106 to 201 (most about 160), so its own scale carries over. */
const TREE_SCALE = 1;

/** A stable pick from a point, so every load and every viewer draws the same tuft. */
const pick = (x: number, y: number, count: number) => Math.abs(Math.floor(Math.sin(x * 12.9898 + y * 78.233) * 43_758.5453)) % count;

export function withPackForest(decor: readonly WorldDecor[], mapId: MapId): WorldDecor[] {
  if (mapId !== TUTORIAL_FOREST_MAP_ID) return [...decor];
  const out: WorldDecor[] = [];
  for (const item of decor) {
    if (item.type === "tree") {
      const frame = TREE_FRAMES[item.variant % TREE_FRAMES.length], s = item.s * TREE_SCALE, flip = pick(item.x, item.y, 2) === 1;
      const shadow = `${frame}__shadow`;
      if (shadow in SOUL_ATLAS.frames) out.push({ type: "soulProp", x: item.x, y: item.y, s, frame: shadow, flip, shadow: true });
      out.push({ type: "soulProp", x: item.x, y: item.y, s, frame, flip });
    } else if (item.type === "grass") {
      const frame = GRASS_FRAMES[pick(item.x, item.y, GRASS_FRAMES.length)];
      out.push({ type: "soulProp", x: item.x, y: item.y, s: 1, frame, flip: item.variant % 2 === 1, ground: lowEnough(frame, 1) });
    } else out.push(item);
  }
  return out;
}
