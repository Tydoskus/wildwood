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
 * - the pack's own colliders (tilemap colliders on the river banks and the
 *   fence, boxes and polygons on trees, house bases, wells, bridge rails),
 *   so the game keeps players out of what Unity kept its character out of.
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
import { bakeInteriors } from "./soul-interiors.mjs";

const root = resolve(import.meta.dirname, "../..");
const packageDir = process.argv[2];
if (!packageDir) { console.error("usage: bake-forest-village-scene.mjs <extractedPackageDir>"); process.exit(1); }
loadPackage(packageDir);

const UNITS = 60;
/** Ground pixels per game unit: half resolution keeps the decoded image small on phones. */
const GROUND_SCALE = .5;
const PROP_SCALE = .6;
// The demo scene's village: the base village prefab plus its chimney smoke and campfire particles.
const PREFAB = "Demo/ForestVillage Variant.prefab";

const guid = [...byGuid].find(([, entry]) => entry.path.endsWith(PREFAB))?.[0];
if (!guid) throw new Error(`no ${PREFAB} in the package`);
const objects = expand(guid);
/** What blocks walking, as Unity colliders do: each a polygon in Unity units, with its box. */
const solids = [], passages = [];
/** The wells: walk into one and you fall in (the game puts you back on the square). */
const pits = [];
const shapeOf = points => ({ points, box: [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))] });

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
/**
 * The demo was saved at night (it starts at 3am): its day/night script shows each building's lit window
 * panes and hides the dark ones. Ours is always day, so as that script does by day, the other way round.
 */
const DAYTIME = [[/Window_In_Light/, false], [/Window_In_Dark/, true]];
function active(goId) {
  for (let id = goId, guard = 0; id && guard < 64; guard++, id = parentGo(id)) {
    const go = gameObjects.get(id);
    const daytime = DAYTIME.find(([name]) => name.test(go?.m_Name ?? ""));
    if (daytime ? !daytime[1] : String(go?.m_IsActive ?? "1") === "0") return false;
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
/** A renderer's colour as a tint, or null for white. */
const tintOf = color => {
  const tint = [num(color?.r, 1), num(color?.g, 1), num(color?.b, 1)];
  return tint.every(value => value > .999) ? null : tint;
};
async function spriteBuffer(sprite, scale, { flipX = false, flipY = false, size = null, alpha = 1, tint = null } = {}) {
  const key = `${sprite.texture}:${JSON.stringify(sprite.rect)}:${scale}:${flipX}:${flipY}:${JSON.stringify(size)}:${alpha}:${tint}`;
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
  // Unity multiplies a sprite by its renderer's colour: one white window pane is a dark one by day, a lit one by night.
  if (tint) buffer = await sharp(buffer).ensureAlpha().linear([...tint, 1], [0, 0, 0, 0]).png().toBuffer();
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
/** The unit a renderer or collider belongs to: its outermost placed prefab small enough to be one thing, else its sorting group. */
const unitOf = (component, goId) => (component?.instances ?? []).find(id => (renderersPer.get(id) ?? 0) <= 24) ?? sortingGroup(goId);
const isWell = (component, goId) => /^Well/.test(gameObjects.get(String(unitOf(component, goId)))?.m_Name ?? "");
/** Each unit's box colliders, [left, bottom, right, top]: a building's tell where each of its walls stands. */
const unitColliders = new Map();

// ---- Colliders: the pack's own boxes (trees, house bases, stones, hay, the bridges' rails) and polygons (wells). ----
for (const [goId] of gameObjects) {
  if (!active(goId)) continue;
  const world = worldOf(goId);
  for (const component of byGameObject.get(goId) ?? []) {
    const data = component.data ?? {};
    if (String(data.m_Enabled ?? "1") === "0") continue;
    if (String(data.m_IsTrigger ?? "0") === "1") {
      // The demo's bridge passages: triggers that let its character over the river's collision. Walkable, here.
      if (component.classId === 61 && /BridgePassage/.test(gameObjects.get(goId)?.m_Name ?? "")) {
        const cx = world.x + num(data.m_Offset?.x) * world.sx, cy = world.y + num(data.m_Offset?.y) * world.sy;
        const w = num(data.m_Size?.x) * Math.abs(world.sx), h = num(data.m_Size?.y) * Math.abs(world.sy);
        passages.push([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]);
      }
      continue;
    }
    if (component.classId === 61) {
      const cx = world.x + num(data.m_Offset?.x) * world.sx, cy = world.y + num(data.m_Offset?.y) * world.sy;
      const w = num(data.m_Size?.x) * Math.abs(world.sx), h = num(data.m_Size?.y) * Math.abs(world.sy);
      (isWell(component, goId) ? pits : solids).push(shapeOf([[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]]));
      const unit = unitOf(component, goId);
      if (unit) unitColliders.set(unit, [...(unitColliders.get(unit) ?? []), solids.at(-1).box]);
    } else if (component.classId === 60) {
      for (const path of data.m_Points?.m_Paths ?? []) {
        if (!Array.isArray(path) || !path.length) continue;
        (isWell(component, goId) ? pits : solids).push(shapeOf(path.map(point => [world.x + (num(point.x) + num(data.m_Offset?.x)) * world.sx, world.y + (num(point.y) + num(data.m_Offset?.y)) * world.sy])));
      }
    }
  }
}


// ---- Collect the ground (chunked tilemaps) and the props. ----
const ground = []; // { order, layer, x, y, sprite, flipX, flipY, alpha } in Unity units
const props = [];  // { depthY, order, seq, x, y, sprite, flipX, flipY, size, alpha, group }

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
    const collides = Boolean(componentOf(goId, 19719996)) && String(componentOf(goId, 19719996)?.data?.m_IsTrigger ?? "0") !== "1";
    for (const tile of tilemap.data.m_Tiles ?? []) {
      const at = tile.first ?? {}, info = tile.second ?? {};
      const ref = spriteArray[num(info.m_TileSpriteIndex)]?.m_Data;
      if (!ref?.guid) continue;
      const sprite = spriteFor(ref);
      if (!sprite) continue;
      const matrix = matrices[num(info.m_TileMatrixIndex)]?.m_Data ?? {};
      const color = colors[num(info.m_TileColorIndex)]?.m_Data ?? {};
      const x = world.x + (num(at.x) + num(anchor.x, .5)) * cw, y = world.y + (num(at.y) + num(anchor.y, .5)) * ch;
      const piece = { order: num(renderer.m_SortingOrder), layer: name, x, y, sprite, flipX: num(matrix.e00, 1) < 0, flipY: num(matrix.e11, 1) < 0, alpha: num(color.a, 1), tint: tintOf(color), seq: seq++ };
      // A tilemap collider takes each tile's own physics shape: points in pixels from the sprite's centre.
      if (collides) for (const points of sprite.physicsShape ?? []) {
        if (!Array.isArray(points) || points.length < 3) continue;
        const rect = sprite.rect ?? { width: 256, height: 256 };
        const px = (num(rect.width) * .5 - sprite.pivot[0] * num(rect.width)) / sprite.ppu, py = (num(rect.height) * .5 - sprite.pivot[1] * num(rect.height)) / sprite.ppu;
        solids.push(shapeOf(points.map(point => [x + px + num(point.x) / sprite.ppu * (piece.flipX ? -1 : 1), y + py + num(point.y) / sprite.ppu * (piece.flipY ? -1 : 1)])));
      }
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
  const sorting = sortingGroup(goId);
  const group = unitOf(componentOf(goId, 212), goId);
  const groupWorld = group ? worldOf(group) : world;
  // Inside a unit, Unity draws a sorting group by the group's own order, and a lone sprite by its order.
  const unitOrder = sorting ? num(componentOf(sorting, 210)?.data?.m_SortingOrder) : num(renderer.m_SortingOrder);
  // Unity sorts level by level: the outermost sorting group's order, then each nested group's, then the sprite's own.
  // Two groups tied on order are each drawn whole, the farther (higher) one first: a house's Front group
  // (gable, door) over its Back group (wings, long roof), whatever the orders of the sprites inside them.
  const chain = [];
  for (let id = goId, guard = 0; id && guard < 64; guard++, id = parentGo(id)) if (componentOf(id, 210)) chain.unshift({ order: num(componentOf(id, 210).data?.m_SortingOrder), y: worldOf(id).y, id });
  chain.push({ order: num(renderer.m_SortingOrder), y: world.y, id: goId });
  const shadow = sprite.shadow;
  props.push({ clip, goId, door: /^Door_/.test(gameObjects.get(goId)?.m_Name ?? ""),
    depthY: groupWorld.y, unitOrder, chain, order: num(renderer.m_SortingOrder), seq: seq++, x: world.x, y: world.y, sprite, group,
    flipX: String(renderer.m_FlipX) === "1" !== (world.sx < 0), flipY: String(renderer.m_FlipY) === "1",
    size: num(renderer.m_DrawMode) === 1 && renderer.m_Size ? { x: num(renderer.m_Size.x) * Math.abs(world.sx), y: num(renderer.m_Size.y) * Math.abs(world.sy) } : null,
    // Shadows at full strength: the game fades them all together, so overlapping ones do not stack darker.
    scale: Math.abs(world.sx), alpha: num(renderer.m_Color?.a, 1), tint: tintOf(renderer.m_Color), shadow,
  });
}

if (process.env.DEBUG_AT) {
  const [ax, ay] = process.env.DEBUG_AT.split(",").map(Number);
  for (const prop of props) if (Math.hypot(prop.x * UNITS - ax, -prop.y * UNITS - ay) < 80) console.log(JSON.stringify({ name: gameObjects.get(String(prop.goId))?.m_Name, x: Math.round(prop.x * UNITS), y: Math.round(-prop.y * UNITS), depth: Math.round(-prop.depthY * UNITS), order: prop.order, group: prop.group, groupName: gameObjects.get(String(prop.group))?.m_Name }));
}
// A prefab parented onto another (the crossbow on its tower) is one thing with it: it sorts at the other's
// base, drawn after the other's own parts of the same order, as a child is.
const unitRoots = new Set(props.map(prop => prop.group).filter(Boolean));
for (const prop of props) {
  if (!prop.group) continue;
  let outer = null;
  for (let id = parentGo(prop.group), guard = 0; id && guard < 64; guard++, id = parentGo(id)) if (unitRoots.has(id)) outer = id;
  if (!outer) continue;
  prop.group = outer;
  prop.depthY = worldOf(outer).y;
  prop.unitOrder = (prop.unitOrder ?? prop.order) + .5;
  if (prop.chain) prop.chain = [{ ...prop.chain[0], order: prop.chain[0].order + .5 }, ...prop.chain.slice(1)];
}

/** Order inside one unit: each level's sorting order in turn, as Unity's nested sorting groups do. */
function compareChains(a, b) {
  const x = a.chain ?? [{ order: a.unitOrder ?? a.order }], y = b.chain ?? [{ order: b.unitOrder ?? b.order }];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const p = x[i], q = y[i];
    const difference = (p?.order ?? 0) - (q?.order ?? 0);
    if (difference) return difference;
    // The same group: its contents decide, at the next level. Different ones: the farther is drawn first.
    if (!p || !q || p.id === q.id) continue;
    return q.y - p.y;
  }
  return 0;
}

// ---- The ground image. ----
ground.sort((a, b) => a.order - b.order || a.seq - b.seq);
const groundPieces = [];
for (const piece of ground) {
  const image = await spriteBuffer(piece.sprite, GROUND_SCALE * UNITS / 100, { flipX: piece.flipX, flipY: piece.flipY, alpha: piece.alpha, tint: piece.tint });
  groundPieces.push({ ...image, gx: piece.x * UNITS * GROUND_SCALE - image.pivotX, gy: -piece.y * UNITS * GROUND_SCALE - image.pivotY });
}
const minX = Math.floor(Math.min(...groundPieces.map(p => p.gx))), minY = Math.floor(Math.min(...groundPieces.map(p => p.gy)));
const maxX = Math.ceil(Math.max(...groundPieces.map(p => p.gx + p.w))), maxY = Math.ceil(Math.max(...groundPieces.map(p => p.gy + p.h)));
const outDir = join(root, "public/assets/wildstat/soul-dimension");
mkdirSync(outDir, { recursive: true });
await sharp({ create: { width: maxX - minX, height: maxY - minY, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(groundPieces.map(p => ({ input: p.buffer, left: Math.round(p.gx - minX), top: Math.round(p.gy - minY) })))
  .webp({ quality: 90, alphaQuality: 90, effort: 6 }).toFile(join(outDir, "village-ground.webp"));

// ---- The river's masks, for the game's moving water (the demo animates it with a shader): the open water
// you can see (water tiles, less everything drawn over them: banks, bridges), and a band along its shore. ----
{
  const width = maxX - minX, height = maxY - minY;
  const waterOrder = Math.max(...ground.filter(piece => /^Water$/i.test(piece.layer)).map(piece => piece.order));
  const solidWhite = async piece => sharp(piece.buffer).ensureAlpha().linear([0, 0, 0, 1], [255, 255, 255, 0]).png().toBuffer();
  const layers = [];
  for (const [index, piece] of groundPieces.entries()) {
    const source = ground[index];
    const water = /^Water$/i.test(source.layer);
    if (!water && source.order <= waterOrder) continue;
    layers.push({ input: await solidWhite(piece), left: Math.round(piece.gx - minX), top: Math.round(piece.gy - minY), blend: water ? "over" : "dest-out" });
  }
  const mask = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(layers).raw().toBuffer();
  const alpha = new Float32Array(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = mask[i * 4 + 3] / 255;
  // A box blur of the mask: near 1 only well inside the water, so 1 minus it lights the shore.
  const blur = (source, radius) => {
    const out = new Float32Array(source.length), tmp = new Float32Array(source.length);
    for (let y = 0; y < height; y++) { let sum = 0; for (let x = -radius; x < width + radius; x++) {
      sum += source[y * width + Math.min(width - 1, Math.max(0, x + radius))] - source[y * width + Math.min(width - 1, Math.max(0, x - radius - 1))];
      if (x >= 0 && x < width) tmp[y * width + x] = sum / (radius * 2 + 1); } }
    for (let x = 0; x < width; x++) { let sum = 0; for (let y = -radius; y < height + radius; y++) {
      sum += tmp[Math.min(height - 1, Math.max(0, y + radius)) * width + x] - tmp[Math.min(height - 1, Math.max(0, y - radius - 1)) * width + x];
      if (y >= 0 && y < height) out[y * width + x] = sum / (radius * 2 + 1); } }
    return out;
  };
  const near = blur(alpha, 6);
  const inner = Buffer.alloc(width * height * 4), shore = Buffer.alloc(width * height * 4);
  for (let i = 0; i < alpha.length; i++) {
    const deep = Math.max(0, Math.min(1, (near[i] - .7) / .3)) * alpha[i];
    const band = Math.max(0, alpha[i] - Math.max(0, Math.min(1, (near[i] - .45) / .4)));
    inner.fill(255, i * 4, i * 4 + 3); inner[i * 4 + 3] = Math.round(deep * 255);
    shore.fill(255, i * 4, i * 4 + 3); shore[i * 4 + 3] = Math.round(band * 255);
  }
  await sharp(inner, { raw: { width, height, channels: 4 } }).webp({ quality: 80, alphaQuality: 80, effort: 6 }).toFile(join(outDir, "village-water.webp"));
  await sharp(shore, { raw: { width, height, channels: 4 } }).webp({ quality: 80, alphaQuality: 80, effort: 6 }).toFile(join(outDir, "village-shore.webp"));
}

// ---- The props: unique frames packed into one atlas. ----
props.sort((a, b) => b.depthY - a.depthY
  || (a.group && a.group === b.group ? compareChains(a, b) || b.y - a.y || a.seq - b.seq : 0)
  || a.seq - b.seq);
// ---- Buildings whose walls stand at different depths (a front gable and the wings behind it) are cut into
// vertical strips, each sorted at the base of the wall above it, by the colliders under each part. Sorting
// a whole house at one point put a player standing before a wing behind the house, and a barrel too.
const imageOf = prop => prop.prebuilt ?? spriteBuffer(prop.sprite, PROP_SCALE * (prop.scale ?? 1), { flipX: prop.flipX, flipY: prop.flipY, size: prop.size, alpha: prop.alpha, tint: prop.tint });
const byUnit = new Map();
for (const prop of props) if (prop.group) byUnit.set(prop.group, [...(byUnit.get(prop.group) ?? []), prop]);
const sliced = new Set();
const strips = [];
for (const [unit, parts] of byUnit) {
  const colliders = unitColliders.get(unit) ?? [];
  if (colliders.length < 2 || Math.max(...colliders.map(c => c[1])) - Math.min(...colliders.map(c => c[1])) < .25) continue;
  // A door stays its own sprite, to swing open when someone walks up.
  const standing = parts.filter(part => !part.shadow && !part.clip && !part.door && (part.unitOrder ?? part.order) >= 0);
  if (standing.length < 2) continue;
  const pieces = [];
  for (const part of standing) {
    const image = await imageOf(part);
    pieces.push({ ...image, left: part.x * UNITS - image.pivotX, top: -part.y * UNITS - image.pivotY });
  }
  const minX = Math.floor(Math.min(...pieces.map(p => p.left))), minY = Math.floor(Math.min(...pieces.map(p => p.top)));
  const maxX = Math.ceil(Math.max(...pieces.map(p => p.left + p.w))), maxY = Math.ceil(Math.max(...pieces.map(p => p.top + p.h)));
  const composite = await sharp({ create: { width: maxX - minX, height: maxY - minY, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(pieces.map(p => ({ input: p.buffer, left: Math.round(p.left - minX), top: Math.round(p.top - minY) }))).png().toBuffer();
  // Strip edges where a collider starts or ends; each strip sorts at the front of the colliders under it.
  const edges = [...new Set([minX, maxX, ...colliders.flatMap(c => [Math.round(c[0] * UNITS), Math.round(c[2] * UNITS)])])]
    .filter(x => x >= minX && x <= maxX).sort((a, b) => a - b);
  const depthAt = x => {
    const under = colliders.filter(c => c[0] * UNITS <= x && c[2] * UNITS >= x);
    const near = under.length ? under : [colliders.reduce((best, c) => Math.min(Math.abs(c[0] * UNITS - x), Math.abs(c[2] * UNITS - x))
      < Math.min(Math.abs(best[0] * UNITS - x), Math.abs(best[2] * UNITS - x)) ? c : best)];
    return Math.max(...near.map(c => -c[1] * UNITS));
  };
  const runs = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    if (edges[i + 1] - edges[i] < 1) continue;
    const depth = depthAt((edges[i] + edges[i + 1]) / 2);
    const last = runs.at(-1);
    if (last && last.depth === depth && last.right === edges[i]) last.right = edges[i + 1];
    else runs.push({ left: edges[i], right: edges[i + 1], depth });
  }
  for (const [index, run] of runs.entries()) {
    // Each strip but the last reaches a pixel into the next: at a zoom between whole pixels two strips
    // that only met left a hairline between them.
    const right = index < runs.length - 1 ? Math.min(maxX, run.right + 1) : run.right;
    const buffer = await sharp(composite).extract({ left: run.left - minX, top: 0, width: right - run.left, height: maxY - minY }).png().toBuffer();
    strips.push({ prebuilt: { buffer, w: right - run.left, h: maxY - minY, pivotX: 0, pivotY: 0 }, strip: true,
      x: run.left / UNITS, y: -minY / UNITS, depthY: -run.depth / UNITS, group: unit, order: 0, unitOrder: 0, seq: seq++ });
  }
  // An animated part (the windmill's sails) is on top of its whole building in Unity, and it swings across
  // more than one strip: it sorts just in front of the building's front-most strip.
  const front = Math.max(...runs.map(run => run.depth));
  for (const part of parts.filter(p => p.clip)) part.depthY = -(front + .5) / UNITS;
  // A door is on the wall it opens in: just in front of the strip it stands on.
  for (const part of parts.filter(p => p.door)) {
    const doorX = part.x * UNITS;
    part.depthY = -((runs.find(run => run.left <= doorX && run.right >= doorX)?.depth ?? front) + 1) / UNITS;
  }
  for (const part of standing) sliced.add(part);
}
props.splice(0, props.length, ...props.filter(prop => !sliced.has(prop)), ...strips);
props.sort((a, b) => b.depthY - a.depthY
  || (a.group && a.group === b.group ? compareChains(a, b) || b.y - a.y || a.seq - b.seq : 0)
  || a.seq - b.seq);

const frames = new Map();
/** An image's frame in the sheet, the same image always the same frame. */
function addFrame(image) {
  const key = createHash("sha1").update(image.buffer).digest("hex");
  if (!frames.has(key)) frames.set(key, { id: frames.size, ...image });
  return frames.get(key).id;
}
/** A pack texture by name, as a sprite (the whole image). */
function spriteNamed(name) {
  const entry = [...byGuid].find(([, value]) => value.path.endsWith(`/${name}.png`));
  return entry ? spriteFor({ guid: entry[0], fileID: "21300000" }) : null;
}
const placed = [];
/** Each door: its prop, its pictures shut and open, and where its sill is. */
const doorways = [];
for (const prop of props) {
  let image = await imageOf(prop);
  let openImage = null;
  if (prop.door) {
    const name = (gameObjects.get(String(prop.goId))?.m_Name ?? "").replace(/_Open$/, "");
    const closed = spriteNamed(name), open = spriteNamed(`${name}_Open`);
    const draw = sprite => spriteBuffer(sprite, PROP_SCALE * (prop.scale ?? 1), { flipX: prop.flipX, flipY: prop.flipY, alpha: prop.alpha, tint: prop.tint });
    if (closed && open) { image = await draw(closed); openImage = await draw(open); }
  }
  const item = { f: addFrame(image), x: Math.round(prop.x * UNITS), y: Math.round(-prop.y * UNITS), d: Math.round(-prop.depthY * UNITS),
    // Unity draws a negative order under anything at zero (the characters): garden beds, campfire rings, bridge planks.
    ground: !prop.shadow && (prop.unitOrder ?? prop.order) < 0, shadow: Boolean(prop.shadow) };
  if (prop.clip?.kind === "frames") {
    const ids = [];
    for (const key of prop.clip.frames) {
      const sprite = spriteFor(key.sprite);
      const keyImage = sprite ? await spriteBuffer(sprite, PROP_SCALE * (prop.scale ?? 1), { flipX: prop.flipX, flipY: prop.flipY, alpha: prop.alpha, tint: prop.tint }) : image;
      ids.push(addFrame(keyImage));
    }
    item.anim = { frames: ids, times: prop.clip.frames.map(key => +key.time.toFixed(4)), length: +prop.clip.length.toFixed(4) };
  }
  if (prop.clip?.kind === "spin") item.spin = +prop.clip.degreesPerSecond.toFixed(3);
  if (openImage) {
    item.open = addFrame(openImage);
    item.door = doorways.length;
    doorways.push({ item, prop, image });
  }
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

// ---- The rooms behind the doors (soul-interiors.mjs); their furniture goes in this sheet with the rest. ----
const interiors = await bakeInteriors(doorways.map(({ prop }) => ({ building: gameObjects.get(String(prop.group))?.m_Name ?? "" })), addFrame);
/** Shelves of images packed into one sheet `width` wide: sets each one's x and y, returns the height. */
function pack(list, width) {
  let x = 0, y = 0, shelf = 0;
  for (const frame of list) {
    if (x + frame.w + PADDING > width) { x = 0; y += shelf + PADDING; shelf = 0; }
    frame.x = x; frame.y = y; x += frame.w + PADDING; shelf = Math.max(shelf, frame.h);
  }
  return y + shelf;
}
const WIDTH = 2048, PADDING = 2;
const roomSheet = interiors.rooms.map(room => ({ room, buffer: room.image, w: room.imageW, h: room.imageH }));
const roomSheetHeight = pack([...roomSheet].sort((a, b) => b.h - a.h), 2048);
await sharp({ create: { width: 2048, height: roomSheetHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(roomSheet.map(r => ({ input: r.buffer, left: r.x, top: r.y })))
  .webp({ quality: 88, alphaQuality: 90, effort: 6 }).toFile(join(outDir, "village-interiors.webp"));

const frameList = [...frames.values()].sort((a, b) => b.h - a.h);
const sheetHeight = pack(frameList, WIDTH);
await sharp({ create: { width: WIDTH, height: sheetHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(frameList.map(f => ({ input: f.buffer, left: f.x, top: f.y })))
  .webp({ quality: 92, alphaQuality: 100, effort: 6 }).toFile(join(outDir, "village-props.webp"));

// Where the square's fountain stands: the game centres the village on it.
let fountain = null;
for (const [goId, go] of gameObjects) if (!fountain && active(goId) && /^Fountain/.test(go.m_Name ?? "")) fountain = worldOf(goId);
const overlaps = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
const solidShapes = solids.filter(({ box: [l, b, r, t] }) => r - l > 1e-3 && t - b > 1e-3)
  // Inside a passage only the bridge's rails (thin blockers along its sides) still stop anyone.
  .filter(({ box }) => Math.min(box[2] - box[0], box[3] - box[1]) < .2 || !passages.some(passage => overlaps(box, passage)))
  .map(({ points }) => points.flatMap(([x, y]) => [Math.round(x * UNITS), Math.round(-y * UNITS)]));
const scene = {
  units: UNITS,
  ground: { left: minX / GROUND_SCALE, top: minY / GROUND_SCALE, width: (maxX - minX) / GROUND_SCALE, height: (maxY - minY) / GROUND_SCALE },
  frames: Object.fromEntries(frameList.sort((a, b) => a.id - b.id).map(f => [f.id, [f.x, f.y, f.w, f.h, Math.round(f.pivotX), Math.round(f.pivotY)]])),
  /**
   * [frame, x, y, depth, flags, open frame, door]: flags 1 lies flat (drawn with the ground), 2 is a shadow
   * (faded with all the others), 4 a door (drawn open while someone is at it; the last two only for one).
   */
  props: placed.map(p => p.open === undefined ? [p.f, p.x, p.y, p.d, (p.ground ? 1 : 0) | (p.shadow ? 2 : 0)] : [p.f, p.x, p.y, p.d, 4, p.open, p.door]),
  /** Prop index -> its clip: sprite frames with their start times and the loop's length, or a spin in degrees a second. */
  animations: Object.fromEntries(placed.map((p, index) => [index, p.anim ? { frames: p.anim.frames, times: p.anim.times, length: p.anim.length } : p.spin ? { spin: p.spin } : null]).filter(([, a]) => a)),
  /** Polygons as flat [x, y, x, y…] lists in game units: everything a player cannot walk through, as round as the pack made it. */
  solids: solidShapes,
  pits: pits.map(({ points }) => points.flatMap(([x, y]) => [Math.round(x * UNITS), Math.round(-y * UNITS)])),
  emitters,
  fountain: fountain ? [Math.round(fountain.x * UNITS), Math.round(-fountain.y * UNITS)] : [0, 0],
  /**
   * The rooms, from their row's origin (SOUL_INTERIORS): each room's picture as [sheet x, y, w, h, world x, y]
   * in village-interiors.webp, its furniture as props ([frame, x, y, depth, flags]) and its walls as solids.
   */
  interiors: {
    rooms: roomSheet.map(r => [r.x, r.y, r.w, r.h, ...r.room.imageAt]),
    props: interiors.props.map(p => [p.f, Math.round(p.x), Math.round(p.y), Math.round(p.d), p.shadow ? 2 : 0]),
    solids: interiors.solids,
  },
};
// ---- The doors and their rooms, for the server too (it moves a player through one): from the village's
// centre (its fountain) and the rooms' origin. `enter` is the wall's front at the door: the feet stop there. ----
const doorData = doorways.map(({ item, prop, image }, index) => {
  const bottom = item.y - image.pivotY + image.h;
  const under = (unitColliders.get(prop.group) ?? []).filter(c => c[0] * UNITS <= item.x && c[2] * UNITS >= item.x);
  const front = under.length ? Math.max(...under.map(c => -c[1] * UNITS)) : bottom;
  return { x: item.x - scene.fountain[0], y: Math.round(bottom - scene.fountain[1]), half: Math.round(image.w / 2 - 8),
    enter: Math.round(Math.max(bottom, front) - scene.fountain[1]), room: interiors.rooms[index].floor };
});
writeFileSync(join(root, "shared/town-doors.json"), `${JSON.stringify({ gap: interiors.gap, doors: doorData }, null, 1)}\n`);
writeFileSync(join(root, "src/game/soul-village-scene.json"), JSON.stringify(scene));
console.log(`${doorData.length} doors, rooms sheet 2048x${roomSheetHeight}`);
console.log(`ground ${maxX - minX}x${maxY - minY}px, ${frameList.length} frames for ${placed.length} props, ${solidShapes.length} solids, ${emitters.length} particle emitters, fountain ${scene.fountain}`);
