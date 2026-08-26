/** Aligns a world-space render coordinate to a physical display pixel. */
export function snapWorldRenderCoordinate(value: number, zoom: number, devicePixelRatio: number) {
  const scale = zoom * devicePixelRatio;
  if (!Number.isFinite(scale) || scale <= 0) return Math.round(value);
  return Math.round(value * scale) / scale;
}
