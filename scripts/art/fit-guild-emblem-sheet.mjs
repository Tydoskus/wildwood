#!/usr/bin/env node
/**
 * Fits a generated 4x4 guild badge sheet to the game's badge frames, so its
 * badges show as large as guild-emblems-v3's: each badge is found by the
 * empty space around it, scaled to v3's badge height (a wide one less, so it
 * still fits its frame), and centred in the same 300px frames v3 uses
 * (src/ui/guild-emblems.ts).
 *
 *   node scripts/art/fit-guild-emblem-sheet.mjs <generated.png> public/assets/wildstat/guild-emblems-vN.webp
 */
import sharp from "sharp";

const [input, output] = process.argv.slice(2);
if (!input || !output) { console.error("usage: fit-guild-emblem-sheet.mjs <in.png> <out.webp>"); process.exit(1); }

const SIZE = 1254, FRAME = 300;
/** guild-emblems-v3's frames, and how much of one its badges fill. */
const COLUMNS = [9, 322, 635, 948], ROWS = [10, 312, 613, 913];
const TARGET_HEIGHT = 286, MAX_WIDTH = 288;

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels } = info;
const solid = (x, y) => data[(y * W + x) * channels + 3] > 24;
/** The four bands of rows (or columns) that hold badges, split by the empty space between them. */
function bands(length, filled) {
  const runs = [];
  let start = -1;
  for (let i = 0; i <= length; i++) {
    const on = i < length && filled(i);
    if (on && start < 0) start = i;
    if (!on && start >= 0) { runs.push([start, i - 1]); start = -1; }
  }
  if (runs.length !== 4) throw new Error(`expected 4 bands, found ${runs.length}`);
  return runs;
}
const rows = bands(H, y => { for (let x = 0; x < W; x++) if (solid(x, y)) return true; return false; });
const columns = bands(W, x => { for (let y = 0; y < H; y++) if (solid(x, y)) return true; return false; });

const layers = [];
for (let cell = 0; cell < 16; cell++) {
  const [x0, x1] = columns[cell % 4], [y0, y1] = rows[Math.floor(cell / 4)];
  // The badge's own box inside its band.
  let left = x1, right = x0, top = y1, bottom = y0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (solid(x, y)) {
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  const w = right - left + 1, h = bottom - top + 1;
  const scale = Math.min(TARGET_HEIGHT / h, MAX_WIDTH / w);
  const sw = Math.round(w * scale), sh = Math.round(h * scale);
  const badge = await sharp(input).extract({ left, top, width: w, height: h }).resize(sw, sh, { kernel: "lanczos3" }).png().toBuffer();
  layers.push({ input: badge, left: COLUMNS[cell % 4] + Math.round((FRAME - sw) / 2), top: ROWS[Math.floor(cell / 4)] + Math.round((FRAME - sh) / 2) });
}
const result = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(layers).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(output);
console.log(`${output}: ${result.width}x${result.height}, ${result.size} bytes`);
