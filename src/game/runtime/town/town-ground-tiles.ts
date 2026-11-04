import { decodedImage } from "../render/decoded-image";
import { townChunkOf, townInteriorArea, TOWN_INTERIOR_MARGIN, TOWN_WORLD } from "../../../../shared/town";
import { SOUL_ATLAS, SOUL_INTERIOR_ROOMS, TOWN_VILLAGE_DECOR, TOWN_VILLAGE_GROUND } from "../../town-village";
import { townChunkDecor, TOWN_INTERIOR_DECOR } from "../../town-world";
import { TOWN_EXCHANGE_DECOR } from "../../town-exchange";
import type { WorldDecor } from "../../world";
import { paintHillsGround } from "./hills-ground";
import { createForestRoadPainter } from "../render/forest-road";
import { TOWN_EXCHANGE_GROUND, paintExchangeGround } from "./exchange-ground";
import { SOUL_SHADOW_STRENGTH, soulFrame, soulPropExtent, type SoulPropDecor } from "../soul/soul-prop-renderer";

type Rect = { left: number; top: number; right: number; bottom: number };

/** The Town's whole world, for the baked ground's tile range (the campaign maps' is much smaller). */
export const TOWN_GROUND_WORLD = Object.freeze({ w: TOWN_WORLD.width, h: TOWN_WORLD.height });

const isGroundProp = (item: WorldDecor): item is SoulPropDecor => item.type === "soulProp" && Boolean(item.ground || item.shadow);
const overlaps = (item: SoulPropDecor, rect: Rect) => {
  const extent = soulPropExtent(item);
  return item.x + extent.right > rect.left && item.x - extent.left < rect.right && item.y + extent.down > rect.top && item.y - extent.up < rect.bottom;
};

/** The village's and its rooms' ground props and shadows: they never change. */
let fixedGroundProps: readonly SoulPropDecor[] | null = null;
/** How far a countryside prop reaches from its point, at most: the chunks that can reach into a rectangle. */
let countrysideReach = 0;

/**
 * Everything the Town draws flat on its ground in a rectangle: its flat props (in depth order) and its
 * shadows. The village, its rooms, the market square and the countryside are fixed, so this is the same
 * whenever it is asked: it does not depend on where the player is or which chunks are loaded.
 */
export function townGroundPropsIn(rect: Rect) {
  fixedGroundProps ??= [...TOWN_VILLAGE_DECOR, ...TOWN_INTERIOR_DECOR, ...TOWN_EXCHANGE_DECOR].filter(isGroundProp);
  if (!countrysideReach) {
    for (const frame of Object.values(SOUL_ATLAS.frames) as { w: number; h: number }[]) countrysideReach = Math.max(countrysideReach, frame.w, frame.h);
    countrysideReach = Math.ceil(countrysideReach * 1.1);
  }
  const flat: SoulPropDecor[] = [], shadows: SoulPropDecor[] = [];
  const take = (item: WorldDecor) => {
    if (!isGroundProp(item) || !overlaps(item, rect)) return;
    if (item.shadow) shadows.push(item); else flat.push(item);
  };
  for (const item of fixedGroundProps) take(item);
  const reach = countrysideReach;
  for (let cy = townChunkOf(rect.top - reach); cy <= townChunkOf(rect.bottom + reach); cy++) {
    for (let cx = townChunkOf(rect.left - reach); cx <= townChunkOf(rect.right + reach); cx++) {
      for (const item of townChunkDecor(cx, cy)) take(item);
    }
  }
  // Stable: ties keep the village's own order.
  flat.sort((a, b) => a.y - b.y);
  return { flat, shadows };
}

type Images = {
  ground: () => HTMLImageElement | undefined;
  interiors: () => HTMLImageElement | undefined;
  villageProps: () => HTMLImageElement | undefined;
  atlas: () => HTMLImageElement | undefined;
  /** The village's road tiles, for the road down to the market square and the square itself. */
  road: () => HTMLImageElement | undefined;
};

/** Still on its way: a tile baked now would miss it, so it waits. A broken image is drawn without. */
const pending = (image: HTMLImageElement | undefined) => !image || !image.complete;
const usable = (image: HTMLImageElement | undefined): image is HTMLImageElement => Boolean(image?.complete && image.naturalWidth > 0);

/**
 * Bakes the Town's ground into the static world's tiles: the village's ground image, the dark round its rooms
 * and their floors, every flat prop and every shadow (laid solid in one layer and then over the ground at the
 * pack's shadow strength, so overlapping shadows read as one). None of it moves, so it is painted once per tile
 * and the tiles are reused, instead of drawn, composited and shadowed again every frame.
 * Returns false, painting nothing, while an image it needs is still loading.
 */
/**
 * Lays a tile's flat soul props and its shadows: the props in the order given, then every shadow solid in one
 * layer, laid over at the pack's shadow strength, so overlapping shadows read as one. The Town's and the forest's.
 */
export function createSoulGroundPropPainter(images: Pick<Images, "villageProps" | "atlas">) {
  let scratch: HTMLCanvasElement | null = null;
  function drawProp(context: CanvasRenderingContext2D, item: SoulPropDecor, originX: number, originY: number) {
    const image = item.sheet === "village" ? images.villageProps() : images.atlas();
    const frame = soulFrame(item.frame, item.sheet);
    if (!usable(image) || !frame) return;
    const x = item.x - originX, y = item.y + (item.dy ?? 0) - originY;
    const w = frame.w * item.s, h = frame.h * item.s;
    if (item.flip) {
      context.save();
      context.translate(x, y);
      context.scale(-1, 1);
      context.drawImage(decodedImage(image), frame.x, frame.y, frame.w, frame.h, -frame.ax * item.s, -frame.ay * item.s, w, h);
      context.restore();
      return;
    }
    context.drawImage(decodedImage(image), frame.x, frame.y, frame.w, frame.h, x - frame.ax * item.s, y - frame.ay * item.s, w, h);
  }
  return function paintGroundProps(context: CanvasRenderingContext2D, flat: readonly SoulPropDecor[], shadows: readonly SoulPropDecor[], ox: number, oy: number, tileSize: number) {
    for (const item of flat) drawProp(context, item, ox, oy);
    if (!shadows.length) return;
    scratch ??= document.createElement("canvas");
    if (scratch.width !== tileSize || scratch.height !== tileSize) { scratch.width = tileSize; scratch.height = tileSize; }
    const layer = scratch.getContext("2d");
    if (!layer) return;
    layer.setTransform(1, 0, 0, 1, 0, 0);
    layer.clearRect(0, 0, tileSize, tileSize);
    layer.imageSmoothingEnabled = false;
    for (const item of shadows) drawProp(layer, item, ox, oy);
    context.save();
    context.globalAlpha = SOUL_SHADOW_STRENGTH;
    context.drawImage(scratch, 0, 0);
    context.restore();
  };
}

/** A decor list's flat soul props (in depth order) and shadows that reach into a rectangle. */
export function soulGroundPropsIn(decor: readonly WorldDecor[], rect: Rect) {
  const flat: SoulPropDecor[] = [], shadows: SoulPropDecor[] = [];
  for (const item of decor) {
    if (!isGroundProp(item) || !overlaps(item, rect)) continue;
    if (item.shadow) shadows.push(item); else flat.push(item);
  }
  flat.sort((a, b) => a.y - b.y);
  return { flat, shadows };
}

/**
 * The part of the village's ground image that is drawn: all but its outermost pixels, a clear row round the edge
 * and, along its bottom, a row tinted off the grass, which drew a line across the countryside's green. The Town's
 * own ground colour, the village's grass, shows there instead.
 */
function villageGroundDrawn(ground: HTMLImageElement | undefined) {
  const area = TOWN_VILLAGE_GROUND;
  if (!ground?.naturalWidth) return area;
  const pixelX = area.w / ground.naturalWidth, pixelY = area.h / ground.naturalHeight;
  return { x: area.x + pixelX, y: area.y + pixelY, w: area.w - pixelX * 2, h: area.h - pixelY * 3 };
}

export function createTownGroundTilePainter(images: Images) {
  const dark = townInteriorArea(TOWN_INTERIOR_MARGIN);
  const paintGroundProps = createSoulGroundPropPainter(images);
  const paintRoads = createForestRoadPainter(images.road);

  const ready = () => !pending(images.ground()) && !pending(images.interiors()) && !pending(images.villageProps()) && !pending(images.atlas()) && !pending(images.road());
  function paint(context: CanvasRenderingContext2D, tileX: number, tileY: number, tileSize: number) {
    if (!ready()) return false;
    const rect = { left: tileX * tileSize, top: tileY * tileSize, right: (tileX + 1) * tileSize, bottom: (tileY + 1) * tileSize };
    const ox = rect.left, oy = rect.top;
    context.imageSmoothingEnabled = false;
    const ground = images.ground(), area = villageGroundDrawn(images.ground());
    const left = Math.max(area.x, rect.left), top = Math.max(area.y, rect.top);
    const right = Math.min(area.x + area.w, rect.right), bottom = Math.min(area.y + area.h, rect.bottom);
    if (usable(ground) && left < right && top < bottom) {
      const scaleX = ground.naturalWidth / TOWN_VILLAGE_GROUND.w, scaleY = ground.naturalHeight / TOWN_VILLAGE_GROUND.h;
      context.drawImage(decodedImage(ground), (left - TOWN_VILLAGE_GROUND.x) * scaleX, (top - TOWN_VILLAGE_GROUND.y) * scaleY, (right - left) * scaleX, (bottom - top) * scaleY,
        left - ox, top - oy, right - left, bottom - top);
    }
    const darkLeft = Math.max(dark.left, rect.left), darkTop = Math.max(dark.top, rect.top);
    const darkRight = Math.min(dark.right, rect.right), darkBottom = Math.min(dark.bottom, rect.bottom);
    if (darkLeft < darkRight && darkTop < darkBottom) {
      context.fillStyle = "#000";
      context.fillRect(darkLeft - ox, darkTop - oy, darkRight - darkLeft, darkBottom - darkTop);
      const rooms = images.interiors();
      if (usable(rooms)) {
        for (const room of SOUL_INTERIOR_ROOMS) {
          if (room.x > rect.right || room.y > rect.bottom || room.x + room.w < rect.left || room.y + room.h < rect.top) continue;
          context.drawImage(decodedImage(rooms), room.sx, room.sy, room.w, room.h, room.x - ox, room.y - oy, room.w, room.h);
        }
      }
    }
    paintHillsGround(context, rect, ox, oy);
    if (rect.right > TOWN_EXCHANGE_GROUND.join || rect.bottom > TOWN_EXCHANGE_GROUND.below) {
      context.save();
      context.beginPath();
      context.rect(TOWN_EXCHANGE_GROUND.join - ox, 0, Math.max(0, rect.right - TOWN_EXCHANGE_GROUND.join), tileSize);
      context.rect(0, TOWN_EXCHANGE_GROUND.below - oy, tileSize, Math.max(0, rect.bottom - TOWN_EXCHANGE_GROUND.below));
      context.clip();
      paintRoads(context, TOWN_EXCHANGE_GROUND.paths, ox, oy, tileSize, TOWN_EXCHANGE_GROUND.grass);
      context.restore();
    }
    paintExchangeGround(context, rect, ox, oy);
    const { flat, shadows } = townGroundPropsIn(rect);
    paintGroundProps(context, flat, shadows, ox, oy, tileSize);
    return true;
  }
  return { ready, paint };
}
