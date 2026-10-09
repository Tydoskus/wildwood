import { residentDrawable } from "./resident-image";

/**
 * Ox is the game's original player sprite (art-source/ox, baked by scripts/art/bake-ox-sprite.mjs): its
 * first front-facing frame, at the art's own pixel size. He stands still, facing down.
 */
export const OX_SPRITE_SOURCE = "assets/wildstat/ox-idle.webp";
/** World units per art pixel: his 47-pixel frame stands a horn's height over a player beside him. */
export const OX_SCALE = 1.35;

let image: HTMLImageElement | null = null;
/** Loaded the first time he is drawn: only the Town's bottom-right room ever shows him. */
function oxImage() {
  if (!image && typeof Image !== "undefined") {
    image = new Image();
    image.decoding = "async";
    image.src = OX_SPRITE_SOURCE;
  }
  return image;
}

/** Draws Ox with his feet at (x, feetY), kept pixel-crisp. Nothing is drawn until the art has loaded. */
export function drawOxSprite(ctx: CanvasRenderingContext2D, x: number, feetY: number) {
  const art = oxImage();
  if (!art?.complete || !art.naturalWidth) return false;
  const width = art.naturalWidth * OX_SCALE, height = art.naturalHeight * OX_SCALE;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(residentDrawable(art), x - width / 2, feetY - height, width, height);
  ctx.restore();
  return true;
}
