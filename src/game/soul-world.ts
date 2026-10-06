import {
  inSoulVillage, SOUL_CHUNK_SIZE, soulChunkCamps, soulChunkProps, soulRandom, soulStatsUnlocked,
  soulWindowChunks, type SoulCamp, type SoulPropKind, type SoulStatId,
} from "../../shared/soul-dimension";
import { SOUL_VILLAGE_DECOR, type SoulFrame } from "./soul-village";
import type { EnemyKind } from "./enemies";
import type { WorldDecor, WorldPath } from "./world";

/** Which forest creature wears each soul stat. */
export const SOUL_ENEMY_SPECIES: Readonly<Record<SoulStatId, EnemyKind>> = {
  damage: "Spitter", health: "Bramble", armor: "Mossback", regen: "Brood", attackSpeed: "Needle", critDamage: "Dread Warden",
};
export const SOUL_ENEMY_KINDS: readonly EnemyKind[] = [...new Set(Object.values(SOUL_ENEMY_SPECIES))];

/** How each wild prop is drawn: one of its atlas frames (by the prop's variant) and its size. */
const PROP_FRAMES: Readonly<Record<SoulPropKind, { frames: readonly SoulFrame[]; s: number }>> = {
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

/** Props too low to stand in front of anyone: drawn with the ground. */
const FLAT = new Set<SoulPropKind>(["grass", "flower", "mushroom", "stoneSmall"]);

/** Whether the village is close enough to this point to be worth drawing. */
const villageNear = (x: number, y: number) => inSoulVillage(x, y, SOUL_CHUNK_SIZE * 2.5);

/** Every prop in the chunk window around a point, the village's included when it is near. */
export function soulWindowDecor(x: number, y: number): WorldDecor[] {
  const decor: WorldDecor[] = villageNear(x, y) ? [...SOUL_VILLAGE_DECOR] : [];
  for (const { cx, cy } of soulWindowChunks(x, y)) {
    for (const prop of soulChunkProps(cx, cy)) {
      const look = PROP_FRAMES[prop.kind];
      decor.push({ type: "soulProp", x: prop.x, y: prop.y, s: look.s * prop.s, frame: look.frames[prop.variant % look.frames.length], flip: prop.flip,
        ground: FLAT.has(prop.kind) });
    }
  }
  return decor;
}

/** The village's ground is one baked image (soul-prop-renderer.ts), so there are no painted paths. */
export function soulWorldLayout(x: number, y: number): { decor: WorldDecor[]; paths: WorldPath[] } {
  return { decor: soulWindowDecor(x, y), paths: [] };
}

/** Every camp in the chunk window around a point. */
export function soulWindowCamps(x: number, y: number): SoulCamp[] {
  return soulWindowChunks(x, y).flatMap(({ cx, cy }) => soulChunkCamps(cx, cy));
}

/** The soul stat a camp is for a player at this tier, or null before the first tier. */
export function soulCampStat(camp: SoulCamp, tier: number): SoulStatId | null {
  const unlocked = soulStatsUnlocked(tier);
  return unlocked.length ? unlocked[Math.min(unlocked.length - 1, Math.floor(camp.roll * unlocked.length))] : null;
}

/** Where each member of a camp stands: spread around its centre, the same on every client. */
export function soulCampPoints(camp: SoulCamp) {
  const random = soulRandom(camp.x, camp.y, 4);
  return Array.from({ length: camp.count }, (_, index) => {
    const angle = (index / camp.count) * Math.PI * 2 + random() * .8;
    const distance = camp.radius * (.35 + random() * .6);
    return { x: Math.round(camp.x + Math.cos(angle) * distance), y: Math.round(camp.y + Math.sin(angle) * distance) };
  });
}

/** A soul enemy's camp name carries its stat and camp, so a kill knows what it paid. */
export const soulCampName = (stat: SoulStatId, camp: SoulCamp) => `soul:${stat}:${camp.key}`;
export function soulStatOfCampName(campName: string | undefined): SoulStatId | null {
  if (!campName?.startsWith("soul:")) return null;
  const stat = campName.split(":")[1] as SoulStatId;
  return stat in SOUL_ENEMY_SPECIES ? stat : null;
}
