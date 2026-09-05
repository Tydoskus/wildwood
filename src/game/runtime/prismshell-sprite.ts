import atlas from "../enemy-atlases/carapace-castle-512.mjs";

export const PRISMSHELL_ATLAS = atlas;
export const PRISMSHELL_SPRITE_HEIGHT = 340;
// Bosses are stationary. Retain the export as a source, but never download
// its unused walk sheet during gameplay or background preparation.
export const PRISMSHELL_USED_PAGES = [...new Set([
  ...atlas.animations.idle.frames.map((frame) => frame.page),
  ...atlas.animations.attack.frames.map((frame) => frame.page),
])];

export function prismshellSpriteFrame(timeSeconds: number, attackElapsedSeconds?: number) {
  const motion = attackElapsedSeconds === undefined ? atlas.animations.idle : atlas.animations.attack;
  const seconds = attackElapsedSeconds ?? timeSeconds;
  const elapsed = Number.isFinite(seconds) ? Math.max(0, seconds) * 1000 : 0;
  const rawIndex = Math.floor(elapsed / motion.frameDurationMs);
  const index = motion.loop ? rawIndex % motion.frames.length : Math.min(rawIndex, motion.frames.length - 1);
  const scale = PRISMSHELL_SPRITE_HEIGHT / (atlas.bounds.bottom - atlas.bounds.top);
  return {
    ...motion.frames[index],
    drawX: -atlas.anchorX * scale,
    drawY: PRISMSHELL_SPRITE_HEIGHT / 2 - atlas.bounds.bottom * scale,
    drawWidth: atlas.frameWidth * scale,
    drawHeight: atlas.frameHeight * scale,
    top: -PRISMSHELL_SPRITE_HEIGHT / 2,
  };
}
