import { COOK_FIRES, FIRE_REACH } from "../../../../shared/cooking";
import {
  TOWN_ARMOR_SELLER_POSITION, TOWN_BENCH_POSITION, TOWN_EXCHANGE_POSITION, TOWN_EXCHANGE_REACH, TOWN_CARD_SELLER_POSITION, TOWN_GEAR_SELLER_REACH, TOWN_WEAPON_SELLER_POSITION, TOWN_CARD_SELLER_REACH, TOWN_DOORS, TOWN_FEET_OFFSET, TOWN_OX_POSITION, TOWN_OX_REACH,
  TOWN_QUEST_BOARD_POSITION, TOWN_RESEARCH_POSITION, TOWN_SCHOOL_POSITIONS, TOWN_SCHOOL_REACH, TOWN_SMITH_POSITION, TOWN_SMITH_REACH, TOWN_SOUL_PORTAL, TOWN_TRAVEL_PORTAL, TOWN_WALK_AREA, inTownWalkArea, townRoomAt,
} from "../../../../shared/town";
import { TOWN_VILLAGE_PITS, type SoulSolid } from "../../town-village";
import { TOWN_FEET_RADIUS, TOWN_SOLIDS } from "./town-runtime";

export type TownPoint = { x: number; y: number };

/** The planner's grid: a cell this wide, eight ways round, never cutting a corner past a solid. */
export const TOWN_PATH_CELL = 16;
/** Room kept round the feet: the player's own circle and a little to spare. */
const CLEARANCE = TOWN_FEET_RADIUS + 1;
/** How far past the start and goal the search may wander, and the wider second try. */
const MARGIN = 480, WIDE_MARGIN = 1_600;
/** A plan gives up after this many cells looked at. */
const MAX_EXPANDED = 250_000;
/** What a step costs through a place a walk-by would set something off (a door, a window, a portal). */
const AVOID_COST = 12;
/** A straight stretch is checked every this many units, and skips at most this many cells. */
const SAMPLE = 4, LOOKAHEAD = 80;

// The solids by square, so a point is only tested against the few near it.
const BUCKET = 128;
const buckets = new Map<number, SoulSolid[]>();
const bucketKey = (bx: number, by: number) => bx * 100_000 + by;
for (const solid of TOWN_SOLIDS) {
  for (let bx = Math.floor((solid.left - CLEARANCE) / BUCKET); bx <= Math.floor((solid.right + CLEARANCE) / BUCKET); bx++) {
    for (let by = Math.floor((solid.top - CLEARANCE) / BUCKET); by <= Math.floor((solid.bottom + CLEARANCE) / BUCKET); by++) {
      const key = bucketKey(bx, by), list = buckets.get(key);
      if (list) list.push(solid); else buckets.set(key, [solid]);
    }
  }
}

/** Whether a circle at (x, y) overlaps a solid: its centre inside, or an edge closer than `r` (pushOutOf's test). */
function overlaps(x: number, y: number, r: number, solid: SoulSolid) {
  if (x <= solid.left - r || x >= solid.right + r || y <= solid.top - r || y >= solid.bottom + r) return false;
  const { xs, ys } = solid;
  let inside = false;
  for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) {
    if ((ys[i] > y) !== (ys[j] > y) && x < (xs[j] - xs[i]) * (y - ys[i]) / (ys[j] - ys[i]) + xs[i]) inside = !inside;
    const dx = xs[i] - xs[j], dy = ys[i] - ys[j], length = dx * dx + dy * dy;
    const t = length > 0 ? Math.max(0, Math.min(1, ((x - xs[j]) * dx + (y - ys[j]) * dy) / length)) : 0;
    const px = xs[j] + dx * t - x, py = ys[j] + dy * t - y;
    if (px * px + py * py < r * r) return true;
  }
  return inside;
}

/**
 * Whether feet can stand at (x, feetY), as the Town holds them (town-runtime.ts): clear of every building, fence,
 * river, railing and piece of furniture, inside the walls outside the rooms, and out of the wells.
 */
export function townFeetClear(x: number, feetY: number, r = CLEARANCE) {
  if (!townRoomAt(x, feetY - TOWN_FEET_OFFSET, 400) && !inTownWalkArea(x, feetY)) return false;
  for (const well of TOWN_VILLAGE_PITS) if (overlaps(x, feetY, r + 16, well)) return false;
  const near = buckets.get(bucketKey(Math.floor(x / BUCKET), Math.floor(feetY / BUCKET)));
  return !near || !near.some(solid => overlaps(x, feetY, r, solid));
}

/**
 * Places a walk only passes through when there is no other way, as feet: a house's door (walking up into one goes
 * in), the Smith's, the sellers', the Trade Chrysanthemum's clerk's, stations' and schools' reach (walking by opens their window), and the two portals.
 */
const AVOID: readonly { x: number; y: number; r: number }[] = [
  ...COOK_FIRES.map(at => ({ ...at, r: FIRE_REACH + 30 })),
  ...TOWN_DOORS.map(door => ({ x: door.x, y: door.enter + 10, r: Math.max(48, door.half + 30) })),
  { ...TOWN_SMITH_POSITION, r: TOWN_SMITH_REACH + 30 }, { ...TOWN_CARD_SELLER_POSITION, r: TOWN_CARD_SELLER_REACH + 30 },
  { ...TOWN_OX_POSITION, r: TOWN_OX_REACH + 30 },
  { ...TOWN_EXCHANGE_POSITION, r: TOWN_EXCHANGE_REACH + 30 },
  ...[TOWN_WEAPON_SELLER_POSITION, TOWN_ARMOR_SELLER_POSITION].map(at => ({ ...at, r: TOWN_GEAR_SELLER_REACH + 30 })),
  ...Object.values(TOWN_SCHOOL_POSITIONS).map(at => ({ x: at.x, y: at.y, r: TOWN_SCHOOL_REACH + 30 })),
  ...[TOWN_BENCH_POSITION, TOWN_RESEARCH_POSITION, TOWN_QUEST_BOARD_POSITION].map(at => ({ x: at.x, y: at.y, r: 110 })),
  ...[TOWN_TRAVEL_PORTAL, TOWN_SOUL_PORTAL].map(portal => ({ x: portal.x, y: portal.y, r: 170 })),
];
/** The place to avoid a point is in, or -1. */
function avoidAt(x: number, feetY: number) {
  for (let index = 0; index < AVOID.length; index++) {
    const zone = AVOID[index], dx = x - zone.x, dy = feetY - zone.y;
    if (dx * dx + dy * dy < zone.r * zone.r) return index;
  }
  return -1;
}

// A binary heap of cell indices by cost, reused from plan to plan.
let heapCells = new Int32Array(1_024), heapCosts = new Float64Array(1_024), heapSize = 0;
function push(cell: number, cost: number) {
  if (heapSize === heapCells.length) {
    const cells = new Int32Array(heapSize * 2), costs = new Float64Array(heapSize * 2);
    cells.set(heapCells); costs.set(heapCosts); heapCells = cells; heapCosts = costs;
  }
  let at = heapSize++;
  while (at > 0) {
    const parent = (at - 1) >> 1;
    if (heapCosts[parent] <= cost) break;
    heapCells[at] = heapCells[parent]; heapCosts[at] = heapCosts[parent]; at = parent;
  }
  heapCells[at] = cell; heapCosts[at] = cost;
}
function pop() {
  const top = heapCells[0], lastCell = heapCells[--heapSize], lastCost = heapCosts[heapSize];
  let at = 0;
  for (;;) {
    let child = at * 2 + 1;
    if (child >= heapSize) break;
    if (child + 1 < heapSize && heapCosts[child + 1] < heapCosts[child]) child++;
    if (heapCosts[child] >= lastCost) break;
    heapCells[at] = heapCells[child]; heapCosts[at] = heapCosts[child]; at = child;
  }
  heapCells[at] = lastCell; heapCosts[at] = lastCost;
  return top;
}

const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
/** The search leans this much on the straight-line estimate: a near-shortest walk for far fewer cells looked at. */
const GREED = 1.2;

// What each cell's centre is, kept from plan to plan (the Town's solids never move): 1 clear, 2 blocked, 3 clear
// but a place to avoid. Inside the walls in one array; the rooms, far off, by key.
const WALLED = {
  x0: Math.floor(TOWN_WALK_AREA.left / TOWN_PATH_CELL), y0: Math.floor(TOWN_WALK_AREA.top / TOWN_PATH_CELL),
  columns: Math.floor(TOWN_WALK_AREA.right / TOWN_PATH_CELL) - Math.floor(TOWN_WALK_AREA.left / TOWN_PATH_CELL) + 1,
  rows: Math.floor(TOWN_WALK_AREA.bottom / TOWN_PATH_CELL) - Math.floor(TOWN_WALK_AREA.top / TOWN_PATH_CELL) + 1,
};
const walledGround = new Uint8Array(WALLED.columns * WALLED.rows);
const roomGround = new Map<number, number>();
const centre = (index: number) => index * TOWN_PATH_CELL + TOWN_PATH_CELL / 2;
function groundOf(column: number, row: number) {
  const c = column - WALLED.x0, r = row - WALLED.y0, walled = c >= 0 && r >= 0 && c < WALLED.columns && r < WALLED.rows;
  const known = walled ? walledGround[r * WALLED.columns + c] : roomGround.get(column * 100_000 + row);
  if (known) return known;
  const x = centre(column), y = centre(row), value = !townFeetClear(x, y) ? 2 : avoidAt(x, y) >= 0 ? 3 : 1;
  if (walled) walledGround[r * WALLED.columns + c] = value; else roomGround.set(column * 100_000 + row, value);
  return value;
}

// The search's own arrays, kept and grown from plan to plan. Each plan takes two new marks: `generation` for
// a cell it has reached, one more for a cell it has finished.
let scratchCost = new Float64Array(0), scratchCame = new Int32Array(0), scratchSeen = new Uint32Array(0), generation = 0, closedMark = 0;
function scratch(size: number) {
  if (scratchCost.length < size || generation > 0xfffffff0) {
    scratchCost = new Float64Array(size); scratchCame = new Int32Array(size); scratchSeen = new Uint32Array(size); generation = 0;
  }
  generation += 2; closedMark = generation + 1;
  return { cost: scratchCost, came: scratchCame, seen: scratchSeen };
}

/** Whether a cell and the eight round it are all clear: then anywhere in it keeps the feet's room. */
function roomy(column: number, row: number) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (groundOf(column + dx, row + dy) === 2) return false;
  return true;
}

/** A* over the grid in a box round the two points, its cells then joined in straight stretches; null when there is no way. */
function search(from: TownPoint, to: TownPoint, margin: number): TownPoint[] | null {
  const room = townRoomAt(from.x, from.y - TOWN_FEET_OFFSET);
  const area = room ? { left: room.room.left - 60, right: room.room.right + 60, top: room.room.top - 260, bottom: room.room.bottom + 60 } : TOWN_WALK_AREA;
  const left = Math.max(area.left, Math.min(from.x, to.x) - margin), right = Math.min(area.right, Math.max(from.x, to.x) + margin);
  const top = Math.max(area.top, Math.min(from.y, to.y) - margin), bottom = Math.min(area.bottom, Math.max(from.y, to.y) + margin);
  const x0 = Math.floor(left / TOWN_PATH_CELL), y0 = Math.floor(top / TOWN_PATH_CELL);
  const columns = Math.floor(right / TOWN_PATH_CELL) - x0 + 1, rows = Math.floor(bottom / TOWN_PATH_CELL) - y0 + 1;
  if (columns <= 0 || rows <= 0) return null;
  const cellOf = (x: number, y: number) => {
    const column = Math.floor(x / TOWN_PATH_CELL) - x0, row = Math.floor(y / TOWN_PATH_CELL) - y0;
    return column < 0 || row < 0 || column >= columns || row >= rows ? -1 : row * columns + column;
  };
  const start = cellOf(from.x, from.y), goal = cellOf(to.x, to.y);
  if (start < 0 || goal < 0 || !townFeetClear(to.x, to.y)) return null;
  // The goal's own cell counts as clear: the goal itself is.
  const groundAt = (cell: number) => cell === goal ? 1 : groundOf(x0 + cell % columns, y0 + Math.floor(cell / columns));
  const { cost, came, seen } = scratch(columns * rows);
  // A cell's cost and parent count only once this plan has set them (seen), so nothing is cleared between plans.
  const costOf = (cell: number) => seen[cell] >= generation ? cost[cell] : Infinity;
  const goalColumn = goal % columns, goalRow = Math.floor(goal / columns);
  const estimate = (cell: number) => {
    const dx = Math.abs(cell % columns - goalColumn), dy = Math.abs(Math.floor(cell / columns) - goalRow);
    return GREED * (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy));
  };
  heapSize = 0;
  cost[start] = 0; came[start] = -1; seen[start] = generation;
  push(start, estimate(start));
  let expanded = 0;
  while (heapSize) {
    const cell = pop();
    if (seen[cell] === closedMark) continue;
    if (cell === goal) break;
    seen[cell] = closedMark;
    if (++expanded > MAX_EXPANDED) return null;
    const column = cell % columns, row = (cell - column) / columns;
    for (const [dx, dy] of STEPS) {
      const nextColumn = column + dx, nextRow = row + dy;
      if (nextColumn < 0 || nextRow < 0 || nextColumn >= columns || nextRow >= rows) continue;
      const next = nextRow * columns + nextColumn;
      const ground = seen[next] === closedMark ? 2 : groundAt(next);
      if (ground === 2) continue;
      // Diagonally only past two clear sides: never through a corner.
      if (dx && dy && (groundAt(row * columns + nextColumn) === 2 || groundAt(nextRow * columns + column) === 2)) continue;
      const total = cost[cell] + (dx && dy ? Math.SQRT2 : 1) * (ground === 3 ? AVOID_COST : 1);
      if (total >= costOf(next)) continue;
      cost[next] = total;
      came[next] = cell;
      seen[next] = generation;
      push(next, total + estimate(next));
    }
  }
  if (costOf(goal) === Infinity) return null;
  const cells: number[] = [];
  for (let cell = goal; cell >= 0; cell = came[cell]) cells.push(cell);
  cells.reverse();
  // A straight stretch: clear all the way (tested exactly only beside something solid), and through no place to
  // avoid unless one end is in it.
  const point = (cell: number) => cell === start ? from : cell === goal ? to : { x: (x0 + cell % columns) * TOWN_PATH_CELL + TOWN_PATH_CELL / 2, y: (y0 + Math.floor(cell / columns)) * TOWN_PATH_CELL + TOWN_PATH_CELL / 2 };
  const straight = (a: number, b: number) => {
    const pa = point(a), pb = point(b), avoidEnds = groundAt(a) === 3 || groundAt(b) === 3;
    const steps = Math.max(1, Math.ceil(Math.hypot(pb.x - pa.x, pb.y - pa.y) / SAMPLE));
    for (let step = 1; step < steps; step++) {
      const x = pa.x + (pb.x - pa.x) * step / steps, y = pa.y + (pb.y - pa.y) * step / steps;
      const column = Math.floor(x / TOWN_PATH_CELL), row = Math.floor(y / TOWN_PATH_CELL), ground = groundOf(column, row);
      if (ground === 2 || (ground === 3 && !avoidEnds)) return false;
      if (!roomy(column, row) && !townFeetClear(x, y)) return false;
    }
    return true;
  };
  // From each point, the furthest cell ahead a straight stretch reaches (sought by halves), and on from there.
  const points: TownPoint[] = [];
  for (let anchor = 0; anchor < cells.length - 1;) {
    let near = anchor + 1, far = Math.min(cells.length - 1, anchor + LOOKAHEAD);
    while (near < far) {
      const middle = Math.ceil((near + far) / 2);
      if (straight(cells[anchor], cells[middle])) near = middle; else far = middle - 1;
    }
    points.push(point(cells[near]));
    anchor = near;
  }
  if (!points.length) points.push(to);
  return points;
}

/**
 * A walk through the Town for feet at `from` to `to` (both feet points): the waypoints after `from`, ending at
 * `to`, or null when there is no way there. It searches a box round the two, then a wider one.
 */
export function planTownPath(from: TownPoint, to: TownPoint): TownPoint[] | null {
  if (Math.hypot(to.x - from.x, to.y - from.y) < 1) return [to];
  return search(from, to, MARGIN) ?? search(from, to, WIDE_MARGIN);
}
