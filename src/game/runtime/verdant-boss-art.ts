import { GRAVEBLOOM_SPRITE_GROUND_OFFSET } from "../constants";
export { GRAVEBLOOM_ART_TOP } from "../constants";
import { drawBossSheetFrame } from "./boss-frame-crop";
export const GRAVEBLOOM_ART_SOURCE = 'assets/wildstat/gravebloom-boss-v1.webp';

/** Authored transparent boss art with subtle breathing and ability charge motion. */
export function drawGravebloomArt(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, pose: 'idle' | 'laser' | 'emp', hurt: number, sprite?: HTMLImageElement) {
  if (!sprite?.naturalWidth || !sprite.naturalHeight) return;
  const charge = pose !== 'idle';
  const breath = Math.sin(time * (charge ? 7 : 2.2)) * (charge ? .018 : .006);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#020b0880';
  ctx.beginPath(); ctx.ellipse(0, GRAVEBLOOM_SPRITE_GROUND_OFFSET, 140, 36, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(0, 140);
  ctx.scale(1 + breath, 1 - breath);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (hurt > 0) ctx.filter = 'brightness(1.65)';
  drawBossSheetFrame(ctx, sprite, { bossId: "GRAVEBLOOM", frame: 0, cellWidth: sprite.naturalWidth, cellHeight: sprite.naturalHeight, drawWidth: 420, drawHeight: 420, top: -240 - 140 });
  ctx.restore();
}
