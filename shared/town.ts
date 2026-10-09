/**
 * The Town: ForestVillage's own demo village (baked by
 * scripts/art/bake-forest-village-scene.mjs), every player's hub between Home
 * and the maps, and where a new account starts.
 *
 * - The travel portal stands at the end of the village's top road, the Soul
 *   Dimension's at the end of its bottom road. Home's travel pad leads here.
 * - Behind each house door is a room, a world away in a row of rooms walled
 *   all round, so a door is the only way in or out. Fall in a well and you are
 *   back on the square.
 * - Round the village, the pack's countryside is laid chunk by chunk from the
 *   coordinates alone (every client builds the same), and walls keep everyone
 *   close enough to the village to matter.
 */
import doorData from "./town-doors.json";

export const TOWN_MAP_ID = "town";
export type TownMapId = typeof TOWN_MAP_ID;
export const isTownMap = (mapId: unknown): mapId is TownMapId => mapId === TOWN_MAP_ID;

/** The Town's world: the village and its countryside on the left, the row of rooms far below. Wider than the narrow motion format holds. */
export const TOWN_WORLD = Object.freeze({ width: 30_000, height: 15_000 });
/** The village's fountain: everything in the village is placed from it. */
export const TOWN_CENTER = Object.freeze({ x: 6_000, y: 5_000 });
/** Where a traveller lands: the village square, east of the fountain. */
export const TOWN_ARRIVAL = Object.freeze({ x: TOWN_CENTER.x + 120, y: TOWN_CENTER.y + 110 });
/** The village's own ground (no wild props inside it), as offsets from the fountain. */
export const TOWN_VILLAGE_BOUNDS = Object.freeze({ left: -2_560, right: 2_120, top: -1_420, bottom: 2_030 });
export const inTownVillage = (x: number, y: number, margin = 0) =>
  x > TOWN_CENTER.x + TOWN_VILLAGE_BOUNDS.left - margin && x < TOWN_CENTER.x + TOWN_VILLAGE_BOUNDS.right + margin
  && y > TOWN_CENTER.y + TOWN_VILLAGE_BOUNDS.top - margin && y < TOWN_CENTER.y + TOWN_VILLAGE_BOUNDS.bottom + margin;
/** How far past the village's ground anyone may walk: the countryside's edge, walled. */
export const TOWN_WALK_MARGIN = 320;
export const TOWN_WALK_AREA = Object.freeze({
  left: TOWN_CENTER.x + TOWN_VILLAGE_BOUNDS.left - TOWN_WALK_MARGIN, right: TOWN_CENTER.x + TOWN_VILLAGE_BOUNDS.right + TOWN_WALK_MARGIN,
  top: TOWN_CENTER.y + TOWN_VILLAGE_BOUNDS.top - TOWN_WALK_MARGIN, bottom: TOWN_CENTER.y + TOWN_VILLAGE_BOUNDS.bottom + TOWN_WALK_MARGIN,
});

type Pad = { x: number; y: number; width: number; height: number; depth: number };
const pad = (dx: number, dy: number): Pad => Object.freeze({ x: TOWN_CENTER.x + dx, y: TOWN_CENTER.y + dy, width: 150, height: 150, depth: TOWN_CENTER.y + dy });
/**
 * The travel portal, at the very end of the village's top road (where its dirt meets the ground's north edge),
 * standing on it with its arch over the grass beyond: it opens the map picker.
 */
export const TOWN_TRAVEL_PORTAL = Object.freeze({ ...pad(-1_220, -1_365), label: "Travel" });
/** The Soul Dimension's portal, at the very end of the bottom road past the bridge, where it meets the south edge. */
export const TOWN_SOUL_PORTAL = Object.freeze({ ...pad(-609, 1_985), destination: "soul_dimension" as const, label: "Soul Dimension" });
/** The rune stone that marks the Soul Dimension's portal, beside it. */
export const TOWN_SOUL_RUNESTONE = Object.freeze({ x: TOWN_SOUL_PORTAL.x + 118, y: TOWN_SOUL_PORTAL.y - 6 });

/** A seeded random stream from whole-number parts: the countryside is laid from it, the same on every client. */
export function townRandom(...parts: number[]) {
  let h = 0x50f1d1;
  for (const part of parts) {
    h = Math.imul(h ^ (part | 0), 0x9e3779b1) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
  }
  let state = h || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Doors and rooms ----

/**
 * The village's rooms, one behind each door (baked with the village into town-doors.json): they stand in a
 * row here, far from the village and walled all round, so a door is the only way in or out.
 */
export const TOWN_INTERIORS = Object.freeze({ x: 3_000, y: 12_500 });
/** Where a player's feet are below their position: what doors, walls and wells are measured against. */
export const TOWN_FEET_OFFSET = 29;
/** How far from a door (or out of its room) the server still lets a player use it: their position lags a little. */
export const TOWN_DOOR_REACH = 160;
export type TownDoor = {
  index: number;
  /** The middle of the door's sill, and its half-width at the sill. */
  x: number; y: number; half: number;
  /** The wall's front at the door: as close as feet get. */
  enter: number;
  /** The room's floor. */
  room: { left: number; top: number; right: number; bottom: number };
  /** The doorway out of the room, in the middle of its front wall, and its half-width. */
  exit: { x: number; y: number; half: number };
  /** Where a player stands after going through: just outside the door, or just inside the room's doorway. */
  outside: { x: number; y: number };
  inside: { x: number; y: number };
};
export const TOWN_DOORS: readonly TownDoor[] = doorData.doors.map((door, index) => {
  const [rx, ry, rw, rh] = door.room;
  const room = { left: TOWN_INTERIORS.x + rx, top: TOWN_INTERIORS.y + ry, right: TOWN_INTERIORS.x + rx + rw, bottom: TOWN_INTERIORS.y + ry + rh };
  const x = TOWN_CENTER.x + door.x, y = TOWN_CENTER.y + door.y, exitX = (room.left + room.right) / 2;
  return Object.freeze({
    index, x, y, half: door.half, enter: TOWN_CENTER.y + door.enter, room,
    exit: { x: exitX, y: room.bottom, half: doorData.gap / 2 },
    outside: { x, y: y + 40 - TOWN_FEET_OFFSET },
    inside: { x: exitX, y: room.bottom - 56 - TOWN_FEET_OFFSET },
  });
});
/**
 * The stations Home used to hold, each inside a Town building, against its back wall where a piece of the
 * room's own furniture stood (the client draws the station in its place and keeps its collider as the
 * station's): Loadout Upgrades in the smithy (door 6) for its tool table, Tech Research in the windmill
 * (door 1) for its roped-off display, Weekly Quests in the Inn (door 5) for its notice board. Each is
 * (door, offset from the room's top-left corner). The server checks the bench's reach from the same point.
 */
const stationIn = (door: number, dx: number, dy: number) => {
  const { room } = TOWN_DOORS[door];
  return Object.freeze({ door, x: room.left + dx, y: room.top + dy });
};
export const TOWN_BENCH_POSITION = stationIn(6, 210, 65);
export const TOWN_RESEARCH_POSITION = stationIn(1, 210, 50);
export const TOWN_QUEST_BOARD_POSITION = stationIn(5, 300, 44);
/**
 * Ox keeps the bottom-right house (door 8) and sells the Galaxy set. Where his feet are: in the open
 * floor between the back wall's furniture and the table, so a player can walk right up to him.
 */
export const TOWN_OX_POSITION = stationIn(8, 120, 100);
/** How close a player's feet come to Ox's before his shop opens. */
export const TOWN_OX_REACH = 60;

/** The whole row of rooms, walls and all. */
const TOWN_INTERIOR_AREA = Object.freeze({
  left: Math.min(...TOWN_DOORS.map(door => door.room.left)) - 200, right: Math.max(...TOWN_DOORS.map(door => door.room.right)) + 200,
  top: Math.min(...TOWN_DOORS.map(door => door.room.top)) - 400, bottom: Math.max(...TOWN_DOORS.map(door => door.room.bottom)) + 200,
});
/** Nothing grows this close to the rooms: from inside one there is only dark around it. */
export const TOWN_INTERIOR_MARGIN = 3_500;
export const inTownInteriors = (x: number, y: number, margin = 0) =>
  x > TOWN_INTERIOR_AREA.left - margin && x < TOWN_INTERIOR_AREA.right + margin && y > TOWN_INTERIOR_AREA.top - margin && y < TOWN_INTERIOR_AREA.bottom + margin;
export const townInteriorArea = (margin = 0) => ({
  left: TOWN_INTERIOR_AREA.left - margin, top: TOWN_INTERIOR_AREA.top - margin, right: TOWN_INTERIOR_AREA.right + margin, bottom: TOWN_INTERIOR_AREA.bottom + margin,
});
/** The room a point is in (with a little to spare), if any. */
export function townRoomAt(x: number, y: number, spare = 0) {
  return TOWN_DOORS.find(({ room }) => x >= room.left - spare && x <= room.right + spare && y >= room.top - spare - 200 && y <= room.bottom + spare) ?? null;
}
/**
 * Where going through a door takes a player at this position: in, when they are at it outside; out, when
 * they are in its room; nowhere (null) when they are at neither. The server's rule, and the client's.
 */
export function townDoorDestination(index: number, x: number, y: number) {
  const door = TOWN_DOORS[index];
  if (!door) return null;
  if (Math.hypot(x - door.x, y + TOWN_FEET_OFFSET - door.enter) <= TOWN_DOOR_REACH) return door.inside;
  if (townRoomAt(x, y, TOWN_DOOR_REACH) === door) return door.outside;
  return null;
}
/** Where a player stands to go through a door, by their position: at its sill outside, and in its room's doorway. */
export function townDoorSides(index: number) {
  const door = TOWN_DOORS[index];
  return door ? [{ x: door.x, y: door.enter - TOWN_FEET_OFFSET }, { x: door.exit.x, y: door.exit.y - TOWN_FEET_OFFSET }] : [];
}

// ---- The countryside, chunk by chunk ----

export const TOWN_CHUNK_SIZE = 1_600;
/** Chunks loaded around the player each way: a 5×5 window, 8,000 units across. */
export const TOWN_CHUNK_RADIUS = 2;
export const townChunkOf = (value: number) => Math.floor(value / TOWN_CHUNK_SIZE);
/** Only chunks a screen could see from inside the walls hold anything. */
const TOWN_PROP_AREA = Object.freeze({ left: TOWN_WALK_AREA.left - 2_000, right: TOWN_WALK_AREA.right + 2_000, top: TOWN_WALK_AREA.top - 2_000, bottom: TOWN_WALK_AREA.bottom + 2_000 });
export const townChunkInWorld = (cx: number, cy: number) =>
  (cx + 1) * TOWN_CHUNK_SIZE > TOWN_PROP_AREA.left && cx * TOWN_CHUNK_SIZE < TOWN_PROP_AREA.right
  && (cy + 1) * TOWN_CHUNK_SIZE > TOWN_PROP_AREA.top && cy * TOWN_CHUNK_SIZE < TOWN_PROP_AREA.bottom;

export type TownPropKind = "tree" | "smallTree" | "birch" | "bush" | "grass" | "flower" | "mushroom" | "stone" | "stoneSmall" | "log" | "stump";
export type TownProp = { kind: TownPropKind; x: number; y: number; s: number; flip: boolean; variant: number };
/** ForestVillage's own countryside: mostly grass, trees in loose groves, the odd stone, log and mushroom ring. */
const WILD_PROPS: readonly [TownPropKind, number][] = [
  ["grass", 26], ["tree", 9], ["bush", 7], ["flower", 5], ["smallTree", 4], ["mushroom", 3], ["stoneSmall", 3], ["birch", 2],
  ["stone", 1.5], ["stump", 1], ["log", .8],
];
const WILD_WEIGHT = WILD_PROPS.reduce((sum, [, weight]) => sum + weight, 0);
/** Where the portals stand: the countryside keeps clear of them. */
const PORTAL_CLEARINGS = [TOWN_TRAVEL_PORTAL, TOWN_SOUL_PORTAL];
/** A chunk's scattered props, clear of the village, its portals and the rooms. */
export function townChunkProps(cx: number, cy: number): TownProp[] {
  if (!townChunkInWorld(cx, cy)) return [];
  const random = townRandom(cx, cy, 2);
  const props: TownProp[] = [];
  const total = 40 + Math.floor(random() * 20);
  for (let index = 0; index < total; index++) {
    const x = cx * TOWN_CHUNK_SIZE + random() * TOWN_CHUNK_SIZE;
    const y = cy * TOWN_CHUNK_SIZE + random() * TOWN_CHUNK_SIZE;
    let pick = random() * WILD_WEIGHT, kind: TownPropKind = "grass";
    for (const [candidate, weight] of WILD_PROPS) { if ((pick -= weight) <= 0) { kind = candidate; break; } }
    const s = .9 + random() * .2;
    const flip = random() < .5;
    const variant = Math.floor(random() * 1_000);
    if (inTownVillage(x, y, 60) || inTownInteriors(x, y, TOWN_INTERIOR_MARGIN)) continue;
    if (kind !== "grass" && PORTAL_CLEARINGS.some(portal => Math.hypot(portal.x - x, portal.y - y) < 260)) continue;
    props.push({ kind, x: Math.round(x), y: Math.round(y), s, flip, variant });
  }
  return props;
}
/** Every chunk in the window around a point, nearest ring first. */
export function townWindowChunks(x: number, y: number, radius = TOWN_CHUNK_RADIUS) {
  const ccx = townChunkOf(x), ccy = townChunkOf(y);
  const chunks: { cx: number; cy: number }[] = [];
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    if (townChunkInWorld(ccx + dx, ccy + dy)) chunks.push({ cx: ccx + dx, cy: ccy + dy });
  }
  return chunks.sort((a, b) => Math.max(Math.abs(a.cx - ccx), Math.abs(a.cy - ccy)) - Math.max(Math.abs(b.cx - ccx), Math.abs(b.cy - ccy)));
}
