import { townChunkOf, townInteriorArea, TOWN_INTERIOR_MARGIN, TOWN_WORLD } from "../../../shared/town";
import { SOUL_ATLAS, SOUL_INTERIOR_ROOMS, SOUL_VILLAGE_DECOR, SOUL_VILLAGE_GROUND } from "../soul-village";
import { townChunkDecor, TOWN_INTERIOR_DECOR } from "../town-world";
import type { WorldDecor } from "../world";
import { SOUL_SHADOW_STRENGTH, soulFrame, soulPropExtent, type SoulPropDecor } from "./soul-prop-renderer";

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
 * Everything the Town draws flat on its ground in a rectangle: its flat props (in depth order, as they were
 * drawn every frame) and its shadows. The village, its rooms and the countryside are fixed, so this is the same
 * whenever it is asked: it does not depend on where the player is or which chunks are loaded.
 */
export function townGroundPropsIn(rect: Rect) {
  fixedGroundProps ??= [...SOUL_VILLAGE_DECOR, ...TOWN_INTERIOR_DECOR].filter(isGroundProp);
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
export function createTownGroundTilePainter(images: Images) {
  let scratch: HTMLCanvasElement | null = null;
  const dark = townInteriorArea(TOWN_INTERIOR_MARGIN);

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
      context.drawImage(image, frame.x, frame.y, frame.w, frame.h, -frame.ax * item.s, -frame.ay * item.s, w, h);
      context.restore();
      return;
    }
    context.drawImage(image, frame.x, frame.y, frame.w, frame.h, x - frame.ax * item.s, y - frame.ay * item.s, w, h);
  }

  const ready = () => !pending(images.ground()) && !pending(images.interiors()) && !pending(images.villageProps()) && !pending(images.atlas());
  function paint(context: CanvasRenderingContext2D, tileX: number, tileY: number, tileSize: number) {
    if (!ready()) return false;
    const rect = { left: tileX * tileSize, top: tileY * tileSize, right: (tileX + 1) * tileSize, bottom: (tileY + 1) * tileSize };
    const ox = rect.left, oy = rect.top;
    context.imageSmoothingEnabled = false;
    const ground = images.ground(), area = SOUL_VILLAGE_GROUND;
    const left = Math.max(area.x, rect.left), top = Math.max(area.y, rect.top);
    const right = Math.min(area.x + area.w, rect.right), bottom = Math.min(area.y + area.h, rect.bottom);
    if (usable(ground) && left < right && top < bottom) {
      const scaleX = ground.naturalWidth / area.w, scaleY = ground.naturalHeight / area.h;
      context.drawImage(ground, (left - area.x) * scaleX, (top - area.y) * scaleY, (right - left) * scaleX, (bottom - top) * scaleY,
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
          context.drawImage(rooms, room.sx, room.sy, room.w, room.h, room.x - ox, room.y - oy, room.w, room.h);
        }
      }
    }
    const { flat, shadows } = townGroundPropsIn(rect);
    for (const item of flat) drawProp(context, item, ox, oy);
    if (shadows.length) {
      scratch ??= document.createElement("canvas");
      if (scratch.width !== tileSize || scratch.height !== tileSize) { scratch.width = tileSize; scratch.height = tileSize; }
      const layer = scratch.getContext("2d");
      if (layer) {
        layer.setTransform(1, 0, 0, 1, 0, 0);
        layer.clearRect(0, 0, tileSize, tileSize);
        layer.imageSmoothingEnabled = false;
        for (const item of shadows) drawProp(layer, item, ox, oy);
        context.save();
        context.globalAlpha = SOUL_SHADOW_STRENGTH;
        context.drawImage(scratch, 0, 0);
        context.restore();
      }
    }
    return true;
  }
  return { ready, paint };
}
export type TownGroundTilePainter = ReturnType<typeof createTownGroundTilePainter>;
