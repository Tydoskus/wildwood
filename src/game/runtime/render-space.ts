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
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1 / safeZoom, 1 / safeZoom);
  try {
    draw();
  } finally {
    ctx.restore();
  }
}
