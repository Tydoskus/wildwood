#!/usr/bin/env node
/**
 * Bakes ForestVillage's demo village (Demo/ForestVillage Variant.prefab,
 * the scene in the pack's screenshots) for the Soul Dimension's centre:
 *
 * - every ground tilemap Unity draws in chunks (field, roads, cobblestone,
 *   water, bridges) into one ground image, in Unity's own sorting order;
 * - every sprite renderer, and the tiles of tilemaps Unity sorts one by one
 *   (the log fence), as props the game depth-sorts. A sorting group (a
 *   house, a tree) stays one unit: its parts share the group's depth and
 *   keep their order inside it, as in Unity;
 * - the water cells no bridge covers, so the game can keep players out.
 *
 *   tar -xzf "art-source/2D Minimal World - ForestVillage.unitypackage" -C <pkg>
 *   node scripts/art/bake-forest-village-scene.mjs <pkg>
 *
 * Writes public/assets/wildstat/soul-dimension/village-ground.webp,
 * village-props.webp and src/game/soul-village-scene.json. Game units are
 * Unity units × UNITS (60: the pack's 100 pixels a unit at the atlas's .6).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { byGuid, expand, loadPackage, num, parseUnity, spriteFor, nineSlice } from "./unity-prefab.mjs";

const root = resolve(import.meta.dirname, "../..");
const packageDir = process.argv[2];
if (!packageDir) { console.error("usage: bake-forest-village-scene.mjs <extractedPackageDir>"); process.exit(1); }
loadPackage(packageDir);

const UNITS = 60;
/** Ground pixels per game unit: half resolution keeps the decoded image small on phones. */
const GROUND_SCALE = .5;
const PROP_SCALE = .6;
const SHADOW_ALPHA = .22;
// The demo scene's village: the base village prefab plus its chimney smoke and campfire particles.
const PREFAB = "Demo/ForestVillage Variant.prefab";

const guid = [...byGuid].find(([, entry]) => entry.path.endsWith(PREFAB))?.[0];
if (!guid) throw new Error(`no ${PREFAB} in the package`);
const objects = expand(guid);

// ---- Index the expanded prefab. ----
const transforms = new Map(), gameObjects = new Map(), byGameObject = new Map();
for (const [id, object] of objects) {
  if (object.classId === 4) transforms.set(String(id), object.data);
  if (object.classId === 1) gameObjects.set(String(id), object.data);
  const owner = object.data?.m_GameObject?.fileID;
  if (owner) {
    const list = byGameObject.get(String(owner)) ?? [];
    list.push({ id: String(id), ...object });
    byGameObject.set(String(owner), list);
  }
}
const transformOfGo = goId => (byGameObject.get(goId) ?? []).find(c => c.classId === 4);
const componentOf = (goId, classId) => (byGameObject.get(goId) ?? []).find(c => c.classId === classId);
const parentGo = goId => {
  const transform = transformOfGo(goId);
  const father = transform?.data.m_Father?.fileID;
  return father && father !== "0" ? transforms.get(String(father))?.m_GameObject?.fileID ?? null : null;
};
function worldOf(goId) {
  const chain = [];
  for (let id = goId, guard = 0; id && guard < 64; guard++, id = parentGo(id)) chain.unshift(transformOfGo(id)?.data);
  let x = 0, y = 0, sx = 1, sy = 1;
  for (const t of chain) {
    if (!t) continue;
    const p = t.m_LocalPosition ?? {}, s = t.m_LocalScale ?? {};
    x += num(p.x) * sx; y += num(p.y) * sy;
    sx *= num(s.x, 1); sy *= num(s.y, 1);
  }
  return { x, y, sx, sy };
}
function active(goId) {
  for (let id = goId, guard = 0; id && guard < 64; guard++, id = parentGo(id)) {
    if (String(gameObjects.get(id)?.m_IsActive ?? "1") === "0") return false;
  }
  return true;
}
/** The outermost sorting group a renderer sits in, if any: its parts sort as one. */
function sortingGroup(goId) {
  let group = null;
  for (let id = goId, guard = 0; id && guard < 64; guard++, id = parentGo(id)) if (componentOf(id, 210)) group = id;
  return group;
}

// ---- Sprites at a scale, cached. ----
const spriteCache = new Map();
async function spriteBuffer(sprite, scale, { flipX = false, flipY = false, size = null, alpha = 1 } = {}) {
  const key = `${sprite.texture}:${JSON.stringify(sprite.rect)}:${scale}:${flipX}:${flipY}:${JSON.stringify(size)}:${alpha}`;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const meta = await sharp(sprite.texture).metadata();
  const rect = sprite.rect ? { x: num(sprite.rect.x), y: num(sprite.rect.y), w: num(sprite.rect.width), h: num(sprite.rect.height) } : { x: 0, y: 0, w: meta.width, h: meta.height };
  let buffer = await sharp(sprite.texture).extract({ left: Math.round(rect.x), top: Math.round(meta.height - rect.y - rect.h), width: Math.round(rect.w), height: Math.round(rect.h) }).png().toBuffer();
  let w = rect.w, h = rect.h;
  if (size) {
    w = Math.max(1, Math.round(size.x * sprite.ppu)); h = Math.max(1, Math.round(size.y * sprite.ppu));
    buffer = await nineSlice(buffer, rect.w, rect.h, sprite.border, w, h);
  }
  // Drawn at `scale` output pixels per source pixel of a 100-pixels-a-unit sprite.
  const factor = scale * 100 / sprite.ppu;
  const ow = Math.max(1, Math.round(w * factor)), oh = Math.max(1, Math.round(h * factor));
  let image = sharp(buffer).resize(ow, oh, { fit: "fill", kernel: "lanczos3" });
  if (flipX) image = image.flop();
  if (flipY) image = image.flip();
  buffer = await image.png().toBuffer();
  if (alpha < 1) buffer = await sharp(buffer).ensureAlpha().composite([{ input: Buffer.from([0, 0, 0, Math.round(255 * alpha)]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: "dest-in" }]).png().toBuffer();
  const result = { buffer, w: ow, h: oh, pivotX: (flipX ? 1 - sprite.pivot[0] : sprite.pivot[0]) * ow, pivotY: (1 - (flipY ? 1 - sprite.pivot[1] : sprite.pivot[1])) * oh };
  spriteCache.set(key, result);
  return result;
}

// ---- Animators: the pack's clips swap sprites (fires, the fountain) or spin (the windmill's sails). ----
const clipCache = new Map();
function clipFor(controllerGuid) {
  if (clipCache.has(controllerGuid)) return clipCache.get(controllerGuid);
  const controller = byGuid.get(controllerGuid);
  let clip = null;
  if (controller) {
    const name = controller.path.split("/").pop().replace(/\.controller$/, "");
    const entry = [...byGuid.values()].find(e => /\.anim$/.test(e.path) && e.path.split("/").pop().startsWith(`${name}_Idle`));
    if (entry) {
      const [doc] = parseUnity(readFileSync(join(entry.dir, "asset"), "utf8"));
      const data = doc?.data ?? {};
      const frames = (data.m_PPtrCurves ?? []).flatMap(curve => curve?.curve ?? []).map(key => ({ time: num(key.time), sprite: key.value }));
      const stop = num(data.m_AnimationClipSettings?.m_StopTime, frames.at(-1)?.time ?? 1);
      const spin = (data.m_EulerCurves ?? []).flatMap(curve => curve?.curve?.m_Curve ?? []);
      const turn = spin.length >= 2 ? num(spin.at(-1).value?.z) - num(spin[0].value?.z) : 0;
      clip = frames.length > 1 ? { kind: "frames", frames, length: stop }
        : turn ? { kind: "spin", degreesPerSecond: turn / Math.max(1e-6, num(spin.at(-1).time) - num(spin[0].time)) } : null;
    }
  }
  clipCache.set(controllerGuid, clip);
  return clip;
}
const animatorClip = goId => {
  const animator = componentOf(goId, 95)?.data;
  return animator?.m_Controller?.guid ? clipFor(animator.m_Controller.guid) : null;
};

const renderersPer = new Map();
for (const [, object] of objects) if (object.classId === 212) for (const id of object.instances ?? []) renderersPer.set(id, (renderersPer.get(id) ?? 0) + 1);

// ---- Collect the ground (chunked tilemaps) and the props. ----
const ground = []; // { order, layer, x, y, sprite, flipX, flipY, alpha } in Unity units
const props = [];  // { depthY, order, seq, x, y, sprite, flipX, flipY, size, alpha, group }
const water = [], bridges = new Set();
let seq = 0;
for (const [goId] of gameObjects) {
  if (!active(goId)) continue;
  const tilemap = componentOf(goId, 1839735485);
  if (tilemap) {
    const renderer = componentOf(goId, 483693784)?.data ?? {};
    const name = gameObjects.get(goId)?.m_Name ?? "";
    const world = worldOf(goId);
    const parent = parentGo(goId);
    const cell = componentOf(parent, 156049354)?.data?.m_CellSize ?? { x: 2.56, y: 2.56 };
    const cw = num(cell.x, 2.56), ch = num(cell.y, 2.56);
    const anchor = tilemap.data.m_TileAnchor ?? { x: .5, y: .5 };
    const spriteArray = tilemap.data.m_TileSpriteArray ?? [];
    const matrices = tilemap.data.m_TileMatrixArray ?? [];
    const colors = tilemap.data.m_TileColorArray ?? [];
    const individual = String(renderer.m_Mode ?? "0") === "1";
    for (const tile of tilemap.data.m_Tiles ?? []) {
      const at = tile.first ?? {}, info = tile.second ?? {};
      const ref = spriteArray[num(info.m_TileSpriteIndex)]?.m_Data;
      if (!ref?.guid) continue;
      const sprite = spriteFor(ref);
      if (!sprite) continue;
      const matrix = matrices[num(info.m_TileMatrixIndex)]?.m_Data ?? {};
      const color = colors[num(info.m_TileColorIndex)]?.m_Data ?? {};
      const x = world.x + (num(at.x) + num(anchor.x, .5)) * cw, y = world.y + (num(at.y) + num(anchor.y, .5)) * ch;
      const piece = { order: num(renderer.m_SortingOrder), x, y, sprite, flipX: num(matrix.e00, 1) < 0, flipY: num(matrix.e11, 1) < 0, alpha: num(color.a, 1), seq: seq++ };
      if (/water/i.test(name)) water.push({ x: num(at.x), y: num(at.y), cx: x, cy: y, half: cw / 2 });
      if (/bridge/i.test(name)) bridges.add({ cx: x, cy: y, half: Math.max(cw, ch) / 2 });
      // Sorted at the tile's pivot, the foot of its posts, as Unity sorts it.
      if (individual) props.push({ ...piece, depthY: y, group: null });
      else ground.push(piece);
    }
    continue;
  }
  const renderer = componentOf(goId, 212)?.data;
  if (!renderer || String(renderer.m_Enabled ?? "1") === "0") continue;
  // A fire's renderer has no sprite of its own: its animation sets one every frame. Start it on the first.
  const clip = animatorClip(goId);
  const spriteRef = renderer.m_Sprite?.guid ? renderer.m_Sprite : clip?.kind === "frames" ? clip.frames[0]?.sprite : null;
  if (!spriteRef?.guid) continue;
  const sprite = spriteFor(spriteRef);
  if (!sprite) continue;
  const world = worldOf(goId);
  // Unity sorts by order in layer before position, so a campfire's fire (a higher order) is always over its base.
  // Keep each placed prefab together, its order inside it, unless it is a big container of many things.
  const placedAs = (componentOf(goId, 212)?.instances ?? []).find(id => (renderersPer.get(id) ?? 0) <= 24) ?? null;
  const sorting = sortingGroup(goId);
  const group = placedAs ?? sorting;
  const groupWorld = group ? worldOf(group) : world;
  // Inside a unit, Unity draws a sorting group by the group's own order, and a lone sprite by its order.
  const unitOrder = sorting ? num(componentOf(sorting, 210)?.data?.m_SortingOrder) : num(renderer.m_SortingOrder);
  const shadow = sprite.shadow;
  props.push({ clip, goId,
    depthY: groupWorld.y, unitOrder, order: num(renderer.m_SortingOrder), seq: seq++, x: world.x, y: world.y, sprite, group,
    flipX: String(renderer.m_FlipX) === "1" !== (world.sx < 0), flipY: String(renderer.m_FlipY) === "1",
    size: num(renderer.m_DrawMode) === 1 && renderer.m_Size ? { x: num(renderer.m_Size.x) * Math.abs(world.sx), y: num(renderer.m_Size.y) * Math.abs(world.sy) } : null,
    scale: Math.abs(world.sx), alpha: num(renderer.m_Color?.a, 1) * (shadow ? SHADOW_ALPHA : 1),
  });
}

if (process.env.DEBUG_AT) {
  const [ax, ay] = process.env.DEBUG_AT.split(",").map(Number);
  for (const prop of props) if (Math.hypot(prop.x * UNITS - ax, -prop.y * UNITS - ay) < 80) console.log(JSON.stringify({ name: gameObjects.get(String(prop.goId))?.m_Name, x: Math.round(prop.x * UNITS), y: Math.round(-prop.y * UNITS), depth: Math.round(-prop.depthY * UNITS), order: prop.order, group: prop.group, groupName: gameObjects.get(String(prop.group))?.m_Name }));
}
// ---- The ground image. ----
ground.sort((a, b) => a.order - b.order || a.seq - b.seq);
const groundPieces = [];
for (const piece of ground) {
  const image = await spriteBuffer(piece.sprite, GROUND_SCALE * UNITS / 100, { flipX: piece.flipX, flipY: piece.flipY, alpha: piece.alpha });
  groundPieces.push({ ...image, gx: piece.x * UNITS * GROUND_SCALE - image.pivotX, gy: -piece.y * UNITS * GROUND_SCALE - image.pivotY });
}
const minX = Math.floor(Math.min(...groundPieces.map(p => p.gx))), minY = Math.floor(Math.min(...groundPieces.map(p => p.gy)));
const maxX = Math.ceil(Math.max(...groundPieces.map(p => p.gx + p.w))), maxY = Math.ceil(Math.max(...groundPieces.map(p => p.gy + p.h)));
const outDir = join(root, "public/assets/wildstat/soul-dimension");
mkdirSync(outDir, { recursive: true });
await sharp({ create: { width: maxX - minX, height: maxY - minY, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(groundPieces.map(p => ({ input: p.buffer, left: Math.round(p.gx - minX), top: Math.round(p.gy - minY) })))
  .webp({ quality: 90, alphaQuality: 90, effort: 6 }).toFile(join(outDir, "village-ground.webp"));

// ---- The props: unique frames packed into one atlas. ----
props.sort((a, b) => b.depthY - a.depthY
  || (a.group && a.group === b.group ? (a.unitOrder ?? a.order) - (b.unitOrder ?? b.order) || a.order - b.order || b.y - a.y || a.seq - b.seq : 0)
  || a.seq - b.seq);
const frames = new Map();
const placed = [];
for (const prop of props) {
  const image = await spriteBuffer(prop.sprite, PROP_SCALE * (prop.scale ?? 1), { flipX: prop.flipX, flipY: prop.flipY, size: prop.size, alpha: prop.alpha });
  const key = createHash("sha1").update(image.buffer).digest("hex");
  if (!frames.has(key)) frames.set(key, { id: frames.size, ...image });
  const frame = frames.get(key);
  const item = { f: frame.id, x: Math.round(prop.x * UNITS), y: Math.round(-prop.y * UNITS), d: Math.round(-prop.depthY * UNITS) };
  if (prop.clip?.kind === "frames") {
    const ids = [];
    for (const key of prop.clip.frames) {
      const sprite = spriteFor(key.sprite);
      const keyImage = sprite ? await spriteBuffer(sprite, PROP_SCALE * (prop.scale ?? 1), { flipX: prop.flipX, flipY: prop.flipY, alpha: prop.alpha }) : image;
      const keyHash = createHash("sha1").update(keyImage.buffer).digest("hex");
      if (!frames.has(keyHash)) frames.set(keyHash, { id: frames.size, ...keyImage });
      ids.push(frames.get(keyHash).id);
    }
    item.anim = { frames: ids, times: prop.clip.frames.map(key => +key.time.toFixed(4)), length: +prop.clip.length.toFixed(4) };
  }
  if (prop.clip?.kind === "spin") item.spin = +prop.clip.degreesPerSecond.toFixed(3);
  placed.push(item);
}
// Equal depths keep Unity's order inside a group: nudge each later part a hair deeper.
const seen = new Map();
for (const item of placed) { const n = seen.get(item.d) ?? 0; seen.set(item.d, n + 1); item.d = +(item.d + n * .001).toFixed(3); }
// ---- Particle systems (chimney smoke, campfire smoke and sparks): their settings, for the game's own small emitter. ----
const curveRange = c => {
  // Unity's MinMaxCurve: 0 a constant, 1 a curve times the scalar, 3 a random value between two constants.
  const state = num(c?.minMaxState), max = num(c?.scalar), min = num(c?.minScalar);
  if (state === 3) return [Math.min(min, max), Math.max(min, max)];
  if (state === 1 || state === 2) {
    const keys = (c?.maxCurve?.m_Curve ?? []).map(k => num(k.value));
    return keys.length ? [max * Math.min(...keys), max * Math.max(...keys)] : [max, max];
  }
  return [max, max];
};
const curveKeys = c => (c?.maxCurve?.m_Curve ?? []).map(k => [+num(k.time).toFixed(3), +(num(k.value) * (num(c?.minMaxState) === 1 ? num(c?.scalar, 1) : 1)).toFixed(3)]);
function gradientKeys(g) {
  const gradient = num(g?.minMaxState) === 0 ? null : g?.maxGradient;
  if (!gradient) { const c = g?.maxColor ?? {}; return { colors: [[0, num(c.r, 1), num(c.g, 1), num(c.b, 1)]], alphas: [[0, num(c.a, 1)]] }; }
  const colors = [], alphas = [];
  for (let i = 0; i < num(gradient.m_NumColorKeys, 2); i++) { const k = gradient[`key${i}`] ?? {}; colors.push([+(num(gradient[`ctime${i}`]) / 65535).toFixed(3), num(k.r), num(k.g), num(k.b)]); }
  for (let i = 0; i < num(gradient.m_NumAlphaKeys, 2); i++) { const k = gradient[`key${i}`] ?? {}; alphas.push([+(num(gradient[`atime${i}`]) / 65535).toFixed(3), num(k.a)]); }
  return { colors, alphas };
}
function materialTexture(materialRef) {
  const entry = byGuid.get(materialRef?.guid);
  if (!entry) return null;
  const text = readFileSync(join(entry.dir, "asset"), "utf8");
  // _MainTex on the built-in pipeline's materials, _BaseMap on URP's.
  const texture = /_(?:MainTex|BaseMap):\s*\n\s*m_Texture: \{fileID: \d+, guid: (\w+)/.exec(text)?.[1];
  const additive = /_DstBlend: 1\b/.test(text);
  return texture ? { texture, additive } : null;
}
const emitters = [];
for (const [goId] of gameObjects) {
  if (!active(goId)) continue;
  const system = componentOf(goId, 198)?.data;
  const renderer = componentOf(goId, 199)?.data;
  if (!system || !renderer) continue;
  const main = system.InitialModule ?? {};
  const material = materialTexture(renderer.m_Materials?.[0]);
  const textureEntry = material && byGuid.get(material.texture);
  if (!textureEntry) continue;
  const world = worldOf(goId);
  const uv = system.UVModule ?? {};
  const sheet = String(uv.enabled ?? "0") === "1" ? [num(uv.tilesX, 1), num(uv.tilesY, 1)] : [1, 1];
  const image = await sharp(join(textureEntry.dir, "asset")).png().toBuffer();
  const meta = await sharp(image).metadata();
  // The texture goes in at most 128 pixels a cell: particles are small on screen.
  const cellW = Math.min(128, Math.round(meta.width / sheet[0])), cellH = Math.min(128, Math.round(meta.height / sheet[1]));
  const sized = await sharp(image).resize(cellW * sheet[0], cellH * sheet[1], { fit: "fill" }).png().toBuffer();
  const key = createHash("sha1").update(sized).digest("hex");
  if (!frames.has(key)) frames.set(key, { id: frames.size, buffer: sized, w: cellW * sheet[0], h: cellH * sheet[1], pivotX: 0, pivotY: 0 });
  const scale = Math.abs(world.sx) * UNITS;
  const color = system.ColorModule ?? {}, size = system.SizeModule ?? {}, rotation = system.RotationModule ?? {}, shape = system.ShapeModule ?? {}, noise = system.NoiseModule ?? {};
  emitters.push({
    x: Math.round(world.x * UNITS), y: Math.round(-world.y * UNITS),
    frame: frames.get(key).id, sheet, additive: material.additive, order: num(renderer.m_SortingOrder),
    lifetime: curveRange(main.startLifetime), speed: curveRange(main.startSpeed).map(v => +(v * scale).toFixed(2)),
    size: curveRange(main.startSize).map(v => +(v * scale).toFixed(2)), rotation: curveRange(main.startRotation).map(v => +v.toFixed(3)),
    gravity: +(num(main.gravityModifier?.scalar) * 9.81 * scale).toFixed(2), max: num(main.maxNumParticles, 50),
    rate: curveRange(system.EmissionModule?.rateOverTime)[1],
    shape: { type: num(shape.type), radius: +(num(shape.radius?.value ?? shape.radius, 0) * scale).toFixed(2), angle: num(shape.angle) },
    startColor: gradientKeys(main.startColor),
    color: String(color.enabled ?? "0") === "1" ? gradientKeys(color.gradient) : null,
    sizeCurve: String(size.enabled ?? "0") === "1" ? curveKeys(size.curve) : null,
    spin: String(rotation.enabled ?? "0") === "1" ? curveRange(rotation.curve).map(v => +v.toFixed(3)) : [0, 0],
    noise: String(noise.enabled ?? "0") === "1" ? +(num(noise.strength?.scalar) * scale).toFixed(2) : 0,
  });
}

const frameList = [...frames.values()].sort((a, b) => b.h - a.h);
const WIDTH = 2048, PADDING = 2;
let x = 0, y = 0, shelf = 0;
for (const frame of frameList) {
  if (x + frame.w + PADDING > WIDTH) { x = 0; y += shelf + PADDING; shelf = 0; }
  frame.x = x; frame.y = y; x += frame.w + PADDING; shelf = Math.max(shelf, frame.h);
}
await sharp({ create: { width: WIDTH, height: y + shelf, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(frameList.map(f => ({ input: f.buffer, left: f.x, top: f.y })))
  .webp({ quality: 92, alphaQuality: 100, effort: 6 }).toFile(join(outDir, "village-props.webp"));

// Where the square's fountain stands (the game centres the village on it), and every building's footprint.
let fountain = null;
const groupBoxes = new Map();
for (const [goId, go] of gameObjects) {
  if (!active(goId)) continue;
  if (!fountain && /^Fountain/.test(go.m_Name ?? "")) fountain = worldOf(goId);
}
for (const prop of props) {
  if (!prop.group) continue;
  const name = gameObjects.get(prop.group)?.m_Name ?? "";
  if (!/House|Inn|Apothecary|Forge|Tower|Well|Fountain|PopUp|Windmill|Tools/i.test(name)) continue;
  const box = groupBoxes.get(prop.group) ?? { left: Infinity, right: -Infinity, base: prop.depthY };
  const half = (prop.size ? prop.size.x : num(prop.sprite.rect?.width, 100) / prop.sprite.ppu) * (prop.scale ?? 1) / 2;
  if (!prop.sprite.shadow) { box.left = Math.min(box.left, prop.x - half); box.right = Math.max(box.right, prop.x + half); }
  groupBoxes.set(prop.group, box);
}
const buildings = [...groupBoxes.values()].filter(box => Number.isFinite(box.left)).map(box => {
  const width = (box.right - box.left) * .8;
  return [Math.round(((box.left + box.right) / 2 - width / 2) * UNITS), Math.round(-box.base * UNITS) - 50, Math.round(width * UNITS), 60];
});
// A bridge's tiles sit on their own tilemap, so match them to the water by where they are, not by cell number.
const bridged = cell => [...bridges].some(bridge => Math.abs(bridge.cx - cell.cx) < bridge.half + cell.half * .5 && Math.abs(bridge.cy - cell.cy) < bridge.half + cell.half * .5);
const solidWater = water.filter(cell => !bridged(cell))
  .map(cell => [Math.round((cell.cx - cell.half) * UNITS), Math.round(-(cell.cy + cell.half) * UNITS), Math.round(cell.half * 2 * UNITS)]);
const scene = {
  units: UNITS,
  ground: { left: minX / GROUND_SCALE, top: minY / GROUND_SCALE, width: (maxX - minX) / GROUND_SCALE, height: (maxY - minY) / GROUND_SCALE },
  frames: Object.fromEntries(frameList.sort((a, b) => a.id - b.id).map(f => [f.id, [f.x, f.y, f.w, f.h, Math.round(f.pivotX), Math.round(f.pivotY)]])),
  props: placed.map(p => [p.f, p.x, p.y, p.d]),
  /** Prop index -> its clip: sprite frames with their start times and the loop's length, or a spin in degrees a second. */
  animations: Object.fromEntries(placed.map((p, index) => [index, p.anim ? { frames: p.anim.frames, times: p.anim.times, length: p.anim.length } : p.spin ? { spin: p.spin } : null]).filter(([, a]) => a)),
  water: solidWater,
  buildings,
  emitters,
  fountain: fountain ? [Math.round(fountain.x * UNITS), Math.round(-fountain.y * UNITS)] : [0, 0],
};
writeFileSync(join(root, "src/game/soul-village-scene.json"), JSON.stringify(scene));
console.log(`ground ${maxX - minX}x${maxY - minY}px, ${frameList.length} frames for ${placed.length} props, ${solidWater.length} water cells, ${buildings.length} buildings, ${emitters.length} particle emitters, fountain ${scene.fountain}`);
