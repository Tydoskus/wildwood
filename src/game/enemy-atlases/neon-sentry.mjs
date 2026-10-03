/**
 * Original vector sprite sheets, shipped as bitmaps at twice their viewBox
 * (scripts/rasterize-vector-sprites.mjs); a stable origin keeps all three
 * motions aligned. Coordinates below are in viewBox units, scaled to the bitmap.
 */
export const VECTOR_SHEET_SCALE = 2;

/** Scales a viewBox-unit atlas to its bitmap: every frame, anchor and bound. */
export function vectorSheetAtlas(atlas) {
  const s = VECTOR_SHEET_SCALE;
  const box = ({ x, y, w, h, ...rest }) => ({ ...rest, x: x * s, y: y * s, w: w * s, h: h * s });
  return {
    ...atlas,
    frameWidth: atlas.frameWidth * s, frameHeight: atlas.frameHeight * s,
    anchorX: atlas.anchorX * s, anchorY: atlas.anchorY * s,
    bounds: Object.fromEntries(Object.entries(atlas.bounds).map(([edge, value]) => [edge, value * s])),
    pages: atlas.pages.map(page => ({ ...page, width: page.width * s, height: page.height * s })),
    animations: Object.fromEntries(Object.entries(atlas.animations).map(([name, clip]) => [name, { ...clip, frames: clip.frames.map(box) }])),
  };
}

export function neonSentryAtlas(role, src = `assets/wildstat/enemies/neon-sentry/${role}.webp`) {
  const clip = (row, loop, frameDurationMs) => ({
    loop, frameDurationMs, durationMs: frameDurationMs * 8,
    frames: Array.from({ length: 8 }, (_, index) => ({ page: 0, x: index * 128, y: row * 128, w: 128, h: 128 })),
  });
  return vectorSheetAtlas({
    frameWidth: 128, frameHeight: 128, anchorX: 64, anchorY: 109,
    bounds: { top: 4, bottom: 113, left: 15, right: 127 },
    pages: [{ src, width: 1024, height: 384 }],
    animations: { idle: clip(0, true, 140), walk: clip(1, true, 85), attack: clip(2, false, 75) },
  });
}
