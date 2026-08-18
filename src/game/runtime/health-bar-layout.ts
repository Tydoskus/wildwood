/**
 * Rounded digits carry almost no visual weight below their baseline. Moving
 * them slightly below the bar's geometric center makes them look centered.
 */
export const HEALTH_BAR_TEXT_OPTICAL_OFFSET_Y = 4;

export function healthBarTextY(barY: number, barHeight: number) {
  return Math.round(barY + barHeight / 2 + HEALTH_BAR_TEXT_OPTICAL_OFFSET_Y);
}
