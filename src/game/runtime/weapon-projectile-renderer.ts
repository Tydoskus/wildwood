import { itemPresentation } from "../item-presentation";
import { PLAYER_WORLD_SCALE } from "../player-render-scale";

export function rockProjectileSize(itemId: string | undefined, naturalWidth: number, naturalHeight: number) {
  const held = itemPresentation(itemId)?.world;
  return {
    width: (held?.kind === "SPRITE" ? held.width ?? naturalWidth : naturalWidth) * PLAYER_WORLD_SCALE,
    height: (held?.kind === "SPRITE" ? held.height ?? naturalHeight : naturalHeight) * PLAYER_WORLD_SCALE,
  };
}

export function paintArrowProjectile(target: CanvasRenderingContext2D, x: number, y: number, angle: number, offset = 0) {
  target.save();
  target.translate(x, y);
  target.rotate(angle);
  target.translate(0, offset);
  target.lineCap = "round";
  target.strokeStyle = "#160b07";
  target.lineWidth = 5;
  target.beginPath(); target.moveTo(-10, 0); target.lineTo(8, 0); target.stroke();
  target.strokeStyle = "#f4ce84";
  target.lineWidth = 2;
  target.beginPath(); target.moveTo(-10, 0); target.lineTo(8, 0); target.stroke();
  target.fillStyle = "#160b07";
  target.beginPath(); target.moveTo(13, 0); target.lineTo(5, -6); target.lineTo(5, 6); target.closePath(); target.fill();
  target.fillStyle = "#d7e8ee";
  target.beginPath(); target.moveTo(10, 0); target.lineTo(6, -3); target.lineTo(6, 3); target.closePath(); target.fill();
  target.strokeStyle = "#160b07";
  target.lineWidth = 3;
  target.beginPath(); target.moveTo(-9, 0); target.lineTo(-13, -4); target.moveTo(-9, 0); target.lineTo(-13, 4); target.stroke();
  target.restore();
}


export function paintRockProjectile(ctx: CanvasRenderingContext2D, image: HTMLImageElement | undefined, itemId: string | undefined, x: number, y: number, angle: number, offset = 0) {
  if (!image?.complete || image.naturalWidth <= 0) return false;
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  const { width, height } = rockProjectileSize(itemId, image.naturalWidth, image.naturalHeight);
  ctx.drawImage(image, -width / 2, offset - height / 2, width, height);
  ctx.restore(); return true;
}
