import { cameraZoomPreference } from "./camera-zoom-preference";

/** Aligns a world-space render coordinate to a physical display pixel. */
export function snapWorldRenderCoordinate(value: number, zoom: number, devicePixelRatio: number) {
  const scale = zoom * devicePixelRatio;
  if (!Number.isFinite(scale) || scale <= 0) return Math.round(value);
  return Math.round(value * scale) / scale;
}

/**
 * The context's transform when it draws `scale` device pixels per unit and does not rotate, else null:
 * there, a device-pixel position is known and an overlay can be put on whole pixels.
 */
export function transformAtScale(ctx: CanvasRenderingContext2D, scale: number): DOMMatrix | null {
  if (typeof ctx.getTransform !== "function") return null;
  const m = ctx.getTransform();
  if (!m || m.b !== 0 || m.c !== 0) return null;
  return Math.abs(m.a - scale) < .01 && Math.abs(m.d - scale) < .01 ? m : null;
}

/**
 * Fills a rectangle with its edges moved to the nearest whole device pixels, so it is never blurred
 * across two. Under a rotating transform it is filled as given.
 */
export function fillPixelRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  const m = typeof ctx.getTransform === "function" ? ctx.getTransform() : null;
  if (!m || m.b !== 0 || m.c !== 0) {
    ctx.fillRect(x, y, width, height);
    return;
  }
  const left = Math.round(m.a * x + m.e), right = Math.round(m.a * (x + width) + m.e);
  const top = Math.round(m.d * y + m.f), bottom = Math.round(m.d * (y + height) + m.f);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillRect(left, top, right - left, bottom - top);
  ctx.setTransform(m);
}

/**
 * Draws an overlay at a world-space render anchor while cancelling the outer
 * camera scale. The anchor still follows the world; its contents remain sized
 * in readable CSS pixels.
 */
export function drawScreenSpaceAt(
  ctx: CanvasRenderingContext2D,
  zoom: number,
  x: number,
  y: number,
  draw: () => void,
) {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  // Labels grow and shrink with the player's own zoom, so they keep their size next to the world.
  const labelScale = cameraZoomPreference() / safeZoom;
  ctx.save();
  ctx.translate(x, y);
  // The anchor on a whole device pixel, as the sprites under it are, so a name never drifts a pixel against its body.
  const m = typeof ctx.getTransform === "function" ? ctx.getTransform() : null;
  if (m && m.b === 0 && m.c === 0) ctx.setTransform(m.a, 0, 0, m.d, Math.round(m.e), Math.round(m.f));
  ctx.scale(labelScale, labelScale);
  try {
    draw();
  } finally {
    ctx.restore();
  }
}
