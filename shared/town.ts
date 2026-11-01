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
import type { WeaponSchool } from "./weapon-mastery";

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
/**
 * The Copper Hills: the mining country east of the village, a short walk past its river.
 * Ore rocks in four veins, copper
 * nearest the village and adamant furthest out; shared/mining.ts lays them. Part of the Town's own world, so it
 * is the Town's map: walk out east and you are there.
 */
export const TOWN_HILLS = Object.freeze({ left: TOWN_CENTER.x + 3_000, right: TOWN_CENTER.x + 7_400, top: TOWN_CENTER.y - 1_400, bottom: TOWN_CENTER.y + 1_900 });
export const inTownHills = (x: number, y: number, margin = 0) =>
  x > TOWN_HILLS.left - margin && x < TOWN_HILLS.right + margin && y > TOWN_HILLS.top - margin && y < TOWN_HILLS.bottom + margin;
/**
 * Timberwood: the woodcutting grove west of the village, out over its west bridge along a woodcutters' road. Trees
 * in four stands, pine nearest the village and elder furthest out; shared/woodcutting.ts lays them.
 */
export const TOWN_GROVE = Object.freeze({ left: TOWN_CENTER.x - 5_450, right: TOWN_CENTER.x - 2_900, top: TOWN_CENTER.y - 850, bottom: TOWN_CENTER.y + 1_250 });
export const inTownGrove = (x: number, y: number, margin = 0) =>
  x > TOWN_GROVE.left - margin && x < TOWN_GROVE.right + margin && y > TOWN_GROVE.top - margin && y < TOWN_GROVE.bottom + margin;
/**
 * The Town is laid out as a 3×3 grid of areas: Timberwood, the village and the Copper Hills across the middle row.
 * The Trade Chrysanthemum's cell is the bottom row's middle one: as wide as the village, right under it. Countryside
 * fills it round the market square, and the other cells; all nine are open, walled only round the grid's outside.
 */
export const TOWN_EXCHANGE = Object.freeze({
  left: TOWN_CENTER.x + TOWN_VILLAGE_BOUNDS.left, right: TOWN_CENTER.x + TOWN_VILLAGE_BOUNDS.right,
  top: TOWN_CENTER.y + 2_300, bottom: TOWN_CENTER.y + 4_150,
});
export const inTownExchange = (x: number, y: number, margin = 0) =>
  x > TOWN_EXCHANGE.left - margin && x < TOWN_EXCHANGE.right + margin && y > TOWN_EXCHANGE.top - margin && y < TOWN_EXCHANGE.bottom + margin;
/** The market square itself, bare earth as the village's roads are, near the top of its cell. */
export const TOWN_EXCHANGE_PLAZA = Object.freeze({ left: TOWN_CENTER.x - 500, right: TOWN_CENTER.x + 360, top: TOWN_CENTER.y + 2_450, bottom: TOWN_CENTER.y + 3_060 });
/** The square's middle, where the chrysanthemum bed stands. */
export const TOWN_EXCHANGE_CENTER = Object.freeze({
  x: (TOWN_EXCHANGE_PLAZA.left + TOWN_EXCHANGE_PLAZA.right) / 2, y: (TOWN_EXCHANGE_PLAZA.top + TOWN_EXCHANGE_PLAZA.bottom) / 2 + 40,
});
/**
 * The road down to the square, rectangles of road as a map's paths are: a branch east off the village's own bottom
 * road below the river, and the way south into the square. The branch starts inside that road's dirt (its
 * baked edge is at x -558), and only what lies east of TOWN_EXCHANGE_ROAD_JOIN is painted, so the two roads meet
 * as one with no edge between them.
 */
export const TOWN_EXCHANGE_ROAD_JOIN = TOWN_CENTER.x - 561;
export const TOWN_EXCHANGE_ROAD = Object.freeze([
  Object.freeze({ x: TOWN_CENTER.x - 650, y: TOWN_CENTER.y + 1_720, w: 330, h: 96 }),
  Object.freeze({ x: TOWN_CENTER.x - 416, y: TOWN_CENTER.y + 1_720, w: 96, h: 760 }),
]);
/** Where the Trade Chrysanthemum's clerk stands, in front of his booth on the square's north side: his feet. */
export const TOWN_EXCHANGE_POSITION = Object.freeze({ x: TOWN_EXCHANGE_PLAZA.left + 430, y: TOWN_EXCHANGE_PLAZA.top + 190 });
/** As the Smith's: how close a player's feet come before the window opens, and the server's allowance for lag. */
export const TOWN_EXCHANGE_REACH = 60;
export const TOWN_EXCHANGE_SERVER_REACH = 100;
/** The sign to the square, where the branch leaves the village's road, pointing east along it. */
export const TOWN_EXCHANGE_SIGNPOST_POSITION = Object.freeze({ x: TOWN_CENTER.x - 505, y: TOWN_CENTER.y + 1_690 });
/** Whether a point is on the square or its road, or within `margin` of them. */
export function onTownExchangeGround(x: number, y: number, margin = 0) {
  const plaza = TOWN_EXCHANGE_PLAZA;
  if (x > plaza.left - margin && x < plaza.right + margin && y > plaza.top - margin && y < plaza.bottom + margin) return true;
  return TOWN_EXCHANGE_ROAD.some(road => x > road.x - margin && x < road.x + road.w + margin && y > road.y - margin && y < road.y + road.h + margin);
}
/** The village's own stone bridge west of the square: the woodcutters' road leaves the village over it. Its middle. */
export const TOWN_WEST_BRIDGE = Object.freeze({ x: TOWN_CENTER.x - 1_912, y: TOWN_CENTER.y + 226 });
/** How far past an area's own ground its countryside reaches, and how far past the grid's outer cells the walls stand. */
export const TOWN_WALK_MARGIN = 320;
/** The village and the countryside round it: what the minimap shows from the village. */
export const TOWN_VILLAGE_WALK_AREA = Object.freeze({
  left: TOWN_CENTER.x + TOWN_VILLAGE_BOUNDS.left - TOWN_WALK_MARGIN, right: TOWN_CENTER.x + TOWN_VILLAGE_BOUNDS.right + TOWN_WALK_MARGIN,
  top: TOWN_CENTER.y + TOWN_VILLAGE_BOUNDS.top - TOWN_WALK_MARGIN, bottom: TOWN_CENTER.y + TOWN_VILLAGE_BOUNDS.bottom + TOWN_WALK_MARGIN,
});
/** Timberwood and the countryside round it, west of the village. */
export const TOWN_GROVE_WALK_AREA = Object.freeze({
  left: TOWN_GROVE.left - TOWN_WALK_MARGIN, right: TOWN_GROVE.right + TOWN_WALK_MARGIN, top: TOWN_GROVE.top - TOWN_WALK_MARGIN, bottom: TOWN_GROVE.bottom + TOWN_WALK_MARGIN,
});
/** The Trade Chrysanthemum's cell and the countryside round it, south of the village. */
export const TOWN_EXCHANGE_WALK_AREA = Object.freeze({
  left: TOWN_EXCHANGE.left - TOWN_WALK_MARGIN, right: TOWN_EXCHANGE.right + TOWN_WALK_MARGIN, top: TOWN_EXCHANGE.top - TOWN_WALK_MARGIN, bottom: TOWN_EXCHANGE.bottom + TOWN_WALK_MARGIN,
});
/** The grid's top row, as far above the village as the market's row is below it: countryside. */
const TOWN_TOP_ROW = TOWN_CENTER.y + TOWN_VILLAGE_BOUNDS.top - (TOWN_EXCHANGE.bottom - TOWN_CENTER.y - TOWN_VILLAGE_BOUNDS.bottom);
/**
 * Where anyone may walk: the whole 3×3 grid, walled only round its outside. Timberwood's, the village's and the
 * hills' columns, from the top row's countryside down to the market's row.
 */
export const TOWN_WALK_AREAS = Object.freeze([
  Object.freeze({
    left: TOWN_GROVE_WALK_AREA.left, right: TOWN_HILLS.right + TOWN_WALK_MARGIN,
    top: TOWN_TOP_ROW - TOWN_WALK_MARGIN, bottom: TOWN_EXCHANGE_WALK_AREA.bottom,
  }),
]);
/** All the walls hold, in one rectangle (for grids and the minimap); inTownWalkArea says where inside it is open. */
export const TOWN_WALK_AREA = Object.freeze({
  left: Math.min(...TOWN_WALK_AREAS.map(area => area.left)), right: Math.max(...TOWN_WALK_AREAS.map(area => area.right)),
  top: Math.min(...TOWN_WALK_AREAS.map(area => area.top)), bottom: Math.max(...TOWN_WALK_AREAS.map(area => area.bottom)),
});
export const inTownWalkArea = (x: number, y: number) =>
  TOWN_WALK_AREAS.some(area => x >= area.left && x <= area.right && y >= area.top && y <= area.bottom);
/** The nearest point inside the walls: the point itself when it is inside them. */
export function townWalkClamp(x: number, y: number) {
  let best = { x, y }, bestDistance = Infinity;
  for (const area of TOWN_WALK_AREAS) {
    const cx = Math.max(area.left, Math.min(area.right, x)), cy = Math.max(area.top, Math.min(area.bottom, y));
    const distance = (cx - x) ** 2 + (cy - y) ** 2;
    if (distance < bestDistance) { best = { x: cx, y: cy }; bestDistance = distance; }
  }
  return best;
}

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
 * The stations, each inside a Town building, against its back wall where a piece of the
 * room's own furniture stood (the client draws the station in its place and keeps its collider as the
 * station's): Slot Upgrades in the smithy (door 6) for its tool table, Tech Research in the windmill
 * (door 1) for its roped-off display, Weekly Quests in the Inn (door 5) for its notice board. Each is
 * (door, offset from the room's top-left corner). The server checks the station's reach from the same point.
 */
const stationIn = (door: number, dx: number, dy: number) => {
  const { room } = TOWN_DOORS[door];
  return Object.freeze({ door, x: room.left + dx, y: room.top + dy });
};
export const TOWN_BENCH_POSITION = stationIn(6, 210, 65);
export const TOWN_RESEARCH_POSITION = stationIn(1, 210, 50);
export const TOWN_QUEST_BOARD_POSITION = stationIn(5, 300, 44);
/**
 * Each Weapon Mastery school's building (SCHOOL_DETAILS in shared/weapon-mastery.ts names its door): where feet
 * stand to read it, on open floor in front of the back wall, under the sign on the wall between two windows.
 */
export const TOWN_SCHOOL_POSITIONS: Readonly<Record<WeaponSchool, { door: number; x: number; y: number }>> = Object.freeze({
  archery: stationIn(2, 400, 64), swordplay: stationIn(3, 200, 64), sorcery: stationIn(4, 200, 64),
});
/** How close a player's feet come to a school's spot before its window opens. */
export const TOWN_SCHOOL_REACH = 45;
/** The server's allowance for lag at a school's spot, where clients from before crafting moved to the Smith still craft. */
export const TOWN_SCHOOL_SERVER_REACH = 85;
/**
 * Ox keeps the bottom-right house (door 8) and sells the Galaxy set. Where his feet are: in the open
 * floor between the back wall's furniture and the table, so a player can walk right up to him.
 */
export const TOWN_OX_POSITION = stationIn(8, 120, 100);
/** How close a player's feet come to Ox's before his shop opens. */
export const TOWN_OX_REACH = 60;
/**
 * The Smith refines gear (shared/refine.ts), after Ragnarok's refiner. He
 * works outdoors at the blue forge house right of the Slot Upgrades station's building (door 6), the one with crossed
 * swords on its sign: in its yard, between the weapon rack and the forge, behind the anvil. Players walk in
 * from the road on the left. Where his feet are.
 */
export const TOWN_SMITH_POSITION = Object.freeze({ x: TOWN_CENTER.x + 354, y: TOWN_CENTER.y + 483 });
/** How close a player's feet come to the Smith's before his window opens; the server allows a little more for lag. */
export const TOWN_SMITH_REACH = 60;
export const TOWN_SMITH_SERVER_REACH = 100;
/**
 * The Card Seller (shared/card-shop.ts) keeps the market stall at the square's edge, the right one of the
 * top row, beige with teal stripes. Its foot, where the name hangs over it, and where a player's feet stand
 * at its counter, in the lane between the two rows of stalls.
 */
export const TOWN_CARD_SELLER_STALL = Object.freeze({ x: TOWN_CENTER.x - 185, y: TOWN_CENTER.y + 212 });
export const TOWN_CARD_SELLER_POSITION = Object.freeze({ x: TOWN_CARD_SELLER_STALL.x, y: TOWN_CARD_SELLER_STALL.y + 50 });
/** As the Smith's: how close a player's feet come before the window opens, and the server's allowance for lag. */
export const TOWN_CARD_SELLER_REACH = 60;
export const TOWN_CARD_SELLER_SERVER_REACH = 100;
/**
 * The gear sellers keep two more of the market's stalls (the Smith only crafts, reforges and refines): the Weapon
 * Seller the right stall of the bottom row, nearest the Smith, facing south; the Armor Seller the top row's left
 * end, far enough from the Card Seller that their names never overlap. Each stall's foot, where its name hangs,
 * and where a player's feet stand at its counter.
 */
export const TOWN_WEAPON_SELLER_STALL = Object.freeze({ x: TOWN_CENTER.x - 100, y: TOWN_CENTER.y + 376 });
export const TOWN_WEAPON_SELLER_POSITION = Object.freeze({ x: TOWN_WEAPON_SELLER_STALL.x, y: TOWN_WEAPON_SELLER_STALL.y + 50 });
export const TOWN_ARMOR_SELLER_STALL = Object.freeze({ x: TOWN_CENTER.x - 481, y: TOWN_CENTER.y + 212 });
export const TOWN_ARMOR_SELLER_POSITION = Object.freeze({ x: TOWN_ARMOR_SELLER_STALL.x, y: TOWN_ARMOR_SELLER_STALL.y + 50 });
/** As the Card Seller's. */
export const TOWN_GEAR_SELLER_REACH = 60;
export const TOWN_GEAR_SELLER_SERVER_REACH = 100;
/**
 * A gap in the log fence east of the Inn: the square's way out east,
 * to the river's crossing in the north-east and the Copper Hills past it. The fence's middle log section on that
 * side, and its collider, are left out (town-village.ts).
 */
export const TOWN_EAST_FENCE_GAP = Object.freeze({ left: TOWN_CENTER.x + 900, right: TOWN_CENTER.x + 960, top: TOWN_CENTER.y + 140, bottom: TOWN_CENTER.y + 310 });
/**
 * Just outside the gap, where the village's tall tree stood in the way out (town-village.ts leaves it out, its
 * shadow and its trunk with it): open grass, so whoever walks through the gap stays in view.
 */
export const TOWN_EAST_FENCE_GAP_OUTSIDE = Object.freeze({
  left: TOWN_EAST_FENCE_GAP.left + 45, right: TOWN_EAST_FENCE_GAP.right + 80, top: TOWN_EAST_FENCE_GAP.top, bottom: TOWN_EAST_FENCE_GAP.bottom + 110,
});
/**
 * The sign to the Copper Hills: just outside the gap, below its south post, pointing east the way to go. It stands
 * clear of the Inn, the yard's cart and the fence, so its plank reads whole from the square and from the gap.
 */
export const TOWN_HILLS_SIGNPOST_POSITION = Object.freeze({ x: TOWN_EAST_FENCE_GAP.right + 50, y: TOWN_EAST_FENCE_GAP.bottom + 62 });
/**
 * The stone bridge over the river north-east of the gap, where the river runs as narrow as under the village's
 * west bridge: the same two deck halves, the miners' track crossing it. Its middle, and the deck's reach either way.
 */
export const TOWN_EAST_BRIDGE = Object.freeze({ x: TOWN_CENTER.x + 1_314, y: TOWN_CENTER.y - 234, halfWidth: 154, halfHeight: 77 });
/**
 * The way up from the gap to the bridge, and off its far end: the trees that stood there hid whoever walked the
 * track, so they are gone (town-village.ts), as the one outside the gap is.
 */
export const TOWN_EAST_BRIDGE_APPROACHES = Object.freeze([
  Object.freeze({ left: TOWN_EAST_BRIDGE.x - 334, right: TOWN_EAST_BRIDGE.x - 114, top: TOWN_EAST_BRIDGE.y - 66, bottom: TOWN_EAST_BRIDGE.y + 334 }),
  Object.freeze({ left: TOWN_EAST_BRIDGE.x + 126, right: TOWN_EAST_BRIDGE.x + 446, top: TOWN_EAST_BRIDGE.y - 26, bottom: TOWN_EAST_BRIDGE.y + 114 }),
]);

/** The whole row of rooms, walls and all. */
const TOWN_INTERIOR_AREA = Object.freeze({
  left: Math.min(...TOWN_DOORS.map(door => door.room.left)) - 200, right: Math.max(...TOWN_DOORS.map(door => door.room.right)) + 200,
  top: Math.min(...TOWN_DOORS.map(door => door.room.top)) - 400, bottom: Math.max(...TOWN_DOORS.map(door => door.room.bottom)) + 200,
});
/** Nothing grows this close to the rooms: from inside one there is only dark around it. Short of the market's cell. */
export const TOWN_INTERIOR_MARGIN = 1_800;
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
const TOWN_PROP_AREA = Object.freeze({
  left: TOWN_WALK_AREA.left - 2_000, right: TOWN_WALK_AREA.right + 2_000,
  top: Math.max(0, TOWN_WALK_AREA.top - 2_000), bottom: TOWN_WALK_AREA.bottom + 2_000,
});
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
/**
 * How far round the Copper Hills their own scenery reaches (src/game/town-world.ts lays it: the trees that frame
 * them, the hedges between the veins, the grass between the outcrops): the countryside's props keep out of it.
 */
export const TOWN_HILLS_BORDER = 330;
/** Nor any loose stones this near them: beside the ore rocks, a plain stone reads as a rock with nothing in it. */
export const TOWN_HILLS_STONE_FREE = 1_200;
/** How far round Timberwood its own ground reaches (town-world.ts lays its cover): the countryside's props keep out of it. */
export const TOWN_GROVE_BORDER = 150;
/** How far round the market square and its road the countryside's standing props keep, so nothing hides them. */
const TOWN_EXCHANGE_CLEAR = 90;
/** Where the portals stand: the countryside keeps clear of them. */
const PORTAL_CLEARINGS = [TOWN_TRAVEL_PORTAL, TOWN_SOUL_PORTAL];
/** A chunk's scattered props, clear of the village, its portals, the rooms, the Copper Hills, Timberwood and the market square. */
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
    if (inTownVillage(x, y, 60) || inTownInteriors(x, y, TOWN_INTERIOR_MARGIN) || inTownHills(x, y, TOWN_HILLS_BORDER) || inTownGrove(x, y, TOWN_GROVE_BORDER)) continue;
    if ((kind === "stone" || kind === "stoneSmall") && inTownHills(x, y, TOWN_HILLS_STONE_FREE)) continue;
    if (onTownExchangeGround(x, y, kind === "grass" || kind === "flower" ? 30 : TOWN_EXCHANGE_CLEAR)) continue;
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
