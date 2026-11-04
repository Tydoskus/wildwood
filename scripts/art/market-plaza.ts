// The round plaza's curved pieces, each part of a ring round the fountain seen as half as tall as wide: four pavilions.
// Each draws from its foot; ringCentre says where the ring's middle falls from it.
import { ORE_COLORS } from "../../src/game/runtime/town/ore-rock-renderer";
import { FISH_COLORS } from "../../src/game/runtime/town/fishing-runtime";
import { GILT, ICE, ink, OUTLINE, PALE_WOOD, SHADOW, STONE, TILE, WOOD, type Tone } from "./market-paint";
import {
  arrowBundle, axe, crate, crystalCluster, FLETCHES, fish, hangingBanner, ingot, ledger, logBack, logEnd, LOGS, oreHeap, ORES,
  paperLantern, scale, shield, starshard, sword,
} from "./market-goods";

type Paint = (c: CanvasRenderingContext2D) => void;
type Point = { x: number; y: number };
const SQUASH = .5;
/** The pavilions' counters stand on this ring round the fountain. */
export const PAVILION_RING = 320;

/** A ring's middle on screen, from the sprite's foot. */
type Ring = { fx: number; fy: number };
const point = (g: Ring, r: number, a: number, h: number): Point => ({ x: g.fx + r * Math.cos(a), y: g.fy + SQUASH * r * Math.sin(a) - h });

/** Traces a line round the ring from angle a0 to a1, its radius and height given along the way (t from 0 to 1). */
function trace(c: CanvasRenderingContext2D, g: Ring, a0: number, a1: number, r: (t: number) => number, h: (t: number) => number, steps = 36) {
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, p = point(g, r(t), a0 + (a1 - a0) * t, h(t));
    c.lineTo(p.x, p.y);
  }
}
const fixed = (value: number) => () => value;

/** A band between two lines round the ring, each a radius and a height. */
function band(c: CanvasRenderingContext2D, g: Ring, a0: number, a1: number, r0: (t: number) => number, h0: (t: number) => number,
  r1: (t: number) => number, h1: (t: number) => number) {
  c.beginPath();
  const start = point(g, r0(0), a0, h0(0));
  c.moveTo(start.x, start.y);
  trace(c, g, a0, a1, r0, h0);
  trace(c, g, a1, a0, t => r1(1 - t), t => h1(1 - t));
  c.closePath();
}

/** Where a ring's middle must fall so the points round it fit the sprite: centred, its lowest at `bottom`. */
function fit(a0: number, a1: number, rings: readonly [number, number][], bottom: number): Ring {
  let left = Infinity, right = -Infinity, top = Infinity, low = -Infinity;
  for (let i = 0; i <= 40; i++) for (const [r, h] of rings) {
    const p = point({ fx: 0, fy: 0 }, r, a0 + (a1 - a0) * i / 40, h);
    left = Math.min(left, p.x); right = Math.max(right, p.x); top = Math.min(top, p.y); low = Math.max(low, p.y);
  }
  return { fx: -(left + right) / 2, fy: bottom - low };
}

const R = PAVILION_RING, SPAN = 40 * Math.PI / 180;
const PLATFORM = 6, COUNTER = 30, EAVE = 90, RIDGE = 114;
/** Radii round the ring: the floor's edges, the counter's faces, the posts, the eaves and the ridge. */
const FLOOR_IN = R - 40, FLOOR_OUT = R + 28, FACE_IN = R - 22, FACE_OUT = R - 12, POST_IN = R - 32, POST_OUT = R + 20;
const EAVE_IN = R - 38, EAVE_OUT = R + 12, RIDGE_R = R - 6, GOODS = R - 17, SHELF = 52;
/** Each pavilion's place round the fountain: the middle of its arc. */
const PAVILION_MIDS = { nw: 225, ne: 315, sw: 135, se: 45 } as const;
type Quarter = keyof typeof PAVILION_MIDS;

/** Where the ring's middle falls from a pavilion's foot. */
export function pavilionRing(quarter: Quarter): Ring {
  const mid = PAVILION_MIDS[quarter] * Math.PI / 180, a0 = mid - SPAN / 2, a1 = mid + SPAN / 2;
  return fit(a0, a1, [[FLOOR_IN, 0], [FLOOR_OUT, 0], [EAVE_IN, EAVE + 12], [EAVE_OUT, EAVE + 12], [RIDGE_R, RIDGE + 22]], 24);
}

/** A curved pavilion facing the fountain: a stone floor, a counter of goods, posts, a tiled roof, lanterns and a banner. */
function pavilion(c: CanvasRenderingContext2D, quarter: Quarter, goods: (place: (t: number) => Point) => void) {
  const mid = PAVILION_MIDS[quarter] * Math.PI / 180, a0 = mid - SPAN / 2, a1 = mid + SPAN / 2, g = pavilionRing(quarter);
  const facing = Math.sin(mid) < 0, angle = (t: number) => a0 + (a1 - a0) * t;
  const eave = (t: number) => EAVE + 12 * (Math.max(0, 1 - t / .16) ** 2 + Math.max(0, 1 - (1 - t) / .16) ** 2);
  const place = (t: number) => point(g, GOODS, angle(t), COUNTER);
  const upright = (r: number, t: number, h0: number, h1: number, half: number, tone: Tone) => {
    const foot = point(g, r, angle(t), h0), head = point(g, r, angle(t), h1);
    c.beginPath(); c.rect(foot.x - half, head.y, half * 2, foot.y - head.y);
    c.fillStyle = tone.base; c.fill();
    c.fillStyle = tone.light; c.fillRect(foot.x - half * .6, head.y, half * .45, foot.y - head.y);
    c.lineWidth = 2; c.strokeStyle = OUTLINE; c.stroke();
  };
  band(c, g, a0, a1, fixed(FLOOR_IN - 4), fixed(0), fixed(FLOOR_OUT + 4), fixed(0));
  c.fillStyle = "rgba(20,14,8,.2)"; c.fill();
  // The floor: its top, then the edge that faces the viewer.
  band(c, g, a0, a1, fixed(FLOOR_IN), fixed(PLATFORM), fixed(FLOOR_OUT), fixed(PLATFORM)); ink(c, STONE.light, 2.5);
  const edge = facing ? FLOOR_IN : FLOOR_OUT;
  band(c, g, a0, a1, fixed(edge), fixed(PLATFORM), fixed(edge), fixed(0)); ink(c, STONE.base, 2);
  const roofCrates = () => {
    for (const t of [.1, .9]) {
      const p = point(g, R + 6, angle(t), PLATFORM);
      crate(c, p.x, p.y, 18, 16); crate(c, p.x + (t < .5 ? 2 : -2), p.y - 16, 16, 14);
    }
  };
  // The far side first: a back shelf when the counter faces the viewer, the inner posts when it faces away.
  if (facing) {
    band(c, g, a0 + .03, a1 - .03, fixed(POST_OUT), fixed(SHELF), fixed(POST_OUT), fixed(PLATFORM)); ink(c, SHADOW, 2);
    band(c, g, a0 + .03, a1 - .03, fixed(POST_OUT - 6), fixed(SHELF), fixed(POST_OUT + 2), fixed(SHELF)); ink(c, PALE_WOOD.base, 2);
    for (const t of [.03, .5, .97]) upright(POST_OUT, t, PLATFORM, EAVE + 4, 3.5, WOOD);
    roofCrates();
  } else for (const t of [.04, .96]) upright(POST_IN, t, PLATFORM, EAVE + 4, 3.5, WOOD);
  // The counter: its top, the goods on it, then its face towards the viewer, gold along the top.
  band(c, g, a0 + .05, a1 - .05, fixed(FACE_IN), fixed(COUNTER), fixed(FACE_OUT), fixed(COUNTER)); ink(c, PALE_WOOD.base, 2);
  goods(place);
  const face = facing ? FACE_IN : FACE_OUT;
  band(c, g, a0 + .05, a1 - .05, fixed(face), fixed(COUNTER), fixed(face), fixed(PLATFORM)); ink(c, WOOD.base, 2.5);
  band(c, g, a0 + .05, a1 - .05, fixed(face), fixed(COUNTER), fixed(face), fixed(COUNTER - 4)); ink(c, GILT.base, 1.5);
  if (facing) for (const t of [.04, .96]) upright(POST_IN, t, PLATFORM, EAVE + 4, 3.5, WOOD);
  else {
    roofCrates();
    for (const t of [.03, .97]) upright(POST_OUT, t, PLATFORM, EAVE + 4, 3.5, WOOD);
  }
  // The roof: the slope that faces the viewer, tile rows down it, its eave gilt and curling up at the ends, the ridge.
  const eaveR = facing ? EAVE_IN : EAVE_OUT;
  band(c, g, a0, a1, fixed(eaveR), eave, fixed(RIDGE_R), fixed(RIDGE));
  c.fillStyle = TILE.base; c.fill();
  c.save(); c.clip();
  for (let i = 0; i <= 26; i++) {
    const t = i / 26, low = point(g, eaveR, angle(t), eave(t)), high = point(g, RIDGE_R, angle(t), RIDGE);
    c.beginPath(); c.moveTo(low.x - 2, low.y); c.lineTo(high.x - 2, high.y); c.lineWidth = 3; c.strokeStyle = TILE.light; c.stroke();
    c.beginPath(); c.moveTo(low.x + 3, low.y); c.lineTo(high.x + 3, high.y); c.lineWidth = 1.5; c.strokeStyle = TILE.dark; c.stroke();
  }
  c.restore();
  band(c, g, a0, a1, fixed(eaveR), eave, fixed(RIDGE_R), fixed(RIDGE));
  c.lineWidth = 2.5; c.strokeStyle = OUTLINE; c.stroke();
  band(c, g, a0, a1, fixed(eaveR), eave, fixed(eaveR), t => eave(t) - 8); ink(c, TILE.dark, 2);
  c.beginPath();
  trace(c, g, a0, a1, fixed(eaveR), t => eave(t) - 6.5);
  c.lineWidth = 2.5; c.strokeStyle = GILT.base; c.stroke();
  band(c, g, a0, a1, fixed(RIDGE_R), fixed(RIDGE + 9), fixed(RIDGE_R), fixed(RIDGE)); ink(c, TILE.dark, 2);
  c.beginPath(); trace(c, g, a0, a1, fixed(RIDGE_R), fixed(RIDGE + 4.5)); c.lineWidth = 2; c.strokeStyle = GILT.base; c.stroke();
  // The roof's end nearer the viewer, closed by a small gable.
  const near = point(g, FLOOR_IN, a0, 0).y > point(g, FLOOR_IN, a1, 0).y ? 0 : 1;
  const front = point(g, eaveR, angle(near), eave(near)), peak = point(g, RIDGE_R, angle(near), RIDGE + 2);
  const back = point(g, facing ? EAVE_OUT : EAVE_IN, angle(near), eave(near));
  c.beginPath(); c.moveTo(front.x, front.y); c.lineTo(peak.x, peak.y); c.lineTo(back.x, back.y); c.closePath(); ink(c, WOOD.dark, 2);
  c.beginPath(); c.moveTo(front.x, front.y); c.lineTo(peak.x, peak.y); c.lineTo(back.x, back.y); c.lineWidth = 1.5; c.strokeStyle = GILT.base; c.stroke();
  for (const t of [0, 1]) {
    const tip = point(g, eaveR, angle(t), eave(t)), horn = point(g, RIDGE_R, angle(t), RIDGE + 9);
    c.beginPath(); c.ellipse(tip.x, tip.y - 2, 6, 4, 0, 0, Math.PI * 2); ink(c, GILT.base, 1.5);
    c.beginPath(); c.ellipse(horn.x, horn.y - 4, 4, 7, 0, 0, Math.PI * 2); ink(c, TILE.base, 2);
    c.beginPath(); c.arc(horn.x, horn.y - 10, 2.5, 0, Math.PI * 2); ink(c, GILT.base, 1.2);
  }
  // Two lanterns and a banner hung from the eave.
  for (const t of [.06, .94]) { const p = point(g, eaveR, angle(t), eave(t) - 8); paperLantern(c, p.x, p.y, 4.8); }
  const flag = point(g, eaveR, angle(.5), eave(.5) - 8);
  hangingBanner(c, flag.x, flag.y, 15, 22, "#b8321f");
}

/** A small tray of ice with two fish on it, its foot's middle at (x, y). */
function iceTray(c: CanvasRenderingContext2D, x: number, y: number, first: string, second: string) {
  c.beginPath(); c.rect(x - 19, y - 6, 38, 6); ink(c, PALE_WOOD.base, 1.5);
  c.beginPath(); c.rect(x - 18, y - 10, 36, 4); ink(c, ICE.base, 1.5);
  fish(c, x - 2, y - 16, 28, first);
  fish(c, x + 3, y - 11, 28, second, 0, true);
}

const PAVILION_GOODS: Readonly<Record<Quarter, (c: CanvasRenderingContext2D, place: (t: number) => Point) => void>> = {
  nw: (c, place) => {
    let p = place(.12); shield(c, p.x, p.y - 17, 17);
    p = place(.27); sword(c, p.x - 6, p.y, 46, .28); sword(c, p.x + 6, p.y, 46, -.28);
    p = place(.39); scale(c, p.x, p.y, 15);
    p = place(.62); ledger(c, p.x, p.y, 30);
    p = place(.76); axe(c, p.x, p.y, 42, .12);
    p = place(.9); sword(c, p.x, p.y, 44, .08);
  },
  ne: (c, place) => {
    let p = place(.12); crystalCluster(c, p.x, p.y, 32, ORE_COLORS.arcane_crystal);
    p = place(.27); starshard(c, p.x, p.y - 15, 12);
    p = place(.39); scale(c, p.x, p.y, 15);
    p = place(.62); ledger(c, p.x, p.y, 30);
    p = place(.77); arrowBundle(c, p.x, p.y, 40, [FLETCHES[0], FLETCHES[1], FLETCHES[3], FLETCHES[2]]);
    p = place(.91); crystalCluster(c, p.x, p.y, 26, ORE_COLORS.arcane_crystal);
  },
  sw: (c, place) => {
    let p = place(.11); oreHeap(c, p.x, p.y, 10, ORES[0]);
    p = place(.26); oreHeap(c, p.x, p.y, 10, ORES[1]);
    p = place(.39); scale(c, p.x, p.y, 15);
    p = place(.62); ledger(c, p.x, p.y, 30);
    p = place(.76); ingot(c, p.x - 10, p.y, 19, ORES[2]); ingot(c, p.x + 10, p.y, 19, ORES[2]); ingot(c, p.x, p.y - 9, 19, ORES[3]);
    p = place(.9); oreHeap(c, p.x, p.y, 10, ORES[3]);
  },
  se: (c, place) => {
    let p = place(.13); iceTray(c, p.x, p.y, FISH_COLORS.salmon, FISH_COLORS.tuna);
    p = place(.3); iceTray(c, p.x, p.y, FISH_COLORS.perch, FISH_COLORS.trout);
    p = place(.42); scale(c, p.x, p.y, 15);
    p = place(.63); ledger(c, p.x, p.y, 30);
    p = place(.84);
    const logs = [[-12, -12, 0], [12, -12, 1], [0, -32, 2]] as const;
    for (const [dx, dy, wood] of logs) logBack(c, p.x + dx, p.y + dy, 12, 5, LOGS[wood]);
    for (const [dx, dy, wood] of logs) logEnd(c, p.x + dx, p.y + dy, 12, LOGS[wood]);
  },
};

/** Where the plaza's middle falls from a pavilion's foot, for laying it round the fountain. */
export function ringCentre(name: string): Ring | null {
  return name.startsWith("pavilion-") ? pavilionRing(name.slice(9) as Quarter) : null;
}

export const PLAZA_PAINTERS: Readonly<Record<string, Paint>> = {
  "pavilion-nw": c => pavilion(c, "nw", place => PAVILION_GOODS.nw(c, place)),
  "pavilion-ne": c => pavilion(c, "ne", place => PAVILION_GOODS.ne(c, place)),
  "pavilion-sw": c => pavilion(c, "sw", place => PAVILION_GOODS.sw(c, place)),
  "pavilion-se": c => pavilion(c, "se", place => PAVILION_GOODS.se(c, place)),
};
