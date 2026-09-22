// Text sprites now center their safe glyph bounds directly. Keep this named
// offset explicit so future raster padding changes cannot silently move labels.
export const HEALTH_BAR_TEXT_OPTICAL_OFFSET_Y = 0;

/**
 * The exact middle of the bar, unrounded.
 *
 * It used to round, which on an odd bar height put the digits half a pixel
 * below centre — visible once the bar got shorter. The canvas is drawn at
 * device-pixel scale, so a .5 here lands on a real pixel rather than blurring.
 */
export function healthBarTextY(barY: number, barHeight: number) {
  return barY + barHeight / 2 + HEALTH_BAR_TEXT_OPTICAL_OFFSET_Y;
}
