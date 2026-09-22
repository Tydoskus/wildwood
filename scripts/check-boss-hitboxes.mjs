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

console.log("\nNot measured here (drawn with canvas primitives, not artwork):");
console.log("  dragon, frostclaw, magmalisk, gloomroot, tidewyrm, koi shogun,");
console.log("  tempest kirin, miremaw, voltwarden, gravebloom, aegis prime");
