import { TOWN_CENTER, TOWN_EXCHANGE_CENTER, TOWN_GROVE, TOWN_HILLS, TOWN_VILLAGE_BOUNDS, TOWN_WALK_AREA } from "../../shared/town";
import { MINING_NODES } from "../../shared/mining";
import { WOOD_TREE_NODES } from "../../shared/woodcutting";
import { TOWN_VILLAGE_GROUND } from "../game/town-village";
import { TOWN_EXCHANGE_GROUND } from "../game/runtime/town/exchange-ground";
import { ORE_COLORS } from "../game/runtime/town/ore-rock-renderer";
import { LOG_COLORS } from "../game/runtime/town/wood-tree-renderer";
import { miningScene } from "../game/runtime/town/mining-scene";
import { woodcuttingScene } from "../game/runtime/town/woodcutting-scene";
import { drawPortalMapMarker } from "../game/portal-presentation";
import type { MapId, WorldPath } from "../game/world";

/** The World Map's Town page: the whole walled 3×3 grid, the village, Timberwood, the Copper Hills and the market. */
export const TOWN_MAP_AREA = TOWN_WALK_AREA;
const AREA_WIDTH = TOWN_MAP_AREA.right - TOWN_MAP_AREA.left;
const AREA_HEIGHT = TOWN_MAP_AREA.bottom - TOWN_MAP_AREA.top;
/** The map frame's shape on the Town page, as CSS aspect-ratio. */
export const TOWN_MAP_ASPECT = `${AREA_WIDTH} / ${AREA_HEIGHT}`;

/** A point's place on the Town page, 0 to 1 across and down. */
export const townMapFraction = (x: number, y: number) => ({ x: (x - TOWN_MAP_AREA.left) / AREA_WIDTH, y: (y - TOWN_MAP_AREA.top) / AREA_HEIGHT });

/** The Town's named areas, labelled on the page. */
export const TOWN_MAP_PLACES = Object.freeze([
  { name: "Village", x: TOWN_CENTER.x + (TOWN_VILLAGE_BOUNDS.left + TOWN_VILLAGE_BOUNDS.right) / 2, y: TOWN_CENTER.y + TOWN_VILLAGE_BOUNDS.top - 600 },
  { name: "Timberwood", x: (TOWN_GROVE.left + TOWN_GROVE.right) / 2, y: TOWN_GROVE.top - 200 },
  { name: "Copper Hills", x: (TOWN_HILLS.left + TOWN_HILLS.right) / 2, y: TOWN_HILLS.top - 200 },
  { name: "Trade Chrysanthemum", x: TOWN_EXCHANGE_CENTER.x, y: TOWN_EXCHANGE_CENTER.y + 700 },
]);

export type TownMapScene = {
  ground: string;
  path: string;
  paths: readonly WorldPath[];
  villageGround?: HTMLImageElement;
  portals: readonly { x: number; y: number; destination: MapId; unlocked: boolean }[];
  /** The player's feet, or null when they are not out in the Town (inside a room). */
  player: { x: number; y: number } | null;
};

// A small copy of the village's ground, made once: the full image is far too big to scale on every draw.
let villageThumbnail: HTMLCanvasElement | null = null;
function villageImage(image: HTMLImageElement | undefined) {
  if (villageThumbnail || !image?.complete || !image.naturalWidth) return villageThumbnail;
  villageThumbnail = document.createElement("canvas");
  villageThumbnail.width = 512;
  villageThumbnail.height = Math.max(1, Math.round(512 * image.naturalHeight / image.naturalWidth));
  villageThumbnail.getContext("2d")?.drawImage(image, 0, 0, villageThumbnail.width, villageThumbnail.height);
  return villageThumbnail;
}

/** Draws the Town page onto a `width`×`height` canvas already scaled to CSS pixels. */
export function drawTownWorldMap(context: CanvasRenderingContext2D, width: number, height: number, scene: TownMapScene) {
  const sx = width / AREA_WIDTH, sy = height / AREA_HEIGHT;
  const at = (x: number, y: number) => [(x - TOWN_MAP_AREA.left) * sx, (y - TOWN_MAP_AREA.top) * sy] as const;
  const rect = (area: { x: number; y: number; w: number; h: number }) => {
    const [x, y] = at(area.x, area.y);
    context.fillRect(x, y, area.w * sx, area.h * sy);
  };
  context.fillStyle = scene.ground;
  context.fillRect(0, 0, width, height);
  const village = villageImage(scene.villageGround);
  if (village) {
    const [x, y] = at(TOWN_VILLAGE_GROUND.x, TOWN_VILLAGE_GROUND.y);
    context.imageSmoothingEnabled = true;
    context.drawImage(village, x, y, TOWN_VILLAGE_GROUND.w * sx, TOWN_VILLAGE_GROUND.h * sy);
    context.imageSmoothingEnabled = false;
  }
  context.fillStyle = scene.path;
  for (const path of TOWN_EXCHANGE_GROUND.paths) rect(path);
  for (const path of scene.paths) rect(path);

  // Ore rocks and trees: a dot each in its ore's or wood's colour, faded while bare or felled.
  const dot = (x: number, y: number, color: string, faded: boolean) => {
    const [px, py] = at(x, y);
    context.globalAlpha = faded ? .35 : 1;
    context.fillStyle = "#101010"; context.fillRect(px - 2, py - 2, 4, 4);
    context.fillStyle = color; context.fillRect(px - 1, py - 1, 2, 2);
  };
  for (const node of MINING_NODES) dot(node.x, node.y, ORE_COLORS[node.ore].light, miningScene.bare.has(node.id));
  for (const tree of WOOD_TREE_NODES) dot(tree.x, tree.y, LOG_COLORS[tree.log].face, woodcuttingScene.felled.has(tree.id));
  context.globalAlpha = 1;

  for (const portal of scene.portals) {
    const [x, y] = at(portal.x, portal.y);
    drawPortalMapMarker(context, Math.round(x), Math.round(y), portal.destination, portal.unlocked, 2);
  }
  if (scene.player) {
    const [x, y] = at(scene.player.x, scene.player.y);
    context.fillStyle = "#fff";
    context.strokeStyle = "#111111";
    context.lineWidth = 3;
    context.beginPath();
    context.arc(x, y, 6, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }
}
