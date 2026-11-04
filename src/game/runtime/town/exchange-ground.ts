import {
  TOWN_CENTER, TOWN_EXCHANGE_CENTER, TOWN_EXCHANGE_PLAZA_DEPTH, TOWN_EXCHANGE_PLAZA_RADIUS, TOWN_EXCHANGE_POSITION, TOWN_EXCHANGE_ROAD, TOWN_EXCHANGE_ROAD_JOIN,
  townRandom,
} from "../../../../shared/town";
import type { WorldPath } from "../../world";

type Rect = { x: number; y: number; w: number; h: number };
const { x: CX, y: CY } = TOWN_EXCHANGE_CENTER, R = TOWN_EXCHANGE_PLAZA_RADIUS, DEPTH = TOWN_EXCHANGE_PLAZA_DEPTH;
/** Half a paved path's width. */
const WALK = 80;

/** The paved road in from the gate, and the streets along the hall's front (from its foot) and across the avenue. */
const ROAD_IN = TOWN_EXCHANGE_ROAD[TOWN_EXCHANGE_ROAD.length - 1];
const FRONT = TOWN_EXCHANGE_POSITION.y - 40, SOUTH = CY + 610, STREET = 120, STREET_HALF_LENGTH = 1_370;

/**
 * The Trade Chrysanthemum's ground, painted once into the Town's ground tiles: the dirt road down from the village
 * in its road tiles (forest-road.ts), then the market's own paving over the meadow. A round plaza of cobbles inside
 * a ring of dressed stone, a gold chrysanthemum laid in the cobbles round the fountain, and flagstone ways round it:
 * the road paved from the gate in, a street along the hall's front joined to the plaza in front of its steps, paths
 * west, east and south, and a street across the south one.
 */
export const TOWN_EXCHANGE_GROUND = Object.freeze({
  paths: Object.freeze([...TOWN_EXCHANGE_ROAD]) as readonly WorldPath[],
  /** Nothing west of this is painted down by the village: there the branch lies on its own road, which shows instead. */
  join: TOWN_EXCHANGE_ROAD_JOIN,
  /** South of this, below the village's road, the road is painted all the way across. */
  below: TOWN_CENTER.y + 2_100,
  /** The Town's countryside green (map-design.ts), under a rounded corner. */
  grass: "#61864e",
  plaza: Object.freeze({ x: CX, y: CY, rx: R, ry: R * DEPTH }),
  walks: Object.freeze([
    { x: ROAD_IN.x + ROAD_IN.w / 2 - 60, y: TOWN_EXCHANGE_POSITION.y - 180, w: 120, h: CY - 60 - (TOWN_EXCHANGE_POSITION.y - 180) },
    { x: CX - STREET_HALF_LENGTH, y: FRONT, w: STREET_HALF_LENGTH * 2, h: STREET },
    { x: CX - STREET_HALF_LENGTH, y: SOUTH, w: STREET_HALF_LENGTH * 2, h: STREET },
    { x: TOWN_CENTER.x - 2_160, y: CY - WALK, w: CX - R + 30 - (TOWN_CENTER.x - 2_160), h: WALK * 2 },
    { x: CX + R - 30, y: CY - WALK, w: TOWN_CENTER.x + 1_760 - (CX + R - 30), h: WALK * 2 },
    { x: CX - WALK, y: CY + R * DEPTH - 20, w: WALK * 2, h: 830 - (R * DEPTH - 20) },
    { x: CX - 170, y: FRONT + STREET - 20, w: 340, h: CY - R * DEPTH + 30 - (FRONT + STREET - 20) },
  ]) as readonly Rect[],
});

/** What the minimap and the Town map show of it: the road and paths as rectangles, and the round plaza. */
export const TOWN_EXCHANGE_MAP_RECTS: readonly Rect[] = Object.freeze([...TOWN_EXCHANGE_GROUND.paths, ...TOWN_EXCHANGE_GROUND.walks]);

const FLAG = "#c9aa86", FLAG_SEAM = "#a98c69", KERB = "#a59d90", KERB_EDGE = "#776f62";
const RING = "#c3b9a7", RING_SEAM = "#90877a", MORTAR = "#a2998b";
const COBBLES = ["#aaa59b", "#b4ad9f", "#9e9a90", "#ada38d", "#bab4a8"] as const, COBBLE_EDGE = "#7b766b";
const GOLD = "#e3b041", GOLD_UNDER = "#7a5518";
/** The ring of dressed stone round the plaza. */
const RING_WIDTH = 42;
const KERB_WIDTH = 10;

type View = { left: number; top: number; right: number; bottom: number };
const touches = (area: Rect, view: View, margin = 0) =>
  area.x < view.right + margin && area.x + area.w > view.left - margin && area.y < view.bottom + margin && area.y + area.h > view.top - margin;

/** Its kerb: a band of grey stone round its edge, outlined. Every kerb is laid before any flagstones, so where two
 * ways meet, each one's stones cover the other's kerb. */
function paintKerb(c: CanvasRenderingContext2D, walk: Rect, ox: number, oy: number) {
  c.fillStyle = KERB;
  c.fillRect(walk.x - ox, walk.y - oy, walk.w, walk.h);
  c.strokeStyle = KERB_EDGE;
  c.lineWidth = 3;
  c.strokeRect(walk.x - ox + 1.5, walk.y - oy + 1.5, walk.w - 3, walk.h - 3);
}

/** Its flagstones inside the kerb: rows of stones along it, joints staggered. */
function paintFlags(c: CanvasRenderingContext2D, walk: Rect, ox: number, oy: number) {
  const upright = walk.w < walk.h, length = (upright ? walk.h : walk.w) - KERB_WIDTH * 2, width = (upright ? walk.w : walk.h) - KERB_WIDTH * 2;
  c.save();
  c.translate(walk.x + KERB_WIDTH - ox, walk.y + KERB_WIDTH - oy);
  // An upright way is laid as a level one turned a quarter: its length runs down the page.
  if (upright) c.transform(0, 1, 1, 0, 0, 0);
  c.fillStyle = FLAG;
  c.fillRect(0, 0, length, width);
  c.strokeStyle = FLAG_SEAM;
  c.lineWidth = 2;
  const rows = Math.max(2, Math.round(width / 35)), row = width / rows;
  c.beginPath();
  for (let index = 0; index <= rows; index++) { c.moveTo(0, index * row); c.lineTo(length, index * row); }
  for (let index = 0; index < rows; index++) {
    const top = index * row, random = townRandom(Math.round(walk.x), Math.round(walk.y), index);
    for (let x = random() * 50; x < length; x += 44 + random() * 30) { c.moveTo(x, top); c.lineTo(x, top + row); }
  }
  c.stroke();
  c.restore();
}

/**
 * The plaza: mortar and cobbles inside the ring, the ring's blocks, and the gold flower laid over the cobbles. Its
 * shapes are traced half as deep as wide, and stroked after, so their lines keep one width all round.
 */
function paintPlaza(c: CanvasRenderingContext2D, view: View, ox: number, oy: number) {
  const x = CX - ox, y = CY - oy, inner = R - RING_WIDTH;
  /** Traces an outline in the plaza's own round space, then hands it back to be filled or stroked as it lies. */
  const trace = (path: () => void) => {
    c.save(); c.translate(x, y); c.scale(1, DEPTH); c.beginPath(); path(); c.restore();
  };
  c.save();
  c.fillStyle = RING;
  trace(() => c.arc(0, 0, R, 0, Math.PI * 2)); c.fill();
  c.fillStyle = MORTAR;
  trace(() => c.arc(0, 0, inner, 0, Math.PI * 2)); c.fill();
  // The ring's blocks, then its two edges.
  c.strokeStyle = RING_SEAM;
  c.lineWidth = 2;
  trace(() => {
    for (let index = 0; index < 72; index++) {
      const angle = index / 72 * Math.PI * 2, cos = Math.cos(angle), sin = Math.sin(angle);
      c.moveTo(cos * inner, sin * inner); c.lineTo(cos * R, sin * R);
    }
  });
  c.stroke();
  c.strokeStyle = KERB_EDGE;
  c.lineWidth = 3;
  for (const radius of [inner, R - 1.5]) { trace(() => c.arc(0, 0, radius, 0, Math.PI * 2)); c.stroke(); }
  // Cobbles on a staggered grid, each nudged off its point; only those near this tile are drawn.
  const step = 22, depth = inner * DEPTH;
  c.lineWidth = 1.5;
  c.strokeStyle = COBBLE_EDGE;
  for (let gy = Math.floor((Math.max(view.top, CY - depth) - 20) / step); gy <= Math.ceil((Math.min(view.bottom, CY + depth) + 20) / step); gy++) {
    for (let gx = Math.floor((Math.max(view.left, CX - inner) - 20) / step); gx <= Math.ceil((Math.min(view.right, CX + inner) + 20) / step); gx++) {
      const random = townRandom(gx, gy, 41);
      const px = (gx + (gy % 2 ? .5 : 0) + (random() - .5) * .4) * step, py = (gy + (random() - .5) * .4) * step;
      if (Math.hypot((px - CX) / (inner - 10), (py - CY) / (depth - 6)) > 1) continue;
      const rx = 6.5 + random() * 3, ry = rx * (.64 + random() * .12);
      c.fillStyle = COBBLES[Math.floor(random() * COBBLES.length)];
      c.beginPath(); c.ellipse(px - ox, py - oy, rx, ry, (random() - .5) * .5, 0, Math.PI * 2); c.fill(); c.stroke();
    }
  }
  // The gold flower: twelve petals between two rings, a dark line under the gold so it reads on the stone.
  const flower = (width: number, color: string) => {
    c.lineWidth = width;
    c.strokeStyle = color;
    for (const radius of [195, 475]) { trace(() => c.arc(0, 0, radius, 0, Math.PI * 2)); c.stroke(); }
    for (let petal = 0; petal < 12; petal++) {
      const angle = petal / 12 * Math.PI * 2;
      trace(() => c.ellipse(Math.cos(angle) * 335, Math.sin(angle) * 335, 140, 58, angle, 0, Math.PI * 2));
      c.stroke();
    }
  };
  flower(10, GOLD_UNDER);
  flower(5, GOLD);
  c.restore();
}

/** Paints the market's paving that falls in one ground tile (world rect). */
export function paintExchangeGround(context: CanvasRenderingContext2D, view: View, ox: number, oy: number) {
  const walks = TOWN_EXCHANGE_GROUND.walks.filter(walk => touches(walk, view, 4));
  for (const walk of walks) paintKerb(context, walk, ox, oy);
  for (const walk of walks) paintFlags(context, walk, ox, oy);
  if (touches({ x: CX - R, y: CY - R * DEPTH, w: R * 2, h: R * DEPTH * 2 }, view, 4)) paintPlaza(context, view, ox, oy);
}
