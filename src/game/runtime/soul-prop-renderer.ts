import { soulInteriorArea, SOUL_INTERIOR_MARGIN } from "../../../shared/soul-dimension";
import { SOUL_ATLAS, SOUL_DOORS_OPEN, SOUL_INTERIOR_ROOMS, SOUL_VILLAGE_GROUND, SOUL_VILLAGE_SCENE } from "../soul-village";
import type { WorldDecor } from "../world";
import type { Camera } from "./camera";
import { snapWorldRenderCoordinate } from "./render-space";

export type SoulPropDecor = Extract<WorldDecor, { type: "soulProp" }>;
export const SOUL_ATLAS_SOURCE = "assets/wildstat/soul-dimension/soul-atlas.webp";
export { SOUL_INTERIORS_SOURCE, SOUL_VILLAGE_GROUND_SOURCE, SOUL_VILLAGE_PROPS_SOURCE } from "../soul-village";

type Frame = { x: number; y: number; w: number; h: number; ax: number; ay: number };
const villageFrames = new Map<string, Frame>(Object.entries(SOUL_VILLAGE_SCENE.frames)
  .map(([id, [x, y, w, h, ax, ay]]) => [id, { x, y, w, h, ax, ay }]));

/** A Soul Dimension prop's frame (the village's sheet or the wilds' atlas), or null for one neither has. */
export function soulFrame(name: string, sheet?: "village"): Frame | null {
  if (sheet === "village") return villageFrames.get(name) ?? null;
  return (SOUL_ATLAS.frames as Record<string, Frame | undefined>)[name] ?? null;
}

/** The sprite a looping clip shows at this time. */
export function animationFrame(anim: NonNullable<SoulPropDecor["anim"]>, seconds: number) {
  const t = anim.length > 0 ? ((seconds % anim.length) + anim.length) % anim.length : 0;
  let index = 0;
  for (let i = 0; i < anim.times.length; i++) if (anim.times[i] <= t) index = i;
  return anim.frames[index] ?? anim.frames[0];
}

/** How far above and to each side of its depth point a prop reaches, for culling. */
export function soulPropExtent(item: SoulPropDecor) {
  const frame = soulFrame(item.frame, item.sheet);
  if (!frame) return { left: 0, right: 0, up: 0, down: 0 };
  const s = item.spin ? 1.5 * item.s : item.s, dy = item.dy ?? 0;
  return { left: frame.ax * s, right: (frame.w - frame.ax) * s, up: Math.max(0, frame.ay * s - dy), down: Math.max(0, (frame.h - frame.ay) * s + dy) };
}

/** Draws the village's and the wilds' props, each at its own point. */
export function createSoulPropRenderer(options: {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  atlas: () => HTMLImageElement | undefined;
  villageProps: () => HTMLImageElement | undefined;
  devicePixelRatio: () => number;
  /** Seconds, for the pack's animations. */
  time: () => number;
}) {
  return function drawSoulProp(item: SoulPropDecor, target?: CanvasRenderingContext2D) {
    const image = item.sheet === "village" ? options.villageProps() : options.atlas();
    const name = item.anim ? String(animationFrame(item.anim, options.time())) : item.openFrame && SOUL_DOORS_OPEN.has(item.door ?? -1) ? item.openFrame : item.frame;
    const frame = soulFrame(name, item.sheet);
    if (!image?.complete || image.naturalWidth <= 0 || !frame) return;
    const { camera } = options;
    const ctx = target ?? options.ctx;
    const x = snapWorldRenderCoordinate(item.x - camera.x, camera.zoom, options.devicePixelRatio());
    const y = snapWorldRenderCoordinate(item.y + (item.dy ?? 0) - camera.y, camera.zoom, options.devicePixelRatio());
    const w = frame.w * item.s, h = frame.h * item.s;
    if (item.spin) {
      // Unity turns counter-clockwise for a positive angle; the canvas, with y down, the other way.
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-item.spin * options.time() * Math.PI / 180);
      ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, -frame.ax * item.s, -frame.ay * item.s, w, h);
      ctx.restore();
      return;
    }
    if (item.flip) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(-1, 1);
      ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, -frame.ax * item.s, -frame.ay * item.s, w, h);
      ctx.restore();
      return;
    }
    ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, x - frame.ax * item.s, y - frame.ay * item.s, w, h);
  };
}

/**
 * The village's ground (its field, roads, cobbles, river and bridges), one
 * baked image drawn over the ground colour and under everything standing on
 * it. Only the part in view is drawn.
 */
/** How dark the pack's shadows are: its shadow material draws them at about a fifth. */
const SHADOW_STRENGTH = .22;

export function createSoulGroundRenderer(options: {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  ground: () => HTMLImageElement | undefined;
  /** The rooms behind the village's doors: dark all round, each room's floor and walls under its furniture. */
  interiors: () => HTMLImageElement | undefined;
  /** The world's decor: its flat props are drawn here, over the ground, in depth order among themselves. */
  decor: readonly WorldDecor[];
  drawProp: (prop: SoulPropDecor, target?: CanvasRenderingContext2D) => void;
  /** The river's moving light, over the ground and under everything on it. */
  drawWater?: () => void;
  viewport: () => { width: number; height: number };
  devicePixelRatio: () => number;
  active: () => boolean;
}) {
  let flat: SoulPropDecor[] = [], shadows: SoulPropDecor[] = [], dirty = true;
  const visible: SoulPropDecor[] = [];
  let layer: HTMLCanvasElement | null = null;
  /** The decor's flat props and shadows, gathered once each time the decor changes, not every frame. */
  function gather() {
    flat = []; shadows = [];
    for (const item of options.decor) {
      if (item.type !== "soulProp") continue;
      if (item.shadow) shadows.push(item); else if (item.ground) flat.push(item);
    }
    // Stable: ties keep the village's own order.
    flat.sort((a, b) => a.y - b.y);
    dirty = false;
  }
  function inView(item: SoulPropDecor, viewRight: number, viewBottom: number) {
    const extent = soulPropExtent(item);
    const { camera } = options;
    return !(item.x + extent.right < camera.x || item.x - extent.left > viewRight || item.y + extent.down < camera.y || item.y - extent.up > viewBottom);
  }
  /**
   * Every shadow in view drawn solid into one layer, then laid over the ground
   * at the pack's shadow strength once: two shadows that overlap read as one.
   */
  function drawShadows(viewRight: number, viewBottom: number) {
    visible.length = 0;
    for (const item of shadows) if (inView(item, viewRight, viewBottom)) visible.push(item);
    if (!visible.length) return;
    const { ctx } = options;
    const canvas = ctx.canvas as HTMLCanvasElement;
    layer ??= document.createElement("canvas");
    if (layer.width !== canvas.width || layer.height !== canvas.height) { layer.width = canvas.width; layer.height = canvas.height; }
    const shadowContext = layer.getContext("2d");
    if (!shadowContext) return;
    shadowContext.setTransform(1, 0, 0, 1, 0, 0);
    shadowContext.clearRect(0, 0, layer.width, layer.height);
    shadowContext.setTransform(ctx.getTransform());
    shadowContext.imageSmoothingEnabled = ctx.imageSmoothingEnabled;
    for (const item of visible) options.drawProp(item, shadowContext);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = SHADOW_STRENGTH;
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
  }
  const dark = soulInteriorArea(SOUL_INTERIOR_MARGIN);
  function drawInteriors(viewRight: number, viewBottom: number) {
    const { ctx, camera } = options;
    const left = Math.max(dark.left, camera.x), top = Math.max(dark.top, camera.y);
    const right = Math.min(dark.right, viewRight), bottom = Math.min(dark.bottom, viewBottom);
    if (left >= right || top >= bottom) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(left - camera.x, top - camera.y, right - left, bottom - top);
    const image = options.interiors();
    if (!image?.complete || image.naturalWidth <= 0) return;
    const snap = (value: number) => snapWorldRenderCoordinate(value, camera.zoom, options.devicePixelRatio());
    for (const room of SOUL_INTERIOR_ROOMS) {
      if (room.x > viewRight || room.y > viewBottom || room.x + room.w < camera.x || room.y + room.h < camera.y) continue;
      ctx.drawImage(image, room.sx, room.sy, room.w, room.h, snap(room.x - camera.x), snap(room.y - camera.y), room.w, room.h);
    }
  }
  return {
    invalidate() { dirty = true; },
    draw() {
      if (!options.active()) return;
      if (dirty) gather();
      const { ctx, camera } = options;
      const view = options.viewport();
      const viewRight = camera.x + view.width / camera.zoom, viewBottom = camera.y + view.height / camera.zoom;
      const image = options.ground();
      const area = SOUL_VILLAGE_GROUND;
      const left = Math.max(area.x, camera.x), top = Math.max(area.y, camera.y);
      const right = Math.min(area.x + area.w, viewRight), bottom = Math.min(area.y + area.h, viewBottom);
      if (image?.complete && image.naturalWidth > 0 && left < right && top < bottom) {
        const scaleX = image.naturalWidth / area.w, scaleY = image.naturalHeight / area.h;
        const snap = (value: number) => snapWorldRenderCoordinate(value, camera.zoom, options.devicePixelRatio());
        ctx.drawImage(image, (left - area.x) * scaleX, (top - area.y) * scaleY, (right - left) * scaleX, (bottom - top) * scaleY,
          snap(left - camera.x), snap(top - camera.y), right - left, bottom - top);
      }
      options.drawWater?.();
      drawInteriors(viewRight, viewBottom);
      for (const item of flat) if (inView(item, viewRight, viewBottom)) options.drawProp(item);
      drawShadows(viewRight, viewBottom);
    },
  };
}
