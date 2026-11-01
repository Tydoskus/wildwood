import { drawAtlasImage, type AtlasImage, type CanvasAtlas } from "../render/canvas-atlas";
import { frozenCopyOf } from "../render/frozen-canvas";
import { platePixels, plateSize } from "../render/nameplate-scale";

/**
 * The part of an enemy's status that every enemy with the same bar shares:
 * the empty health bar and, at full health, the full bar. Positions are
 * relative to the bar's top left corner. In device pixels: the image's size,
 * the bar's within it, and `inset`, from the image's corner to the bar's.
 */
export type EnemyStatusPlate = AtlasImage & {
  left: number; top: number; width: number; height: number;
  pixelWidth: number; pixelHeight: number; barPixelWidth: number; barPixelHeight: number; inset: number;
};

/** An enemy's health bar: a long, thin pill with no numbers on it, at plate scale. */
export const ENEMY_HEALTH_BAR_HEIGHT = platePixels(5);
/** Pixels between the top of the bar and the bottom of the name's em box. */
export const ENEMY_NAME_GAP = plateSize(4);
export const ENEMY_HEALTH_FILL = "#55d568";
const PLATE_CACHE_LIMIT = 512;
const OUTLINE = 1;

type PillContext = Pick<CanvasRenderingContext2D, "beginPath" | "moveTo" | "arcTo" | "closePath" | "fill">;
/** A rounded bar, its ends as round as its height allows; a sliver narrower than that stays a sliver. */
export function fillPill(ctx: PillContext, x: number, y: number, width: number, height: number) {
  if (!(width > 0) || !(height > 0)) return;
  const radius = Math.min(height / 2, width / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  ctx.fill();
}

/**
 * A mob group is the same enemy many times over, and at full health each
 * one's bar is identical, so it is drawn once to a plate and every enemy's
 * bar is one image. A wounded enemy still uses the plate for its empty bar,
 * and draws only its green fill on top. The name is text over it, drawn from
 * a text sprite one to one on the screen's pixels (canvas.ts).
 *
 * Plates are drawn at the scale they are shown at (the pixel ratio times the
 * player's zoom) so they land one-to-one on the screen's pixels, and the cache
 * is dropped whole when it fills, which only a very long
 * session across many maps can do.
 */
export function createEnemyStatusPlates(options: {
  pixelRatio: () => number;
  createCanvas?: () => HTMLCanvasElement;
  /** Plates packed onto shared pages (canvas-atlas.ts); without one, or with it full, each plate gets its own canvas. */
  atlas?: CanvasAtlas;
}) {
  const plates = new Map<string, EnemyStatusPlate>();
  const createCanvas = options.createCanvas ?? (() => document.createElement("canvas"));
  // The atlas starting over drops every plate on it.
  options.atlas?.onReset(() => plates.clear());

  function build(barW: number, barH: number, full: boolean, scale: number): EnemyStatusPlate {
    // Drawn in whole device pixels, so the bar's edges are sharp where the plate lands one to one.
    const barPixelWidth = Math.max(1, Math.round(barW * scale)), barPixelHeight = Math.max(1, Math.round(barH * scale));
    const outline = Math.max(1, Math.round(OUTLINE * scale));
    const inset = outline + Math.max(1, Math.round(scale));
    const pixelWidth = barPixelWidth + inset * 2, pixelHeight = barPixelHeight + inset * 2;
    const left = -inset / scale, top = -inset / scale, width = pixelWidth / scale, height = pixelHeight / scale;
    const paint = (plateCtx: CanvasRenderingContext2D) => {
      plateCtx.transform(1, 0, 0, 1, inset, inset);
      plateCtx.fillStyle = "rgba(0,0,0,.8)";
      fillPill(plateCtx, -outline, -outline, barPixelWidth + outline * 2, barPixelHeight + outline * 2);
      plateCtx.fillStyle = "#000";
      fillPill(plateCtx, 0, 0, barPixelWidth, barPixelHeight);
      if (full) {
        plateCtx.fillStyle = ENEMY_HEALTH_FILL;
        fillPill(plateCtx, 0, 0, barPixelWidth, barPixelHeight);
      }
    };
    const sizes = { left, top, width, height, pixelWidth, pixelHeight, barPixelWidth, barPixelHeight, inset };
    const region = options.atlas?.allocate(pixelWidth, pixelHeight);
    if (region && options.atlas!.drawInto(region, paint)) {
      return { canvas: region.canvas, sx: region.x, sy: region.y, sw: pixelWidth, sh: pixelHeight, ...sizes };
    }
    const canvas = createCanvas();
    const plateCtx = canvas.getContext("2d");
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    if (plateCtx) paint(plateCtx);
    return { canvas, ...sizes };
  }

  /** `full`: the enemy is at full health, so the plate carries the full bar too. `scale`: device pixels per bar pixel. */
  function plate(barW: number, barH: number, full: boolean, scale = options.pixelRatio()) {
    const key = `${scale}|${barW}|${barH}|${full ? 1 : 0}`;
    const cached = plates.get(key);
    if (cached) return cached;
    if (plates.size >= PLATE_CACHE_LIMIT) plates.clear();
    const built = build(barW, barH, full, scale);
    plates.set(key, built);
    return built;
  }

  // Fills keyed by colour, then by height and width in device pixels.
  const pills = new Map<string, Map<number, AtlasImage | null>>();
  options.atlas?.onReset(() => pills.clear());

  /** A `color` pill `width` × `height` device pixels on the atlas, or null without room for it. */
  function pill(color: string, width: number, height: number) {
    let byColor = pills.get(color);
    if (!byColor) pills.set(color, byColor = new Map());
    const key = height * 65_536 + width;
    const cached = byColor.get(key);
    if (cached !== undefined) return cached;
    const region = options.atlas?.allocate(width, height);
    const image = region && options.atlas!.drawInto(region, pillCtx => {
      pillCtx.fillStyle = color;
      fillPill(pillCtx, 0, 0, width, height);
    }) ? { canvas: region.canvas, sx: region.x, sy: region.y, sw: width, sh: height } : null;
    byColor.set(key, image);
    return image;
  }

  return { plate, pill, size: () => plates.size };
}
export type EnemyStatusPlates = ReturnType<typeof createEnemyStatusPlates>;

/**
 * fillPill on whole device pixels from pre-drawn pills, under an untransformed context: a short one whole,
 * a longer one as the left of a `fullWidth` pill and its right end, which paints the same pixels.
 * False when the atlas had no room, and nothing was drawn.
 */
export function drawPillImage(ctx: Pick<CanvasRenderingContext2D, "drawImage">, plates: EnemyStatusPlates, color: string,
  x: number, y: number, width: number, height: number, fullWidth: number) {
  if (!(width > 0) || !(height > 0)) return true;
  const radius = height / 2, cap = Math.ceil(radius);
  if (width < cap + radius || width > fullWidth) {
    const image = plates.pill(color, width, height);
    if (!image) return false;
    drawAtlasImage(ctx, image, x, y, width, height);
    return true;
  }
  const strip = plates.pill(color, fullWidth, height);
  if (!strip || !strip.canvas.width) return Boolean(strip);
  const source = frozenCopyOf(strip.canvas), sx = strip.sx ?? 0, sy = strip.sy ?? 0;
  ctx.drawImage(source, sx, sy, width - cap, height, x, y, width - cap, height);
  ctx.drawImage(source, sx + fullWidth - cap, sy, cap, height, x + width - cap, y, cap, height);
  return true;
}
