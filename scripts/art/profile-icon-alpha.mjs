#!/usr/bin/env node
/**
 * Builds the transparent profile-picture sheets that sit on each player's chosen
 * White or Black backdrop (shared/profile-icons.ts PROFILE_ICON_SHEETS).
 *
 * The first three sheets only exist flattened on white. For each one, the white
 * around every picture is removed: the near-white connected to the sheet's edge
 * (through the gaps between cells, so around every picture) is flood-filled,
 * with the pockets of backdrop that pictures close off and a thin band just
 * inside all of it where outlines are anti-aliased into that white. Each of those
 * pixels is un-blended against white: its alpha is how far it sits from white
 * toward the nearest solid colour, and its colour is what, laid over white at
 * that alpha, gives the original pixel back. On white a sheet looks as it did
 * (within the paper's noise); on black the outlines end without a pale fringe.
 * White inside a picture (eyes, teeth, highlights, white hair, a sail, a
 * teacup) is left opaque. Known leftovers, too close to the eye whites to tell
 * apart: the holes inside a few hoop earrings stay white.
 *
 * The fourth sheet has a transparent source, so it is fitted again from that
 * (scripts/art/fit-profile-object-sheet.mjs) and checked to keep the crop bounds
 * in src/app/profile-icon-crops.ts.
 *
 * The flattened sheets stay in public/ under their old names for clients that
 * predate the backdrop choice.
 *
 *   node scripts/art/profile-icon-alpha.mjs
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { fitObjectSheet, PROFILE_SHEET_WEBP } from "./fit-profile-object-sheet.mjs";

/**
 * How far from white (255 minus a pixel's darkest channel) the background may
 * drift — paper noise, compression ringing, the faint grey haze some pictures
 * sit in — and still count as background for the flood fill.
 */
export const BACKGROUND_TOLERANCE = 40;
/** Pixels this far into a picture from its background are its anti-aliased rim (Chebyshev distance). */
export const EDGE_BAND = 2;
/** The paper is this far below pure white: noise up to it is fully transparent, not a faint grey veil on black. */
export const PAPER_NOISE = 10;
/** The furthest a rim pixel looks for the solid colour it fades from. */
const COLOUR_SEARCH = 6;

const whiteness = (data, i) => 255 - Math.min(data[i], data[i + 1], data[i + 2]);

/**
 * An enclosed near-white region is a pocket of backdrop when at least a quarter
 * of it is paper white — the backdrop's own whiteness, where shaded whites such
 * as petals, a sail or a helmet sit above 10…
 */
export const POCKET_PAPER_WHITE = 6;
/** …most of the band around it is outline, not the light shading around a highlight such as a pearl's… */
export const POCKET_OUTLINE_SHARE = .66;
/** …and it is no speck: catchlights in eyes are smaller than this, in pixels. */
export const POCKET_MIN_PIXELS = 20;
/** A pixel no brighter than this in any channel is outline. */
const OUTLINE = 120;
/** How far around a pocket its outline is looked for. */
const POCKET_RING = 4;

/**
 * The background mask of a flattened sheet: 1 where a pixel is near-white and
 * reachable (4-connected, through near-white) from the sheet's outer edge, or
 * is in a pocket of the backdrop that a picture closes off — the hole in a mug's
 * handle, a key's bow, the gap between a braid and a neck.
 *
 * The gaps between cells join every cell's background to the outer edge.
 * Seeding from each cell's own border instead floods white that merely crosses
 * a cell line: the cloud under objects sheet 1's rainbow and a white braid in the
 * varied people sheet were eaten that way.
 */
export function backgroundMask(rgb, width, height, { tolerance = BACKGROUND_TOLERANCE, pockets = true } = {}) {
  const size = width * height, mask = new Uint8Array(size), stack = new Int32Array(size);
  const near = p => whiteness(rgb, p * 3) <= tolerance;
  let top = 0;
  const seed = (x, y) => { const p = y * width + x; if (!mask[p] && near(p)) { mask[p] = 1; stack[top++] = p; } };
  for (let x = 0; x < width; x++) { seed(x, 0); seed(x, height - 1); }
  for (let y = 0; y < height; y++) { seed(0, y); seed(width - 1, y); }
  while (top) {
    const p = stack[--top], x = p % width, y = (p - x) / width;
    if (x > 0) seed(x - 1, y);
    if (x < width - 1) seed(x + 1, y);
    if (y > 0) seed(x, y - 1);
    if (y < height - 1) seed(x, y + 1);
  }
  if (!pockets) return mask;
  // Every other near-white region is enclosed by a picture: keep it (eyes,
  // teeth, highlights, white hair, a sail) unless it is a pocket of backdrop.
  const region = new Int32Array(size).fill(-1), seen = new Int32Array(size).fill(-1);
  for (let start = 0, id = 0; start < size; start++) {
    if (mask[start] || region[start] >= 0 || !near(start)) continue;
    const pixels = [start]; region[start] = id;
    for (let k = 0; k < pixels.length; k++) {
      const p = pixels[k], x = p % width, y = (p - x) / width;
      for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1]) {
        if (q >= 0 && !mask[q] && region[q] < 0 && near(q)) { region[q] = id; pixels.push(q); }
      }
    }
    if (isPocket(rgb, width, height, pixels, region, seen, id)) for (const p of pixels) mask[p] = 1;
    id++;
  }
  return mask;
}

/** Whether an enclosed near-white region is backdrop (see POCKET_PAPER_WHITE). */
function isPocket(rgb, width, height, pixels, region, seen, id) {
  if (pixels.length < POCKET_MIN_PIXELS) return false;
  const whites = pixels.map(p => whiteness(rgb, p * 3)).sort((a, b) => a - b);
  if (whites[Math.floor(whites.length / 4)] > POCKET_PAPER_WHITE) return false;
  let around = 0, outline = 0;
  for (const p of pixels) {
    const x = p % width, y = (p - x) / width;
    for (let dy = -POCKET_RING; dy <= POCKET_RING; dy++) for (let dx = -POCKET_RING; dx <= POCKET_RING; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const q = ny * width + nx;
      if (region[q] === id || seen[q] === id) continue;
      seen[q] = id; around++;
      if (Math.max(rgb[q * 3], rgb[q * 3 + 1], rgb[q * 3 + 2]) <= OUTLINE) outline++;
    }
  }
  return outline >= around * POCKET_OUTLINE_SHARE;
}

/** Chebyshev distance from every pixel to the nearest background pixel, capped at `limit + 1`. */
function distanceToBackground(mask, width, height, limit) {
  const distance = new Uint8Array(width * height).fill(limit + 1);
  let frontier = [];
  for (let p = 0; p < mask.length; p++) if (mask[p]) { distance[p] = 0; frontier.push(p); }
  for (let step = 1; step <= limit && frontier.length; step++) {
    const next = [];
    for (const p of frontier) {
      const x = p % width, y = (p - x) / width;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const q = ny * width + nx;
        if (distance[q] > step) { distance[q] = step; next.push(q); }
      }
    }
    frontier = next;
  }
  return distance;
}

/**
 * For every pixel within `limit` steps of a solid pixel, the colour of the
 * nearest one (as an index into the image), else -1.
 */
function nearestSolid(solid, width, height, limit) {
  const source = new Int32Array(width * height).fill(-1);
  let frontier = [];
  for (let p = 0; p < solid.length; p++) if (solid[p]) { source[p] = p; frontier.push(p); }
  for (let step = 1; step <= limit && frontier.length; step++) {
    const next = [];
    for (const p of frontier) {
      const x = p % width, y = (p - x) / width;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const q = ny * width + nx;
        if (source[q] < 0) { source[q] = source[p]; next.push(q); }
      }
    }
    frontier = next;
  }
  return source;
}

/**
 * Turns a sheet flattened on white (RGB, 3 bytes a pixel) into RGBA with the
 * background cut away and its rims un-blended. Returns the RGBA pixels.
 */
export function removeWhiteBackground(rgb, width, height, options = {}) {
  const band = options.band ?? EDGE_BAND, paper = 255 - (options.noise ?? PAPER_NOISE);
  const mask = backgroundMask(rgb, width, height, options);
  const distance = distanceToBackground(mask, width, height, band);
  const solid = new Uint8Array(width * height);
  for (let p = 0; p < solid.length; p++) solid[p] = distance[p] > band ? 1 : 0;
  const colour = nearestSolid(solid, width, height, COLOUR_SEARCH + band);
  // How far a channel sits below the paper's white, on a 0–255 scale. Measuring
  // from the paper rather than from 255 keeps its noise from becoming a faint
  // veil, which a pale solid colour nearby would otherwise magnify.
  const below = channel => Math.max(0, paper - channel) * 255 / paper;
  const rgba = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    const i = p * 3, o = p * 4;
    const r = rgb[i], g = rgb[i + 1], b = rgb[i + 2];
    if (solid[p]) { rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255; continue; }
    // The pixel's alpha: how far it sits from white, along the line toward the
    // solid colour it fades from, and never less than its darkest channel
    // allows, or the un-blended colour would leave 0–255.
    const dr = below(r), dg = below(g), db = below(b);
    let alpha = Math.max(dr, dg, db) / 255;
    const from = colour[p];
    if (alpha > 0 && from >= 0) {
      const fr = below(rgb[from * 3]), fg = below(rgb[from * 3 + 1]), fb = below(rgb[from * 3 + 2]);
      const length = fr * fr + fg * fg + fb * fb;
      // A near-white solid colour gives no direction to measure along.
      if (length > 48 * 48) alpha = Math.max(alpha, Math.min(1, (dr * fr + dg * fg + db * fb) / length));
    }
    if (alpha <= 0) continue;
    // The colour that, over white at that alpha, gives the original pixel back.
    rgba[o] = Math.round(Math.max(0, Math.min(255, 255 - (255 - r) / alpha)));
    rgba[o + 1] = Math.round(Math.max(0, Math.min(255, 255 - (255 - g) / alpha)));
    rgba[o + 2] = Math.round(Math.max(0, Math.min(255, 255 - (255 - b) / alpha)));
    rgba[o + 3] = Math.round(alpha * 255);
  }
  return rgba;
}

/** What the sheets are made from, and the transparent sheet each becomes. */
export const ALPHA_SHEETS = [
  { from: "public/assets/wildstat/profile-portraits-grid-v2.webp", to: "public/assets/wildstat/profile-portraits-grid-v2-alpha.webp" },
  { from: "public/assets/wildstat/profile-portraits-varied-v1.webp", to: "public/assets/wildstat/profile-portraits-varied-v1-alpha.webp" },
  { from: "public/assets/wildstat/profile-objects-grid-v1.webp", to: "public/assets/wildstat/profile-objects-grid-v1-alpha.webp" },
  { fit: "art-source/generated/profile-icons/profile-objects-grid-v2.png", to: "public/assets/wildstat/profile-objects-grid-v2-alpha.webp", bounds: "OBJECT_BOUNDS_V2" },
];

/** The object bounds src/app/profile-icon-crops.ts keeps for a sheet, as written there. */
async function committedBounds(name) {
  const source = await readFile("src/app/profile-icon-crops.ts", "utf8");
  const list = source.split(`const ${name} = [`)[1]?.split("] as const")[0];
  if (!list) throw new Error(`${name} not found in src/app/profile-icon-crops.ts`);
  return [...list.matchAll(/\[(\d+),(\d+),(\d+),(\d+)\]/g)].map(match => match.slice(1).map(Number));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const sheet of ALPHA_SHEETS) {
    let image;
    if (sheet.fit) {
      const { sheet: pixels, size, bounds } = await fitObjectSheet(sheet.fit);
      const expected = await committedBounds(sheet.bounds);
      if (JSON.stringify(bounds) !== JSON.stringify(expected)) {
        throw new Error(`${sheet.fit} no longer fits the crops in src/app/profile-icon-crops.ts (${sheet.bounds}); saved pictures would shift.`);
      }
      image = sharp(pixels, { raw: { width: size, height: size, channels: 4 } });
    } else {
      const { data, info } = await sharp(sheet.from).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const pixels = removeWhiteBackground(data, info.width, info.height);
      image = sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } });
    }
    const result = await image.webp(PROFILE_SHEET_WEBP).toFile(sheet.to);
    console.log(`${sheet.to}: ${result.width}x${result.height}, ${Math.round(result.size / 1024)} KB`);
  }
}
