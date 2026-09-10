/** Bone-and-vine actors share a foot anchor across idle, walk, and attack. */
export function verdantCryptAtlas(role) {
  const clip = (row, loop, frameDurationMs) => ({ loop, frameDurationMs, durationMs: frameDurationMs * 8,
    frames: Array.from({ length: 8 }, (_, i) => ({ page: 0, x: i * 128, y: row * 128, w: 128, h: 128 })) });
  return { frameWidth: 128, frameHeight: 128, anchorX: 64, anchorY: 109,
    bounds: { top: 2, bottom: 117, left: 13, right: 127 },
    pages: [{ src: `assets/wildstat/enemies/verdant-crypt/${role}.svg`, width: 1024, height: 384 }],
    animations: { idle: clip(0, true, 150), walk: clip(1, true, 90), attack: clip(2, false, 85) } };
}
