#!/usr/bin/env node
/**
 * Measure each boss's drawn artwork against the collision circle the server
 * hits it with, so a hitbox that does not match what a player can see shows up
 * as a number rather than as a complaint.
 *
 * The server hits a boss as a circle of RADIUS centred on its position. The
 * client draws the boss from an atlas or a sheet, anchored at that same
 * position. Those two are authored in different files and nothing has ever
 * compared them, which is how a flat 170 ended up on seven different bosses.
 *
 * Only the bosses drawn from artwork are measured here. The rest are drawn
 * with canvas primitives, so their extent is code rather than pixels and has
 * to be read off a render.
 *
 *     node scripts/check-boss-hitboxes.mjs
 */
import sharp from "sharp";
import { readFile } from "node:fs/promises";

const RADIUS = /export const (\w+)_RADIUS = (\d+);/g;
const source = await readFile("spacetimedb/src/boss-combat.ts", "utf8");
const radii = Object.fromEntries([...source.matchAll(RADIUS)].map((m) => [m[1], Number(m[2])]));

/** The opaque extent of an atlas animation, in world units around the anchor. */
function atlasExtent(atlas, spriteHeight, animation = "idle") {
  const scale = spriteHeight / (atlas.bounds.bottom - atlas.bounds.top);
  const drawX = -atlas.anchorX * scale;
  const drawY = spriteHeight / 2 - atlas.bounds.bottom * scale;
  const extent = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (const frame of atlas.animations[animation].frames) {
    const content = frame.contentBounds ?? { x: 0, y: 0, w: frame.w, h: frame.h };
    const scaleX = atlas.frameWidth * scale / frame.w;
    const scaleY = atlas.frameHeight * scale / frame.h;
    extent.left = Math.min(extent.left, drawX + content.x * scaleX);
    extent.right = Math.max(extent.right, drawX + (content.x + content.w) * scaleX);
    extent.top = Math.min(extent.top, drawY + content.y * scaleY);
    extent.bottom = Math.max(extent.bottom, drawY + (content.y + content.h) * scaleY);
  }
  return extent;
}

/** The same, for a boss drawn from a strip of equal frames. */
async function sheetExtent(path, { frames, drawWidth, groundOffset, groundBaseline }) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const frameWidth = Math.floor(info.width / frames);
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] < 16) continue;
      const withinFrame = x % frameWidth;
      if (withinFrame < left) left = withinFrame;
      if (withinFrame > right) right = withinFrame;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  const scale = drawWidth / frameWidth;
  const drawHeight = drawWidth * info.height / frameWidth;
  const topOffset = groundOffset - drawHeight * groundBaseline;
  return {
    left: (left - frameWidth / 2) * scale,
    right: (right + 1 - frameWidth / 2) * scale,
    top: topOffset + top * scale,
    bottom: topOffset + (bottom + 1) * scale,
  };
}

/**
 * A boss drawn as a strip of equal cells, scaled into drawWidth x drawHeight
 * centred on the anchor plus its Y offset. The cell usually has transparent
 * margin, which is why the status bar floats: it hangs off the cell's top edge
 * rather than the top of the creature.
 */
async function cellExtent(path, { frames, rows = 1, drawWidth, drawHeight, offsetY }) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cellWidth = Math.floor(info.width / frames);
  const cellHeight = Math.floor(info.height / rows);
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] < 16) continue;
      const withinX = x % cellWidth, withinY = y % cellHeight;
      if (withinX < left) left = withinX;
      if (withinX > right) right = withinX;
      if (withinY < top) top = withinY;
      if (withinY > bottom) bottom = withinY;
    }
  }
  const scaleX = drawWidth / cellWidth, scaleY = drawHeight / cellHeight;
  return {
    left: (left - cellWidth / 2) * scaleX,
    right: (right + 1 - cellWidth / 2) * scaleX,
    top: offsetY + (top - cellHeight / 2) * scaleY,
    bottom: offsetY + (bottom + 1 - cellHeight / 2) * scaleY,
    // What the status bar is currently anchored to, for comparison.
    cellTop: offsetY - drawHeight / 2,
  };
}

const round = (value, width = 5) => String(Math.round(value)).padStart(width);

function report(name, radius, extent) {
  const halfWidth = Math.max(Math.abs(extent.left), Math.abs(extent.right));
  const centreOffset = (extent.left + extent.right) / 2;
  console.log(
    `${name.padEnd(12)} radius ${round(radius, 4)}` +
    `  art x[${round(extent.left)},${round(extent.right)}] y[${round(extent.top)},${round(extent.bottom)}]` +
    `  half-width ${round(halfWidth, 4)}  off-centre ${round(centreOffset, 4)}`,
  );
}

const rhino = (await import("../src/game/enemy-atlases/rhino-armor-512.mjs")).default;
const reaper = (await import("../src/game/enemy-atlases/reaper-death-512.mjs")).default;

report("ironhorn", radii.IRONHORN, atlasExtent(rhino, 340));
report("dreadreaper", radii.DREADREAPER, atlasExtent(reaper, 340));

// Prismshell is a single texture with authored bounds rather than an atlas.
const prismshell = { left: 17, top: 15, right: 1242, bottom: 1239 };
const prismshellScale = 340 / (prismshell.bottom - prismshell.top);
const prismshellHalf = (prismshell.right - prismshell.left) * prismshellScale / 2;
report("prismshell", radii.PRISMSHELL, { left: -prismshellHalf, right: prismshellHalf, top: -170, bottom: 170 });

report("spider", radii.SPIDER, await sheetExtent(
  "public/assets/wildstat/desert-scorpion-boss-spritesheet-v1.webp",
  { frames: 4, drawWidth: 330, groundOffset: 55, groundBaseline: 0.88 },
));

const SHEETS = [
  ["frostclaw", "FROSTCLAW", "frostclaw-boss-spritesheet.webp", { frames: 4, drawWidth: 330, drawHeight: 440, offsetY: -12 }],
  ["magmalisk", "MAGMALISK", "magmalisk-boss-spritesheet.webp", { frames: 4, drawWidth: 390, drawHeight: 520, offsetY: -8 }],
  ["gloomroot", "GLOOMROOT", "gloomroot-boss-spritesheet-v1.webp", { frames: 2, rows: 2, drawWidth: 430, drawHeight: 430, offsetY: -18 }],
  ["tidewyrm", "TIDEWYRM", "tidewyrm-boss-spritesheet-v1.webp", { frames: 4, drawWidth: 440, drawHeight: 440, offsetY: -28 }],
  ["koi shogun", "KOI_SHOGUN", "koi-shogun-boss-spritesheet-v1.webp", { frames: 4, drawWidth: 330, drawHeight: 440, offsetY: -30 }],
  ["tempest kirin", "TEMPEST_KIRIN", "tempest-kirin-boss-spritesheet-v1.webp", { frames: 4, drawWidth: 356, drawHeight: 542, offsetY: -42 }],
  ["miremaw", "MIREMAW", "miremaw-boss-spritesheet-v1.webp", { frames: 4, drawWidth: 470, drawHeight: 532, offsetY: -45 }],
];

console.log("");
for (const [name, key, file, geometry] of SHEETS) {
  const extent = await cellExtent(`public/assets/wildstat/${file}`, geometry);
  report(name, radii[key], extent);
  const halfHeight = Math.max(Math.abs(extent.top), Math.abs(extent.bottom));
  console.log(
    `${"".padEnd(12)} half-height ${round(halfHeight, 4)} vs radius ${round(radii[key], 4)}` +
    `  status bar floats ${round(extent.top - extent.cellTop, 4)}px above the artwork`,
  );
}

console.log("\nNot measured here: dragon, voltwarden, gravebloom, aegis prime");
