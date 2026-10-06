/**
 * A fall into one of the Soul Dimension village's wells, as drawn: the
 * runtime (soul-dimension-runtime.ts) moves the player down into the well and
 * the camera follows; this hides whatever of them has gone past the well's
 * front lip, and shrinks them a little as they drop away.
 */
export const soulWellFall = { active: false, lip: 0, progress: 0 };

export function drawSoulWellFall(ctx: CanvasRenderingContext2D, x: number, y: number, worldY: number, drawPlayer: () => void) {
  if (!soulWellFall.active) { drawPlayer(); return; }
  ctx.save();
  // Everything below the lip is down in the well.
  ctx.beginPath();
  ctx.rect(x - 400, y - 800, 800, Math.max(0, 800 + soulWellFall.lip - worldY));
  ctx.clip();
  const scale = 1 - soulWellFall.progress * .35;
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.translate(-x, -y);
  drawPlayer();
  ctx.restore();
}
