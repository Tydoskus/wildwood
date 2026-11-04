import { TOWN_CENTER, TOWN_EXCHANGE_CENTER, TOWN_EXCHANGE_POSITION, TOWN_EXCHANGE_ROAD, TOWN_EXCHANGE_SIGNPOST_POSITION } from "../../shared/town";
import { MARKET_SPRITE_SCALE } from "./runtime/town/market-sheet";
import type { SoulSolid } from "./town-village";
import type { WorldDecor } from "./world";

/**
 * The Trade Chrysanthemum south of the village (shared/town.ts places it), its pieces from its own baked sheet
 * (market-sheet.ts):
 *
 * - the clerk's hall to the north, its steps down to the round plaza, the road paved in under a gate, and a street
 *   along the hall's front with the weapon sellers west of the hall and the armourers east;
 * - the plaza: a fountain in the middle, four curved pavilions round it (weapons and armour, crystals and arrows,
 *   ores, fish and timber), stone lanterns round it;
 * - the yards along the paths west and east: timber and fish west towards Timberwood, ores and crystal east
 *   towards the Copper Hills, each ending at a warehouse;
 * - an avenue of banners south, a street across it with the fletchers west and benches either side, and a guardian
 *   lion either side of the avenue's end.
 */
export const TOWN_EXCHANGE_LABEL = "Trade Chrysanthemum";

/** A point measured from the village's fountain, as the grounds are laid out. */
const at = (dx: number, dy: number) => ({ x: TOWN_CENTER.x + dx, y: TOWN_CENTER.y + dy });
const CX = TOWN_EXCHANGE_CENTER.x, CY = TOWN_EXCHANGE_CENTER.y;
const plaza = (dx: number, dy: number) => ({ x: CX + dx, y: CY + dy });

type Piece = { frame: string; x: number; y: number; flip?: boolean; s?: number };
/** Its collider's half-width and how far it reaches up from the foot (0 for none). */
type Solid = { half: number; up: number };

/** The hall stands just behind the clerk; the road comes in under the gate down its last straight. */
const HALL = { x: TOWN_EXCHANGE_POSITION.x, y: TOWN_EXCHANGE_POSITION.y - 40 };
const ROAD_IN = TOWN_EXCHANGE_ROAD[TOWN_EXCHANGE_ROAD.length - 1];
const GATE = { x: ROAD_IN.x + ROAD_IN.w / 2, y: HALL.y - 140 };
/** The fountain's foot, the front edge of its basin, whose middle is the plaza's. */
const FOUNTAIN = { x: CX, y: CY + 90, rx: 180, ry: 90 };

/** The ring pieces' size here, and where one stands: its foot, given at the sheet's size from the fountain. */
const RING_SCALE = 1.3;
const onRing = (dx: number, dy: number) => plaza(dx * RING_SCALE, dy * RING_SCALE);

/** Where each yard's stalls stand: the row north of its path, and the row south. */
const PATH_NORTH = CY - 100, PATH_SOUTH = CY + 230;
/** Where things stand along the streets by the hall's front and across the avenue: just north of each. */
const FRONT_ROW = HALL.y - 15, SOUTH_ROW = CY + 600;
/** Where a stall or a prop of a yard stands along its row. */
const row = (dx: number, y: number) => ({ x: TOWN_CENTER.x + dx, y });
const LANTERN: Solid = { half: 12, up: 10 }, BANNER: Solid = { half: 7, up: 7 }, SIGN: Solid = { half: 8, up: 6 }, STALL: Solid = { half: 56, up: 30 };

const PIECES: readonly (readonly [Piece, Solid])[] = [
  [{ frame: "hall", ...HALL }, { half: 395, up: 330 }],
  [{ frame: "gate", ...GATE }, { half: 0, up: 0 }],
  [{ frame: "fountain", ...FOUNTAIN }, { half: 0, up: 0 }],
  // The pavilions are drawn as parts of rings round the fountain, here a third larger: each
  // foot sits so its ring's middle is the fountain's (scripts/art/market-plaza.ts).
  [{ frame: "pavilion-nw", ...onRing(-217, -83), s: RING_SCALE }, { half: 140, up: 60 }],
  [{ frame: "pavilion-ne", ...onRing(217, -83), s: RING_SCALE }, { half: 140, up: 60 }],
  [{ frame: "pavilion-sw", ...onRing(-217, 134), s: RING_SCALE }, { half: 140, up: 60 }],
  [{ frame: "pavilion-se", ...onRing(217, 134), s: RING_SCALE }, { half: 140, up: 60 }],
  // Stone lanterns round the plaza between the ways out, and either side of where the paths leave it.
  ...[-1, 1].flatMap(side => [
    [{ frame: "stone-lantern", ...plaza(side * 420, -265) }, LANTERN],
    [{ frame: "stone-lantern", ...plaza(side * 470, 250) }, LANTERN],
  ] as const),
  ...[-1, 1].flatMap(side => [
    [{ frame: "stone-lantern", ...plaza(side * 660, -100) }, LANTERN],
    [{ frame: "stone-lantern", ...plaza(side * 660, 150) }, LANTERN],
  ] as const),
  // The avenue south: banners in pairs down to the street across it, and a lion either side of its end.
  ...[420, 590].flatMap(dy => [-130, 130].map(dx => [{ frame: "banner", ...plaza(dx, dy), s: .95 }, BANNER] as const)),
  [{ frame: "lion-statue", ...plaza(-150, 830) }, { half: 36, up: 20 }],
  [{ frame: "lion-statue", ...plaza(150, 830), flip: true }, { half: 36, up: 20 }],
  // West: timber and fish along the path, the warehouse at its end.
  [{ frame: "sign-timber", ...row(-840, PATH_NORTH) }, SIGN],
  [{ frame: "stall-timber", ...row(-980, PATH_NORTH) }, STALL],
  [{ frame: "lumber-stack", ...row(-1_180, PATH_NORTH) }, { half: 64, up: 30 }],
  [{ frame: "stall-timber", ...row(-1_390, PATH_NORTH) }, STALL],
  [{ frame: "lumber-stack", ...row(-1_590, PATH_NORTH) }, { half: 64, up: 30 }],
  [{ frame: "warehouse", ...row(-1_960, PATH_NORTH + 10) }, { half: 160, up: 160 }],
  [{ frame: "sign-fish", ...row(-840, PATH_SOUTH) }, SIGN],
  [{ frame: "stall-fish", ...row(-980, PATH_SOUTH) }, STALL],
  [{ frame: "fish-tub", ...row(-1_150, PATH_SOUTH) }, { half: 30, up: 20 }],
  [{ frame: "stall-fish", ...row(-1_330, PATH_SOUTH) }, STALL],
  [{ frame: "fish-tub", ...row(-1_500, PATH_SOUTH) }, { half: 30, up: 20 }],
  // East: ores north of the path and crystal south, the warehouse at its end.
  [{ frame: "sign-ore", ...row(700, PATH_NORTH) }, SIGN],
  [{ frame: "stall-ore", ...row(840, PATH_NORTH) }, STALL],
  [{ frame: "ore-cart", ...row(1_030, PATH_NORTH) }, { half: 50, up: 26 }],
  [{ frame: "stall-ore", ...row(1_220, PATH_NORTH) }, STALL],
  [{ frame: "warehouse", ...row(1_560, PATH_NORTH + 10) }, { half: 160, up: 160 }],
  [{ frame: "sign-crystal", ...row(700, PATH_SOUTH) }, SIGN],
  [{ frame: "stall-crystal", ...row(840, PATH_SOUTH) }, STALL],
  [{ frame: "crystal-crate", ...row(1_030, PATH_SOUTH) }, { half: 30, up: 18 }],
  [{ frame: "stall-crystal", ...row(1_220, PATH_SOUTH) }, STALL],
  [{ frame: "crystal-crate", ...row(1_410, PATH_SOUTH) }, { half: 30, up: 18 }],
  // The gear sellers along the hall's front street, weapons west of the hall and armour east.
  [{ frame: "sign-weapons", ...row(-820, FRONT_ROW - 10) }, SIGN],
  [{ frame: "stall-weapons", ...row(-1_000, FRONT_ROW) }, STALL],
  [{ frame: "weapon-rack", ...row(-1_180, FRONT_ROW + 5) }, { half: 46, up: 20 }],
  [{ frame: "stall-weapons", ...row(-1_360, FRONT_ROW) }, STALL],
  [{ frame: "sign-armor", ...row(680, FRONT_ROW - 10) }, SIGN],
  [{ frame: "stall-armor", ...row(860, FRONT_ROW) }, STALL],
  [{ frame: "armor-stand", ...row(1_040, FRONT_ROW + 5) }, { half: 26, up: 20 }],
  [{ frame: "stall-armor", ...row(1_220, FRONT_ROW) }, STALL],
  // The street across the avenue: the fletchers west, benches either side of the avenue, a flower bed at each end.
  [{ frame: "sign-arrows", ...row(-820, SOUTH_ROW - 10) }, SIGN],
  [{ frame: "stall-arrows", ...row(-1_000, SOUTH_ROW) }, STALL],
  [{ frame: "arrow-barrel", ...row(-1_170, SOUTH_ROW + 10) }, { half: 22, up: 16 }],
  [{ frame: "stall-arrows", ...row(-1_340, SOUTH_ROW) }, STALL],
  ...[-540, -300, 300, 540].map(dx => [{ frame: "bench", ...plaza(dx, 600) }, { half: 48, up: 14 }] as const),
  ...[-1, 1].map(side => [{ frame: "flower-bed", ...plaza(side * 1_450, 700) }, { half: 64, up: 30 }] as const),
];

/** The countryside's own trees round the market. */
const TREES: readonly (readonly [frame: string, dx: number, dy: number])[] = [
  ["4", -1_550, 2_420], ["6", 1_450, 2_420], ["6", -2_150, 2_620], ["4", 1_780, 2_640], ["6", -2_100, 3_510], ["4", 760, 3_590],
  ["4", -1_150, 4_000], ["6", -560, 4_060], ["6", 420, 4_060], ["4", 1_060, 4_000],
];

const sprite = ({ frame, x, y, flip, s = 1 }: Piece): WorldDecor => ({ type: "soulProp", sheet: "market", frame, s: s * MARKET_SPRITE_SCALE, x, y, flip });
const village = (frame: string, x: number, y: number, s = 1): WorldDecor => ({ type: "soulProp", sheet: "village", frame, s, x, y });

export const TOWN_EXCHANGE_DECOR: readonly WorldDecor[] = [
  ...PIECES.map(([piece]) => sprite(piece)),
  ...TREES.map(([frame, dx, dy]) => { const point = at(dx, dy); return village(frame, point.x, point.y, .8); }),
  { type: "soulProp", frame: "", s: 1, ...TOWN_EXCHANGE_SIGNPOST_POSITION, signpost: "Trade\nChrysanthemum", flip: true },
  { type: "station", x: TOWN_EXCHANGE_POSITION.x, y: TOWN_EXCHANGE_POSITION.y, s: 1, label: TOWN_EXCHANGE_LABEL },
];

const box = (left: number, top: number, right: number, bottom: number): SoulSolid =>
  ({ xs: [left, right, right, left], ys: [top, top, bottom, bottom], left, top, right, bottom });

/** The fountain's kerb as a many-sided outline, a little inside its drawn edge. */
const fountainSolid = (): SoulSolid => {
  const xs: number[] = [], ys: number[] = [], cy = FOUNTAIN.y - FOUNTAIN.ry;
  for (let index = 0; index < 20; index++) {
    const angle = index / 20 * Math.PI * 2;
    xs.push(FOUNTAIN.x + Math.cos(angle) * (FOUNTAIN.rx - 10));
    ys.push(cy + Math.sin(angle) * (FOUNTAIN.ry - 14));
  }
  return { xs, ys, left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
};

/** What a player cannot walk through: the buildings, the fountain, the pavilions' counters and everything standing about. */
export const TOWN_EXCHANGE_SOLIDS: readonly SoulSolid[] = [
  ...PIECES.filter(([, solid]) => solid.half > 0).map(([piece, solid]) => box(piece.x - solid.half, piece.y - solid.up, piece.x + solid.half, piece.y + 4)),
  ...[-82, 82].map(side => box(GATE.x + side - 14, GATE.y - 10, GATE.x + side + 14, GATE.y + 4)),
  fountainSolid(),
  ...TREES.map(([, dx, dy]) => { const point = at(dx, dy); return box(point.x - 14, point.y - 10, point.x + 14, point.y + 4); }),
  box(TOWN_EXCHANGE_SIGNPOST_POSITION.x - 8, TOWN_EXCHANGE_SIGNPOST_POSITION.y - 8, TOWN_EXCHANGE_SIGNPOST_POSITION.x + 8, TOWN_EXCHANGE_SIGNPOST_POSITION.y + 4),
];
