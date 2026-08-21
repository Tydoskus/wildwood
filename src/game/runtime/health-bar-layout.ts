// Text sprites now center their safe glyph bounds directly. Keep this named
// offset explicit so future raster padding changes cannot silently move labels.
export const HEALTH_BAR_TEXT_OPTICAL_OFFSET_Y = 0;

export function healthBarTextY(barY: number, barHeight: number) {
  return Math.round(barY + barHeight / 2 + HEALTH_BAR_TEXT_OPTICAL_OFFSET_Y);
}
