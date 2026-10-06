import { SOUL_VILLAGE_GROUND } from "../soul-village";
import type { Camera } from "./camera";

export const SOUL_WATER_SOURCE = "assets/wildstat/soul-dimension/village-water.webp";
export const SOUL_SHORE_SOURCE = "assets/wildstat/soul-dimension/village-shore.webp";

const GLINT_TILE = 192;

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

/**
 * The village river, moving: two layers of glints drifting across the open
 * water at different speeds, fading in and out, and foam along the shore that
 * breathes. The water itself is in the baked ground; this only lays light on
 * it, through masks baked with it (bake-forest-village-scene.mjs), so it
 * never spills onto a bank or a bridge.
 */
export function createSoulWater(options: {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  water: () => HTMLImageElement | undefined;
  shore: () => HTMLImageElement | undefined;
  viewport: () => { width: number; height: number };
  time: () => number;
}) {
  let layer: HTMLCanvasElement | null = null;
  let tiles: [HTMLCanvasElement, HTMLCanvasElement] | null = null;

  return function drawSoulWater() {
    const water = options.water(), shore = options.shore();
    if (!water?.complete || water.naturalWidth <= 0) return;
    const { ctx, camera } = options;
    const view = options.viewport();
    const area = SOUL_VILLAGE_GROUND;
    const left = Math.max(area.x, camera.x), top = Math.max(area.y, camera.y);
    const right = Math.min(area.x + area.w, camera.x + view.width / camera.zoom), bottom = Math.min(area.y + area.h, camera.y + view.height / camera.zoom);
    if (left >= right || top >= bottom) return;
    const t = options.time();
    const canvas = ctx.canvas as HTMLCanvasElement;
    layer ??= document.createElement("canvas");
    if (layer.width !== canvas.width || layer.height !== canvas.height) { layer.width = canvas.width; layer.height = canvas.height; }
    const target = layer.getContext("2d");
    if (!target) return;
    tiles ??= [glintTile(7), glintTile(29)];
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.globalCompositeOperation = "source-over";
    target.globalAlpha = 1;
    target.clearRect(0, 0, layer.width, layer.height);
    target.setTransform(ctx.getTransform());
    // Glints are pinned to the world, then slide with time, so the water moves rather than the camera.
    const drift = [[t * 9, t * 3], [-t * 6, t * 5]] as const;
    for (const [index, tile] of tiles.entries()) {
      const pattern = target.createPattern(tile, "repeat");
      if (!pattern) continue;
      pattern.setTransform(new DOMMatrix().translateSelf(-camera.x + drift[index][0], -camera.y + drift[index][1]));
      target.globalAlpha = .55 + .45 * Math.sin(t * (1.1 + index * .7) + index * 2);
      target.fillStyle = pattern;
      target.fillRect(left - camera.x, top - camera.y, right - left, bottom - top);
    }
    // Keep only the open water, away from its shore.
    const scaleX = water.naturalWidth / area.w, scaleY = water.naturalHeight / area.h;
    const source = [(left - area.x) * scaleX, (top - area.y) * scaleY, (right - left) * scaleX, (bottom - top) * scaleY] as const;
    target.globalAlpha = 1;
    target.globalCompositeOperation = "destination-in";
    target.drawImage(water, ...source, left - camera.x, top - camera.y, right - left, bottom - top);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = .3;
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
    // Foam along the shore, breathing.
    if (shore?.complete && shore.naturalWidth > 0) {
      ctx.save();
      ctx.globalAlpha = .35 + .2 * Math.sin(t * 1.4);
      ctx.drawImage(shore, ...source, left - camera.x, top - camera.y, right - left, bottom - top);
      ctx.restore();
    }
  };
}
