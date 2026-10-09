// Bakes Ox, the game's original player sprite, into public/assets/wildstat/ox-idle.webp.
//
// The source (art-source/ox/og-player-spritesheet.png, from commit c45270ef) is a 4×4 sheet of pixel art
// upscaled to 1254 px: 320 px square at its own resolution. Sampling it back down to 320 recovers the
// art's pixels exactly. Ox stands still facing down, so only the first frame of the first row is kept,
// cropped to its bounds, with the upscaler's soft halo cut to hard alpha so it stays crisp.
//
//   node scripts/art/bake-ox-sprite.mjs
import sharp from "sharp";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const SOURCE = resolve(root, "art-source/ox/og-player-spritesheet.png");
const OUT = resolve(root, "public/assets/wildstat/ox-idle.webp");
const NATIVE = 320, CELL = NATIVE / 4;

const { data } = await sharp(SOURCE).resize({ width: NATIVE, height: NATIVE, kernel: "nearest" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (let i = 3; i < data.length; i += 4) data[i] = data[i] >= 128 ? 255 : 0;

let left = CELL, top = CELL, right = 0, bottom = 0;
for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
  if (!data[(y * NATIVE + x) * 4 + 3]) continue;
  left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
}
const width = right - left + 1, height = bottom - top + 1;
await sharp(data, { raw: { width: NATIVE, height: NATIVE, channels: 4 } })
  .extract({ left, top, width, height }).webp({ lossless: true }).toFile(OUT);
console.log(`ox-idle.webp: ${width} × ${height}`);
