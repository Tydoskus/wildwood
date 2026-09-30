import { cameraZoomPreference } from "./camera-zoom-preference";

/** Aligns a world-space render coordinate to a physical display pixel. */
export function snapWorldRenderCoordinate(value: number, zoom: number, devicePixelRatio: number) {
  const scale = zoom * devicePixelRatio;
  if (!Number.isFinite(scale) || scale <= 0) return Math.round(value);
  return Math.round(value * scale) / scale;
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
  ctx.scale(labelScale, labelScale);
  try {
    draw();
  } finally {
    ctx.restore();
  }
}
