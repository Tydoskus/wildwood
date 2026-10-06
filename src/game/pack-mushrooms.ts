import type { MapId, WorldDecor } from "./world";

/**
 * The glowing maps' mushrooms, drawn with ForestVillage's mushroom sprites
 * (from the Soul Dimension's atlas) instead of the shapes once painted into
 * the ground: purple in Moonfen, blue and mint elsewhere. They stand up and
 * sort with everything else, like the Soul Dimension's props.
 */
const FRAMES: Partial<Record<MapId, readonly string[]>> = {
  moonfen: ["Mushroom_04_Purple", "Mushroom_05_Purple"],
};
const DEFAULT_FRAMES = ["Mushroom_06_Mint", "Mushroom_04_Blue", "Mushroom_05_Blue"] as const;

export function withPackMushrooms(decor: readonly WorldDecor[], mapId: MapId): WorldDecor[] {
  const frames = FRAMES[mapId] ?? DEFAULT_FRAMES;
  return decor.map(item => item.type !== "glowMushroom" ? item : {
    type: "soulProp", x: item.x, y: item.y, s: Math.max(.6, item.s) * 1.6, frame: frames[item.variant % frames.length], flip: item.variant % 2 === 1,
  });
}
