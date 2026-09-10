export const AEGIS_PRIME_ART_SOURCE = 'assets/wildstat/aegis-prime-boss-v1.svg';
export const AEGIS_PRIME_ART_TOP = -240;

/** The shield commander uses an original vector chassis matched to the reserved sentry. */
export function drawAegisPrimeArt(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, pose: 'idle' | 'laser' | 'emp', hurt: number, sprite?: HTMLImageElement) {
  if (!sprite?.naturalWidth || !sprite.naturalHeight) return;
  const charging = pose !== 'idle';
  const breath = Math.sin(time * (charging ? 7 : 2)) * (charging ? .014 : .004);
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = '#020b1280';
  ctx.beginPath(); ctx.ellipse(0, 116, 143, 35, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(pose === 'laser' ? Math.sin(time * 7) * 3 : 0, 140);
  ctx.scale(1 + breath, 1 - breath);
  ctx.imageSmoothingEnabled = true;
  if (hurt > 0) ctx.filter = 'brightness(1.65)';
  ctx.drawImage(sprite, -224, AEGIS_PRIME_ART_TOP - 140, 448, 448);
  ctx.restore();
}
