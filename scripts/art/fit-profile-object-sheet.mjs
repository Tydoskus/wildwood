#!/usr/bin/env node
/**
 * Fits a generated 8x8 profile-picture object sheet to the game's object
 * atlas format (profile-objects-grid-v1): 1254px square, each object found by
 * the empty space around it, scaled to one size (so a small umbrella reads as
 * well as a whale) and centred in its eighth of the sheet. Prints each
 * object's bounds, which go in src/app/profile-icon-crops.ts.
 *
 * The sheet keeps the source's transparency, so a player's chosen White or
 * Black backdrop shows behind the object; `--flatten` puts it on white as the
 * first sheets were.
 *
 *   node scripts/art/fit-profile-object-sheet.mjs <generated.png> public/assets/wildstat/profile-objects-grid-vN-alpha.webp [--flatten]
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SIZE = 1254, GRID = 8, CELL = SIZE / GRID;
/** The largest side of every object, as v1's objects run. */
const OBJECT_SIZE = 140;
/**
 * A Lanczos shrink from the 2048px source to 140px objects softens their thin
 * outlines; a light sharpen restores them without ringing or grain. Edge
 * sharpness (Laplacian variance on white) 846 unsharpened, 1407 with this; sheet
 * 1, with thicker black outlines, is 2469. Sigma 1 (1814) turned fur grainy.
 */
const SHARPEN = { sigma: .6 };
/**
 * The generator leaves its objects a shade see-through: their insides sit at
 * alpha 248–254, not 255. Everything from here up is opaque, and the
 * anti-aliased rims are stretched to match, so an object over the Black backdrop
 * is its true colour and the alpha plane compresses (sheet 2: 813k partly
 * transparent pixels before, a thin rim after).
 */
const SOLID_ALPHA = 248;
/** The Lanczos shrink leaves a faint alpha haze (1–8, under 3%) around every object: invisible, but a quarter of the alpha plane's bytes. */
const ALPHA_FLOOR = 8;
/**
 * Every profile sheet's encoding. Quality 95 measured no crisper than 92 (edge
 * sharpness 1409 against 1407) and cost 60 KB more on this sheet.
 */
export const PROFILE_SHEET_WEBP = { quality: 92, alphaQuality: 100, smartSubsample: true, effort: 6 };

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

/** Lays the source's objects out on a transparent 1254px sheet. Returns the sheet (RGBA) and each object's bounds. */
export async function fitObjectSheet(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels } = info;
  const solid = (x, y) => data[(y * W + x) * channels + 3] > 40;
  const rows = bands(H, y => { for (let x = 0; x < W; x++) if (solid(x, y)) return true; return false; });
  const columns = bands(W, x => { for (let y = 0; y < H; y++) if (solid(x, y)) return true; return false; });
  if (rows.length !== GRID || columns.length !== GRID) throw new Error(`expected ${GRID}x${GRID} bands, found ${columns.length}x${rows.length}`);

  const opaque = Buffer.from(data);
  for (let i = 3; i < opaque.length; i += channels) opaque[i] = opaque[i] >= SOLID_ALPHA ? 255 : Math.round(opaque[i] * 255 / SOLID_ALPHA);
  const source = () => sharp(opaque, { raw: { width: W, height: H, channels } });

  const layers = [], bounds = [];
  for (let cell = 0; cell < GRID * GRID; cell++) {
    const [x0, x1] = columns[cell % GRID], [y0, y1] = rows[Math.floor(cell / GRID)];
    let left = x1, right = x0, top = y1, bottom = y0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (solid(x, y)) {
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    const w = right - left + 1, h = bottom - top + 1, scale = OBJECT_SIZE / Math.max(w, h);
    const sw = Math.round(w * scale), sh = Math.round(h * scale);
    // Pad the extracted object so the sharpen sees transparency, not a cut edge, at its border.
    const object = await source().extract({ left, top, width: w, height: h }).resize(sw, sh, { kernel: "lanczos3" })
      .extend({ top: 4, bottom: 4, left: 4, right: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .sharpen(SHARPEN).png().toBuffer();
    const at = { left: Math.round((cell % GRID) * CELL + (CELL - sw) / 2), top: Math.round(Math.floor(cell / GRID) * CELL + (CELL - sh) / 2) };
    layers.push({ input: object, left: at.left - 4, top: at.top - 4 });
    bounds.push([at.left, at.top, at.left + sw - 1, at.top + sh - 1]);
  }
  const sheet = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers).raw().toBuffer();
  for (let i = 0; i < sheet.length; i += 4) if (sheet[i + 3] <= ALPHA_FLOOR) sheet[i] = sheet[i + 1] = sheet[i + 2] = sheet[i + 3] = 0;
  return { sheet, size: SIZE, bounds };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2).filter(arg => !arg.startsWith("--"));
  if (!input || !output) { console.error("usage: fit-profile-object-sheet.mjs <in.png> <out.webp> [--flatten]"); process.exit(1); }
  const { sheet, bounds } = await fitObjectSheet(input);
  let image = sharp(sheet, { raw: { width: SIZE, height: SIZE, channels: 4 } });
  if (process.argv.includes("--flatten")) image = image.flatten({ background: "#ffffff" });
  const result = await image.webp(PROFILE_SHEET_WEBP).toFile(output);
  console.log(`${output}: ${result.width}x${result.height}, ${result.size} bytes`);
  for (let row = 0; row < GRID; row++) console.log(`  ${bounds.slice(row * GRID, row * GRID + GRID).map(b => `[${b.join(",")}]`).join(", ")},`);
}
