import { SOUL_VILLAGE_GROUND } from "../soul-village";
import type { Camera } from "./camera";

export const SOUL_WATER_SOURCE = "assets/wildstat/soul-dimension/village-water.webp";
export const SOUL_SHORE_SOURCE = "assets/wildstat/soul-dimension/village-shore.webp";

const GLINT_TILE = 192;
/** The water's map: which squares of this many of the masks' pixels hold any water or foam. */
const WATER_CELL_PIXELS = 32;
/** The light's layer grows in steps of this many pixels, so a drifting view does not resize it every frame. */
const LAYER_STEP = 256;
/** The layer's edges snap out to this grid (world units), so walking does not move them every frame. */
const LAYER_GRID = 128;
/** How often the glints are relit: they drift a few units a second, so this is smooth. */
const RELIGHT_SECONDS = 1 / 20;

/** Which cells of the village's ground hold water or foam, and where that grid lies in the world. */
export type WaterCells = {
  columns: number;
  rows: number;
  /** One per cell, row by row: 1 where there is water or foam. */
  wet: Uint8Array;
  area: { x: number; y: number; w: number; h: number };
};

/** Marks the cells with any coverage in the masks' alpha (RGBA rows, `width` pixels across). */
export function waterCellsFromAlpha(alpha: Uint8ClampedArray, width: number, height: number, area: WaterCells["area"], cellPixels = WATER_CELL_PIXELS): WaterCells {
  const columns = Math.ceil(width / cellPixels), rows = Math.ceil(height / cellPixels);
  const wet = new Uint8Array(columns * rows);
  for (let y = 0; y < height; y++) {
    const row = Math.floor(y / cellPixels) * columns;
    for (let x = 0; x < width; x++) if (alpha[(y * width + x) * 4 + 3] > 0) wet[row + Math.floor(x / cellPixels)] = 1;
  }
  return { columns, rows, wet, area };
}

/**
 * The smallest world rectangle, inside the view, that holds every bit of water or foam in view; null when
 * none is in view (on the square, most of the time), so the water costs nothing there.
 */
export function waterRectInView(cells: WaterCells, view: { left: number; top: number; right: number; bottom: number }) {
  const { area, columns, rows, wet } = cells;
  const cellW = area.w / columns, cellH = area.h / rows;
  const c0 = Math.max(0, Math.floor((view.left - area.x) / cellW)), c1 = Math.min(columns - 1, Math.floor((view.right - area.x) / cellW));
  const r0 = Math.max(0, Math.floor((view.top - area.y) / cellH)), r1 = Math.min(rows - 1, Math.floor((view.bottom - area.y) / cellH));
  let minC = Infinity, maxC = -1, minR = Infinity, maxR = -1;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (!wet[r * columns + c]) continue;
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
    }
  }
  if (maxC < 0) return null;
  const left = Math.max(view.left, area.x + minC * cellW), right = Math.min(view.right, area.x + (maxC + 1) * cellW);
  const top = Math.max(view.top, area.y + minR * cellH), bottom = Math.min(view.bottom, area.y + (maxR + 1) * cellH);
  return left < right && top < bottom ? { left, top, right, bottom } : null;
}

/** Short soft strokes, like light catching ripples: tiled, they read as a moving surface. */
function glintTile(seed: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = GLINT_TILE;
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  let state = seed;
  const random = () => { state = (state * 1_103_515_245 + 12_345) >>> 0; return state / 4_294_967_296; };
  context.strokeStyle = "#ffffff";
  context.lineCap = "round";
  for (let i = 0; i < 16; i++) {
    const x = random() * GLINT_TILE, y = random() * GLINT_TILE, length = 8 + random() * 16;
    context.globalAlpha = .45 + random() * .55;
    context.lineWidth = 1.5 + random() * 1.5;
    context.beginPath();
    context.moveTo(x - length / 2, y);
    context.quadraticCurveTo(x, y - 3, x + length / 2, y);
    context.stroke();
  }
  return canvas;
}

/** Reads the masks once, to know where the water is; null if the browser will not let it. */
function measureWater(water: HTMLImageElement, shore: HTMLImageElement | undefined): WaterCells | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = water.naturalWidth; canvas.height = water.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(water, 0, 0);
    if (shore?.complete && shore.naturalWidth > 0) context.drawImage(shore, 0, 0, canvas.width, canvas.height);
    const cells = waterCellsFromAlpha(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, SOUL_VILLAGE_GROUND);
    canvas.width = canvas.height = 0;
    return cells;
  } catch {
    return null;
  }
}

/**
 * The village river, moving: two layers of glints drifting across the open
 * water at different speeds, fading in and out, and foam along the shore that
 * breathes. The water itself is in the baked ground; this only lays light on
 * it, through masks baked with it (bake-forest-village-scene.mjs), so it
 * never spills onto a bank or a bridge. Only the part of the screen with water
 * in it is worked on: none at all when no water is in view.
 */
export function createSoulWater(options: {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  water: () => HTMLImageElement | undefined;
  shore: () => HTMLImageElement | undefined;
  viewport: () => { width: number; height: number };
  time: () => number;
  /** Off (Low Performance Mode), the river is the baked ground's, still. */
  active?: () => boolean;
}) {
  let layer: HTMLCanvasElement | null = null;
  let target: CanvasRenderingContext2D | null = null;
  let patterns: CanvasPattern[] | null = null;
  let cells: WaterCells | null | undefined;
  let measuredShore = false;
  const matrix = typeof DOMMatrix === "undefined" ? null : new DOMMatrix();
  /** Which stretch of water the layer was last lit for, and when. */
  let litKey = "", litAt = Number.NaN;

  return function drawSoulWater() {
    if (options.active && !options.active()) return;
    const water = options.water(), shore = options.shore();
    if (!water?.complete || water.naturalWidth <= 0) return;
    const { ctx, camera } = options;
    const view = options.viewport();
    const area = SOUL_VILLAGE_GROUND;
    const inView = {
      left: Math.max(area.x, camera.x), top: Math.max(area.y, camera.y),
      right: Math.min(area.x + area.w, camera.x + view.width / camera.zoom), bottom: Math.min(area.y + area.h, camera.y + view.height / camera.zoom),
    };
    if (inView.left >= inView.right || inView.top >= inView.bottom) return;
    // Measured once both masks are in (the shore's foam reaches past the open water).
    const shoreReady = Boolean(shore?.complete);
    if (cells === undefined || (!measuredShore && shoreReady)) { cells = measureWater(water, shore); measuredShore = shoreReady; }
    // The layer covers the water near the view on a coarse grid, so it holds still while the camera drifts and
    // only needs relighting when the glints have moved: a few times a second is smooth for light this slow.
    const reach = {
      left: Math.max(area.x, Math.floor(inView.left / LAYER_GRID) * LAYER_GRID), top: Math.max(area.y, Math.floor(inView.top / LAYER_GRID) * LAYER_GRID),
      right: Math.min(area.x + area.w, Math.ceil(inView.right / LAYER_GRID) * LAYER_GRID), bottom: Math.min(area.y + area.h, Math.ceil(inView.bottom / LAYER_GRID) * LAYER_GRID),
    };
    const wet = cells ? waterRectInView(cells, reach) : reach;
    if (!wet) return;
    // Whole world units, so the layer's pixels line up with the world's.
    const left = Math.floor(wet.left), top = Math.floor(wet.top), right = Math.ceil(wet.right), bottom = Math.ceil(wet.bottom);
    const width = right - left, height = bottom - top;
    // What of it is on screen.
    const showLeft = Math.max(left, inView.left), showTop = Math.max(top, inView.top);
    const showRight = Math.min(right, inView.right), showBottom = Math.min(bottom, inView.bottom);
    if (showLeft >= showRight || showTop >= showBottom) return;
    const t = options.time();
    const scaleX = water.naturalWidth / area.w, scaleY = water.naturalHeight / area.h;
    const key = `${left},${top},${right},${bottom}`;
    if (key !== litKey || !(t >= litAt && t - litAt < RELIGHT_SECONDS)) {
      // The light is worked on in a layer just big enough for the water near the view, a pixel per world unit
      // (the glints' and the mask's own detail), and only then laid over the world: a screen-sized layer cost a
      // full-screen clear, two fills, a mask and a copy of the whole layer every frame, water in view or not.
      layer ??= document.createElement("canvas");
      const fitWidth = Math.ceil(width / LAYER_STEP) * LAYER_STEP, fitHeight = Math.ceil(height / LAYER_STEP) * LAYER_STEP;
      // Grown when the water near the view outgrows it, shrunk when it is far bigger than it needs to be.
      if (layer.width < width || layer.height < height || layer.width * layer.height > 4 * fitWidth * fitHeight) {
        layer.width = fitWidth;
        layer.height = fitHeight;
      }
      target ??= layer.getContext("2d");
      if (!target) return;
      const glints = target;
      patterns ??= [glintTile(7), glintTile(29)].map(tile => glints.createPattern(tile, "repeat")).filter((pattern): pattern is CanvasPattern => Boolean(pattern));
      glints.setTransform(1, 0, 0, 1, 0, 0);
      glints.globalCompositeOperation = "source-over";
      glints.globalAlpha = 1;
      glints.clearRect(0, 0, width, height);
      // Glints are pinned to the world, then slide with time, so the water moves rather than the camera.
      const drift = [[t * 9, t * 3], [-t * 6, t * 5]] as const;
      for (const [index, pattern] of patterns.entries()) {
        if (matrix) { matrix.e = -left + drift[index][0]; matrix.f = -top + drift[index][1]; pattern.setTransform(matrix); }
        glints.globalAlpha = .55 + .45 * Math.sin(t * (1.1 + index * .7) + index * 2);
        glints.fillStyle = pattern;
        glints.fillRect(0, 0, width, height);
      }
      // Keep only the open water, away from its shore.
      glints.globalAlpha = 1;
      glints.globalCompositeOperation = "destination-in";
      glints.drawImage(water, (left - area.x) * scaleX, (top - area.y) * scaleY, width * scaleX, height * scaleY, 0, 0, width, height);
      glints.globalCompositeOperation = "source-over";
      litKey = key;
      litAt = t;
    }
    if (!layer) return;
    const showWidth = showRight - showLeft, showHeight = showBottom - showTop;
    ctx.save();
    ctx.globalAlpha = .3;
    // Smoothly scaled up to the screen, as the glints and the mask always were.
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(layer, showLeft - left, showTop - top, showWidth, showHeight, showLeft - camera.x, showTop - camera.y, showWidth, showHeight);
    ctx.restore();
    // Foam along the shore, breathing.
    if (shore?.complete && shore.naturalWidth > 0) {
      ctx.save();
      ctx.globalAlpha = .35 + .2 * Math.sin(t * 1.4);
      ctx.drawImage(shore, (showLeft - area.x) * scaleX, (showTop - area.y) * scaleY, showWidth * scaleX, showHeight * scaleY,
        showLeft - camera.x, showTop - camera.y, showWidth, showHeight);
      ctx.restore();
    }
  };
}
