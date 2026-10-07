#!/usr/bin/env node
/**
 * Bakes the guild hall (shared/guild-hall.ts): its courtyard and building
 * outside, and the great hall inside in each of its three sizes, from the
 * ForestVillage pack (the grey stone hall, its arched door, torches, trees,
 * the fountain, tables, stools, barrels, lamps) and a few pieces the pack has
 * no art for, drawn here in its flat outlined style: crest banners, carpet,
 * the hearth and the trophy shelf. The guild's own crest goes on the banners
 * at runtime.
 *
 * Every piece that an upgrade adds says so (`when`: [part, min, max]), and the
 * runtime shows only what the guild has. Everything is in the hall map's own
 * coordinates.
 *
 *   node scripts/art/bake-guild-hall.mjs <extractedPackageDir> [--preview <outDir> <levels json>]
 *
 * Writes public/assets/wildstat/guild-hall/{hall-props,hall-ground,hall-rooms}.webp,
 * src/game/guild-hall-scene.json and shared/guild-hall-geometry.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const EXTERIOR = { left: 0, top: 200, right: 1600, bottom: 2200 };
/**
 * The great hall in each size: floor from (x, y), w by h. Only the guild's size is ever shown, so all three
 * stand on one centre, far enough east of the courtyard that no screen sees both. Everything east of
 * INTERIOR_LEFT is dark but the room.
 */
const ROOM_CENTER = 5_300, INTERIOR_LEFT = 3_000;
const ROOMS = [[960, 560], [1_300, 640], [1_700, 720]].map(([w, h]) => ({ x: ROOM_CENTER - w / 2, y: 700, w, h }));
const WALL_H = 190, CAP = 24, GAP = 96;
const TABLE_SEATS = [6, 10, 14, 20];
/** Furniture inside is drawn a little bigger than the village's: a great hall's table, not a cottage's. */
const FURNITURE = .78;

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
async function svgImage(svg, pivotX, pivotY) {
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  const meta = await sharp(buffer).metadata();
  return { buffer, w: meta.width, h: meta.height, pivotX: pivotX ?? meta.width / 2, pivotY: pivotY ?? meta.height };
}

// ---------------------------------------------------------------- the scene
const props = [], solids = [], crests = [], seats = [], boards = [];
const when = (...conditions) => conditions.length ? conditions : undefined;
/** A piece standing at (x, y): its depth is its foot unless told otherwise. */
function put(image, x, y, options = {}) {
  if (!image) return;
  props.push({ f: addFrame(image), x: Math.round(x), y: Math.round(y), d: Math.round(options.depth ?? y), ...(options.ground ? { ground: true } : {}),
    ...(options.shadow ? { shadow: true } : {}), ...(options.when ? { when: options.when } : {}), ...(options.anim ? { anim: options.anim } : {}),
    ...(options.open !== undefined ? { open: options.open, door: 0 } : {}) });
}
function putPrefab(composed, x, y, options = {}) {
  put(composed.shadow, x, y, { ...options, shadow: true });
  put(composed.body, x, y, options);
}
function block(left, top, right, bottom, options = {}) {
  solids.push({ points: [left, top, right, top, right, bottom, left, bottom].map(Math.round), ...(options.when ? { when: options.when } : {}) });
}

// Banners: royal blue cloth with gold trim and a V-cut foot, outlined like the pack. The crest is painted on at runtime.
const BLUE = "#2e4f9c", BLUE_DARK = "#203a78", GOLD = "#e3b24a", INK = "#2b1d14";
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
  crests.push({ x: Math.round(x), d: Math.round(depthY), dy: Math.round(dy), size: Math.round(size), ...(options.when ? { when: options.when } : {}) });
}

// ---------------------------------------------------------------- outside
const hall = await compose("House_Width_Gray_3", { scale: 1, keep: item => !/^Door/.test(item.name) });
const hallDoor = (await compose("House_Width_Gray_3", { scale: 1, keep: item => /^Door/.test(item.name) }));
const doorItem = hallDoor.items[0].item;
const openDoor = await spriteImage({ ...doorItem, sprite: packSprite("Door_06_Open") }, { solidShadow: true });
const doorPivot = { x: -doorItem.world.x * 100, y: doorItem.world.y * 100 };
putPrefab(hall, HALL_X, HALL_BASE);
// The door is its own piece, to swing open: drawn at its place on the wall, a hair in front of it.
const doorBody = hallDoor.body;
const openBody = { buffer: openDoor.buffer, w: openDoor.width, h: openDoor.height, pivotX: -openDoor.left, pivotY: -openDoor.top };
props.push({ f: addFrame(doorBody), x: HALL_X, y: HALL_BASE, d: HALL_BASE + 1, open: addFrame(openBody), door: 0 });
void doorPivot;
const hallLeft = HALL_X - hall.body.pivotX, hallRight = hallLeft + hall.body.w;
// The walls stand on their base: the front of the hall is solid but its door.
const doorSill = HALL_BASE + 2;
const doorHalf = Math.round(doorBody.w / 2 - 10);
block(hallLeft + 18, HALL_BASE - 90, HALL_X - doorHalf - 6, HALL_BASE + 6);
block(HALL_X + doorHalf + 6, HALL_BASE - 90, hallRight - 18, HALL_BASE + 6);
block(HALL_X - doorHalf - 6, HALL_BASE - 90, HALL_X + doorHalf + 6, HALL_BASE - 6);

// Banners: one over the door always, two at the door, then more down the yard.
const wall = await wallBanner(96, 132);
put(wall.image, HALL_X, HALL_BASE - 176, { depth: HALL_BASE + 2 });
crest(HALL_X, HALL_BASE + 3, -176 + wall.crest.dy, wall.crest.size);
const pole = await standingBanner();
for (const [x, y, min] of [[HALL_X - 222, HALL_BASE + 46, 1], [HALL_X + 222, HALL_BASE + 46, 1],
  [PLAZA.left + 40, PLAZA.top + 260, 2], [PLAZA.right - 40, PLAZA.top + 260, 2], [PATH.left - 40, PATH.top + 220, 2], [PATH.right + 40, PATH.top + 220, 2]]) {
  put(pole.image, x, y, { when: when(["banners", min, 9]) });
  crest(x, y + 1, pole.crest.dy, pole.crest.size, { when: when(["banners", min, 9]) });
  block(x - 8, y - 6, x + 8, y + 4, { when: when(["banners", min, 9]) });
}

// Torches: two by the door, more along the yard with the lights.
const torch = await compose("Fire_Torch_01", { scale: .8, keep: item => !/^Fire_c/.test(item.name) });
const flameItem = (await compose("Fire_Torch_01", { scale: .8, keep: item => /^Fire_c/.test(item.name) })).items[0].item;
const flameFrames = [];
for (const name of ["Fire_c01", "Fire_c02", "Fire_c03", "Fire_c04", "Fire_c05"]) {
  const image = await spriteImage({ ...flameItem, sprite: packSprite(name) }, { solidShadow: true });
  const scaled = await sharp(image.buffer).resize(Math.round(image.width * .8), Math.round(image.height * .8)).png().toBuffer();
  flameFrames.push(addFrame({ buffer: scaled, w: Math.round(image.width * .8), h: Math.round(image.height * .8), pivotX: -image.left * .8, pivotY: -image.top * .8 }));
}
const flameAnim = { frames: flameFrames, times: flameFrames.map((_, index) => +(index / 10).toFixed(3)), length: flameFrames.length / 10 };
function putTorch(x, y, options = {}) {
  putPrefab(torch, x, y, options);
  props.push({ f: flameFrames[0], x, y, d: y + .5, anim: flameAnim, ...(options.when ? { when: options.when } : {}) });
  block(x - 6, y - 5, x + 6, y + 4, options);
}
putTorch(HALL_X - 96, HALL_BASE + 26);
putTorch(HALL_X + 96, HALL_BASE + 26);
for (const [x, y] of [[PLAZA.left + 20, PLAZA.top + 80], [PLAZA.right - 20, PLAZA.top + 80], [PLAZA.left + 20, PLAZA.bottom - 20], [PLAZA.right - 20, PLAZA.bottom - 20]])
  putTorch(x, y, { when: when(["lights", 1, 9]) });
for (const y of [PATH.top + 120, PATH.top + 360]) for (const x of [PATH.left - 24, PATH.right + 24]) putTorch(x, y, { when: when(["lights", 2, 9]) });

// The yard: trees and bushes frame it always; flowers and more trees with the first courtyard level, a fountain with the second.
const trees = ["Tree_01_Green", "Tree_04_Green", "Tree_07_Green", "Tree_13_Green", "Tree_02_Green"];
const treeImages = [];
for (const name of trees) treeImages.push(await compose(name, { scale: .6 }));
const bushes = [];
for (const name of ["Bush_01_Green", "Bush_03_Green", "Bush_05_Green"]) bushes.push(await compose(name, { scale: .6 }));
let seed = 11;
const random = () => { seed = (seed * 1_103_515_245 + 12_345) >>> 0; return seed / 4_294_967_296; };
// A wood all round, evenly spaced: rows of trees beyond the yard, and solid, so the yard is the place to be.
let treeIndex = 0;
const nextTree = () => treeImages[treeIndex++ % treeImages.length];
for (let x = 200; x <= 1400; x += 120) putPrefab(nextTree(), x + random() * 16 - 8, 400 + random() * 12);
// The portal home stands at the path's end: keep the trees off it.
for (let x = 200; x <= 1400; x += 120) if (Math.abs(x - HALL_X) >= 220) putPrefab(nextTree(), x + random() * 16 - 8, 2060 + random() * 12);
for (let y = 540; y <= 1920; y += 140) for (const x of [160, 1440]) putPrefab(nextTree(), x + random() * 12 - 6, y + random() * 12);
block(0, 0, 1600, 420); block(0, 2040, 1600, 2400); block(0, 0, 200, 2400); block(1400, 0, 1600, 2400);
for (const [x, y] of [[PLAZA.left - 60, PLAZA.top + 160], [PLAZA.right + 60, PLAZA.top + 160], [PLAZA.left - 70, PLAZA.bottom - 120], [PLAZA.right + 70, PLAZA.bottom - 120]]) {
  putPrefab(bushes[Math.floor(random() * bushes.length)], x, y);
  block(x - 22, y - 10, x + 22, y + 6);
}
const garden = await single("Garden_01", .6);
for (const [x, y] of [[PLAZA.left - 120, PLAZA.top + 330], [PLAZA.right + 120, PLAZA.top + 330], [PATH.left - 150, PATH.top + 330], [PATH.right + 150, PATH.top + 330]])
  put(garden, x, y, { ground: true, when: when(["courtyard", 1, 9]) });
for (const [x, y, index] of [[PLAZA.left - 170, PLAZA.top + 40, 1], [PLAZA.right + 170, PLAZA.top + 40, 3], [PATH.left - 200, PATH.top + 120, 0], [PATH.right + 200, PATH.top + 120, 2]]) {
  putPrefab(treeImages[index], x, y, { when: when(["courtyard", 1, 9]) });
  block(x - 16, y - 8, x + 16, y + 6, { when: when(["courtyard", 1, 9]) });
}
const fountain = await compose("Fountain_02_Top_Angel", { scale: .62 });
const fountainY = PLAZA.top + 330;
putPrefab(fountain, HALL_X, fountainY, { when: when(["courtyard", 2, 9]) });
{
  const r = 64, points = [];
  for (let i = 0; i < 16; i++) points.push(HALL_X + Math.cos(i / 16 * Math.PI * 2) * r, fountainY - 22 + Math.sin(i / 16 * Math.PI * 2) * r * .55);
  solids.push({ points: points.map(Math.round), when: when(["courtyard", 2, 9]) });
}
// The yard's ground, in the Soul village's own colours (sampled from village-ground.webp): its field and lighter
// patches of grass, one soft-edged dirt yard in front of the hall and down to the portal, pebbles laid at its heart.
const GRASS = "#54783c", GRASS_LIGHT = "#60844c", DIRT = "#b89474", DIRT_MARK = "#a8845f", DIRT_EDGE = "#7c6044";
const PEBBLE = ["#a9a59c", "#9d998f", "#b3afa5"], PEBBLE_EDGE = "#7c776e";
const groundScale = .5;
{
  const W = EXTERIOR.right - EXTERIOR.left, H = EXTERIOR.bottom - EXTERIOR.top;
  const X = x => x - EXTERIOR.left, Y = y => y - EXTERIOR.top;
  let state = 29;
  const next = () => { state = (state * 1_103_515_245 + 12_345) >>> 0; return state / 4_294_967_296; };
  const yard = [
    `<rect x="${X(470)}" y="${Y(690)}" width="660" height="520" rx="90"/>`,
    `<rect x="${X(400)}" y="${Y(830)}" width="800" height="250" rx="80"/>`,
    `<rect x="${X(728)}" y="${Y(1150)}" width="144" height="760" rx="44"/>`,
    `<ellipse cx="${X(HALL_X)}" cy="${Y(PATH.bottom - 40)}" rx="140" ry="82"/>`,
  ].join("");
  const patches = [[250, 560, 190, 150], [1160, 1260, 200, 190], [260, 1440, 210, 170]]
    .map(([x, y, w, h]) => `<rect x="${X(x)}" y="${Y(y)}" width="${w}" height="${h}" rx="34" fill="${GRASS_LIGHT}"/>`).join("");
  const marks = [];
  for (let i = 0; i < 160; i++) {
    const x = 220 + next() * 1160, y = 460 + next() * 1560;
    marks.push(`<path d="M${X(x) - 5} ${Y(y) - 3}L${X(x)} ${Y(y) + 2}L${X(x) + 5} ${Y(y) - 3}" fill="none" stroke="${GRASS_LIGHT}" stroke-width="2.5" stroke-linecap="round"/>`);
  }
  for (let i = 0; i < 70; i++) {
    const x = 480 + next() * 640, y = 760 + next() * 1120;
    const inYard = (x > 470 && x < 1130 && y < 1200) || (x > 735 && x < 865);
    if (inYard) marks.push(`<path d="M${X(x) - 8} ${Y(y)}H${X(x) + 8}" stroke="${DIRT_MARK}" stroke-width="2.5" stroke-linecap="round" stroke-opacity=".6"/>`);
  }
  const pebbles = [];
  const pebble = (x, y, r) => pebbles.push(`<ellipse cx="${X(x).toFixed(1)}" cy="${Y(y).toFixed(1)}" rx="${(r * 1.25).toFixed(1)}" ry="${r.toFixed(1)}" fill="${PEBBLE[Math.floor(next() * PEBBLE.length)]}" stroke="${PEBBLE_EDGE}" stroke-width="2"/>`);
  // The heart of the yard, before the door: an even oval of pebbles, as the village square has them.
  for (let y = 1000 - 120; y <= 1000 + 120; y += 17) for (let x = HALL_X - 200 + (Math.round(y / 17) % 2) * 9; x <= HALL_X + 200; x += 19) {
    if (((x - HALL_X) / 200) ** 2 + ((y - 1000) / 120) ** 2 > 1) continue;
    pebble(x + next() * 6 - 3, y + next() * 5 - 2.5, 5 + next() * 2.5);
  }
  // A line of them down the path, and round the portal's pad.
  for (let y = 1120; y < PATH.bottom - 100; y += 16) pebble(HALL_X + next() * 30 - 15, y + next() * 6, 4 + next() * 3);
  for (let i = 0; i < 40; i++) { const angle = i / 40 * Math.PI * 2; pebble(HALL_X + Math.cos(angle) * 112, PATH.bottom - 40 + Math.sin(angle) * 62, 4 + next() * 3); }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><filter id="fringe" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".35" numOctaves="1" seed="4"/>
      <feDisplacementMap in="SourceGraphic" scale="5" xChannelSelector="R" yChannelSelector="G"/></filter></defs>
    <rect width="${W}" height="${H}" fill="${GRASS}"/>${patches}
    <g filter="url(#fringe)"><g fill="${DIRT_EDGE}" stroke="${DIRT_EDGE}" stroke-width="10">${yard}</g><g fill="${DIRT}">${yard}</g></g>
    ${marks.join("")}${pebbles.join("")}</svg>`;
  const full = await sharp(Buffer.from(svg)).png().toBuffer();
  mkdirSync(join(root, "public/assets/wildstat/guild-hall"), { recursive: true });
  await sharp(full).resize(Math.round(W * groundScale), Math.round(H * groundScale)).webp({ quality: 88, effort: 6 }).toFile(join(root, "public/assets/wildstat/guild-hall/hall-ground.webp"));
}

// ---------------------------------------------------------------- inside
const wallSprite = await spritePixels(packSprite("Module_Width_01"));
const wallMeta = await sharp(wallSprite).metadata();
const wallW = Math.round(wallMeta.width * WALL_H / wallMeta.height);
const wallTile = await sharp(wallSprite).resize(wallW, WALL_H, { fit: "fill", kernel: "lanczos3" }).png().toBuffer();
const wallPost = Math.round(28 * WALL_H / wallMeta.height);
const windowImage = (await compose("Window_03_Ivory", { scale: .78, recolor: item => /Window_In/.test(item.name ?? "") ? { ...item, color: { r: .78, g: .9, b: .95, a: 1 } } : null })).body;
const stool = await compose("Chair_01_Brown", { scale: FURNITURE });
const stoolLight = await compose("Chair_01_LightBrown", { scale: FURNITURE });
const lamp = await compose("Lamp_01", { scale: FURNITURE });
const lampTall = await compose("Lamp_03", { scale: FURNITURE });
const board = await compose("Board_01", { scale: FURNITURE });
const barrel = await compose("Ork_01", { scale: FURNITURE });
const barrelShut = await compose("Ork_01_Close", { scale: FURNITURE });
const chest = await compose("Chest_02_Gold", { scale: FURNITURE });
const rack = await compose("WeaponRack_01", { scale: FURNITURE });
const sword = await single("Weapon_02", FURNITURE);

/** The carpet down the table's length: red with gold, flat on the floor. */
async function carpet(w, h) {
  return svgImage(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="10" fill="#8e3b2e" stroke="#5d2219" stroke-width="4"/>
    <rect x="16" y="14" width="${w - 32}" height="${h - 28}" rx="6" fill="none" stroke="#c9a14a" stroke-width="4"/>
    <rect x="28" y="26" width="${w - 56}" height="${h - 52}" rx="4" fill="none" stroke="#c9a14a" stroke-width="2" stroke-dasharray="10 8"/></svg>`, w / 2, h / 2);
}
/** The great table, one piece as long as its seats need: a plank top, its front apron and legs, outlined like the pack. */
async function longTable(length) {
  const top = 70, apron = 26, legs = 22, w = length, h = top + apron + legs + 8;
  const planks = [];
  for (let y = 10; y < top - 4; y += 14) planks.push(`<path d="M10 ${y}H${w - 10}" stroke="#8a5a32" stroke-width="2" stroke-opacity=".55"/>`);
  for (let x = 120; x < w - 60; x += 160) planks.push(`<path d="M${x} 6V${top - 4}" stroke="#8a5a32" stroke-width="2" stroke-opacity=".4"/>`);
  const legX = [16, w - 34, ...(w > 400 ? [w / 2 - 9] : [])];
  return svgImage(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    ${legX.map(x => `<rect x="${x}" y="${top + apron - 6}" width="18" height="${legs + 8}" rx="3" fill="#6d4426" stroke="${INK}" stroke-width="3"/>`).join("")}
    <rect x="3" y="${top - 6}" width="${w - 6}" height="${apron + 6}" rx="6" fill="#8a5a32" stroke="${INK}" stroke-width="4"/>
    <path d="M10 ${top + 6}H${w - 10}" stroke="#a46d3d" stroke-width="3" stroke-linecap="round"/>
    <rect x="3" y="3" width="${w - 6}" height="${top}" rx="10" fill="#c08a52" stroke="${INK}" stroke-width="4"/>
    ${planks.join("")}<path d="M14 9H${w - 14}" stroke="#ddb07a" stroke-width="3" stroke-linecap="round"/></svg>`, w / 2, top + apron + legs);
}
/** A stone fireplace on the back wall: its mouth's centre and size come back for the fire. */
async function hearth(w, h) {
  const mouthW = w * .52, mouthH = h * .46, mouthX = (w - mouthW) / 2, mouthY = h - mouthH - 10;
  const stones = [];
  let state = Math.round(w * 7 + h);
  const next = () => { state = (state * 1_103_515_245 + 12_345) >>> 0; return state / 4_294_967_296; };
  for (let y = 18; y < h - 12; y += 24) for (let x = 8 + (y / 24 % 2) * 14; x < w - 12; x += 34) {
    if (x > mouthX - 20 && x < mouthX + mouthW && y > mouthY - 14) continue;
    stones.push(`<rect x="${x.toFixed(1)}" y="${y}" width="${(28 + next() * 6).toFixed(1)}" height="20" rx="6" fill="${["#9a948b", "#8c867d", "#a59f95"][Math.floor(next() * 3)]}" stroke="#57524b" stroke-width="2.5"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect x="3" y="12" width="${w - 6}" height="${h - 15}" rx="8" fill="#7d776e" stroke="${INK}" stroke-width="4"/>${stones.join("")}
    <rect x="0" y="3" width="${w}" height="20" rx="6" fill="#6d4a2c" stroke="${INK}" stroke-width="4"/>
    <path d="M${mouthX} ${h - 10}V${mouthY + mouthW * .3}A${mouthW / 2} ${mouthW * .3} 0 0 1 ${mouthX + mouthW} ${mouthY + mouthW * .3}V${h - 10}Z" fill="#1d130d" stroke="${INK}" stroke-width="4"/>
    <rect x="${mouthX - 8}" y="${h - 14}" width="${mouthW + 16}" height="12" rx="4" fill="#57524b" stroke="${INK}" stroke-width="3"/></svg>`;
  return { image: await svgImage(svg, w / 2, h), mouth: { dy: -10 - 4, w: mouthW } };
}
/** A wooden shelf of gold cups; `rows` of them. */
async function trophies(w, rows) {
  const h = rows * 70 + 20, cups = [];
  for (let row = 0; row < rows; row++) {
    const y = 14 + row * 70;
    cups.push(`<rect x="4" y="${y + 52}" width="${w - 8}" height="12" rx="3" fill="#8a5a32" stroke="${INK}" stroke-width="3"/>`);
    for (let x = 28; x < w - 20; x += 54) {
      const tall = (x / 54 + row) % 2 === 0;
      const cupH = tall ? 46 : 36, top = y + 52 - cupH;
      cups.push(`<g><path d="M${x - 13} ${top}H${x + 13}C${x + 13} ${top + 20} ${x + 6} ${top + 26} ${x + 2} ${top + 27}V${y + 44}H${x + 9}V${y + 52}H${x - 9}V${y + 44}H${x - 2}V${top + 27}C${x - 6} ${top + 26} ${x - 13} ${top + 20} ${x - 13} ${top}Z" fill="${GOLD}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M${x - 13} ${top + 5}C${x - 22} ${top + 5} ${x - 22} ${top + 18} ${x - 9} ${top + 18}M${x + 13} ${top + 5}C${x + 22} ${top + 5} ${x + 22} ${top + 18} ${x + 9} ${top + 18}" fill="none" stroke="${INK}" stroke-width="3"/>
        <path d="M${x - 8} ${top + 4}V${top + 14}" stroke="#fff3c4" stroke-width="3" stroke-linecap="round"/></g>`);
    }
  }
  return svgImage(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${cups.join("")}</svg>`, w / 2, h);
}

const roomSheets = [];
const geometry = { door: null, rooms: [] };
for (const [size, room] of ROOMS.entries()) {
  const { x: ox, y: oy, w, h } = room;
  const inRoom = when(["size", size, size]);
  const imageW = w + CAP * 2, imageH = h + WALL_H + CAP * 2, fx = CAP, fy = CAP + WALL_H, gapLeft = fx + w / 2 - GAP / 2;
  const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" width="${imageW}" height="${imageH}">${body}</svg>`;
  const floor = svg(`<defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".3"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>
    <rect x="${fx}" y="${CAP}" width="${w}" height="${WALL_H}" fill="#c9a888"/>
    <g transform="translate(${fx} ${fy})">${woodFloor(w, h, 21 + size)}</g>
    <rect x="${fx}" y="${fy}" width="${w}" height="20" fill="url(#fade)"/>
    <rect x="${fx}" y="${fy}" width="12" height="${h}" fill="#000" fill-opacity=".1"/><rect x="${fx + w - 12}" y="${fy}" width="12" height="${h}" fill="#000" fill-opacity=".1"/>
    <rect x="${fx + w / 2 - 66}" y="${fy + h - 52}" width="132" height="42" rx="8" fill="#8e3b2e" stroke="#5d2219" stroke-width="3"/>
    <rect x="${fx + w / 2 - 54}" y="${fy + h - 43}" width="108" height="24" rx="5" fill="none" stroke="#c9a14a" stroke-width="2.5"/>`);
  const caps = svg(`<defs><linearGradient id="out" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1a10"/><stop offset="1" stop-color="#000"/></linearGradient></defs>
    <path d="M0 0H${imageW}V${imageH}H${gapLeft + GAP}V${fy + h}H${fx + w}V${CAP}H${fx}V${fy + h}H${gapLeft}V${imageH}H0Z" fill="#5b3a22" stroke="#2f1c10" stroke-width="3" stroke-linejoin="round"/>
    <path d="M${fx - 2} ${CAP - 3}H${fx + w + 2}" stroke="#7d5232" stroke-width="3"/>
    <rect x="${gapLeft}" y="${fy + h}" width="${GAP}" height="${CAP}" fill="url(#out)"/>`);
  const layers = [];
  for (let x = 0; x < w; x += wallW - wallPost) {
    const width = Math.min(wallW, w - x);
    layers.push({ input: width === wallW ? wallTile : await sharp(wallTile).extract({ left: 0, top: 0, width, height: WALL_H }).png().toBuffer(), left: fx + x, top: CAP });
  }
  // Windows high on the back wall, clear of the crest banner in the middle.
  const windows = Math.max(2, Math.floor(w / 260));
  for (let i = 0; i < windows; i++) {
    const cx = fx + (w * (i + .5)) / windows;
    if (Math.abs(cx - (fx + w / 2)) < 120) continue;
    layers.push({ input: windowImage.buffer, left: Math.round(cx - windowImage.w / 2), top: Math.round(CAP + 20) });
  }
  const picture = await sharp(Buffer.from(floor)).composite([...layers, { input: Buffer.from(caps) }]).png().toBuffer();
  roomSheets.push({ size, buffer: picture, w: imageW, h: imageH, at: [ox - CAP, oy - WALL_H - CAP] });

  // The crest over the head of the table, on the back wall.
  const big = await wallBanner(118, 150);
  put(big.image, ox + w / 2, oy - 6, { depth: oy, when: inRoom });
  crest(ox + w / 2, oy + 1, -6 + big.crest.dy, big.crest.size, { when: inRoom });
  // More banners on the wall with the banners' last level.
  const small = await wallBanner(84, 130);
  for (const side of [-1, 1]) {
    const x = ox + w / 2 + side * Math.min(w * .17, 290);
    put(small.image, x, oy - 26, { depth: oy, when: when(["size", size, size], ["banners", 2, 9]) });
    crest(x, oy + 1, -26 + small.crest.dy, small.crest.size, { when: when(["size", size, size], ["banners", 2, 9]) });
  }
  // The hearth on the left of the back wall: a fireplace, then a great hearth.
  for (const [level, hw, hh, fire] of [[1, 150, 150, .95], [2, 230, 200, 1.35]]) {
    const { image, mouth } = await hearth(hw, hh);
    const x = ox + Math.max(170, w * .17);
    put(image, x, oy + 4, { depth: oy, when: when(["size", size, size], ["hearth", level, level]) });
    const fireFrames = [];
    for (const id of flameFrames) {
      const frame = [...frames.values()].find(entry => entry.id === id);
      const fw = Math.round(frame.w * fire), fh = Math.round(frame.h * fire);
      fireFrames.push(addFrame({ buffer: await sharp(frame.buffer).resize(fw, fh).png().toBuffer(), w: fw, h: fh, pivotX: frame.pivotX * fire, pivotY: frame.pivotY * fire }));
    }
    props.push({ f: fireFrames[0], x: Math.round(x), y: Math.round(oy + 4 + mouth.dy + 28 * fire), d: oy + .5, anim: { ...flameAnim, frames: fireFrames }, when: when(["size", size, size], ["hearth", level, level]) });
    block(x - hw / 2, oy - 10, x + hw / 2, oy + 16, { when: when(["size", size, size], ["hearth", level, level]) });
  }
  // The trophy shelf on the right, then a wall of them with the weapons the guild has won.
  for (const [level, rows] of [[1, 1], [2, 2]]) {
    const shelf = await trophies(Math.min(300, w * .22), rows);
    const x = ox + w - Math.max(190, w * .18);
    put(shelf, x, oy - 24, { depth: oy, when: when(["size", size, size], ["trophies", level, level]) });
  }
  for (const side of [-1, 1]) put(sword, ox + w - Math.max(190, w * .18) + side * 170, oy - 30, { depth: oy, when: when(["size", size, size], ["trophies", 2, 9]) });
  putPrefab(rack, ox + w - Math.max(190, w * .18), oy + 40, { when: when(["size", size, size], ["trophies", 2, 9]) });
  block(ox + w - Math.max(190, w * .18) - 50, oy + 24, ox + w - Math.max(190, w * .18) + 50, oy + 46, { when: when(["size", size, size], ["trophies", 2, 9]) });

  // The great table: as long as its seats need, stools along both sides, a carpet under it.
  const tableY = oy + Math.round(h * .46);
  for (const [level, total] of TABLE_SEATS.entries()) {
    const perSide = total / 2, spacing = 74, length = perSide * spacing + 30;
    const runW = Math.round(length), left = ox + w / 2 - runW / 2;
    const both = when(["size", size, size], ["table", level, level]);
    // The carpet runs under the whole sitting: stools behind the table and in front of it.
    put(await carpet(Math.round(runW + 120), 300), ox + w / 2, tableY - 46, { ground: true, depth: tableY - 220, when: both });
    put(await longTable(runW), ox + w / 2, tableY, { when: both });
    // The table's top reaches 118 behind its foot; nobody walks through it.
    block(left + 4, tableY - 110, left + runW - 4, tableY + 6, { when: both });
    for (let i = 0; i < perSide; i++) {
      const x = ox + w / 2 + (i - (perSide - 1) / 2) * spacing;
      // North of the table, behind its far edge (the table hides a sitter's legs); south, in front of it.
      const northY = tableY - 126, southY = tableY + 36;
      put((i % 2 ? stoolLight : stool).body, x, northY, { ground: true, depth: northY - 1, when: both });
      put((i % 2 ? stool : stoolLight).body, x, southY, { ground: true, depth: southY - 1, when: both });
      seats.push({ x: Math.round(x), y: northY, side: "north", when: both });
      seats.push({ x: Math.round(x), y: southY, side: "south", when: both });
    }
  }

  // Lamps: two by the back wall, then down the sides, then tall lanterns at the table's ends.
  for (const [x, y, min] of [[ox + 50, oy + 70, 0], [ox + w - 50, oy + 70, 0], [ox + 40, oy + h * .55, 1], [ox + w - 40, oy + h * .55, 1], [ox + 40, oy + h - 70, 1], [ox + w - 40, oy + h - 70, 1]]) {
    putPrefab(lamp, x, y, { when: when(["size", size, size], ["lights", min, 9]) });
    block(x - 8, y - 6, x + 8, y + 4, { when: when(["size", size, size], ["lights", min, 9]) });
  }
  for (const side of [-1, 1]) {
    const x = ox + w / 2 + side * Math.min(w / 2 - 110, (TABLE_SEATS[3] / 2 * 74 + 30) / 2 + 90);
    putPrefab(lampTall, x, tableY + 10, { when: when(["size", size, size], ["lights", 2, 9]) });
    block(x - 12, tableY, x + 12, tableY + 14, { when: when(["size", size, size], ["lights", 2, 9]) });
  }
  // Barrels and a chest in the front corners, always; the upgrade board by the door.
  putPrefab(barrel, ox + 60, oy + h - 120, { when: inRoom });
  putPrefab(barrelShut, ox + 104, oy + h - 104, { when: inRoom });
  putPrefab(barrel, ox + 76, oy + h - 70, { when: inRoom });
  block(ox + 30, oy + h - 140, ox + 130, oy + h - 60, { when: inRoom });
  putPrefab(chest, ox + 70, oy + 230, { when: inRoom });
  block(ox + 40, oy + 214, ox + 100, oy + 236, { when: inRoom });
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
geometry.door = { x: HALL_X, y: doorSill, half: doorHalf, enter: HALL_BASE + 6 };

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
  .toFile(join(root, "public/assets/wildstat/guild-hall/hall-props.webp"));
const roomList = [...roomSheets].sort((a, b) => b.h - a.h);
const roomsH = pack(roomList, 2048);
await sharp({ create: { width: 2048, height: roomsH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(roomList.map(room => ({ input: room.buffer, left: room.x, top: room.y }))).webp({ quality: 88, alphaQuality: 90, effort: 6 })
  .toFile(join(root, "public/assets/wildstat/guild-hall/hall-rooms.webp"));
const scene = {
  frames: Object.fromEntries(frameList.sort((a, b) => a.id - b.id).map(f => [f.id, [f.x, f.y, f.w, f.h, Math.round(f.pivotX), Math.round(f.pivotY)]])),
  ground: { x: EXTERIOR.left, y: EXTERIOR.top, w: EXTERIOR.right - EXTERIOR.left, h: EXTERIOR.bottom - EXTERIOR.top },
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
  const sheet = await sharp(join(root, "public/assets/wildstat/guild-hall/hall-props.webp")).png().toBuffer();
  const emblems = await sharp(join(root, "public/assets/wildstat/guild-emblems-v4.webp")).extract({ left: 9, top: 10, width: 300, height: 300 }).png().toBuffer();
  async function render(region, base, file) {
    const layers = [];
    if (base) layers.push({ input: base, left: 0, top: 0 });
    const items = [...props.filter(shown).map(p => ({ ...p, kind: "prop" })), ...crests.filter(shown).map(c => ({ ...c, kind: "crest", y: c.d }))]
      .sort((a, b) => (a.shadow ? -1e9 : 0) - (b.shadow ? -1e9 : 0) || (a.ground ? -1e8 : 0) - (b.ground ? -1e8 : 0) || a.d - b.d);
    for (const item of items) {
      if (item.kind === "crest") {
        const input = await sharp(emblems).resize(item.size, item.size).png().toBuffer();
        const left = Math.round(item.x - item.size / 2 - region.left), top = Math.round(item.d + item.dy - item.size / 2 - region.top);
        if (left >= 0 && top >= 0 && left + item.size <= region.w && top + item.size <= region.h) layers.push({ input, left, top });
        continue;
      }
      const [x, y, w, h, ax, ay] = scene.frames[item.f];
      let input = await sharp(sheet).extract({ left: x, top: y, width: w, height: h }).png().toBuffer();
      if (item.shadow) input = await sharp(input).ensureAlpha().composite([{ input: Buffer.from([0, 0, 0, 56]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: "dest-in" }]).png().toBuffer();
      const left = Math.round(item.x - ax - region.left), top = Math.round(item.y - ay - region.top);
      if (left < 0 || top < 0 || left + w > region.w || top + h > region.h) continue;
      layers.push({ input, left, top });
    }
    await sharp({ create: { width: region.w, height: region.h, channels: 4, background: "#000" } }).composite(layers).png().toFile(file);
  }
  mkdirSync(outDir, { recursive: true });
  const ground = await sharp(join(root, "public/assets/wildstat/guild-hall/hall-ground.webp")).resize(EXTERIOR.right - EXTERIOR.left, EXTERIOR.bottom - EXTERIOR.top).png().toBuffer();
  await render({ left: EXTERIOR.left, top: EXTERIOR.top, w: EXTERIOR.right - EXTERIOR.left, h: EXTERIOR.bottom - EXTERIOR.top }, ground, join(outDir, "outside.png"));
  const room = roomSheets[levels.size ?? 0];
  const rooms = await sharp(join(root, "public/assets/wildstat/guild-hall/hall-rooms.webp")).extract({ left: room.x, top: room.y, width: room.w, height: room.h }).png().toBuffer();
  await render({ left: room.at[0], top: room.at[1], w: room.w, h: room.h }, rooms, join(outDir, "inside.png"));
  console.log(`preview: ${outDir}/outside.png, inside.png`);
}
