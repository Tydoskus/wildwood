import { bossAnimationClock } from "./boss-animation-clock";
import atlas from "../enemy-atlases/carapace-angler-512.mjs";

export const CARAPACE_ANGLER_ATLAS = atlas;
export const CARAPACE_ANGLER_SPRITE_HEIGHT = 340;
// Bosses are stationary. Retain the export as a source, but never download
// its unused walk sheet during gameplay or background preparation.
export const CARAPACE_ANGLER_USED_PAGES = [...new Set([
  ...atlas.animations.idle.frames.map((frame) => frame.page),
  ...atlas.animations.attack.frames.map((frame) => frame.page),
])];

export function carapaceAnglerSpriteFrame(timeSeconds: number, attackElapsedSeconds?: number) {
  const { attacking, elapsed } = bossAnimationClock(timeSeconds, attackElapsedSeconds, atlas.animations.attack.durationMs);
  const motion = attacking ? atlas.animations.attack : atlas.animations.idle;
  const rawIndex = Math.floor(elapsed / motion.frameDurationMs);
  const index = motion.loop ? rawIndex % motion.frames.length : Math.min(rawIndex, motion.frames.length - 1);
  const scale = CARAPACE_ANGLER_SPRITE_HEIGHT / (atlas.bounds.bottom - atlas.bounds.top);
  return {
    ...motion.frames[index],
    tuningFrame: index + (attacking ? atlas.animations.idle.frames.length : 0),
    drawX: -atlas.anchorX * scale,
    drawY: CARAPACE_ANGLER_SPRITE_HEIGHT / 2 - atlas.bounds.bottom * scale,
    drawWidth: atlas.frameWidth * scale,
    drawHeight: atlas.frameHeight * scale,
    top: -CARAPACE_ANGLER_SPRITE_HEIGHT / 2,
  };
}
