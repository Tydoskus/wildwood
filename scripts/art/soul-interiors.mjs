/**
 * The insides of the Soul Dimension village's buildings, one room behind each
 * door, for bake-forest-village-scene.mjs. The pack draws no interiors, so a
 * room is built from what it does have: its half-timbered wall (the red
 * house's back wing) along the back, its windows on it, a plank or flagstone
 * floor drawn in the pack's flat outlined style, and its own furniture
 * prefabs (tables, stools, barrels, chests, the smithy's anvil and furnace),
 * each with its shadow, set out by what the building is.
 *
 * Rooms stand in a row far from the village (the game puts them at
 * SOUL_INTERIORS, shared/soul-dimension.ts); everything here is in game units
 * from the row's origin, the first room's floor at 0,0.
 */
import sharp from "sharp";
import { byGuid, drawList, num, spriteFor, spriteImage } from "./unity-prefab.mjs";

/** Game units a pack pixel (100 a Unity unit, the game's 60). */
const SCALE = .6;
/** Room floors this far apart: a room never sees the next. */
export const ROOM_SPACING = 3_000;
/** The back wall's face, above the floor, and the thickness of the wall tops around the room. */
const WALL_H = 133, CAP = 18;
/** The timber post at each end of the pack's wall, in game units. */
const WALL_POST = Math.round(28 * SCALE);
/** The way out: a gap in the front wall, centred. */
const GAP = 84;

/** Each kind of building's room size and furniture: [prefab, x, feet y] on the floor. */
const LAYOUTS = {
  home: { w: 400, h: 250, floor: "wood", items: [
    ["Ork_01", 34, 36], ["Ork_01_Close", 72, 30], ["DryingRack_02", 190, 34], ["Chest_01_White", 352, 40],
    ["Table_05", 200, 140], ["Chair_01_Brown", 150, 150], ["Chair_01_Brown", 250, 150],
    ["Lamp_01", 372, 130], ["Bucket_01_Water", 36, 200], ["Log_Pile_01", 366, 218],
  ] },
  /** A woodworker's house. */
  workshop: { w: 400, h: 250, floor: "wood", items: [
    ["Table_04", 80, 40], ["Log_Pile_02", 160, 34], ["Log_Pile_03", 196, 40], ["Chest_02_Silver", 352, 40],
    ["Table_05", 220, 150], ["Chair_01_LightBrown", 170, 160], ["Stump_Axe_01", 330, 150],
    ["Lamp_01", 28, 140], ["Box_03", 370, 222], ["Bucket_01", 40, 214],
  ] },
  /** A farmer's house. */
  farmhouse: { w: 400, h: 250, floor: "wood", items: [
    ["Straw_02", 50, 40], ["Straw_01", 100, 46], ["Box_01", 300, 36], ["Box_04", 352, 44],
    ["Table_01", 200, 140], ["Chair_01_Brown", 150, 150], ["Chair_01_Brown", 250, 150], ["Chest_01_Purple", 200, 40],
    ["Lamp_01", 372, 150], ["Ork_01_Water", 38, 210], ["Bucket_01_Water", 362, 216],
  ] },
  inn: { w: 600, h: 300, floor: "wood", items: [
    ["Chest_02_Gold", 70, 40], ["Board_01", 300, 36], ["Ork_01", 520, 34], ["Ork_01_Close", 562, 40], ["Ork_01", 545, 72],
    ["Lamp_01", 28, 130], ["Lamp_01", 572, 210],
    ...[[140, 130], [300, 190], [460, 130]].flatMap(([x, y]) => [["Table_05", x, y], ["Chair_01_Brown", x - 46, y + 8], ["Chair_01_LightBrown", x + 46, y + 8]]),
    ["Box_04", 60, 268],
  ] },
  smithy: { w: 460, h: 270, floor: "stone", items: [
    ["Furnace_01", 70, 40], ["Table_04", 210, 40], ["WeaponRack_01", 360, 40],
    ["Anvil_01", 180, 140], ["Bucket_01_Water", 110, 160], ["Stump_Axe_01", 360, 160],
    ["Log_Pile_01", 420, 228], ["Log_Pile_02", 392, 240], ["Box_03", 40, 240], ["Table_01", 120, 240],
  ] },
  apothecary: { w: 480, h: 270, floor: "wood", items: [
    ["Ork_01", 34, 36], ["Ork_01_Water", 72, 40], ["DryingRack_01", 210, 34], ["Chest_01_Purple", 420, 40],
    ["Table_05", 150, 140], ["Table_02", 310, 140], ["Chair_01_LightBrown", 268, 150],
    ["StockTank_01", 390, 222], ["Bucket_02", 40, 206], ["Lamp_01", 452, 120], ["Box_01", 74, 244],
  ] },
  storehouse: { w: 600, h: 300, floor: "wood", items: [
    ["Box_04", 40, 50], ["Box_01", 90, 44], ["Box_03", 66, 92], ["Straw_02", 200, 40], ["Straw_01", 252, 46],
    ["Chest_02_Gold", 380, 44], ["Ork_01", 480, 36], ["Ork_01_Close", 520, 42], ["Ork_01", 560, 36],
    ["Table_06", 300, 160], ["Log_Pile_03", 520, 200], ["Straw_03", 90, 236], ["Box_02", 540, 262],
    ["Lamp_01", 30, 170], ["Lamp_01", 572, 120],
  ] },
};
const HOMES = ["home", "workshop", "farmhouse"];
const layoutFor = (building, homeIndex) => /Inn/.test(building) ? "inn" : /Tools/.test(building) ? "smithy" : /Apothecary/.test(building) ? "apothecary"
  : /Module/.test(building) ? "storehouse" : HOMES[homeIndex % HOMES.length];

function random(seed) {
  let state = seed >>> 0 || 1;
  return () => { state = (state * 1_103_515_245 + 12_345) >>> 0; return state / 4_294_967_296; };
}

/** Planks in rows, each a little different, outlined as the pack outlines its wood. */
function woodFloor(w, h, seed) {
  const next = random(seed), rows = [];
  const fills = ["#c8945a", "#c08a50", "#cf9c62", "#bb8549"];
  for (let y = 0, row = 0; y < h; y += 26, row++) {
    let x = -next() * 120;
    while (x < w) {
      const length = 80 + next() * 90;
      rows.push(`<rect x="${x.toFixed(1)}" y="${y}" width="${length.toFixed(1)}" height="26" fill="${fills[Math.floor(next() * fills.length)]}" stroke="#7a4a28" stroke-width="2.5"/>`,
        `<line x1="${(x + 3).toFixed(1)}" y1="${y + 4}" x2="${(x + length - 3).toFixed(1)}" y2="${y + 4}" stroke="#dcae74" stroke-width="2" stroke-linecap="round"/>`,
        `<circle cx="${(x + 7).toFixed(1)}" cy="${y + 13}" r="1.6" fill="#6b3f1f"/><circle cx="${(x + length - 7).toFixed(1)}" cy="${y + 13}" r="1.6" fill="#6b3f1f"/>`);
      x += length;
    }
  }
  return rows.join("");
}

/** Flagstones for the smithy: a forge is no place for planks. */
function stoneFloor(w, h, seed) {
  const next = random(seed), stones = [];
  const fills = ["#a39d92", "#9a9387", "#aca69b", "#958f84"];
  for (let y = 0, row = 0; y < h; y += 40, row++) {
    for (let x = row % 2 ? -24 : 0; x < w; x += 48) {
      const jx = next() * 4 - 2, jy = next() * 4 - 2;
      stones.push(`<rect x="${(x + 2 + jx).toFixed(1)}" y="${(y + 2 + jy).toFixed(1)}" width="44" height="36" rx="7" fill="${fills[Math.floor(next() * fills.length)]}" stroke="#5d5850" stroke-width="3"/>`,
        `<line x1="${(x + 9 + jx).toFixed(1)}" y1="${(y + 7 + jy).toFixed(1)}" x2="${(x + 30 + jx).toFixed(1)}" y2="${(y + 7 + jy).toFixed(1)}" stroke="#c4bfb4" stroke-width="2" stroke-linecap="round"/>`);
    }
  }
  return `<rect width="${w}" height="${h}" fill="#4e4a44"/>${stones.join("")}`;
}

/** A texture of the pack's by name, as a sprite (the whole image). */
function packSprite(name) {
  const entry = [...byGuid].find(([, value]) => value.path.endsWith(`/${name}.png`));
  return entry ? spriteFor({ guid: entry[0], fileID: "21300000" }) : null;
}
async function spritePixels(sprite) {
  const meta = await sharp(sprite.texture).metadata();
  const rect = sprite.rect ? { x: num(sprite.rect.x), y: num(sprite.rect.y), w: num(sprite.rect.width), h: num(sprite.rect.height) } : { x: 0, y: 0, w: meta.width, h: meta.height };
  return sharp(sprite.texture).extract({ left: Math.round(rect.x), top: Math.round(meta.height - rect.y - rect.h), width: Math.round(rect.w), height: Math.round(rect.h) }).png().toBuffer();
}

const composed = new Map();
/**
 * A prefab drawn as the pack builds it, at game size: its body, and its shadow apart (solid, for the
 * game's shadow layer), each with the prefab's origin (where it stands) as its pivot.
 */
async function composePrefab(name, recolor = null) {
  const key = `${name}:${JSON.stringify(recolor)}`;
  if (composed.has(key)) return composed.get(key);
  const match = [...byGuid].find(([, entry]) => entry.path.endsWith(`/${name}.prefab`));
  if (!match) throw new Error(`no ${name}.prefab in the package`);
  const images = [];
  for (const item of drawList(match[0])) images.push(await spriteImage(recolor?.(item) ?? item, { solidShadow: true }));
  const draw = async list => {
    if (!list.length) return null;
    const minX = Math.floor(Math.min(...list.map(i => i.left))), minY = Math.floor(Math.min(...list.map(i => i.top)));
    const maxX = Math.ceil(Math.max(...list.map(i => i.left + i.width))), maxY = Math.ceil(Math.max(...list.map(i => i.top + i.height)));
    const full = await sharp({ create: { width: maxX - minX, height: maxY - minY, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(list.map(i => ({ input: i.buffer, left: Math.round(i.left - minX), top: Math.round(i.top - minY) }))).png().toBuffer();
    const w = Math.max(1, Math.round((maxX - minX) * SCALE)), h = Math.max(1, Math.round((maxY - minY) * SCALE));
    return { buffer: await sharp(full).resize(w, h, { fit: "fill", kernel: "lanczos3" }).png().toBuffer(), w, h, pivotX: -minX * SCALE, pivotY: -minY * SCALE };
  };
  const result = { body: await draw(images.filter(i => !i.shadow)), shadow: await draw(images.filter(i => i.shadow)) };
  composed.set(key, result);
  return result;
}

const box = (left, top, right, bottom) => [left, top, right, top, right, bottom, left, bottom].map(Math.round);

/**
 * One room for each door: its picture (floor and walls, to draw under everything), its furniture as
 * props, and what blocks walking (the walls, less the way out, and each piece of furniture).
 * `addFrame` puts an image in the village's sprite sheet and returns its frame id.
 */
export async function bakeInteriors(doors, addFrame) {
  const wall = await spritePixels(packSprite("Module_Width_01"));
  const wallMeta = await sharp(wall).metadata();
  const wallW = Math.round(wallMeta.width * SCALE);
  const wallTile = await sharp(wall).resize(wallW, WALL_H, { fit: "fill", kernel: "lanczos3" }).png().toBuffer();
  // Windows as seen from inside by day: the pane is sky, not the dark glass the street sees.
  const window = (await composePrefab("Window_03_Ivory", item => /Window_In/.test(item.name ?? "") ? { ...item, color: { r: .78, g: .9, b: .95, a: 1 } } : null)).body;
  const rooms = [], props = [], solids = [];
  let homes = 0;
  for (const [index, door] of doors.entries()) {
    const kind = layoutFor(door.building, homes);
    if (HOMES.includes(kind)) homes++;
    const layout = LAYOUTS[kind];
    const { w, h } = layout;
    const ox = index * ROOM_SPACING, oy = 0;
    // A house furnished like an earlier one is its mirror, so no two are twins.
    const mirror = HOMES.includes(kind) && homes > HOMES.length;
    // ---- The picture: walls' tops around, the back wall's face, the floor, the doorway. ----
    const imageW = w + CAP * 2, imageH = h + WALL_H + CAP * 2;
    const fx = CAP, fy = CAP + WALL_H;
    const gapLeft = fx + w / 2 - GAP / 2;
    const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" width="${imageW}" height="${imageH}">${body}</svg>`;
    // Under the back wall: the floor, the wall's shadow on it, the sides' shade and a rug at the door.
    const floor = svg(`<defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>
      <rect x="${fx}" y="${CAP}" width="${w}" height="${WALL_H}" fill="#c9a888"/>
      <g transform="translate(${fx} ${fy})">${layout.floor === "stone" ? stoneFloor(w, h, index + 7) : woodFloor(w, h, index + 7)}</g>
      <rect x="${fx}" y="${fy}" width="${w}" height="16" fill="url(#fade)"/>
      <rect x="${fx}" y="${fy}" width="10" height="${h}" fill="#000" fill-opacity=".1"/><rect x="${fx + w - 10}" y="${fy}" width="10" height="${h}" fill="#000" fill-opacity=".1"/>
      <rect x="${fx + w / 2 - 58}" y="${fy + h - 46}" width="116" height="38" rx="8" fill="#8e3b2e" stroke="#5d2219" stroke-width="3"/>
      <rect x="${fx + w / 2 - 48}" y="${fy + h - 38}" width="96" height="22" rx="5" fill="none" stroke="#c9a14a" stroke-width="2.5"/>`);
    // Over it: the walls' tops all round (over the back wall's ends) and the dark of the doorway.
    const caps = svg(`<defs><linearGradient id="out" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1a10"/><stop offset="1" stop-color="#000"/></linearGradient></defs>
      <path d="M0 0H${imageW}V${imageH}H${gapLeft + GAP}V${fy + h}H${fx + w}V${CAP}H${fx}V${fy + h}H${gapLeft}V${imageH}H0Z" fill="#5b3a22" stroke="#2f1c10" stroke-width="3" stroke-linejoin="round"/>
      <path d="M${fx - 2} ${CAP - 3}H${fx + w + 2}" stroke="#7d5232" stroke-width="3"/>
      <rect x="${gapLeft}" y="${fy + h}" width="${GAP}" height="${CAP}" fill="url(#out)"/>`);
    const layers = [];
    // Each length of wall overlaps the last by its end post, so where two meet there is one post, not two.
    for (let x = 0; x < w; x += wallW - WALL_POST) {
      const width = Math.min(wallW, w - x);
      const tile = width === wallW ? wallTile : await sharp(wallTile).extract({ left: 0, top: 0, width, height: WALL_H }).png().toBuffer();
      layers.push({ input: tile, left: fx + x, top: CAP });
    }
    const windows = Math.max(1, Math.floor(w / 200));
    for (let i = 0; i < windows; i++) {
      const cx = fx + (w * (i + .5)) / windows;
      layers.push({ input: window.buffer, left: Math.round(cx - window.w / 2), top: Math.round(CAP + 18) });
    }
    const image = await sharp(Buffer.from(floor)).composite([...layers, { input: Buffer.from(caps) }]).png().toBuffer();
    rooms.push({ door: index, kind, floor: [ox, oy, w, h], image, imageW, imageH, imageAt: [ox - CAP, oy - WALL_H - CAP] });
    // ---- Furniture: standing props, each with its shadow and a block at its foot. ----
    for (const [name, x0, y] of layout.items) {
      const x = mirror ? w - x0 : x0;
      const { body, shadow } = await composePrefab(name);
      if (!body) continue;
      const at = { x: ox + x, y: oy + y };
      props.push({ f: addFrame(body), x: at.x, y: at.y, d: at.y });
      if (shadow) props.push({ f: addFrame(shadow), x: at.x, y: at.y, d: at.y, shadow: true });
      const half = Math.max(6, Math.min(body.w * .42, body.w / 2 - 4));
      solids.push(box(at.x - half, at.y - 16, at.x + half, at.y + 4));
    }
    // ---- Walls: the back (its face is no floor), the sides, the front less the doorway, and a stop just past it. ----
    const far = 400;
    solids.push(box(ox - CAP - far, oy - WALL_H - CAP - far, ox + w + CAP + far, oy + 6));
    solids.push(box(ox - CAP - far, oy - WALL_H, ox, oy + h + CAP + far));
    solids.push(box(ox + w, oy - WALL_H, ox + w + CAP + far, oy + h + CAP + far));
    solids.push(box(ox - CAP - far, oy + h, ox + w / 2 - GAP / 2, oy + h + CAP + far));
    solids.push(box(ox + w / 2 + GAP / 2, oy + h, ox + w + CAP + far, oy + h + CAP + far));
    solids.push(box(ox + w / 2 - GAP / 2 - 10, oy + h + 30, ox + w / 2 + GAP / 2 + 10, oy + h + CAP + far));
  }
  return { rooms, props, solids, gap: GAP };
}
