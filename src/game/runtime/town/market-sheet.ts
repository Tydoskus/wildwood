import sheet from "../../market-sprites.json";

/**
 * The Trade Chrysanthemum's sprites, baked into one sheet (scripts/art/bake-market-sprites.mjs) and drawn as the
 * village's props are: nothing about them is painted while the game runs.
 */
export const MARKET_SPRITES_SOURCE = "assets/wildstat/market/market-sprites.webp";

type Frame = { x: number; y: number; w: number; h: number; ax: number; ay: number };
const frames = new Map<string, Frame>(Object.entries(sheet.frames as Record<string, readonly number[]>)
  .map(([name, [x, y, w, h, ax, ay]]) => [name, { x, y, w, h, ax, ay }]));

export const marketFrame = (name: string): Frame | null => frames.get(name) ?? null;
/** The sheet's pixels are this many world units each: a market prop's scale, to stand at its own size. */
export const MARKET_SPRITE_SCALE = 1 / sheet.scale;
