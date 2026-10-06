/**
 * Reads ForestVillage's Unity prefabs and scenes without Unity: prefabs and
 * .meta files are plain YAML, nested prefab instances expand by Unity's own
 * id rule, and sprites resolve through each texture's import settings. Used
 * by compose-forest-village.mjs (single prefabs) and
 * bake-forest-village-scene.mjs (the demo village, ground and all).
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

// ---- A small reader for Unity's YAML: block maps, block lists, flow maps. ----
function parseFlow(text) {
  let i = 0;
  const ws = () => { while (text[i] === " ") i++; };
  function value() {
    ws();
    if (text[i] === "{") {
      i++; const out = {};
      for (;;) {
        ws();
        if (text[i] === "}") { i++; return out; }
        const colon = text.indexOf(":", i);
        const key = text.slice(i, colon).trim();
        i = colon + 1;
        out[key] = value();
        ws();
        if (text[i] === ",") i++;
      }
    }
    let end = i;
    while (end < text.length && text[end] !== "," && text[end] !== "}") end++;
    const raw = text.slice(i, end).trim();
    i = end;
    return raw;
  }
  return value();
}
function scalar(raw) {
  const text = raw.trim();
  if (text.startsWith("{")) return parseFlow(text);
  if (text === "[]") return [];
  return text;
}
function parseBlock(lines, start, indent) {
  // Returns [value, nextIndex]. A block is a map or a list at `indent`.
  let i = start;
  while (i < lines.length && !lines[i].trim()) i++;
  if (i >= lines.length) return [null, i];
  const first = lines[i];
  const isList = first.slice(indent).startsWith("- ");
  if (isList) {
    const out = [];
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      const lead = line.length - line.trimStart().length;
      if (lead < indent || !line.slice(indent).startsWith("- ")) break;
      // "- key: value" starts a map whose keys sit at indent + 2.
      const rest = line.slice(indent + 2);
      if (rest.startsWith("- ")) {
        // A list of lists of points (a sprite's physics shape, a polygon collider's paths).
        const inner = [scalar(rest.slice(2))];
        i++;
        while (i < lines.length && lines[i].trim() && (lines[i].length - lines[i].trimStart().length > indent)) {
          const item = lines[i].trim();
          if (item.startsWith("- ")) inner.push(scalar(item.slice(2)));
          i++;
        }
        out.push(inner);
        continue;
      }
      const keyMatch = /^([A-Za-z0-9_.]+):(.*)$/.exec(rest);
      if (keyMatch) {
        const patched = [" ".repeat(indent + 2) + rest, ...lines.slice(i + 1)];
        const [item, consumed] = parseMap(patched, 0, indent + 2);
        out.push(item);
        i += consumed;
      } else {
        out.push(scalar(rest));
        i++;
      }
    }
    return [out, i];
  }
  const [map, consumed] = parseMap(lines.slice(i), 0, indent);
  return [map, i + consumed];
}
export function parseMap(lines, start, indent) {
  const out = {};
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const lead = line.length - line.trimStart().length;
    if (lead < indent) break;
    if (lead > indent) { i++; continue; }
    if (line.slice(indent).startsWith("- ")) break;
    const match = /^([^:]+):(.*)$/.exec(line.slice(indent));
    if (!match) { i++; continue; }
    const key = match[1].trim();
    const rest = match[2].trim();
    if (rest) { out[key] = scalar(rest); i++; continue; }
    // Nested block: a list may sit at the same indent as its key.
    let next = i + 1;
    while (next < lines.length && !lines[next].trim()) next++;
    const nextLine = lines[next] ?? "";
    const nextLead = nextLine.length - nextLine.trimStart().length;
    const childIndent = nextLine.slice(nextLead).startsWith("- ") ? nextLead : Math.max(nextLead, indent + 1);
    if (next >= lines.length || nextLead < indent || (nextLead === indent && !nextLine.slice(nextLead).startsWith("- "))) {
      out[key] = null; i++; continue;
    }
    const [value, after] = parseBlock(lines, next, childIndent);
    out[key] = value;
    i = after;
  }
  return [out, i - start];
}

/** Splits a Unity asset into { classId, fileId, stripped, data } documents. */
export function parseUnity(text) {
  const docs = [];
  const parts = text.split(/^--- /m).slice(1);
  for (const part of parts) {
    const header = /^!u!(\d+) &(-?\d+)( stripped)?/.exec(part);
    if (!header) continue;
    const lines = part.split("\n").slice(1);
    const [body] = parseMap(lines, 0, 0);
    const type = Object.keys(body)[0];
    docs.push({ classId: Number(header[1]), fileId: BigInt(header[2]), stripped: Boolean(header[3]), type, data: body[type] ?? {} });
  }
  return docs;
}

// ---- The package: guid -> path, asset text, meta. ----
export const byGuid = new Map();
/** Points the reader at an extracted .unitypackage (one folder per asset guid). */
export function loadPackage(packageDir) {
  for (const guid of readdirSync(packageDir)) {
    const pathFile = join(packageDir, guid, "pathname");
    if (!existsSync(pathFile)) continue;
    byGuid.set(guid, { path: readFileSync(pathFile, "utf8").split("\n")[0].trim(), dir: join(packageDir, guid) });
  }
}
const prefabCache = new Map();
export function prefabDocs(guid) {
  if (!prefabCache.has(guid)) {
    const entry = byGuid.get(guid);
    if (!entry || !existsSync(join(entry.dir, "asset"))) throw new Error(`missing prefab ${guid}`);
    prefabCache.set(guid, parseUnity(readFileSync(join(entry.dir, "asset"), "utf8")));
  }
  return prefabCache.get(guid);
}

const spriteCache = new Map();
/** The sprite a renderer points at: its texture file, pixel rect, pivot, border and pixels per unit. */
export function spriteFor(ref) {
  const key = `${ref.guid}:${ref.fileID}`;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const entry = byGuid.get(ref.guid);
  if (!entry) return null;
  const meta = readFileSync(join(entry.dir, "asset.meta"), "utf8");
  const [doc] = parseMap(meta.split("\n"), 0, 0);
  const importer = doc.TextureImporter;
  const ppu = Number(importer.spritePixelsToUnits ?? 100);
  const texture = join(entry.dir, "asset");
  let sprite = null;
  const pivotFor = (alignment, custom) => {
    const a = Number(alignment);
    const table = { 0: [.5, .5], 1: [0, 1], 2: [.5, 1], 3: [1, 1], 4: [0, .5], 5: [1, .5], 6: [0, 0], 7: [.5, 0], 8: [1, 0] };
    return a === 9 ? [Number(custom.x), Number(custom.y)] : table[a] ?? [.5, .5];
  };
  const border = b => b ? [Number(b.x), Number(b.y), Number(b.z), Number(b.w)] : [0, 0, 0, 0];
  if (Number(importer.spriteMode) === 2) {
    const sprites = importer.spriteSheet?.sprites ?? [];
    const names = new Map((importer.internalIDToNameTable ?? []).map(item => [String(item.first?.["213"] ?? ""), item.second]));
    // Newer imports name each sprite's id in nameFileIdTable; the oldest number them 21300000, 21300002…
    for (const [spriteName, id] of Object.entries(importer.spriteSheet?.nameFileIdTable ?? {})) names.set(String(id), spriteName);
    const name = names.get(String(ref.fileID));
    const legacy = Number(ref.fileID) >= 21300000 && Number(ref.fileID) % 2 === 0 ? sprites[(Number(ref.fileID) - 21300000) / 2] : undefined;
    const found = sprites.find(s => String(s.internalID) === String(ref.fileID)) ?? sprites.find(s => s.name === name) ?? legacy ?? (sprites.length === 1 ? sprites[0] : null);
    if (found) sprite = { rect: found.rect, pivot: pivotFor(found.alignment, found.pivot), border: border(found.border), physicsShape: found.physicsShape ?? [] };
    else console.warn(`unresolved sprite ${ref.fileID} in ${entry.path}`);
  }
  if (!sprite) sprite = { rect: null, pivot: pivotFor(importer.alignment, importer.spritePivot), border: border(importer.spriteBorder) };
  const result = { texture, ppu, shadow: /\/(Tree_)?Shadow\d*\.png$/.test(entry.path), ...sprite };
  spriteCache.set(key, result);
  return result;
}

// ---- Expanding a prefab with its nested instances into flat objects. ----
export const MASK = (1n << 63n) - 1n;
const SHADOW_ALPHA = .22;
export const num = (value, fallback = 0) => { const n = Number(value); return Number.isFinite(n) ? n : fallback; };

/**
 * Every object of a prefab, nested instances included, keyed by its id in
 * this prefab's space (Unity's: instance id XOR the source object's id).
 */
export function expand(guid) {
  const docs = prefabDocs(guid);
  const objects = new Map();
  for (const doc of docs) {
    if (doc.stripped || doc.classId === 1001) continue;
    objects.set(doc.fileId, { classId: doc.classId, data: structuredClone(doc.data) });
  }
  for (const doc of docs) {
    if (doc.classId !== 1001) continue;
    const source = doc.data.m_SourcePrefab?.guid;
    if (!source || !byGuid.has(source)) continue;
    const inner = expand(source);
    const mods = doc.data.m_Modification?.m_Modifications ?? [];
    for (const mod of mods) {
      const target = inner.get(BigInt(mod.target?.fileID ?? 0));
      if (!target) continue;
      setPath(target.data, mod.propertyPath, mod.objectReference && mod.objectReference.fileID && mod.objectReference.fileID !== "0" ? mod.objectReference : mod.value);
    }
    const removed = new Set((doc.data.m_Modification?.m_RemovedComponents ?? []).map(item => String(item.fileID)));
    const instance = doc.fileId;
    const parent = doc.data.m_Modification?.m_TransformParent?.fileID;
    const copies = [];
    let rootGameObject = null;
    for (const [id, object] of inner) {
      if (removed.has(String(id))) continue;
      const mapped = (instance ^ id) & MASK;
      const copy = { classId: object.classId, data: structuredClone(object.data), instances: object.instances };
      remapRefs(copy.data, instance);
      if (copy.classId === 4 && (!copy.data.m_Father || copy.data.m_Father.fileID === "0")) {
        copy.data.m_Father = { fileID: String(parent ?? 0) };
        rootGameObject = copy.data.m_GameObject?.fileID ?? null;
      }
      objects.set(mapped, copy);
      copies.push(copy);
    }
    // `instances`: every prefab instance an object sits in, outermost first (each by its root GameObject).
    for (const copy of copies) copy.instances = [rootGameObject, ...(copy.instances ?? []).map(id => String((instance ^ BigInt(id)) & MASK))];
  }
  return objects;
}
function remapRefs(data, instance) {
  for (const key of ["m_GameObject", "m_Father"]) {
    const ref = data[key];
    if (ref && ref.fileID && ref.fileID !== "0") data[key] = { fileID: String((instance ^ BigInt(ref.fileID)) & MASK) };
  }
}
export function setPath(data, path, value) {
  const parts = String(path).split(".");
  let node = data;
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] === "Array") continue;
    node[parts[i]] ??= {};
    node = node[parts[i]];
  }
  node[parts.at(-1)] = typeof value === "object" ? value : String(value ?? "");
}

/** Sprites to draw, in prefab units, back to front. */
export function drawList(guid) {
  const objects = expand(guid);
  const transformOf = new Map();
  const gameObjects = new Map();
  for (const [id, object] of objects) {
    if (object.classId === 4) transformOf.set(String(object.data.m_GameObject?.fileID), { id, ...object.data });
    if (object.classId === 1) gameObjects.set(String(id), object.data);
  }
  const transforms = new Map([...objects].filter(([, o]) => o.classId === 4).map(([id, o]) => [String(id), o.data]));
  const worldOf = transform => {
    let x = 0, y = 0, sx = 1, sy = 1, sort = [];
    const chain = [];
    for (let t = transform, guard = 0; t && guard < 64; guard++) { chain.unshift(t); t = transforms.get(String(t.m_Father?.fileID)); }
    for (const t of chain) {
      const p = t.m_LocalPosition ?? {}, s = t.m_LocalScale ?? {};
      x += num(p.x) * sx; y += num(p.y) * sy;
      sx *= num(s.x, 1); sy *= num(s.y, 1);
    }
    return { x, y, sx, sy, depth: chain.length };
  };
  const active = goId => {
    let transform = transformOf.get(goId);
    for (let guard = 0; transform && guard < 64; guard++) {
      const go = gameObjects.get(String(transform.m_GameObject?.fileID));
      if (go && String(go.m_IsActive ?? "1") === "0") return false;
      transform = transforms.get(String(transform.m_Father?.fileID));
    }
    return true;
  };
  const items = [];
  let order = 0;
  for (const [, object] of objects) {
    if (object.classId !== 212) continue;
    const r = object.data;
    if (String(r.m_Enabled ?? "1") === "0") continue;
    const goId = String(r.m_GameObject?.fileID);
    if (!active(goId)) continue;
    const transform = transformOf.get(goId);
    if (!transform || !r.m_Sprite?.guid) continue;
    const sprite = spriteFor(r.m_Sprite);
    if (!sprite) continue;
    const world = worldOf(transform);
    items.push({ sprite, world, order: num(r.m_SortingOrder), seq: order++, flipX: String(r.m_FlipX) === "1",
      drawMode: num(r.m_DrawMode), size: r.m_Size ? { x: num(r.m_Size.x), y: num(r.m_Size.y) } : null,
      color: r.m_Color, name: gameObjects.get(goId)?.m_Name });
  }
  items.sort((a, b) => a.order - b.order || b.world.y - a.world.y || a.seq - b.seq);
  if (process.env.DEBUG_COMPOSE) for (const item of items) console.log(item.name, item.order, item.world, item.drawMode, item.size);
  return items;
}

export async function spriteImage(item) {
  const { sprite } = item;
  const meta = await sharp(sprite.texture).metadata();
  const rect = sprite.rect ? { x: num(sprite.rect.x), y: num(sprite.rect.y), w: num(sprite.rect.width), h: num(sprite.rect.height) } : { x: 0, y: 0, w: meta.width, h: meta.height };
  // Unity rects count from the bottom.
  let image = sharp(sprite.texture).extract({ left: Math.round(rect.x), top: Math.round(meta.height - rect.y - rect.h), width: Math.round(rect.w), height: Math.round(rect.h) });
  let w = rect.w, h = rect.h;
  if (item.drawMode === 1 && item.size) {
    // Sliced: keep the borders, stretch the middle.
    w = Math.max(1, Math.round(item.size.x * sprite.ppu)); h = Math.max(1, Math.round(item.size.y * sprite.ppu));
    image = sharp(await nineSlice(await image.png().toBuffer(), rect.w, rect.h, sprite.border, w, h));
  }
  const sx = item.world.sx * (item.flipX ? -1 : 1), sy = item.world.sy;
  const pw = Math.max(1, Math.round(w * Math.abs(sx))), ph = Math.max(1, Math.round(h * Math.abs(sy)));
  let buffer = await image.png().toBuffer();
  if (pw !== w || ph !== h) buffer = await sharp(buffer).resize(pw, ph, { fit: "fill" }).png().toBuffer();
  if (sx < 0) buffer = await sharp(buffer).flop().png().toBuffer();
  if (sy < 0) buffer = await sharp(buffer).flip().png().toBuffer();
  // The pack draws shadows with a translucent material; the sprite itself is solid black.
  const alpha = (item.color ? num(item.color.a, 1) : 1) * (sprite.shadow ? SHADOW_ALPHA : 1);
  if (alpha < 1) buffer = await sharp(buffer).ensureAlpha().composite([{ input: Buffer.from([0, 0, 0, Math.round(255 * alpha)]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: "dest-in" }]).png().toBuffer();
  const pivotX = sx < 0 ? 1 - sprite.pivot[0] : sprite.pivot[0];
  const pivotY = sy < 0 ? 1 - sprite.pivot[1] : sprite.pivot[1];
  // Top-left corner in pixels, y down, relative to the prefab origin.
  const left = item.world.x * sprite.ppu - pivotX * pw;
  const top = -item.world.y * sprite.ppu - (1 - pivotY) * ph;
  return { buffer, left, top, width: pw, height: ph };
}

export async function nineSlice(buffer, w, h, border, outW, outH) {
  const [l, b, r, t] = border.map(Math.round);
  if (!(l + r) && !(t + b)) return sharp(buffer).resize(outW, outH, { fit: "fill" }).png().toBuffer();
  const cols = [[0, l, l], [l, w - l - r, Math.max(1, outW - l - r)], [w - r, r, r]];
  const rows = [[0, t, t], [t, h - t - b, Math.max(1, outH - t - b)], [h - b, b, b]];
  const parts = [];
  let y = 0;
  for (const [sy, sh, dh] of rows) {
    let x = 0;
    for (const [sx, sw, dw] of cols) {
      if (sw > 0 && sh > 0 && dw > 0 && dh > 0) {
        const piece = await sharp(buffer).extract({ left: sx, top: sy, width: sw, height: sh }).resize(dw, dh, { fit: "fill" }).png().toBuffer();
        parts.push({ input: piece, left: x, top: y });
      }
      x += dw;
    }
    y += dh;
  }
  // A size smaller than the two borders still gets both; the result is then squeezed to the size.
  const fullW = cols.reduce((sum, col) => sum + col[2], 0), fullH = rows.reduce((sum, row) => sum + row[2], 0);
  const full = await sharp({ create: { width: fullW, height: fullH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(parts).png().toBuffer();
  return fullW === outW && fullH === outH ? full : sharp(full).resize(outW, outH, { fit: "fill" }).png().toBuffer();
}

