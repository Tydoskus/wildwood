import { inTownInteriors, inTownVillage, TOWN_CHUNK_SIZE, TOWN_INTERIOR_MARGIN, townChunkProps, townWindowChunks, type TownPropKind } from "../../shared/town";
import { SOUL_ATLAS, SOUL_INTERIOR_DECOR, SOUL_VILLAGE_DECOR, type SoulFrame } from "./soul-village";
import type { WorldDecor, WorldPath } from "./world";

/** How each countryside prop is drawn: one of its atlas frames (by the prop's variant) and its size. */
const PROP_FRAMES: Readonly<Record<TownPropKind, { frames: readonly SoulFrame[]; s: number }>> = {
  tree: { frames: ["Tree_01_Green", "Tree_02_Green", "Tree_03_Green", "Tree_04_Green", "Tree_05_Green", "Tree_06_Green", "Tree_07_Green", "Tree_08_Green",
    "Tree_09_Green", "Tree_10_Green", "Tree_11_Green", "Tree_12_Green", "Tree_13_Green", "Tree_14_Green", "Tree_15_Green", "Tree_16_Green",
    "Tree_17_Green", "Tree_18_Green", "Tree_19_Green"], s: 1 },
  smallTree: { frames: ["Small_Tree_01_Green", "Small_Tree_02_Green", "Small_Tree_03_Green"], s: 1 },
  birch: { frames: ["Birch_01_Green", "Birch_02_Green"], s: 1 },
  bush: { frames: ["Bush_01_Green", "Bush_02_Green", "Bush_03_Green", "Bush_04_Green", "Bush_05_Green"], s: 1 },
  grass: { frames: ["Grass_01_Green", "Grass_02_Green", "Grass_03_Green", "Grass_04_Green", "Grass_05_Green", "Grass_06_Green", "Grass_07_Green",
    "Grass_08_Green", "Grass_09_Green", "Grass_10_Green"], s: 1 },
  flower: { frames: ["Flower_01_Blue", "Flower_01_Yellow"], s: 1 },
  mushroom: { frames: ["Mushroom_01_Pink", "Mushroom_02_Pink", "Mushroom_03_Pink", "Mushroom_01_White", "Mushroom_02_White", "Mushroom_03_White",
    "Mushroom_01_Yellow", "Mushroom_02_Yellow", "Mushroom_03_Yellow"], s: 1 },
  stone: { frames: ["Stone_02_Gray", "Stone_03_Gray", "Stone_04_Gray"], s: 1 },
  stoneSmall: { frames: ["Stone_01_Gray", "Stone_05_Gray", "Stone_06_Gray", "Stone_07_Gray"], s: 1 },
  log: { frames: ["Tree_Log_01", "Tree_Log_02", "Tree_Log_03"], s: 1 },
  stump: { frames: ["Tree_Stump_01", "Tree_Stump_02", "Tree_Stump_03"], s: 1 },
};

/**
 * Props too low to stand in front of anyone are drawn with the ground. A tall
 * tuft of grass or a big mushroom stands, and sorts against players and trees
 * like anything else that does.
 */
const FLAT_HEIGHT = 30;
const lowEnough = (frame: SoulFrame, s: number) => SOUL_ATLAS.frames[frame].ay * s <= FLAT_HEIGHT;

/** Every prop in the chunk window around a point: the village's and its rooms' when they are near, and the countryside's. */
export function townWindowDecor(x: number, y: number): WorldDecor[] {
  const decor: WorldDecor[] = inTownVillage(x, y, TOWN_CHUNK_SIZE * 2.5) ? [...SOUL_VILLAGE_DECOR] : [];
  if (inTownInteriors(x, y, TOWN_INTERIOR_MARGIN)) decor.push(...SOUL_INTERIOR_DECOR);
  for (const { cx, cy } of townWindowChunks(x, y)) {
    for (const prop of townChunkProps(cx, cy)) {
      const look = PROP_FRAMES[prop.kind];
      const frame = look.frames[prop.variant % look.frames.length], s = look.s * prop.s;
      const shadow = `${frame}__shadow`;
      if (shadow in SOUL_ATLAS.frames) decor.push({ type: "soulProp", x: prop.x, y: prop.y, s, frame: shadow, flip: prop.flip, shadow: true });
      decor.push({ type: "soulProp", x: prop.x, y: prop.y, s, frame, flip: prop.flip, ground: lowEnough(frame, s) });
    }
  }
  return decor;
}

/** The village's ground is one baked image (soul-prop-renderer.ts), so there are no painted paths. */
export function townWorldLayout(x: number, y: number): { decor: WorldDecor[]; paths: WorldPath[] } {
  return { decor: townWindowDecor(x, y), paths: [] };
}
