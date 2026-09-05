import atlas from "../enemy-atlases/reaper-death.mjs";

export const DREADREAPER_ATLAS = atlas;
export const DREADREAPER_SPRITE_HEIGHT = 340;
// Bosses are stationary. Retain the export as a source, but never download
// its unused walk sheet during gameplay or background preparation.
export const DREADREAPER_USED_PAGES = [...new Set([
  ...atlas.animations.idle.frames.map((frame) => frame.page),
  ...atlas.animations.attack.frames.map((frame) => frame.page),
])];

export function dreadreaperSpriteFrame(timeSeconds: number, attackElapsedSeconds?: number) {
  const motion = attackElapsedSeconds === undefined ? atlas.animations.idle : atlas.animations.attack;
  const seconds = attackElapsedSeconds ?? timeSeconds;
  const elapsed = Number.isFinite(seconds) ? Math.max(0, seconds) * 1000 : 0;
  const rawIndex = Math.floor(elapsed / motion.frameDurationMs);
  const index = motion.loop ? rawIndex % motion.frames.length : Math.min(rawIndex, motion.frames.length - 1);
  const scale = DREADREAPER_SPRITE_HEIGHT / (atlas.bounds.bottom - atlas.bounds.top);
  return {
    ...motion.frames[index],
    drawX: -atlas.anchorX * scale,
    drawY: DREADREAPER_SPRITE_HEIGHT / 2 - atlas.bounds.bottom * scale,
    drawWidth: atlas.frameWidth * scale,
    drawHeight: atlas.frameHeight * scale,
    top: -DREADREAPER_SPRITE_HEIGHT / 2,
  };
}
