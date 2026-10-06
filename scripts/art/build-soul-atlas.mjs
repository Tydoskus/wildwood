#!/usr/bin/env node
/**
 * Packs the Soul Dimension's wild props into one atlas: ForestVillage's
 * nature prefabs (trees with their shadows, bushes, grass, mushrooms, stones,
 * logs), baked by compose-forest-village.mjs. The village itself comes from
 * bake-forest-village-scene.mjs.
 *
 *   tar -xzf "art-source/2D Minimal World - ForestVillage.unitypackage" -C <pkg>
 *   node scripts/art/compose-forest-village.mjs <pkg> <composed> Tree/Tree_01_Green Bush/Bush_01_Green ...
 *   node scripts/art/build-soul-atlas.mjs <composed>
 *
 * Writes public/assets/wildstat/soul-dimension/soul-atlas.webp and
 * src/game/soul-atlas.json (each frame's rect and ground anchor, in atlas
 * pixels). Everything is first brought to the pack's 100 pixels a unit and
 * then scaled by ATLAS_SCALE, so the pieces keep their sizes to each other.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "../..");
const composed = process.argv[2];
if (!composed) { console.error("usage: build-soul-atlas.mjs <composedDir>"); process.exit(1); }
const ATLAS_SCALE = .6;
const PADDING = 2;

/** Every composed prefab in the directory: the wilds' trees, bushes, grass, mushrooms, stones and logs. */
const frames = Object.keys(JSON.parse(readFileSync(join(composed, "anchors.json"), "utf8"))).map(name => ({ name, composed: name }));
// Plain sprites the pack has no prefab for: the coloured mushrooms the campaign's glowing maps use.
const mushrooms = resolve(root, "../../../art-source/vendor/forest-village/Pack/Forest/Nature/ResourcesData/Sprites/Mushroom");
const mushroomDir = existsSync(mushrooms) ? mushrooms : resolve(root, "art-source/vendor/forest-village/Pack/Forest/Nature/ResourcesData/Sprites/Mushroom");
for (const name of ["Mushroom_04_Blue", "Mushroom_05_Blue", "Mushroom_04_Purple", "Mushroom_05_Purple", "Mushroom_06_Mint"]) frames.push({ name, file: join(mushroomDir, `${name}.png`) });
// The village's stone gate, which frames the Soul Dimension's portal home.
frames.push({ name: "GateFrame_01", file: join(mushroomDir, "../../../../ForestVillage/ResourcesData/Sprites/Prop/GateFrame_01.png") });
const anchors = JSON.parse(readFileSync(join(composed, "anchors.json"), "utf8"));
const images = [];
for (const frame of frames) {
  let buffer, anchor;
  if (frame.file) {
    buffer = await sharp(frame.file).png().toBuffer();
    const meta = await sharp(buffer).metadata();
    anchor = [meta.width / 2, meta.height * .94];
  } else {
    const a = anchors[frame.composed];
    buffer = await sharp(join(composed, `${frame.composed}.webp`)).png().toBuffer();
    // The prefab's origin is its ground point, when it falls on the image; some sit off their root.
    const inside = a.originX >= 0 && a.originX <= a.width && a.originY >= a.height * .5 && a.originY <= a.height;
    anchor = inside ? [a.originX, a.originY] : [a.width / 2, a.height * .93];
  }
  const trimmed = frame.keep ? null : await sharp(buffer).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true }).catch(() => null);
  let offsetX = 0, offsetY = 0;
  if (trimmed && trimmed.info.trimOffsetLeft !== undefined) {
    offsetX = -trimmed.info.trimOffsetLeft; offsetY = -trimmed.info.trimOffsetTop;
    buffer = trimmed.data;
  }
  const meta = await sharp(buffer).metadata();
  const w = Math.max(1, Math.round(meta.width * ATLAS_SCALE)), h = Math.max(1, Math.round(meta.height * ATLAS_SCALE));
  const scaled = await sharp(buffer).resize(w, h, { kernel: "lanczos3" }).png().toBuffer();
  images.push({ name: frame.name, buffer: scaled, w, h, ax: (anchor[0] - offsetX) * ATLAS_SCALE, ay: (anchor[1] - offsetY) * ATLAS_SCALE });
}

// Shelf packing, tallest first, into a 2048-wide sheet.
const WIDTH = 2048;
images.sort((a, b) => b.h - a.h);
let x = 0, y = 0, shelf = 0;
for (const image of images) {
  if (x + image.w + PADDING > WIDTH) { x = 0; y += shelf + PADDING; shelf = 0; }
  image.x = x; image.y = y;
  x += image.w + PADDING; shelf = Math.max(shelf, image.h);
}
const height = y + shelf;
const outDir = join(root, "public/assets/wildstat/soul-dimension");
mkdirSync(outDir, { recursive: true });
await sharp({ create: { width: WIDTH, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(images.map(image => ({ input: image.buffer, left: image.x, top: image.y })))
  .webp({ quality: 92, alphaQuality: 100, effort: 6 }).toFile(join(outDir, "soul-atlas.webp"));
const atlas = Object.fromEntries(images.sort((a, b) => a.name.localeCompare(b.name)).map(image => [image.name,
  { x: image.x, y: image.y, w: image.w, h: image.h, ax: Math.round(image.ax), ay: Math.round(image.ay) }]));
writeFileSync(join(root, "src/game/soul-atlas.json"), `${JSON.stringify({ width: WIDTH, height, frames: atlas }, null, 1)}\n`);
console.log(`soul-atlas.webp ${WIDTH}x${height}, ${images.length} frames`);
