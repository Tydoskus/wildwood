import { TOWN_FEET_OFFSET } from "../../../../shared/town";

/**
 * A fall into one of the town wells: the
 * runtime (town-runtime.ts) moves the player down into the well and
 * the camera follows; this hides whatever of them has gone past the well's
 * front lip, and shrinks them a little as they drop away.
 */
export const soulWellFall = { active: false, lip: 0, progress: 0, elapsed: 0, direction: 1 };

export function drawSoulWellFall(ctx: CanvasRenderingContext2D, x: number, y: number, worldY: number, drawPlayer: () => void) {
  if (!soulWellFall.active) { drawPlayer(); return; }
  ctx.save();
  // Everything below the lip is down in the well.
  ctx.beginPath();
  ctx.rect(x - 400, y - 800, 800, Math.max(0, 800 + soulWellFall.lip - worldY));
  ctx.clip();
  const scale = 1 - soulWellFall.progress * .35;
  // The lead foot catches on the rim. Tip around it before gravity takes over.
  const tip = Math.min(1, soulWellFall.elapsed / .30);
  const pivotY = y + TOWN_FEET_OFFSET;
  ctx.translate(x, pivotY);
  ctx.rotate(soulWellFall.direction * .86 * tip * tip * (3 - 2 * tip));
  ctx.scale(scale, scale);
  ctx.translate(-x, -pivotY);
  drawPlayer();
  ctx.restore();
}
