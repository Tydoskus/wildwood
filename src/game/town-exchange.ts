import { TOWN_CENTER, TOWN_EXCHANGE_CENTER, TOWN_EXCHANGE_POSITION, TOWN_EXCHANGE_ROAD, TOWN_EXCHANGE_SIGNPOST_POSITION } from "../../shared/town";
import { MARKET_SPRITE_SCALE } from "./runtime/town/market-sheet";
import type { SoulSolid } from "./town-village";
import type { WorldDecor } from "./world";

/**
 * The Trade Chrysanthemum south of the village (shared/town.ts places it), its pieces from its own baked sheet
 * (market-sheet.ts):
 *
 * - the clerk's hall to the north, its steps down to the round plaza, and a gate over the road where it comes in;
 * - the plaza: a fountain in the middle, four curved pavilions round it (weapons and armour, crystals and arrows,
 *   ores, fish and timber), stone lanterns round it;
 * - the yards along the paths west and east: timber and fish west towards Timberwood, ores and crystal east
 *   towards the Copper Hills, each ending at a warehouse; the gear sellers' corners north of them, the fletchers'
 *   south-west;
 * - an avenue of banners and flower beds south to a stone lion.
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
/** Where a stall or a prop of a yard stands along its row. */
const row = (dx: number, y: number) => ({ x: TOWN_CENTER.x + dx, y });

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
  ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => [{ frame: "stone-lantern", ...plaza(sx * 470, sy * 250) }, { half: 12, up: 10 }] as const),
  ...[-1, 1].flatMap(side => [
    [{ frame: "stone-lantern", ...plaza(side * 660, -100) }, { half: 12, up: 10 }],
    [{ frame: "stone-lantern", ...plaza(side * 660, 110) }, { half: 12, up: 10 }],
  ] as const),
  // The avenue south: banners in pairs, flower beds and the lion.
  ...[360, 460, 560].flatMap(dy => [
    [{ frame: "banner", ...plaza(-130, dy) }, { half: 7, up: 7 }], [{ frame: "banner", ...plaza(130, dy) }, { half: 7, up: 7 }],
  ] as const),
  [{ frame: "flower-bed", ...plaza(-230, 650) }, { half: 64, up: 30 }],
  [{ frame: "flower-bed", ...plaza(230, 650) }, { half: 64, up: 30 }],
  [{ frame: "lion-statue", ...plaza(0, 700) }, { half: 36, up: 20 }],
  // West: timber and fish along the path, the warehouse at its end.
  [{ frame: "sign-timber", ...row(-800, PATH_NORTH) }, { half: 8, up: 6 }],
  [{ frame: "stall-timber", ...row(-980, PATH_NORTH) }, { half: 56, up: 30 }],
  [{ frame: "lumber-stack", ...row(-1_180, PATH_NORTH) }, { half: 64, up: 30 }],
  [{ frame: "stall-timber", ...row(-1_390, PATH_NORTH) }, { half: 56, up: 30 }],
  [{ frame: "lumber-stack", ...row(-1_590, PATH_NORTH) }, { half: 64, up: 30 }],
  [{ frame: "warehouse", ...row(-1_960, PATH_NORTH + 10) }, { half: 160, up: 160 }],
  [{ frame: "sign-fish", ...row(-800, PATH_SOUTH) }, { half: 8, up: 6 }],
  [{ frame: "stall-fish", ...row(-980, PATH_SOUTH) }, { half: 56, up: 30 }],
  [{ frame: "fish-tub", ...row(-1_150, PATH_SOUTH) }, { half: 30, up: 20 }],
  [{ frame: "stall-fish", ...row(-1_330, PATH_SOUTH) }, { half: 56, up: 30 }],
  [{ frame: "fish-tub", ...row(-1_500, PATH_SOUTH) }, { half: 30, up: 20 }],
  // East: ores and crystal, the warehouse at its end.
  [{ frame: "sign-ore", ...row(660, PATH_NORTH) }, { half: 8, up: 6 }],
  [{ frame: "stall-ore", ...row(840, PATH_NORTH) }, { half: 56, up: 30 }],
  [{ frame: "ore-cart", ...row(1_030, PATH_NORTH) }, { half: 50, up: 26 }],
  [{ frame: "stall-crystal", ...row(1_220, PATH_NORTH) }, { half: 56, up: 30 }],
  [{ frame: "warehouse", ...row(1_560, PATH_NORTH + 10) }, { half: 160, up: 160 }],
  [{ frame: "sign-ore", ...row(660, PATH_SOUTH) }, { half: 8, up: 6 }],
  [{ frame: "stall-crystal", ...row(840, PATH_SOUTH) }, { half: 56, up: 30 }],
  [{ frame: "ore-cart", ...row(1_030, PATH_SOUTH) }, { half: 50, up: 26 }],
  [{ frame: "stall-ore", ...row(1_220, PATH_SOUTH) }, { half: 56, up: 30 }],
  [{ frame: "ore-cart", ...row(1_410, PATH_SOUTH) }, { half: 50, up: 26 }],
  // The gear sellers' corners either side of the hall, and the fletchers' south-west.
  [{ frame: "sign-weapons", ...at(-820, 2_590) }, { half: 8, up: 6 }],
  [{ frame: "stall-weapons", ...at(-1_000, 2_600) }, { half: 56, up: 30 }],
  [{ frame: "weapon-rack", ...at(-1_180, 2_610) }, { half: 46, up: 20 }],
  [{ frame: "stall-weapons", ...at(-1_360, 2_600) }, { half: 56, up: 30 }],
  [{ frame: "sign-armor", ...at(680, 2_590) }, { half: 8, up: 6 }],
  [{ frame: "stall-armor", ...at(860, 2_600) }, { half: 56, up: 30 }],
  [{ frame: "armor-stand", ...at(1_040, 2_610) }, { half: 26, up: 20 }],
  [{ frame: "stall-armor", ...at(1_220, 2_600) }, { half: 56, up: 30 }],
  [{ frame: "sign-arrows", ...at(-820, 3_490) }, { half: 8, up: 6 }],
  [{ frame: "stall-arrows", ...at(-1_000, 3_510) }, { half: 56, up: 30 }],
  [{ frame: "arrow-barrel", ...at(-1_170, 3_520) }, { half: 22, up: 16 }],
  [{ frame: "stall-arrows", ...at(-1_340, 3_510) }, { half: 56, up: 30 }],
];

/** The countryside's own trees round the market, and benches on the grass by the plaza. */
const TREES: readonly (readonly [frame: string, dx: number, dy: number])[] = [
  ["4", -1_550, 2_420], ["6", 1_450, 2_420], ["6", -2_150, 2_620], ["4", 1_780, 2_640], ["4", -1_250, 3_780], ["6", 1_000, 3_700],
  ["6", -430, 3_740], ["4", 290, 3_740], ["4", 700, 3_550], ["6", -2_100, 3_510],
];
const BENCHES: readonly (readonly [frame: string, dx: number, dy: number])[] = [
  ["41", -620, 3_460], ["252", 480, 3_460], ["41", 860, 3_560],
];

const sprite = ({ frame, x, y, flip, s = 1 }: Piece): WorldDecor => ({ type: "soulProp", sheet: "market", frame, s: s * MARKET_SPRITE_SCALE, x, y, flip });
const village = (frame: string, x: number, y: number, s = 1): WorldDecor => ({ type: "soulProp", sheet: "village", frame, s, x, y });

export const TOWN_EXCHANGE_DECOR: readonly WorldDecor[] = [
  ...PIECES.map(([piece]) => sprite(piece)),
  ...TREES.map(([frame, dx, dy]) => { const point = at(dx, dy); return village(frame, point.x, point.y, .8); }),
  ...BENCHES.map(([frame, dx, dy]) => { const point = at(dx, dy); return village(frame, point.x, point.y); }),
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
  ...BENCHES.map(([, dx, dy]) => { const point = at(dx, dy); return box(point.x - 50, point.y - 14, point.x + 50, point.y + 4); }),
  box(TOWN_EXCHANGE_SIGNPOST_POSITION.x - 8, TOWN_EXCHANGE_SIGNPOST_POSITION.y - 8, TOWN_EXCHANGE_SIGNPOST_POSITION.x + 8, TOWN_EXCHANGE_SIGNPOST_POSITION.y + 4),
];
