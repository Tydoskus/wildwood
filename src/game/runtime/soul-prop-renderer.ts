import { SOUL_ATLAS, SOUL_VILLAGE_GROUND, SOUL_VILLAGE_SCENE } from "../soul-village";
import type { WorldDecor } from "../world";
import type { Camera } from "./camera";
import { snapWorldRenderCoordinate } from "./render-space";

export type SoulPropDecor = Extract<WorldDecor, { type: "soulProp" }>;
export const SOUL_ATLAS_SOURCE = "assets/wildstat/soul-dimension/soul-atlas.webp";
export { SOUL_VILLAGE_GROUND_SOURCE, SOUL_VILLAGE_PROPS_SOURCE } from "../soul-village";

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
  return function drawSoulProp(item: SoulPropDecor) {
    const image = item.sheet === "village" ? options.villageProps() : options.atlas();
    const frame = soulFrame(item.anim ? String(animationFrame(item.anim, options.time())) : item.frame, item.sheet);
    if (!image?.complete || image.naturalWidth <= 0 || !frame) return;
    const { ctx, camera } = options;
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
export function createSoulGroundRenderer(options: {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  ground: () => HTMLImageElement | undefined;
  viewport: () => { width: number; height: number };
  devicePixelRatio: () => number;
  active: () => boolean;
}) {
  return function drawSoulGround() {
    if (!options.active()) return;
    const image = options.ground();
    if (!image?.complete || image.naturalWidth <= 0) return;
    const { ctx, camera } = options;
    const view = options.viewport();
    const area = SOUL_VILLAGE_GROUND;
    const left = Math.max(area.x, camera.x), top = Math.max(area.y, camera.y);
    const right = Math.min(area.x + area.w, camera.x + view.width / camera.zoom), bottom = Math.min(area.y + area.h, camera.y + view.height / camera.zoom);
    if (left >= right || top >= bottom) return;
    const scaleX = image.naturalWidth / area.w, scaleY = image.naturalHeight / area.h;
    const snap = (value: number) => snapWorldRenderCoordinate(value, camera.zoom, options.devicePixelRatio());
    ctx.drawImage(image, (left - area.x) * scaleX, (top - area.y) * scaleY, (right - left) * scaleX, (bottom - top) * scaleY,
      snap(left - camera.x), snap(top - camera.y), right - left, bottom - top);
  };
}
