#!/usr/bin/env node
/**
 * Bakes the guild hall (shared/guild-hall.ts): its courtyard and building
 * outside, and the great hall inside in each of its three sizes, from the
 * ForestVillage pack (the grey stone hall, its arched door, torches, lamps,
 * braziers, trees, the fountain, tables, stools, barrels) and a few pieces the
 * pack has no art for, drawn here in its flat outlined style: crest banners,
 * carpets, the hearth, the trophy shelf and wall, candelabras. The guild's own
 * crest goes on the banners (and the great hearth) at runtime.
 *
 * The courtyard is a clearing in the middle of the outdoors, one ring of trees
 * round it as props a player walks among, on a ground image with a margin of
 * grass beyond them. Outdoors the camera keeps to that image and zooms out no
 * further than it, so nothing past it is ever drawn.
 *
 * Every piece that an upgrade adds says so (`when`: [part, min, max]), and the
 * runtime shows only what the guild has. The courtyard is laid out about the
 * hall at (800, 760) and placed in the world at OUT; the rooms are in the hall
 * map's own coordinates.
 *
 *   node scripts/art/bake-guild-hall.mjs <extractedPackageDir> [--preview <outDir> <levels json>]
 *
 * Writes public/assets/wildstat/guild-hall/{hall-props,hall-ground,hall-rooms}.webp,
 * src/game/guild-hall-scene.json and shared/guild-hall-geometry.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { byGuid, drawList, loadPackage } from "./unity-prefab.mjs";
import { spriteImage } from "./unity-prefab.mjs";
import { packSprite, spritePixels, woodFloor } from "./soul-interiors.mjs";

const args = process.argv.slice(2);
const packageDir = args[0];
if (!packageDir) { console.error("usage: bake-guild-hall.mjs <extractedPackageDir> [--preview <outDir> <levels json>]"); process.exit(1); }
const previewAt = args.indexOf("--preview");
loadPackage(packageDir);
const root = resolve(import.meta.dirname, "../..");

// ---------------------------------------------------------------- layout
/** The courtyard: the hall's front (its door's sill) faces south over a paved yard to the portal home. */
const HALL_X = 800, HALL_BASE = 760;
const PLAZA = { left: 500, right: 1100, top: 700, bottom: 1340 };
const PATH = { left: 730, right: 870, top: 1340, bottom: 1960 };
/**
 * The great hall in each size: floor from (x, y), w by h. Only the guild's size is ever shown, so all three
 * stand on one centre, far enough east of the courtyard that no screen sees both. Everything east of
 * INTERIOR_LEFT is dark but the room.
 */
const ROOM_CENTER = 5_000, INTERIOR_LEFT = 3_600;
/** The hall map's height (shared/guild-hall.ts GUILD_HALL_WORLD): the outdoors is x 0..INTERIOR_LEFT, y 0..WORLD_H. */
const WORLD_H = 4_000;
/** Where players can be outside: trees baked into the ground stay clear of it, so none is ever drawn over a player. */
const CLEARING = { left: 185, top: 385, right: 1_425, bottom: 2_030 };
/** Where the courtyard's layout stands in the world: the clearing in the middle of the outdoors, the same wood all round. */
const OUT = { x: INTERIOR_LEFT / 2 - HALL_X, y: Math.round((WORLD_H / 2 - (CLEARING.top + CLEARING.bottom) / 2) / 10) * 10 };
/** The ground image: the clearing and a margin of grass round its ring of trees. Outdoors the camera keeps to it. */
const NEAR = { left: CLEARING.left - 360, top: CLEARING.top - 360, right: CLEARING.right + 360, bottom: CLEARING.bottom + 360 };
const WALL_H = 190, CAP = 24, GAP = 96;
const ROOMS = [[960, 560], [1_300, 640], [1_700, 720]].map(([w, h]) => ({ x: ROOM_CENTER - w / 2, y: Math.round(WORLD_H / 2 - (h - WALL_H) / 2), w, h }));
const TABLE_SEATS = [6, 10, 14, 20];
/** Furniture inside is drawn a little bigger than the village's: a great hall's table, not a cottage's. */
const FURNITURE = .78;
/**
 * The back wall in each size: the hearth's and trophies' distance from the side walls, the side banners' from
 * the middle, and each upgrade's width by level.
 */
const WALLS = [
  { side: 185, banner: 145, hearth: [0, 140, 180], trophies: [0, 180, 220] },
  { side: 230, banner: 220, hearth: [0, 160, 230], trophies: [0, 210, 260] },
  { side: 290, banner: 290, hearth: [0, 160, 240], trophies: [0, 220, 270] },
];

// ---------------------------------------------------------------- frames
const frames = new Map();
function addFrame(image) {
  const key = createHash("sha1").update(image.buffer).digest("hex");
  if (!frames.has(key)) frames.set(key, { id: frames.size, ...image });
  return frames.get(key).id;
}

/** A prefab drawn as the pack builds it, at `scale` game units a pack pixel: its body and shadow apart. */
async function compose(name, { scale = .6, keep = () => true, recolor = null } = {}) {
  const match = [...byGuid].find(([, entry]) => entry.path.endsWith(`/${name}.prefab`));
  if (!match) throw new Error(`no ${name}.prefab`);
  const images = [];
  for (const item of drawList(match[0])) {
    if (!keep(item)) continue;
    images.push({ item, ...(await spriteImage(recolor?.(item) ?? item, { solidShadow: true })) });
  }
  const draw = async list => {
    if (!list.length) return null;
    const minX = Math.floor(Math.min(...list.map(i => i.left))), minY = Math.floor(Math.min(...list.map(i => i.top)));
    const maxX = Math.ceil(Math.max(...list.map(i => i.left + i.width))), maxY = Math.ceil(Math.max(...list.map(i => i.top + i.height)));
    const full = await sharp({ create: { width: maxX - minX, height: maxY - minY, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(list.map(i => ({ input: i.buffer, left: Math.round(i.left - minX), top: Math.round(i.top - minY) }))).png().toBuffer();
    const w = Math.max(1, Math.round((maxX - minX) * scale)), h = Math.max(1, Math.round((maxY - minY) * scale));
    return { buffer: await sharp(full).resize(w, h, { fit: "fill", kernel: "lanczos3" }).png().toBuffer(), w, h, pivotX: -minX * scale, pivotY: -minY * scale };
  };
  return { body: await draw(images.filter(i => !i.shadow)), shadow: await draw(images.filter(i => i.shadow)), items: images };
}
/** One pack sprite alone, by name, at a scale, with its pivot. */
async function single(name, scale) {
  const sprite = packSprite(name);
  if (!sprite) throw new Error(`no sprite ${name}`);
  const pixels = await spritePixels(sprite);
  const meta = await sharp(pixels).metadata();
  const w = Math.max(1, Math.round(meta.width * scale)), h = Math.max(1, Math.round(meta.height * scale));
  return { buffer: await sharp(pixels).resize(w, h, { fit: "fill", kernel: "lanczos3" }).png().toBuffer(), w, h,
    pivotX: sprite.pivot[0] * w, pivotY: (1 - sprite.pivot[1]) * h };
}
async function svgImage(svg, pivotX, pivotY, sprites = []) {
  let buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  // Pack sprites laid over the drawing: [image, left, top].
  if (sprites.length) buffer = await sharp(buffer).composite(sprites.map(([image, left, top]) => ({ input: image.buffer, left: Math.round(left), top: Math.round(top) }))).png().toBuffer();
  const meta = await sharp(buffer).metadata();
  return { buffer, w: meta.width, h: meta.height, pivotX: pivotX ?? meta.width / 2, pivotY: pivotY ?? meta.height };
}
/** The same image mirrored, its pivot with it. */
async function mirrored(image) {
  return { ...image, buffer: await sharp(image.buffer).flop().png().toBuffer(), pivotX: image.w - image.pivotX };
}

// ---------------------------------------------------------------- the scene
const props = [], solids = [], crests = [], seats = [], boards = [];
/** Added to everything placed: OUT while the courtyard is laid out, nothing for the rooms. */
const shift = { x: 0, y: 0 };
const when = (...conditions) => conditions.length ? conditions : undefined;
/** A piece standing at (x, y): its depth is its foot unless told otherwise. */
function put(image, x, y, options = {}) {
  if (!image) return;
  props.push({ f: addFrame(image), x: Math.round(x + shift.x), y: Math.round(y + shift.y), d: Math.round((options.depth ?? y) + shift.y), ...(options.ground ? { ground: true } : {}),
    ...(options.shadow ? { shadow: true } : {}), ...(options.when ? { when: options.when } : {}), ...(options.anim ? { anim: options.anim } : {}),
    ...(options.open !== undefined ? { open: options.open, door: 0 } : {}) });
}
function putPrefab(composed, x, y, options = {}) {
  put(composed.shadow, x, y, { ...options, shadow: true });
  put(composed.body, x, y, options);
}
function block(left, top, right, bottom, options = {}) {
  solids.push({ points: [left + shift.x, top + shift.y, right + shift.x, top + shift.y, right + shift.x, bottom + shift.y, left + shift.x, bottom + shift.y].map(Math.round),
    ...(options.when ? { when: options.when } : {}) });
}
/** A prefab standing at (x, y) that nobody walks through: its foot is solid, `half` wide each way. */
function stand(composed, x, y, half, options = {}) {
  putPrefab(composed, x, y, options);
  block(x - half, y - 8, x + half, y + 5, options);
}

// Banners: royal blue cloth with gold trim and a V-cut foot, outlined like the pack. The crest is painted on at runtime.
const BLUE = "#2e4f9c", BLUE_DARK = "#203a78", GOLD = "#e3b24a", GOLD_DARK = "#b9862c", INK = "#2b1d14";
function bannerCloth(w, h) {
  const v = h * .18;
  return `<path d="M3 3H${w - 3}V${h - v}L${w / 2} ${h - 3}L3 ${h - v}Z" fill="${BLUE}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M${w * .5} 3V${h - 6}" stroke="${BLUE_DARK}" stroke-width="${w * .5}" stroke-opacity=".22"/>
    <path d="M11 9H${w - 11}V${h - v - 4}L${w / 2} ${h - 13}L11 ${h - v - 4}Z" fill="none" stroke="${GOLD}" stroke-width="4" stroke-linejoin="round"/>`;
}
/** A banner on a pole, standing in the yard: the crest's centre and size, from its foot. */
async function standingBanner() {
  const w = 96, cloth = 136, pole = 230;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w + 20}" height="${pole + 16}">
    <rect x="${w / 2 + 4}" y="12" width="12" height="${pole}" rx="4" fill="#7b4f2c" stroke="${INK}" stroke-width="3"/>
    <rect x="6" y="22" width="${w + 8}" height="12" rx="6" fill="#8a5a32" stroke="${INK}" stroke-width="3"/>
    <circle cx="${w / 2 + 10}" cy="12" r="10" fill="${GOLD}" stroke="${INK}" stroke-width="3"/>
    <g transform="translate(10 30)">${bannerCloth(w, cloth)}</g>
    <ellipse cx="${w / 2 + 10}" cy="${pole + 8}" rx="18" ry="6" fill="#000" fill-opacity=".25"/></svg>`;
  return { image: await svgImage(svg, w / 2 + 10, pole + 8), crest: { dx: 0, dy: -(pole + 8) + 30 + cloth * .42, size: w * .72 } };
}
/** A banner hanging from a rod on a wall. */
async function wallBanner(w, cloth) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w + 24}" height="${cloth + 22}">
    <rect x="2" y="4" width="${w + 20}" height="12" rx="6" fill="#8a5a32" stroke="${INK}" stroke-width="3"/>
    <circle cx="8" cy="10" r="7" fill="${GOLD}" stroke="${INK}" stroke-width="3"/><circle cx="${w + 16}" cy="10" r="7" fill="${GOLD}" stroke="${INK}" stroke-width="3"/>
    <g transform="translate(12 12)">${bannerCloth(w, cloth)}</g></svg>`;
  return { image: await svgImage(svg, (w + 24) / 2, cloth + 22), crest: { dx: 0, dy: -(cloth + 22) + 12 + cloth * .42, size: w * .74 } };
}
function crest(x, depthY, dy, size, options = {}) {
  crests.push({ x: Math.round(x + shift.x), d: Math.round(depthY + shift.y), dy: Math.round(dy), size: Math.round(size), ...(options.when ? { when: options.when } : {}) });
}

/** A fire's flickering frames, from a pack fire prefab's flame, at a scale: shared by every fire of that kind. */
async function flames(prefab, scale) {
  const item = (await compose(prefab, { scale, keep: entry => /^Fire_c/.test(entry.name) })).items[0].item;
  const ids = [];
  for (const name of ["Fire_c01", "Fire_c02", "Fire_c03", "Fire_c04", "Fire_c05"]) {
    const image = await spriteImage({ ...item, sprite: packSprite(name) }, { solidShadow: true });
    const w = Math.round(image.width * scale), h = Math.round(image.height * scale);
    ids.push(addFrame({ buffer: await sharp(image.buffer).resize(w, h).png().toBuffer(), w, h, pivotX: -image.left * scale, pivotY: -image.top * scale }));
  }
  return { frames: ids, times: ids.map((_, index) => +(index / 10).toFixed(3)), length: ids.length / 10 };
}
const frameOf = id => [...frames.values()].find(entry => entry.id === id);

// ---------------------------------------------------------------- outside
shift.x = OUT.x; shift.y = OUT.y;
const hall = await compose("House_Width_Gray_3", { scale: 1, keep: item => !/^Door/.test(item.name) });
const hallDoor = (await compose("House_Width_Gray_3", { scale: 1, keep: item => /^Door/.test(item.name) }));
const doorItem = hallDoor.items[0].item;
const openDoor = await spriteImage({ ...doorItem, sprite: packSprite("Door_06_Open") }, { solidShadow: true });
putPrefab(hall, HALL_X, HALL_BASE);
// The door is its own piece, to swing open: drawn at its place on the wall, a hair in front of it.
const doorBody = hallDoor.body;
const openBody = { buffer: openDoor.buffer, w: openDoor.width, h: openDoor.height, pivotX: -openDoor.left, pivotY: -openDoor.top };
props.push({ f: addFrame(doorBody), x: HALL_X + OUT.x, y: HALL_BASE + OUT.y, d: HALL_BASE + 1 + OUT.y, open: addFrame(openBody), door: 0 });
const hallLeft = HALL_X - hall.body.pivotX, hallRight = hallLeft + hall.body.w;
// The walls stand on their base: the front of the hall is solid but its door.
const doorSill = HALL_BASE + 2;
const doorHalf = Math.round(doorBody.w / 2 - 10);
block(hallLeft + 18, HALL_BASE - 90, HALL_X - doorHalf - 6, HALL_BASE + 6);
block(HALL_X + doorHalf + 6, HALL_BASE - 90, hallRight - 18, HALL_BASE + 6);
block(HALL_X - doorHalf - 6, HALL_BASE - 90, HALL_X + doorHalf + 6, HALL_BASE - 6);

// Banners: one over the door always, two at the door, then four more round the yard's head.
const wall = await wallBanner(96, 132);
put(wall.image, HALL_X, HALL_BASE - 176, { depth: HALL_BASE + 2 });
crest(HALL_X, HALL_BASE + 3, -176 + wall.crest.dy, wall.crest.size);
const pole = await standingBanner();
for (const [x, y, min] of [[HALL_X - 222, HALL_BASE + 46, 1], [HALL_X + 222, HALL_BASE + 46, 1],
  [PLAZA.left - 30, PLAZA.top + 330, 2], [PLAZA.right + 30, PLAZA.top + 330, 2], [PATH.left - 80, PATH.top - 10, 2], [PATH.right + 80, PATH.top - 10, 2]]) {
  put(pole.image, x, y, { when: when(["banners", min, 9]) });
  crest(x, y + 1, pole.crest.dy, pole.crest.size, { when: when(["banners", min, 9]) });
  block(x - 8, y - 6, x + 8, y + 4, { when: when(["banners", min, 9]) });
}

// Lights: two torches at the door always; lamp posts down the path, then braziers round the yard's heart.
const torch = await compose("Fire_Torch_01", { scale: .8, keep: item => !/^Fire_c/.test(item.name) });
const flameAnim = await flames("Fire_Torch_01", .8);
function putTorch(x, y, options = {}) {
  putPrefab(torch, x, y, options);
  props.push({ f: flameAnim.frames[0], x: x + OUT.x, y: y + OUT.y, d: y + OUT.y + .5, anim: flameAnim, ...(options.when ? { when: options.when } : {}) });
  block(x - 6, y - 5, x + 6, y + 4, options);
}
putTorch(HALL_X - 96, HALL_BASE + 26);
putTorch(HALL_X + 96, HALL_BASE + 26);
const yardLamp = await compose("Lamp_01", { scale: .85 });
for (const y of [PATH.top + 110, PATH.top + 290, PATH.top + 470]) for (const x of [PATH.left - 28, PATH.right + 28])
  stand(yardLamp, x, y, 8, { when: when(["lights", 1, 9]) });
const brazier = await compose("Fire_Torch_04", { scale: .62, keep: item => !/^Fire_c/.test(item.name) });
const brazierFlames = await flames("Fire_Torch_04", .62);
for (const [x, y] of [[HALL_X - 245, 925], [HALL_X + 245, 925], [HALL_X - 245, 1095], [HALL_X + 245, 1095]]) {
  stand(brazier, x, y, 20, { when: when(["lights", 2, 9]) });
  props.push({ f: brazierFlames.frames[0], x: x + OUT.x, y: y + OUT.y, d: y + OUT.y + .5, anim: brazierFlames, when: when(["lights", 2, 9]) });
}

// The wood round the yard: rows of trees beyond it, solid, so the yard is the place to be.
const trees = ["Tree_01_Green", "Tree_04_Green", "Tree_07_Green", "Tree_13_Green", "Tree_02_Green"];
const treeImages = [];
for (const name of trees) treeImages.push(await compose(name, { scale: .6 }));
let seed = 11;
const random = () => { seed = (seed * 1_103_515_245 + 12_345) >>> 0; return seed / 4_294_967_296; };
let treeIndex = 0;
const nextTree = () => treeImages[treeIndex++ % treeImages.length];
for (let x = 200; x <= 1400; x += 120) putPrefab(nextTree(), x + random() * 16 - 8, 400 + random() * 12);
// The portal home stands at the path's end: keep the trees off it.
for (let x = 200; x <= 1400; x += 120) if (Math.abs(x - HALL_X) >= 220) putPrefab(nextTree(), x + random() * 16 - 8, 2060 + random() * 12);
for (let y = 540; y <= 1920; y += 140) for (const x of [160, 1440]) putPrefab(nextTree(), x + random() * 12 - 6, y + random() * 12);
block(0, 0, 1600, 420); block(0, 2040, 1600, 2400); block(0, 0, 200, 2400); block(1400, 0, 1600, 2400);

// About the hall: a wood pile and a water barrel against its walls, bushes at the yard's corners.
const bushes = [];
for (const name of ["Bush_01_Green", "Bush_03_Green", "Bush_02_Green"]) bushes.push(await compose(name, { scale: .6 }));
const logs = await compose("Log_Pile_02", { scale: .8 });
const stump = await compose("Stump_Axe_01", { scale: .7 });
const waterBarrel = await compose("Ork_01_Water", { scale: .7 });
const bucket = await compose("Bucket_01", { scale: .6 });
stand(logs, hallRight + 26, HALL_BASE - 10, 34);
stand(stump, hallRight + 74, HALL_BASE + 18, 18);
stand(waterBarrel, hallLeft - 24, HALL_BASE - 6, 22);
stand(bucket, hallLeft - 64, HALL_BASE + 14, 14);
for (const [x, y, kind] of [[PLAZA.left - 80, PLAZA.top + 470, 1], [PLAZA.right + 80, PLAZA.top + 470, 1], [PLAZA.left - 130, PLAZA.top + 60, 0], [PLAZA.right + 130, PLAZA.top + 60, 0]]) {
  putPrefab(bushes[kind], x, y);
  block(x - 30, y - 10, x + 30, y + 6);
}

// Trees And Flowers: flower beds by the yard and the path, young trees and blossom between them.
const garden = await single("Garden_01", .6);
for (const [x, y] of [[PLAZA.left - 175, PLAZA.top + 290], [PLAZA.right + 175, PLAZA.top + 290], [PATH.left - 150, PATH.top + 300], [PATH.right + 150, PATH.top + 300]])
  put(garden, x, y, { ground: true, when: when(["courtyard", 1, 9]) });
const youngTree = await compose("Tree_08_Green", { scale: .5 });
for (const [x, y] of [[PLAZA.left - 190, PLAZA.top + 70], [PLAZA.right + 190, PLAZA.top + 70], [PATH.left - 250, PATH.top + 520], [PATH.right + 250, PATH.top + 520]])
  stand(youngTree, x, y, 16, { when: when(["courtyard", 1, 9]) });
// Fountain Garden: the fountain at the yard's heart, round hedges about it.
const fountain = await compose("Fountain_02_Top_Angel", { scale: .62 });
const fountainY = PLAZA.top + 330;
putPrefab(fountain, HALL_X, fountainY, { when: when(["courtyard", 2, 9]) });
{
  const r = 64, points = [];
  for (let i = 0; i < 16; i++) points.push(HALL_X + OUT.x + Math.cos(i / 16 * Math.PI * 2) * r, fountainY + OUT.y - 22 + Math.sin(i / 16 * Math.PI * 2) * r * .55);
  solids.push({ points: points.map(Math.round), when: when(["courtyard", 2, 9]) });
}
for (const [x, y] of [[HALL_X - 140, fountainY - 60], [HALL_X + 140, fountainY - 60]]) {
  putPrefab(bushes[2], x, y, { when: when(["courtyard", 2, 9]) });
  block(x - 28, y - 10, x + 28, y + 6, { when: when(["courtyard", 2, 9]) });
}

// ---------------------------------------------------------------- the ground
// The yard's ground, in the Town village's own colours (sampled from village-ground.webp): its field and lighter
// patches of grass, one soft-edged dirt yard in front of the hall and down to the portal, pebbles laid at its heart;
// the wood just round it, a little darker the deeper it goes, to the tone of the repeating wood beyond.
const GRASS = "#54783c", GRASS_LIGHT = "#60844c", GRASS_DARK = "#4a6b35", DIRT = "#b89474", DIRT_MARK = "#a8845f", DIRT_EDGE = "#7c6044";
const PEBBLE = ["#a9a59c", "#9d998f", "#b3afa5"], PEBBLE_EDGE = "#7c776e";
const groundScale = .5;
/** Whether a point is on the dirt yard or its path (with a margin), where no grass grows. */
const onYard = (x, y, margin = 0) => (x > 470 - margin && x < 1130 + margin && y > 690 - margin && y < 1210 + margin)
  || (x > 400 - margin && x < 1200 + margin && y > 830 - margin && y < 1080 + margin)
  || (x > 728 - margin && x < 872 + margin && y > 1150 && y < 1910)
  || ((x - HALL_X) ** 2 / (140 + margin) ** 2 + (y - (PATH.bottom - 40)) ** 2 / (82 + margin) ** 2 < 1);
const inClearing = (x, y, margin = 0) => x > CLEARING.left - margin && x < CLEARING.right + margin && y > CLEARING.top - margin && y < CLEARING.bottom + margin;
/** The undergrowth along the clearing's edge. */
const undergrowth = [];
for (const name of ["Bush_01_Green", "Bush_03_Green", "Bush_05_Green"]) undergrowth.push(await compose(name, { scale: .6 }));
/** Overlays at their pivots in a W by H picture whose top left is (originX, originY), cropped to it. */
async function place(list, W, H, originX, originY) {
  const out = [];
  for (const { image, x, y } of list) {
    if (!image) continue;
    const left = Math.round(x - originX - image.pivotX), top = Math.round(y - originY - image.pivotY);
    const l = Math.max(0, left), t = Math.max(0, top), r = Math.min(W, left + image.w), b = Math.min(H, top + image.h);
    if (l >= r || t >= b) continue;
    const input = l === left && t === top && r === left + image.w && b === top + image.h ? image.buffer
      : await sharp(image.buffer).extract({ left: l - left, top: t - top, width: r - l, height: b - t }).png().toBuffer();
    out.push({ input, left: l, top: t });
  }
  return out;
}
/** Shadows overlap as one, at the pack's strength, as the runtime's shadow layer draws them. */
async function shadowLayer(list, W, H, originX, originY) {
  return sharp(await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(await place(list, W, H, originX, originY)).png().toBuffer())
    .composite([{ input: Buffer.from([0, 0, 0, 56]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: "dest-in" }]).png().toBuffer();
}
const groundDir = join(root, "public/assets/wildstat/guild-hall");
mkdirSync(groundDir, { recursive: true });

{
  const W = NEAR.right - NEAR.left, H = NEAR.bottom - NEAR.top;
  const X = x => x - NEAR.left, Y = y => y - NEAR.top;
  let state = 29;
  const next = () => { state = (state * 1_103_515_245 + 12_345) >>> 0; return state / 4_294_967_296; };
  const yard = [
    `<rect x="${X(470)}" y="${Y(690)}" width="660" height="520" rx="90"/>`,
    `<rect x="${X(400)}" y="${Y(830)}" width="800" height="250" rx="80"/>`,
    `<rect x="${X(728)}" y="${Y(1150)}" width="144" height="760" rx="44"/>`,
    `<ellipse cx="${X(HALL_X)}" cy="${Y(PATH.bottom - 40)}" rx="140" ry="82"/>`,
  ].join("");
  // Soft patches of lighter grass in the clearing, each a few overlapping blobs.
  const patches = [];
  for (const [cx, cy, size] of [[330, 600, 1], [1230, 1240, 1.1], [330, 1470, 1.2], [1180, 560, .8], [560, 1760, .9], [1100, 1800, .8], [300, 1050, .7]]) {
    for (let i = 0; i < 4; i++) {
      const rx = (50 + next() * 40) * size, ry = (30 + next() * 26) * size;
      patches.push(`<ellipse cx="${(X(cx) + (next() - .5) * 90 * size).toFixed(1)}" cy="${(Y(cy) + (next() - .5) * 50 * size).toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}"/>`);
    }
  }
  const marks = [];
  for (let i = 0; i < 320; i++) {
    const x = 220 + next() * 1160, y = 440 + next() * 1600;
    if (onYard(x, y, 10)) continue;
    marks.push(`<path d="M${X(x) - 5} ${Y(y) - 3}L${X(x)} ${Y(y) + 2}L${X(x) + 5} ${Y(y) - 3}" fill="none" stroke="${GRASS_LIGHT}" stroke-width="2.5" stroke-linecap="round"/>`);
  }
  for (let i = 0; i < 110; i++) {
    const x = 410 + next() * 780, y = 700 + next() * 1220;
    if (onYard(x, y, -12)) marks.push(`<path d="M${X(x) - 8} ${Y(y)}H${X(x) + 8}" stroke="${DIRT_MARK}" stroke-width="2.5" stroke-linecap="round" stroke-opacity=".6"/>`);
  }
  const pebbles = [];
  const pebble = (x, y, r) => pebbles.push(`<ellipse cx="${X(x).toFixed(1)}" cy="${Y(y).toFixed(1)}" rx="${(r * 1.25).toFixed(1)}" ry="${r.toFixed(1)}" fill="${PEBBLE[Math.floor(next() * PEBBLE.length)]}" stroke="${PEBBLE_EDGE}" stroke-width="2"/>`);
  // The heart of the yard, before the door: an even oval of pebbles, as the village square has them, with a kerb of bigger stones.
  for (let y = 1000 - 120; y <= 1000 + 120; y += 17) for (let x = HALL_X - 200 + (Math.round(y / 17) % 2) * 9; x <= HALL_X + 200; x += 19) {
    if (((x - HALL_X) / 200) ** 2 + ((y - 1000) / 120) ** 2 > .86) continue;
    pebble(x + next() * 6 - 3, y + next() * 5 - 2.5, 5 + next() * 2.5);
  }
  for (let i = 0; i < 64; i++) { const angle = i / 64 * Math.PI * 2; pebble(HALL_X + Math.cos(angle) * 200, 1000 + Math.sin(angle) * 120, 7 + next() * 1.5); }
  // A line of them down the path, and round the portal's pad.
  for (let y = 1120; y < PATH.bottom - 100; y += 16) pebble(HALL_X + next() * 30 - 15, y + next() * 6, 4 + next() * 3);
  for (let i = 0; i < 40; i++) { const angle = i / 40 * Math.PI * 2; pebble(HALL_X + Math.cos(angle) * 112, PATH.bottom - 40 + Math.sin(angle) * 62, 4 + next() * 3); }
  // The clearing's grass, its edge ragged like the yard's; outside it the wood's own floor shows through.
  const clearingPath = `M${X(CLEARING.left - 40)} ${Y(CLEARING.top + 120)}V${Y(CLEARING.bottom - 60)}Q${X(CLEARING.left - 40)} ${Y(CLEARING.bottom + 60)} ${X(CLEARING.left + 120)} ${Y(CLEARING.bottom + 60)}H${X(CLEARING.right - 120)}Q${X(CLEARING.right + 40)} ${Y(CLEARING.bottom + 60)} ${X(CLEARING.right + 40)} ${Y(CLEARING.bottom - 60)}V${Y(CLEARING.top + 120)}Q${X(CLEARING.right + 40)} ${Y(CLEARING.top - 20)} ${X(CLEARING.right - 120)} ${Y(CLEARING.top - 20)}H${X(CLEARING.left + 120)}Q${X(CLEARING.left - 40)} ${Y(CLEARING.top - 20)} ${X(CLEARING.left - 40)} ${Y(CLEARING.top + 120)}Z`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><filter id="fringe" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".35" numOctaves="1" seed="4"/>
      <feDisplacementMap in="SourceGraphic" scale="5" xChannelSelector="R" yChannelSelector="G"/></filter>
      <filter id="ragged" x="-2%" y="-2%" width="104%" height="104%"><feTurbulence type="fractalNoise" baseFrequency=".02" numOctaves="2" seed="7"/>
      <feDisplacementMap in="SourceGraphic" scale="70" xChannelSelector="R" yChannelSelector="G"/></filter></defs>
    <rect width="${W}" height="${H}" fill="${GRASS_DARK}"/><path d="${clearingPath}" fill="${GRASS}" filter="url(#ragged)"/>
    <g fill="${GRASS_LIGHT}" filter="url(#fringe)">${patches.join("")}</g>
    <g filter="url(#fringe)"><g fill="${DIRT_EDGE}" stroke="${DIRT_EDGE}" stroke-width="10">${yard}</g><g fill="${DIRT}">${yard}</g></g>
    ${marks.join("")}${pebbles.join("")}</svg>`;
  const base = await sharp(Buffer.from(svg)).png().toBuffer();

  // What lies on the ground: grass tufts, flowers and small stones in the clearing, mushrooms and stones under the wood.
  const tufts = [];
  for (const name of ["Grass_04_Green", "Grass_05_Green", "Grass_06_Green", "Grass_07_Green", "Grass_08_Green"]) tufts.push((await compose(name, { scale: .6 })).body);
  const flowers = [(await compose("Flower_01_Blue", { scale: .9 })).body, (await compose("Flower_01_Yellow", { scale: .9 })).body];
  const pebblesSmall = [];
  for (const name of ["Stone_05_Gray", "Stone_06_Gray", "Stone_03_Gray"]) pebblesSmall.push(await compose(name, { scale: .45 }));
  const mushrooms = [];
  for (const name of ["Mushroom_01_Pink", "Mushroom_02_White", "Mushroom_03_Yellow"]) mushrooms.push((await compose(name, { scale: .55 })).body);
  const lying = [], shadows = [];
  const lay = (image, x, y) => image && lying.push({ image, x, y });
  for (let i = 0; i < 150; i++) {
    const x = CLEARING.left + next() * (CLEARING.right - CLEARING.left), y = CLEARING.top + 40 + next() * (CLEARING.bottom - CLEARING.top - 40);
    if (onYard(x, y, 24) || (x > hallLeft - 90 && x < hallRight + 110 && y < HALL_BASE + 40)) continue;
    lay(tufts[Math.floor(next() * tufts.length)], x, y);
  }
  for (let i = 0; i < 46; i++) {
    const cx = CLEARING.left + 30 + next() * (CLEARING.right - CLEARING.left - 60), cy = CLEARING.top + 80 + next() * (CLEARING.bottom - CLEARING.top - 120);
    if (onYard(cx, cy, 40) || (cx > hallLeft - 90 && cx < hallRight + 110 && cy < HALL_BASE + 40)) continue;
    const kind = flowers[Math.floor(next() * 2)];
    for (let j = 0; j < 4; j++) lay(kind, cx + (next() - .5) * 44, cy + (next() - .5) * 26);
  }
  for (let i = 0; i < 22; i++) {
    const x = CLEARING.left + 20 + next() * (CLEARING.right - CLEARING.left - 40), y = CLEARING.top + 60 + next() * (CLEARING.bottom - CLEARING.top - 80);
    if (onYard(x, y, -30) || !onYard(x, y, 30)) continue;
    const stone = pebblesSmall[Math.floor(next() * pebblesSmall.length)];
    shadows.push({ image: stone.shadow, x, y }); lay(stone.body, x, y);
  }

  // Only bushes stand on the ground image; the one ring of trees round the clearing are props.
  const standing = [];
  const inside = (x, y, image) => X(x) - image.pivotX >= 0 && X(x) - image.pivotX + image.w <= W && Y(y) - image.pivotY >= 0 && Y(y) - image.pivotY + image.h <= H;
  /** A tree there is never drawn over someone in the clearing: behind the north edge, or wholly beside or below it. */
  const clear = (x, y, image) => {
    const half = Math.max(image.pivotX, image.w - image.pivotX) * .85, height = image.pivotY;
    return y <= CLEARING.top || x - half >= CLEARING.right || x + half <= CLEARING.left || y - height >= CLEARING.bottom;
  };
  // Undergrowth along the wood's edge, behind the ring of trees.
  for (let i = 0; i < 40; i++) {
    const side = Math.floor(next() * 4), along = next();
    const x = side === 0 ? CLEARING.left - 60 - next() * 60 : side === 1 ? CLEARING.right + 70 + next() * 60 : CLEARING.left + along * (CLEARING.right - CLEARING.left);
    const y = side === 2 ? CLEARING.top - 10 - next() * 40 : side === 3 ? CLEARING.bottom + 60 + next() * 50 : CLEARING.top + along * (CLEARING.bottom - CLEARING.top);
    const bush = undergrowth[Math.floor(next() * undergrowth.length)];
    if ((!clear(x, y, bush.body) && !(side === 3 && y - bush.body.pivotY >= CLEARING.bottom - 40)) || !inside(x, y, bush.body)) continue;
    standing.push({ image: bush.body, shadow: bush.shadow, x, y });
    if (next() < .4) lay(mushrooms[Math.floor(next() * mushrooms.length)], x + (next() - .5) * 60, y + 10);
  }
  for (const item of standing) shadows.push({ image: item.shadow, x: item.x, y: item.y });
  standing.sort((a, b) => a.y - b.y);

  const full = await sharp(base).composite([...await place(lying, W, H, NEAR.left, NEAR.top), { input: await shadowLayer(shadows, W, H, NEAR.left, NEAR.top), left: 0, top: 0 },
    ...await place(standing, W, H, NEAR.left, NEAR.top)]).png().toBuffer();
  await sharp(full).resize(Math.round(W * groundScale), Math.round(H * groundScale)).webp({ quality: 78, alphaQuality: 90, effort: 6 }).toFile(join(groundDir, "hall-ground.webp"));
}

// ---------------------------------------------------------------- inside
shift.x = 0; shift.y = 0;
const wallSprite = await spritePixels(packSprite("Module_Width_01"));
const wallMeta = await sharp(wallSprite).metadata();
const wallW = Math.round(wallMeta.width * WALL_H / wallMeta.height);
const wallTile = await sharp(wallSprite).resize(wallW, WALL_H, { fit: "fill", kernel: "lanczos3" }).png().toBuffer();
const wallPost = Math.round(28 * WALL_H / wallMeta.height);
const windowBody = (await compose("Window_03_Ivory", { scale: .78, recolor: item => /Window_In/.test(item.name ?? "") ? { ...item, color: { r: .78, g: .9, b: .95, a: 1 } } : null })).body;
const windowImage = { ...windowBody, pivotX: windowBody.w / 2, pivotY: 0 };
const WINDOW_TOP = 20;
const stool = await compose("Chair_01_Brown", { scale: FURNITURE });
const stoolLight = await compose("Chair_01_LightBrown", { scale: FURNITURE });
const lamp = await compose("Lamp_01", { scale: FURNITURE });
const hangingLamp = await compose("Lamp_02", { scale: FURNITURE });
const hangingLampRight = { body: await mirrored(hangingLamp.body), shadow: await mirrored(hangingLamp.shadow) };
const board = await compose("Board_01", { scale: FURNITURE });
const barrel = await compose("Ork_01", { scale: FURNITURE });
const barrelShut = await compose("Ork_01_Close", { scale: FURNITURE });
const crate = await compose("Box_02", { scale: FURNITURE });
const crateSmall = await compose("Box_01", { scale: FURNITURE * .85 });
const chest = await compose("Chest_02_Gold", { scale: FURNITURE });
const sideTable = await compose("Table_05", { scale: FURNITURE });
const pail = await compose("Bucket_02", { scale: FURNITURE * .8 });
const firewood = (await compose("Log_Pile_03", { scale: FURNITURE })).body;
const shield = (await compose("Signboard_02_Brown", { scale: .62 })).body;
const rackRail = (await compose("WeaponRack_01", { scale: FURNITURE })).body;
const rackWeapons = [];
for (const name of ["Weapon_04", "Weapon_01", "Weapon_03", "Weapon_06", "Weapon_02"]) rackWeapons.push(await single(name, FURNITURE));

/** The carpet down the table's length: red with gold, a pattern down its middle, flat on the floor. */
async function carpet(w, h) {
  const diamonds = [];
  for (let x = 70; x < w - 60; x += 64) diamonds.push(`<path d="M${x} ${h / 2 - 16}L${x + 14} ${h / 2}L${x} ${h / 2 + 16}L${x - 14} ${h / 2}Z" fill="#a8483a" stroke="#c9a14a" stroke-width="2"/>`);
  return svgImage(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="10" fill="#8e3b2e" stroke="#5d2219" stroke-width="4"/>
    <rect x="16" y="14" width="${w - 32}" height="${h - 28}" rx="6" fill="none" stroke="#c9a14a" stroke-width="4"/>
    <rect x="28" y="26" width="${w - 56}" height="${h - 52}" rx="4" fill="none" stroke="#c9a14a" stroke-width="2" stroke-dasharray="10 8"/>
    ${diamonds.join("")}
    ${[8, w - 8].map(x => Array.from({ length: Math.floor((h - 30) / 14) }, (_, i) => `<path d="M${x} ${22 + i * 14}h${x < w / 2 ? -6 : 6}" stroke="#c9a14a" stroke-width="2.5" stroke-linecap="round"/>`).join("")).join("")}</svg>`, w / 2, h / 2);
}
/**
 * The great table, one piece as long as its seats need: a plank top, its front apron and legs, outlined like the
 * pack, and a place laid before every seat (plates and cups), bread and fruit down the middle.
 */
async function longTable(length, perSide, spacing) {
  const top = 70, apron = 26, legs = 22, w = length, h = top + apron + legs + 8;
  const planks = [];
  for (let y = 10; y < top - 4; y += 14) planks.push(`<path d="M10 ${y}H${w - 10}" stroke="#8a5a32" stroke-width="2" stroke-opacity=".55"/>`);
  for (let x = 120; x < w - 60; x += 160) planks.push(`<path d="M${x} 6V${top - 4}" stroke="#8a5a32" stroke-width="2" stroke-opacity=".4"/>`);
  const legX = [16, w - 34, ...(w > 400 ? [w / 2 - 9] : [])];
  const laid = [];
  for (let i = 0; i < perSide; i++) {
    const x = w / 2 + (i - (perSide - 1) / 2) * spacing;
    for (const [y, cupSide] of [[17, 1], [top - 16, -1]]) {
      laid.push(`<ellipse cx="${x}" cy="${y}" rx="15" ry="8" fill="#d9d4c7" stroke="${INK}" stroke-width="2.5"/><ellipse cx="${x}" cy="${y}" rx="8" ry="4" fill="#c4bdae"/>`);
      const cx = x + cupSide * 22 * (i % 2 ? -1 : 1);
      laid.push(`<rect x="${cx - 6}" y="${y - 12}" width="12" height="14" rx="3" fill="#9a6a3c" stroke="${INK}" stroke-width="2.5"/><ellipse cx="${cx}" cy="${y - 12}" rx="6" ry="2.5" fill="#e8d9a8" stroke="${INK}" stroke-width="2"/>`);
    }
  }
  // Bread and a bowl of fruit between the places, along the table's middle.
  for (let i = 0; i < Math.max(1, Math.floor(perSide / 2)); i++) {
    const x = w / 2 + (i - (Math.max(1, Math.floor(perSide / 2)) - 1) / 2) * spacing * 2, y = top / 2 + 1;
    laid.push(i % 2
      ? `<ellipse cx="${x}" cy="${y}" rx="20" ry="9" fill="#c98b45" stroke="${INK}" stroke-width="2.5"/><path d="M${x - 10} ${y - 3}l4 5M${x} ${y - 4}l4 5M${x + 10} ${y - 3}l-1 5" stroke="#8a5528" stroke-width="2"/>`
      : `<ellipse cx="${x}" cy="${y + 2}" rx="19" ry="8" fill="#8a5a32" stroke="${INK}" stroke-width="2.5"/><circle cx="${x - 7}" cy="${y - 3}" r="6" fill="#c7402e" stroke="${INK}" stroke-width="2"/><circle cx="${x + 6}" cy="${y - 3}" r="6" fill="#86b04a" stroke="${INK}" stroke-width="2"/><circle cx="${x}" cy="${y - 8}" r="5" fill="#e3b24a" stroke="${INK}" stroke-width="2"/>`);
  }
  return svgImage(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    ${legX.map(x => `<rect x="${x}" y="${top + apron - 6}" width="18" height="${legs + 8}" rx="3" fill="#6d4426" stroke="${INK}" stroke-width="3"/>`).join("")}
    <rect x="3" y="${top - 6}" width="${w - 6}" height="${apron + 6}" rx="6" fill="#8a5a32" stroke="${INK}" stroke-width="4"/>
    <path d="M10 ${top + 6}H${w - 10}" stroke="#a46d3d" stroke-width="3" stroke-linecap="round"/>
    <rect x="3" y="3" width="${w - 6}" height="${top}" rx="10" fill="#c08a52" stroke="${INK}" stroke-width="4"/>
    ${planks.join("")}<path d="M14 9H${w - 14}" stroke="#ddb07a" stroke-width="3" stroke-linecap="round"/>${laid.join("")}</svg>`, w / 2, top + apron + legs);
}
/** A three-branched gold candlestick for the table, lit. */
async function candelabra() {
  const flame = (x, y) => `<path d="M${x} ${y - 13}C${x + 5} ${y - 6} ${x + 5} ${y} ${x} ${y}C${x - 5} ${y} ${x - 5} ${y - 6} ${x} ${y - 13}Z" fill="#ffcf5a" stroke="#c4561c" stroke-width="2"/>`;
  const candle = (x, y) => `<rect x="${x - 4}" y="${y}" width="8" height="15" rx="2" fill="#f4ead2" stroke="${INK}" stroke-width="2.5"/>${flame(x, y - 1)}`;
  return svgImage(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="74">
    <path d="M14 42C14 54 50 54 50 42M32 54V40" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
    <path d="M14 42C14 54 50 54 50 42M32 54V40" fill="none" stroke="${GOLD}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M32 54V66" stroke="${INK}" stroke-width="8" stroke-linecap="round"/><path d="M32 54V66" stroke="${GOLD}" stroke-width="4" stroke-linecap="round"/>
    <ellipse cx="32" cy="68" rx="13" ry="4.5" fill="${GOLD}" stroke="${INK}" stroke-width="2.5"/>
    ${[[14, 42], [50, 42], [32, 36]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="7" ry="3" fill="${GOLD_DARK}" stroke="${INK}" stroke-width="2"/>`).join("")}
    ${candle(14, 27)}${candle(50, 27)}${candle(32, 21)}</svg>`, 32, 70);
}
/** A gold cup, its foot at (x, y), `h` tall; `metal` picks gold, silver or bronze. */
function cup(x, y, h, metal = "gold") {
  const [fill, shine] = { gold: [GOLD, "#fff3c4"], silver: ["#c9ced6", "#ffffff"], bronze: ["#c27c45", "#f0c49a"] }[metal];
  const r = h * .3, top = y - h, neck = top + h * .58;
  return `<g><path d="M${x - r} ${top}H${x + r}C${x + r} ${top + h * .42} ${x + r * .45} ${neck - 2} ${x + 2} ${neck}V${y - 8}H${x + r * .7}V${y}H${x - r * .7}V${y - 8}H${x - 2}V${neck}C${x - r * .45} ${neck - 2} ${x - r} ${top + h * .42} ${x - r} ${top}Z" fill="${fill}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M${x - r} ${top + 5}C${x - r * 1.7} ${top + 5} ${x - r * 1.7} ${top + h * .38} ${x - r * .65} ${top + h * .38}M${x + r} ${top + 5}C${x + r * 1.7} ${top + 5} ${x + r * 1.7} ${top + h * .38} ${x + r * .65} ${top + h * .38}" fill="none" stroke="${INK}" stroke-width="3"/>
    <path d="M${x - r * .55} ${top + 4}V${top + h * .3}" stroke="${shine}" stroke-width="3" stroke-linecap="round"/></g>`;
}
/** Stones laid in courses inside a shape, outlined like the pack's walls. */
function stoneCourses(left, top, w, h, seed, clipId) {
  let state = seed;
  const next = () => { state = (state * 1_103_515_245 + 12_345) >>> 0; return state / 4_294_967_296; };
  const stones = [];
  for (let y = top + 3, row = 0; y < top + h; y += 22, row++) for (let x = left - (row % 2) * 16 - 4; x < left + w; x += 32) {
    stones.push(`<rect x="${(x + 1.5).toFixed(1)}" y="${y + 1.5}" width="${(28 + next() * 3).toFixed(1)}" height="19" rx="6" fill="${["#9a948b", "#8c867d", "#a59f95", "#948e84"][Math.floor(next() * 4)]}" stroke="#57524b" stroke-width="2.5"/>`);
  }
  return `<g clip-path="url(#${clipId})">${stones.join("")}</g>`;
}
/**
 * The hearth on the back wall, its chimney breast up to the ceiling: a stone fireplace with a wood mantel, then a
 * great hearth with candles and firewood, the guild's crest on its breast. Its foot is the wall's foot.
 */
async function hearthArt(w, level) {
  const great = level >= 2;
  const W = w + 24, foot = WALL_H, H = foot + 24, x0 = 12;
  const boxH = great ? 116 : 100, boxTop = foot - boxH;
  const breastW = Math.round(w * (great ? .66 : .6)), breastX = x0 + (w - breastW) / 2;
  const mouthW = w * (great ? .58 : .54), mouthH = boxH * .62, mouthX = x0 + (w - mouthW) / 2, mouthTop = foot - 6 - mouthH;
  const mantelY = boxTop - 6;
  const mouth = `M${mouthX} ${foot - 6}V${mouthTop + mouthW * .28}A${mouthW / 2} ${mouthW * .28} 0 0 1 ${mouthX + mouthW} ${mouthTop + mouthW * .28}V${foot - 6}Z`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><clipPath id="breast"><rect x="${breastX}" y="0" width="${breastW}" height="${mantelY}"/></clipPath>
      <clipPath id="box"><rect x="${x0}" y="${boxTop}" width="${w}" height="${boxH}" rx="6"/></clipPath>
      <radialGradient id="glow" cx=".5" cy="1" r=".9"><stop offset="0" stop-color="#ffb347"/><stop offset=".45" stop-color="#c4561c"/><stop offset="1" stop-color="#1d130d"/></radialGradient></defs>
    <rect x="${breastX}" y="-4" width="${breastW}" height="${mantelY + 4}" fill="#7d776e" stroke="${INK}" stroke-width="4"/>
    ${stoneCourses(breastX, 0, breastW, mantelY, w * 7 + 1, "breast")}
    <rect x="${breastX}" y="-4" width="${breastW}" height="${mantelY + 4}" fill="none" stroke="${INK}" stroke-width="4"/>
    <rect x="${x0}" y="${boxTop}" width="${w}" height="${boxH}" rx="6" fill="#7d776e"/>
    ${stoneCourses(x0, boxTop, w, boxH, w * 13 + 5, "box")}
    <rect x="${x0}" y="${boxTop}" width="${w}" height="${boxH}" rx="6" fill="none" stroke="${INK}" stroke-width="4"/>
    <path d="${mouth}" fill="url(#glow)" stroke="#57524b" stroke-width="9" stroke-linejoin="round"/>
    <path d="${mouth}" fill="none" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M${mouthX + mouthW * .2} ${foot - 10}L${mouthX + mouthW * .78} ${foot - 22}M${mouthX + mouthW * .22} ${foot - 22}L${mouthX + mouthW * .8} ${foot - 10}" stroke="${INK}" stroke-width="11" stroke-linecap="round"/>
    <path d="M${mouthX + mouthW * .2} ${foot - 10}L${mouthX + mouthW * .78} ${foot - 22}M${mouthX + mouthW * .22} ${foot - 22}L${mouthX + mouthW * .8} ${foot - 10}" stroke="#7b4f2c" stroke-width="6" stroke-linecap="round"/>
    <rect x="${x0 - 8}" y="${mantelY - 8}" width="${w + 16}" height="20" rx="5" fill="#6d4a2c" stroke="${INK}" stroke-width="4"/>
    <path d="M${x0 - 2} ${mantelY - 2}H${x0 + w + 2}" stroke="#94673d" stroke-width="3" stroke-linecap="round"/>
    <rect x="${x0 - 12}" y="${foot - 6}" width="${w + 24}" height="22" rx="6" fill="#8c867d" stroke="${INK}" stroke-width="3.5"/>
    <path d="M${x0 - 6} ${foot}H${x0 + w + 6}" stroke="#a59f95" stroke-width="3" stroke-linecap="round"/>
    ${great
      ? `${[x0 + 14, x0 + w - 14].map(x => `<rect x="${x - 5}" y="${mantelY - 30}" width="10" height="22" rx="2" fill="#f4ead2" stroke="${INK}" stroke-width="2.5"/>
          <path d="M${x} ${mantelY - 44}C${x + 5} ${mantelY - 37} ${x + 5} ${mantelY - 31} ${x} ${mantelY - 31}C${x - 5} ${mantelY - 31} ${x - 5} ${mantelY - 37} ${x} ${mantelY - 44}Z" fill="#ffcf5a" stroke="#c4561c" stroke-width="2"/>`).join("")}
         ${cup(x0 + w * .3, mantelY - 8, 26, "silver")}${cup(x0 + w * .7, mantelY - 8, 26, "silver")}
         <circle cx="${x0 + w / 2}" cy="${mantelY * .5}" r="27" fill="${GOLD}" stroke="${INK}" stroke-width="4"/><circle cx="${x0 + w / 2}" cy="${mantelY * .5}" r="21" fill="#2e4f9c" stroke="${INK}" stroke-width="3"/>`
      : `${cup(x0 + w * .28, mantelY - 8, 24, "bronze")}
         <rect x="${x0 + w * .62}" y="${mantelY - 26}" width="10" height="18" rx="2" fill="#f4ead2" stroke="${INK}" stroke-width="2.5"/>
         <path d="M${x0 + w * .62 + 5} ${mantelY - 39}c5 7 5 12 0 12c-5 0-5-5 0-12Z" fill="#ffcf5a" stroke="#c4561c" stroke-width="2"/>`}
    </svg>`;
  // Firewood stacked on the hearthstone, in front of the stone's corner.
  const sprites = great ? [[firewood, x0 - 4, foot + 12 - firewood.h]] : [];
  const image = await svgImage(svg, x0 + w / 2, foot + 4, sprites);
  return { image, mouthFoot: -10, crest: great ? { dy: -(foot + 4) + mantelY * .5, size: 38 } : null };
}
/** The trophy shelf (cups on a bracketed plank) or the trophy wall (a panel of shelves, the shield and swords). */
async function trophyArt(w, level) {
  if (level < 2) {
    const h = 96, shelfY = 64;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      ${[22, w - 34].map(x => `<path d="M${x} ${shelfY + 10}H${x + 12}V${shelfY + 18}C${x + 12} ${shelfY + 26} ${x + 6} ${shelfY + 30} ${x} ${shelfY + 30}Z" fill="#7b4f2c" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`).join("")}
      <rect x="4" y="${shelfY}" width="${w - 8}" height="13" rx="3" fill="#8a5a32" stroke="${INK}" stroke-width="3"/>
      <path d="M9 ${shelfY + 4}H${w - 9}" stroke="#a46d3d" stroke-width="2.5" stroke-linecap="round"/>
      ${cup(w * .22, shelfY, 38, "silver")}${cup(w * .5, shelfY, 54, "gold")}${cup(w * .78, shelfY, 38, "bronze")}
      <rect x="${w * .5 - 22}" y="${shelfY + 17}" width="44" height="14" rx="3" fill="${GOLD}" stroke="${INK}" stroke-width="2.5"/></svg>`;
    return svgImage(svg, w / 2, h - 4);
  }
  const h = 168, rows = [64, 140];
  const cups = [];
  const shieldLeft = w / 2 - shield.w / 2;
  for (const [row, y] of rows.entries()) {
    const spots = row === 0 ? [w * .14, w * .28, w * .72, w * .86] : [w * .14, w * .32, w * .5, w * .68, w * .86];
    spots.forEach((x, i) => cups.push(cup(x, y, row === 0 ? 38 : (i % 2 ? 38 : 48), ["gold", "silver", "gold", "bronze", "gold"][(i + row) % 5])));
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect x="3" y="3" width="${w - 6}" height="${h - 6}" rx="8" fill="#5b3a22" stroke="${INK}" stroke-width="4"/>
    <rect x="12" y="12" width="${w - 24}" height="${h - 24}" rx="4" fill="#6d4a2c" stroke="#3b2414" stroke-width="2.5"/>
    ${rows.map(y => `<rect x="10" y="${y}" width="${w - 20}" height="11" rx="2" fill="#8a5a32" stroke="${INK}" stroke-width="3"/>`).join("")}
    ${cups.join("")}</svg>`;
  return svgImage(svg, w / 2, h - 2, [[shield, shieldLeft, 6]]);
}
/** A weapon stand: spears, swords and a mace upright in a rail. */
async function weaponStand() {
  const W = rackRail.w + 8, H = 120;
  const sprites = rackWeapons.map((image, i) => [image, 4 + rackRail.w * (.14 + i * .18) - image.w / 2, H - 14 - image.h]);
  sprites.push([rackRail, 4, H - rackRail.h]);
  return svgImage(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"/>`, W / 2, H - 4, sprites);
}

const roomSheets = [];
const geometry = { door: null, rooms: [] };
const table = new Map();
const candle = await candelabra();
const stand2 = await weaponStand();
for (const [size, room] of ROOMS.entries()) {
  const { x: ox, y: oy, w, h } = room;
  const inRoom = when(["size", size, size]);
  const at = (...conditions) => when(["size", size, size], ...conditions);
  const layout = WALLS[size], cx = ox + w / 2;
  const hearthX = ox + layout.side, trophyX = ox + w - layout.side;
  const imageW = w + CAP * 2, imageH = h + WALL_H + CAP * 2, fx = CAP, fy = CAP + WALL_H, gapLeft = fx + w / 2 - GAP / 2;
  const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" width="${imageW}" height="${imageH}">${body}</svg>`;
  // Before the table, a runner from the door's mat: under the table's carpet, whatever its length.
  const tableY = oy + Math.round(h * .46);
  const runnerTop = tableY + 60 - oy + fy, runnerBottom = fy + h - 48;
  const floor = svg(`<defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".34"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
      <linearGradient id="side" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
      <linearGradient id="front" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>
    <rect x="${fx}" y="${CAP}" width="${w}" height="${WALL_H}" fill="#c9a888"/>
    <g transform="translate(${fx} ${fy})">${woodFloor(w, h, 21 + size)}</g>
    <rect x="${fx}" y="${fy}" width="${w}" height="34" fill="url(#fade)"/>
    <rect x="${fx}" y="${fy}" width="30" height="${h}" fill="url(#side)"/><rect x="${fx + w - 30}" y="${fy}" width="30" height="${h}" fill="url(#side)" transform="rotate(180 ${fx + w - 15} ${fy + h / 2})"/>
    <rect x="${fx}" y="${fy + h - 22}" width="${w}" height="22" fill="url(#front)"/>
    <rect x="${fx + w / 2 - 52}" y="${runnerTop}" width="104" height="${runnerBottom - runnerTop}" fill="#8e3b2e" stroke="#5d2219" stroke-width="3"/>
    <path d="M${fx + w / 2 - 40} ${runnerTop}V${runnerBottom - 6}M${fx + w / 2 + 40} ${runnerTop}V${runnerBottom - 6}" stroke="#c9a14a" stroke-width="3"/>
    ${Array.from({ length: Math.floor((runnerBottom - runnerTop - 30) / 40) }, (_, i) => { const y = runnerBottom - 28 - i * 40; return `<path d="M${fx + w / 2} ${y - 10}L${fx + w / 2 + 10} ${y}L${fx + w / 2} ${y + 10}L${fx + w / 2 - 10} ${y}Z" fill="#a8483a" stroke="#c9a14a" stroke-width="2"/>`; }).join("")}
    <rect x="${fx + w / 2 - 70}" y="${fy + h - 54}" width="140" height="44" rx="8" fill="#8e3b2e" stroke="#5d2219" stroke-width="3"/>
    <rect x="${fx + w / 2 - 58}" y="${fy + h - 45}" width="116" height="26" rx="5" fill="none" stroke="#c9a14a" stroke-width="2.5"/>`);
  // Over the wall: a dark beam under the ceiling, and a shadow where the wall meets the floor.
  const trim = svg(`<rect x="${fx}" y="${CAP}" width="${w}" height="14" fill="#5b3a22"/><path d="M${fx} ${CAP + 14}H${fx + w}" stroke="#2f1c10" stroke-width="3"/>
    <rect x="${fx}" y="${CAP + 16}" width="${w}" height="10" fill="#000" fill-opacity=".12"/>
    <path d="M${fx} ${fy - 1}H${fx + w}" stroke="#2f1c10" stroke-width="3" stroke-opacity=".6"/>`);
  const caps = svg(`<defs><linearGradient id="out" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1a10"/><stop offset="1" stop-color="#000"/></linearGradient></defs>
    <path d="M0 0H${imageW}V${imageH}H${gapLeft + GAP}V${fy + h}H${fx + w}V${CAP}H${fx}V${fy + h}H${gapLeft}V${imageH}H0Z" fill="#5b3a22" stroke="#2f1c10" stroke-width="3" stroke-linejoin="round"/>
    <path d="M${fx - 2} ${CAP - 3}H${fx + w + 2}" stroke="#7d5232" stroke-width="3"/>
    <path d="M6 6H${imageW - 6}" stroke="#7d5232" stroke-width="2" stroke-opacity=".7"/>
    <rect x="${gapLeft}" y="${fy + h}" width="${GAP}" height="${CAP}" fill="url(#out)"/>`);
  const layers = [];
  for (let x = 0; x < w; x += wallW - wallPost) {
    const width = Math.min(wallW, w - x);
    layers.push({ input: width === wallW ? wallTile : await sharp(wallTile).extract({ left: 0, top: 0, width, height: WALL_H }).png().toBuffer(), left: fx + x, top: CAP });
  }
  // Windows high on the back wall: baked where nothing ever hangs; where the hearth, the trophies or the side
  // banners go, a window only until they come.
  const bannerEdge = 54, bigEdge = 71, winHalf = windowImage.w / 2 + 14;
  const baked = [], shy = [];
  const sideEdge = layout.side + Math.max(layout.hearth[2], layout.trophies[2]) / 2;
  const between = (a, b) => b - a >= winHalf * 2 ? (a + b) / 2 : null;
  for (const spot of [between(sideEdge, w / 2 - layout.banner - bannerEdge), between(w / 2 - layout.banner + bannerEdge, w / 2 - bigEdge)])
    if (spot !== null) baked.push(spot, w - spot);
  shy.push([layout.side, ["hearth", 0, 0]], [w - layout.side, ["trophies", 0, 0]]);
  if (!baked.length) shy.push([w / 2 - layout.banner, ["banners", 0, 1]], [w / 2 + layout.banner, ["banners", 0, 1]]);
  for (const spot of baked) layers.push({ input: windowImage.buffer, left: Math.round(fx + spot - windowImage.w / 2), top: CAP + WINDOW_TOP });
  for (const [spot, condition] of shy) put(windowImage, ox + spot, oy - WALL_H + WINDOW_TOP, { depth: oy - 2, when: at(condition) });
  const picture = await sharp(Buffer.from(floor)).composite([...layers, { input: Buffer.from(trim) }, { input: Buffer.from(caps) }]).png().toBuffer();
  roomSheets.push({ size, buffer: picture, w: imageW, h: imageH, at: [ox - CAP, oy - WALL_H - CAP] });

  // The crest over the head of the table, on the back wall.
  const big = await wallBanner(118, 150);
  put(big.image, cx, oy - 6, { depth: oy, when: inRoom });
  crest(cx, oy + 1, -6 + big.crest.dy, big.crest.size, { when: inRoom });
  // More banners on the wall with the banners' last level.
  const small = await wallBanner(84, 130);
  for (const side of [-1, 1]) {
    const x = cx + side * layout.banner;
    put(small.image, x, oy - 26, { depth: oy, when: at(["banners", 2, 9]) });
    crest(x, oy + 1, -26 + small.crest.dy, small.crest.size, { when: at(["banners", 2, 9]) });
  }
  // The hearth on the left of the back wall: a fireplace, then a great hearth, a fire burning in it.
  for (const level of [1, 2]) {
    const hw = layout.hearth[level], fire = level === 2 ? 1.3 : .95;
    const { image, mouthFoot, crest: hearthCrest } = await hearthArt(hw, level);
    const shown = at(["hearth", level, level]);
    put(image, hearthX, oy + 4, { depth: oy, when: shown });
    if (hearthCrest) crest(hearthX, oy + 1, 4 + hearthCrest.dy, hearthCrest.size, { when: shown });
    const fireFrames = [];
    for (const id of flameAnim.frames) {
      const frame = frameOf(id);
      const fw = Math.round(frame.w * fire), fh = Math.round(frame.h * fire);
      fireFrames.push(addFrame({ buffer: await sharp(frame.buffer).resize(fw, fh).png().toBuffer(), w: fw, h: fh, pivotX: frame.pivotX * fire, pivotY: frame.pivotY * fire }));
    }
    // The flame's foot sits on the logs in the hearth's mouth.
    const first = frameOf(fireFrames[0]);
    const fireY = oy + 4 + mouthFoot - 8 + first.pivotY - first.h;
    props.push({ f: fireFrames[0], x: Math.round(hearthX), y: Math.round(fireY), d: oy + .5, anim: { ...flameAnim, frames: fireFrames }, when: shown });
    block(hearthX - hw / 2 - 12, oy - 10, hearthX + hw / 2 + 12, oy + 16, { when: shown });
  }
  // The trophies on the right: a shelf of cups, then a wall of them with the shield, and a stand of the weapons won.
  for (const level of [1, 2]) {
    const art = await trophyArt(layout.trophies[level], level);
    put(art, trophyX, level === 2 ? oy - 14 : oy - 52, { depth: oy, when: at(["trophies", level, level]) });
  }
  put(stand2, trophyX, oy + 60, { when: at(["trophies", 2, 9]) });
  block(trophyX - 54, oy + 46, trophyX + 54, oy + 64, { when: at(["trophies", 2, 9]) });

  // The great table: as long as its seats need, stools along both sides, a carpet under it, candelabras on it with the last lights.
  for (const [level, total] of TABLE_SEATS.entries()) {
    const perSide = total / 2, spacing = 74, length = perSide * spacing + 30;
    const runW = Math.round(length), left = cx - runW / 2;
    const both = at(["table", level, level]);
    if (!table.has(runW)) table.set(runW, await longTable(runW, perSide, spacing));
    // The carpet runs under the whole sitting: stools behind the table and in front of it.
    put(await carpet(Math.round(runW + 120), 300), cx, tableY - 46, { ground: true, depth: tableY - 220, when: both });
    put(table.get(runW), cx, tableY, { when: both });
    // The table's top reaches 118 behind its foot; nobody walks through it.
    block(left + 4, tableY - 110, left + runW - 4, tableY + 6, { when: both });
    for (let i = 0; i < perSide; i++) {
      const x = cx + (i - (perSide - 1) / 2) * spacing;
      // North of the table, behind its far edge (the table hides a sitter's legs); south, in front of it.
      const northY = tableY - 126, southY = tableY + 36;
      put((i % 2 ? stoolLight : stool).body, x, northY, { ground: true, depth: northY - 1, when: both });
      put((i % 2 ? stool : stoolLight).body, x, southY, { ground: true, depth: southY - 1, when: both });
      seats.push({ x: Math.round(x), y: northY, side: "north", when: both });
      seats.push({ x: Math.round(x), y: southY, side: "south", when: both });
    }
    const lights = Math.max(1, Math.round(runW / 280));
    for (let i = 0; i < lights; i++) {
      const x = cx + (i - (lights - 1) / 2) * (runW / lights);
      put(candle, x, tableY - 74, { depth: tableY + 1, when: at(["table", level, level], ["lights", 2, 9]) });
    }
  }

  // Lamps: two by the back wall, then down the sides; with the last lights the front ones hang lanterns out over the floor.
  for (const x of [ox + 50, ox + w - 50]) stand(lamp, x, oy + 70, 8, { when: inRoom });
  const sideY = oy + Math.round(h * .42), frontY = oy + Math.round(h * .76);
  for (const x of [ox + 40, ox + w - 40]) {
    stand(lamp, x, sideY, 8, { when: at(["lights", 1, 9]) });
    stand(lamp, x, frontY, 8, { when: at(["lights", 1, 1]) });
  }
  stand(hangingLamp, ox + 30, frontY, 8, { when: at(["lights", 2, 9]) });
  stand(hangingLampRight, ox + w - 30, frontY, 8, { when: at(["lights", 2, 9]) });
  // Stores in the front left corner, the strongbox by the left wall; the upgrade board by the door, a side table by the right wall.
  const storeX = ox + 150, storeY = oy + h - 90;
  stand(barrel, storeX - 14, storeY - 50, 26, { when: inRoom });
  stand(barrelShut, storeX + 32, storeY - 34, 26, { when: inRoom });
  stand(barrel, storeX + 4, storeY, 26, { when: inRoom });
  stand(crate, storeX + 70, storeY - 8, 24, { when: inRoom });
  stand(crateSmall, storeX + 64, storeY + 18, 20, { when: inRoom });
  // A table too long for them pushes them down to the front, either side of the runner.
  const roomy = TABLE_SEATS.map(total => (total / 2 * 74 + 30) / 2 + 40 < w / 2 - 204);
  const fits = roomy.lastIndexOf(true);
  stand(chest, ox + 170, oy + 210, 34, { when: at(["table", 0, fits]) });
  stand(sideTable, ox + w - 140, oy + 230, 30, { when: at(["table", 0, fits]) });
  stand(pail, ox + w - 98, oy + 254, 12, { when: at(["table", 0, fits]) });
  if (fits < TABLE_SEATS.length - 1) {
    stand(chest, cx - 170, oy + h - 66, 34, { when: at(["table", fits + 1, 9]) });
    stand(sideTable, cx + 170, oy + h - 70, 30, { when: at(["table", fits + 1, 9]) });
  }
  const boardX = ox + w - 150, boardY = oy + h - 90;
  putPrefab(board, boardX, boardY, { when: inRoom });
  block(boardX - 50, boardY - 12, boardX + 50, boardY + 6, { when: inRoom });
  boards.push({ size, x: boardX, y: boardY + 30 });

  // Walls: the back (its face is no floor), the sides, the front less the doorway, and a stop just past it.
  const far = 400;
  block(ox - CAP - far, oy - WALL_H - CAP - far, ox + w + CAP + far, oy + 8, { when: inRoom });
  block(ox - CAP - far, oy - WALL_H, ox, oy + h + CAP + far, { when: inRoom });
  block(ox + w, oy - WALL_H, ox + w + CAP + far, oy + h + CAP + far, { when: inRoom });
  block(ox - CAP - far, oy + h, ox + w / 2 - GAP / 2, oy + h + CAP + far, { when: inRoom });
  block(ox + w / 2 + GAP / 2, oy + h, ox + w + CAP + far, oy + h + CAP + far, { when: inRoom });
  block(ox + w / 2 - GAP / 2 - 10, oy + h + 30, ox + w / 2 + GAP / 2 + 10, oy + h + CAP + far, { when: inRoom });
  geometry.rooms.push({ floor: [ox, oy, w, h], exit: { x: ox + w / 2, y: oy + h, half: GAP / 2 } });
}
geometry.door = { x: HALL_X + OUT.x, y: doorSill + OUT.y, half: doorHalf, enter: HALL_BASE + 6 + OUT.y };
// The yard feet can reach, inside the wood's solids: a saved position outside it and every room is from an older layout.
geometry.yard = [200 + OUT.x, 420 + OUT.y, 1_400 + OUT.x, 2_040 + OUT.y];
// Where a member arrives, at the foot of the yard, and the portal home on the round pad below it.
geometry.arrival = { x: HALL_X + OUT.x, y: 1_760 + OUT.y };
geometry.homePad = { x: HALL_X + OUT.x, y: PATH.bottom + OUT.y };
geometry.interiorLeft = INTERIOR_LEFT;

// ---------------------------------------------------------------- write
const PADDING = 2;
function pack(list, width) {
  let x = 0, y = 0, shelf = 0;
  for (const frame of list) {
    if (x + frame.w + PADDING > width) { x = 0; y += shelf + PADDING; shelf = 0; }
    frame.x = x; frame.y = y; x += frame.w + PADDING; shelf = Math.max(shelf, frame.h);
  }
  return y + shelf;
}
const frameList = [...frames.values()].sort((a, b) => b.h - a.h);
const sheetH = pack(frameList, 2048);
await sharp({ create: { width: 2048, height: sheetH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(frameList.map(frame => ({ input: frame.buffer, left: frame.x, top: frame.y }))).webp({ quality: 92, alphaQuality: 100, effort: 6 })
  .toFile(join(groundDir, "hall-props.webp"));
const roomList = [...roomSheets].sort((a, b) => b.h - a.h);
const roomsH = pack(roomList, 2048);
await sharp({ create: { width: 2048, height: roomsH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(roomList.map(room => ({ input: room.buffer, left: room.x, top: room.y }))).webp({ quality: 88, alphaQuality: 90, effort: 6 })
  .toFile(join(groundDir, "hall-rooms.webp"));
const scene = {
  frames: Object.fromEntries(frameList.sort((a, b) => a.id - b.id).map(f => [f.id, [f.x, f.y, f.w, f.h, Math.round(f.pivotX), Math.round(f.pivotY)]])),
  ground: { x: NEAR.left + OUT.x, y: NEAR.top + OUT.y, w: NEAR.right - NEAR.left, h: NEAR.bottom - NEAR.top },
  interiorLeft: INTERIOR_LEFT,
  props, crests, seats, boards, solids,
  rooms: roomSheets.map(room => ({ size: room.size, sheet: [room.x, room.y, room.w, room.h], at: room.at })),
};
writeFileSync(join(root, "src/game/guild-hall-scene.json"), JSON.stringify(scene));
writeFileSync(join(root, "shared/guild-hall-geometry.json"), `${JSON.stringify(geometry, null, 1)}\n`);
console.log(`${frames.size} frames (sheet 2048x${sheetH}), ${props.length} props, ${solids.length} solids, ${seats.length} seats; rooms 2048x${roomsH}`);

// ---------------------------------------------------------------- preview
if (previewAt >= 0) {
  const outDir = args[previewAt + 1], levels = JSON.parse(args[previewAt + 2] ?? "{}");
  const shown = item => !item.when || item.when.every(([part, min, max]) => (levels[part] ?? 0) >= min && (levels[part] ?? 0) <= max);
  const sheet = await sharp(join(groundDir, "hall-props.webp")).png().toBuffer();
  const emblems = await sharp(join(root, "public/assets/wildstat/guild-emblems-v4.webp")).extract({ left: 9, top: 10, width: 300, height: 300 }).png().toBuffer();
  const ground = await sharp(join(groundDir, "hall-ground.webp")).resize(scene.ground.w, scene.ground.h).png().toBuffer();
  const rooms = await sharp(join(groundDir, "hall-rooms.webp")).png().toBuffer();
  const room = scene.rooms[levels.size ?? 0];
  const pin = (buffer, w, h, x, y) => ({ image: { buffer, w, h, pivotX: 0, pivotY: 0 }, x, y });
  /** Everything in a world rectangle as the runtime draws it: outdoors the wood and the ground, indoors the dark and the room. */
  async function render(region, file, scale = 1) {
    const under = [], indoorsView = region.left + region.w / 2 >= INTERIOR_LEFT;
    // Only the player's side of the door is drawn: the runtime keeps the other side's decor out.
    const side = item => (item.x >= INTERIOR_LEFT) === indoorsView;
    if (!indoorsView) {
      under.push(pin(ground, scene.ground.w, scene.ground.h, scene.ground.x, scene.ground.y));
    } else {
      const [sx, sy, w, h] = room.sheet;
      under.push(pin(await sharp(rooms).extract({ left: sx, top: sy, width: w, height: h }).png().toBuffer(), w, h, room.at[0], room.at[1]));
    }
    const items = [...props.filter(p => shown(p) && side(p)).map(p => ({ ...p, kind: "prop" })), ...crests.filter(c => shown(c) && side(c)).map(c => ({ ...c, kind: "crest", y: c.d }))]
      .sort((a, b) => (a.shadow ? -1e9 : 0) - (b.shadow ? -1e9 : 0) || (a.ground ? -1e8 : 0) - (b.ground ? -1e8 : 0) || a.d - b.d);
    const list = [];
    for (const item of items) {
      if (item.kind === "crest") {
        list.push(pin(await sharp(emblems).resize(item.size, item.size).png().toBuffer(), item.size, item.size, item.x - item.size / 2, item.d + item.dy - item.size / 2));
        continue;
      }
      const [x, y, w, h, ax, ay] = scene.frames[item.f];
      if (item.x - ax > region.left + region.w || item.x - ax + w < region.left || item.y - ay > region.top + region.h || item.y - ay + h < region.top) continue;
      let input = await sharp(sheet).extract({ left: x, top: y, width: w, height: h }).png().toBuffer();
      if (item.shadow) input = await sharp(input).ensureAlpha().composite([{ input: Buffer.from([0, 0, 0, 56]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: "dest-in" }]).png().toBuffer();
      list.push(pin(input, w, h, item.x - ax, item.y - ay));
    }
    const layers = [...await place(under, region.w, region.h, region.left, region.top), ...await place(list, region.w, region.h, region.left, region.top)];
    const picture = await sharp({ create: { width: region.w, height: region.h, channels: 4, background: "#000" } }).composite(layers).png().toBuffer();
    await sharp(picture).resize(Math.round(region.w * scale)).png().toFile(file);
  }
  /** The camera's view, w by h world units, of a player at (x, y): kept to their side of the door, centred when wider. */
  function view(x, y, w, h) {
    const indoorsHere = x >= INTERIOR_LEFT, g = scene.ground;
    const area = indoorsHere ? { left: INTERIOR_LEFT, top: 0, right: 6_400, bottom: WORLD_H } : { left: g.x, top: g.y, right: g.x + g.w, bottom: g.y + g.h };
    // The zoom stops where the view would pass the area.
    const fit = Math.min(1, (area.right - area.left) / w, (area.bottom - area.top) / h);
    w = Math.round(w * fit); h = Math.round(h * fit);
    const along = (p, size, lo, hi) => size >= hi - lo ? lo + (hi - lo - size) / 2 : Math.max(lo, Math.min(hi - size, p - size / 2));
    return { left: Math.round(along(x, w, area.left, area.right)), top: Math.round(along(y, h, area.top, area.bottom)), w, h };
  }
  mkdirSync(outDir, { recursive: true });
  await render({ left: OUT.x, top: OUT.y + 200, w: 1_600, h: 2_000 }, join(outDir, "outside.png"));
  await render({ left: 0, top: 0, w: INTERIOR_LEFT, h: WORLD_H }, join(outDir, "outdoors.png"), .4);
  // The widest zoom out (50%) on 16:9, 21:9 and 32:9 windows and a short one at the camera's floor, at the door and the yard's east edge.
  for (const [name, w, h] of [["16x9", 2_480, 1_395], ["21x9", 3_307, 1_395], ["32x9", 4_960, 1_395], ["short", 5_600, 1_200]]) {
    await render(view(geometry.door.x, geometry.door.y - 150, w, h), join(outDir, `view-${name}-door.png`), .4);
    await render(view(1_390 + OUT.x, 1_800 + OUT.y, w, h), join(outDir, `view-${name}-east.png`), .4);
  }
  await render({ left: room.at[0], top: room.at[1], w: room.sheet[2], h: room.sheet[3] }, join(outDir, "inside.png"));
  await render(view(room.at[0] + room.sheet[2] / 2, room.at[1] + room.sheet[3] / 2, 3_307, 1_395), join(outDir, "view-21x9-inside.png"), .4);
  console.log(`preview: ${outDir}`);
}
