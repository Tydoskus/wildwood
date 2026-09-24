import { AEGIS_PRIME_SPRITE_GROUND_OFFSET } from "../constants";
export { AEGIS_PRIME_ART_TOP } from "../constants";
import { drawBossSheetFrame } from "./boss-frame-crop";
export const AEGIS_PRIME_ART_SOURCE = 'assets/wildstat/aegis-prime-boss-v1.svg';

/** The shield commander uses an original vector chassis matched to the reserved sentry. */
export function drawAegisPrimeArt(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, pose: 'idle' | 'laser' | 'emp', hurt: number, sprite?: HTMLImageElement) {
  if (!sprite?.naturalWidth || !sprite.naturalHeight) return;
  const charging = pose !== 'idle';
  const breath = Math.sin(time * (charging ? 7 : 2)) * (charging ? .014 : .004);
  ctx.save();
  try {
    ctx.translate(x, y);
    ctx.fillStyle = '#020b1280';
    ctx.beginPath(); ctx.ellipse(0, AEGIS_PRIME_SPRITE_GROUND_OFFSET, 143, 35, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(pose === 'laser' ? Math.sin(time * 7) * 3 : 0, 140);
    ctx.scale(1 + breath, 1 - breath);
    ctx.imageSmoothingEnabled = true;
    // Avoid per-frame SVG filter surfaces on mobile GPUs when rapid hits keep hurt active.
    if (hurt > 0) ctx.globalAlpha *= .8;
    drawBossSheetFrame(ctx, sprite, { bossId: "AEGIS_PRIME", frame: 0, cellWidth: sprite.naturalWidth, cellHeight: sprite.naturalHeight, drawWidth: 448, drawHeight: 448, top: -240 - 140 });
  } finally { ctx.restore(); }
}
