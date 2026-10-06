#!/usr/bin/env node
/**
 * Fits a generated 8x8 profile-picture object sheet to the game's object
 * atlas format (profile-objects-grid-v1): 1254px square on white, each object
 * found by the empty space around it, scaled to one size (so a small umbrella
 * reads as well as a whale) and centred in its eighth of the sheet. Prints each
 * object's bounds, which go in src/app/profile-icon-crops.ts.
 *
 *   node scripts/art/fit-profile-object-sheet.mjs <generated.png> public/assets/wildstat/profile-objects-grid-vN.webp
 */
import sharp from "sharp";

const [input, output] = process.argv.slice(2);
if (!input || !output) { console.error("usage: fit-profile-object-sheet.mjs <in.png> <out.webp>"); process.exit(1); }

const SIZE = 1254, GRID = 8, CELL = SIZE / GRID;
/** The largest side of every object, as v1's objects run. */
const OBJECT_SIZE = 140;

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels } = info;
const solid = (x, y) => data[(y * W + x) * channels + 3] > 40;
/** The bands of rows (or columns) holding objects, split by the empty space between them. */
function bands(length, filled) {
  const runs = [];
  let start = -1;
  for (let i = 0; i <= length; i++) {
    const on = i < length && filled(i);
    if (on && start < 0) start = i;
    if (!on && start >= 0) { runs.push([start, i - 1]); start = -1; }
  }
  // Specks in a gap make a band of their own: keep the eight widest, in order.
  return runs.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, GRID).sort((a, b) => a[0] - b[0]);
}
const rows = bands(H, y => { for (let x = 0; x < W; x++) if (solid(x, y)) return true; return false; });
const columns = bands(W, x => { for (let y = 0; y < H; y++) if (solid(x, y)) return true; return false; });
if (rows.length !== GRID || columns.length !== GRID) throw new Error(`expected ${GRID}x${GRID} bands, found ${columns.length}x${rows.length}`);

const layers = [], bounds = [];
for (let cell = 0; cell < GRID * GRID; cell++) {
  const [x0, x1] = columns[cell % GRID], [y0, y1] = rows[Math.floor(cell / GRID)];
  let left = x1, right = x0, top = y1, bottom = y0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (solid(x, y)) {
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  const w = right - left + 1, h = bottom - top + 1, scale = OBJECT_SIZE / Math.max(w, h);
  const sw = Math.round(w * scale), sh = Math.round(h * scale);
  const object = await sharp(input).extract({ left, top, width: w, height: h }).resize(sw, sh, { kernel: "lanczos3" }).png().toBuffer();
  const at = { left: Math.round((cell % GRID) * CELL + (CELL - sw) / 2), top: Math.round(Math.floor(cell / GRID) * CELL + (CELL - sh) / 2) };
  layers.push({ input: object, ...at });
  bounds.push([at.left, at.top, at.left + sw - 1, at.top + sh - 1]);
}
const result = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
  .composite(layers).flatten({ background: "#ffffff" }).webp({ quality: 90, effort: 6 }).toFile(output);
console.log(`${output}: ${result.width}x${result.height}, ${result.size} bytes`);
for (let row = 0; row < GRID; row++) console.log(`  ${bounds.slice(row * GRID, row * GRID + GRID).map(b => `[${b.join(",")}]`).join(", ")},`);
