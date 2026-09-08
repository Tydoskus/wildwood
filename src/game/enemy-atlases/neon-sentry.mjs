/** Original vector sprite sheets; a stable origin keeps all three motions aligned. */
export function neonSentryAtlas(role) {
  const clip = (row, loop, frameDurationMs) => ({
    loop, frameDurationMs, durationMs: frameDurationMs * 8,
    frames: Array.from({ length: 8 }, (_, index) => ({ page: 0, x: index * 128, y: row * 128, w: 128, h: 128 })),
  });
  return {
    frameWidth: 128, frameHeight: 128, anchorX: 64, anchorY: 109,
    bounds: { top: 4, bottom: 113, left: 15, right: 127 },
    pages: [{ src: `assets/wildstat/enemies/neon-sentry/${role}.svg`, width: 1024, height: 384 }],
    animations: { idle: clip(0, true, 140), walk: clip(1, true, 85), attack: clip(2, false, 75) },
  };
}
