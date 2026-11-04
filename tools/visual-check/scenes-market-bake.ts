// Draws every market sprite (scripts/art/market-sprites.ts) at the sheet's scale for scripts/art/bake-market-sprites.mjs
// to pack: each as a PNG with its foot's place, left on the page for the bake to read.
import { MARKET_SPRITES } from "../../scripts/art/market-sprites";

type Baked = { name: string; width: number; height: number; ax: number; ay: number; data: string };
declare global {
  interface Window { __marketBake?: Baked[] }
}

/** Sheet pixels per world unit, and room round each sprite for its outlines. */
const SCALE = 1.5, PAD = 4;

export async function marketBake() {
  const baked = MARKET_SPRITES.map(sprite => {
    const { left, right, up, down } = sprite.extents;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil((left + right + PAD * 2) * SCALE);
    canvas.height = Math.ceil((up + down + PAD * 2) * SCALE);
    const context = canvas.getContext("2d")!;
    context.scale(SCALE, SCALE);
    context.translate(left + PAD, up + PAD);
    context.lineJoin = "round";
    sprite.draw(context);
    return { name: sprite.name, width: canvas.width, height: canvas.height, ax: (left + PAD) * SCALE, ay: (up + PAD) * SCALE, data: canvas.toDataURL("image/png") };
  });
  window.__marketBake = baked;
  // The page shows how many were drawn, so a capture of the scene says the bake ran.
  document.body.textContent = `${baked.length} market sprites at ${SCALE}x`;
}
