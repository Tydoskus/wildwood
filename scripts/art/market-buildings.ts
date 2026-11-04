// The market's buildings and its first props, baked into the market's sprite sheet: the exchange hall, the gate,
// the fountain, the banner and the warehouse. Each draws from its foot, in world units.
import { at, block, bloom, CLOTH, crest, drum, GILT, GOLD, groundShadow, ink, LACQUER, OUTLINE, PALE_WOOD, post, SHADOW, STONE, TILE, WHITE_BLOOM,
  WOOD } from "./market-paint";
import { crate, hangingBanner, paperLantern, sack } from "./market-goods";
import { stoneLantern } from "./market-yard";

/** A banner pole: a charcoal cloth, gold-trimmed, with a gold chrysanthemum on it, hung from a crossbar. */
export function drawBanner(c: CanvasRenderingContext2D) {
  c.fillStyle = "rgba(20,14,8,.22)";
  c.beginPath(); c.ellipse(0, -2, 14, 5, 0, 0, Math.PI * 2); c.fill();
  c.lineJoin = "round";
  c.lineWidth = 3; c.strokeStyle = OUTLINE;
  // The pole and its gold cap.
  c.fillStyle = "#8a5d36";
  c.beginPath(); c.rect(-4, -138, 8, 138); c.fill(); c.stroke();
  c.fillStyle = "#e9b23a";
  c.beginPath(); c.arc(0, -142, 6, 0, Math.PI * 2); c.fill(); c.stroke();
  c.fillStyle = "#8a5d36";
  c.beginPath(); c.rect(-24, -130, 48, 6); c.fill(); c.stroke();
  // The cloth, swallow-tailed.
  c.fillStyle = "#2a2b2f";
  c.beginPath(); c.moveTo(-20, -124); c.lineTo(20, -124); c.lineTo(20, -52); c.lineTo(0, -62); c.lineTo(-20, -52); c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = "#d9a63a"; c.lineWidth = 2;
  c.beginPath(); c.moveTo(-15, -118); c.lineTo(15, -118); c.lineTo(15, -59); c.lineTo(0, -67); c.lineTo(-15, -59); c.closePath(); c.stroke();
  bloom(c, 0, -94, 13, GOLD);
}

/** A tiled roof's shape: its eave flat to `flat` then sweeping up to tips at `half`, its ridge `ridgeHalf` wide. */
type RoofShape = { half: number; flat: number; eave: number; tip: number; ridgeHalf: number; ridge: number; fascia: number };

/** Traces the eave from one tip to the other (the pen at the first), `drop` below the tiles' edge along the flat. */
function eaveEdge(c: CanvasRenderingContext2D, r: RoofShape, drop: number, leftward: boolean) {
  const s = leftward ? -1 : 1, cx = r.flat + (r.half - r.flat) * .58;
  c.quadraticCurveTo(-s * cx, r.eave - 4 + drop, -s * r.flat, r.eave + drop);
  c.lineTo(s * r.flat, r.eave + drop);
  c.quadraticCurveTo(s * cx, r.eave - 4 + drop, s * r.half, r.tip);
}

function roofSlope(c: CanvasRenderingContext2D, r: RoofShape) {
  const hx = (r.ridgeHalf + r.half) / 2;
  c.beginPath(); c.moveTo(-r.half, r.tip);
  c.quadraticCurveTo(-hx, r.tip + 2, -r.ridgeHalf, r.ridge); c.lineTo(r.ridgeHalf, r.ridge); c.quadraticCurveTo(hx, r.tip + 2, r.half, r.tip);
  eaveEdge(c, r, 0, true); c.closePath();
}

/** A tiled roof centred on x: rafters under its eave down to `wallTop`, tile rows, a gilt eave curling up at its ends
 *  and a ridge with curled ends unless it is a skirt roof tucked under a wall. */
function tiledRoof(c: CanvasRenderingContext2D, x: number, r: RoofShape, wallTop: number | null, ridge: boolean) {
  at(c, x, 0, 0, () => {
    if (wallTop !== null) {
      const under = () => {
        c.beginPath(); c.moveTo(-r.half, r.tip); eaveEdge(c, r, r.fascia, false);
        c.lineTo(r.half - 12, wallTop); c.lineTo(-r.half + 12, wallTop); c.closePath();
      };
      under(); c.fillStyle = "#241c19"; c.fill();
      c.save(); c.clip();
      c.beginPath();
      for (let rafter = -r.half; rafter <= r.half; rafter += 11) {
        c.moveTo(rafter, wallTop); c.lineTo(rafter * (Math.abs(rafter) > r.flat ? 1.1 : 1), r.tip - 10);
      }
      c.lineWidth = 4.5; c.strokeStyle = "#4a3123"; c.stroke();
      c.restore();
      under(); c.lineWidth = 2.5; c.strokeStyle = OUTLINE; c.stroke();
    }
    roofSlope(c, r); c.fillStyle = TILE.base; c.fill();
    c.save(); c.clip();
    const k = r.ridgeHalf / r.half;
    for (let row = -r.half - 13; row <= r.half + 13; row += 13) {
      c.beginPath(); c.moveTo(row * k - 3, r.ridge - 2); c.lineTo(row - 4, r.eave + 4);
      c.lineWidth = 3.5; c.strokeStyle = TILE.light; c.stroke();
      c.beginPath(); c.moveTo(row * k + 4, r.ridge - 2); c.lineTo(row + 6, r.eave + 4);
      c.lineWidth = 2; c.strokeStyle = TILE.dark; c.stroke();
    }
    c.restore();
    roofSlope(c, r); c.lineWidth = 3; c.strokeStyle = OUTLINE; c.stroke();
    const fascia = () => { c.beginPath(); c.moveTo(-r.half, r.tip); eaveEdge(c, r, r.fascia, false); eaveEdge(c, r, 0, true); c.closePath(); };
    fascia(); c.fillStyle = TILE.dark; c.fill();
    c.beginPath(); c.moveTo(-r.half, r.tip); eaveEdge(c, r, r.fascia * .75, false);
    c.lineWidth = 3; c.strokeStyle = GILT.base; c.stroke();
    fascia(); c.lineWidth = 2.5; c.strokeStyle = OUTLINE; c.stroke();
    for (let disc = -r.flat + 7; disc <= r.flat - 7; disc += 13) {
      c.beginPath(); c.arc(disc, r.eave + r.fascia * .35, Math.min(3.5, r.fascia * .3), 0, Math.PI * 2); ink(c, TILE.light, 1);
    }
    for (const side of [-1, 1]) {
      c.beginPath(); c.ellipse(side * (r.half - 5), r.tip - 1, 8, 4.5, side * -.55, 0, Math.PI * 2);
      ink(c, GILT.base, 2);
    }
    if (!ridge) return;
    const rh = r.ridgeHalf, top = r.ridge;
    for (const side of [-1, 1]) {
      c.beginPath(); c.moveTo(side * (rh - 4), top - 12); c.quadraticCurveTo(side * (rh + 18), top - 14, side * (rh + 26), top - 27);
      c.quadraticCurveTo(side * (rh + 35), top - 12, side * (rh + 18), top + 4); c.lineTo(side * (rh - 4), top + 2); c.closePath();
      ink(c, TILE.base, 2.5);
      c.beginPath(); c.arc(side * (rh + 25), top - 25, 3, 0, Math.PI * 2); ink(c, GILT.base, 1.5);
    }
    block(c, -rh - 6, top - 12, (rh + 6) * 2, 14, TILE, 2.5);
    block(c, -rh, top - 6, rh * 2, 3, GILT, 1);
  });
}

/** A lattice window lit warm from inside, its top left at (x, y). */
function latticeWindow(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  block(c, x - 4, y - 4, w + 8, h + 8, WOOD, 2);
  c.fillStyle = "#f0a94e"; c.fillRect(x, y, w, h);
  const glow = c.createRadialGradient(x + w / 2, y + h * .6, 2, x + w / 2, y + h * .6, Math.max(w, h) * .7);
  glow.addColorStop(0, "#ffe6a3"); glow.addColorStop(1, "rgba(255,214,140,0)");
  c.fillStyle = glow; c.fillRect(x, y, w, h);
  c.beginPath();
  for (let lx = x + 9; lx < x + w - 2; lx += 9) { c.moveTo(lx, y); c.lineTo(lx, y + h); }
  for (let ly = y + 9; ly < y + h - 2; ly += 9) { c.moveTo(x, ly); c.lineTo(x + w, ly); }
  c.lineWidth = 2; c.strokeStyle = WOOD.base; c.stroke();
  c.beginPath(); c.rect(x, y, w, h); c.lineWidth = 2; c.strokeStyle = OUTLINE; c.stroke();
}

/** A long stone planter box heaped with yellow and white chrysanthemums, its foot's middle at (x, y). */
function longPlanter(c: CanvasRenderingContext2D, x: number, y: number, w: number) {
  c.beginPath(); c.rect(x - w / 2, y - 27, w, 7); ink(c, STONE.light, 2.5);
  c.beginPath(); c.rect(x - w / 2 + 6, y - 26, w - 12, 4); ink(c, "#5b3e2a", 1.5);
  const rows: [number, number, number][] = [];
  for (let i = 0; i < 5; i++) rows.push([x + (i - 2) * w * .18, y - 33, i]);
  for (let i = 0; i < 4; i++) rows.push([x + (i - 1.5) * w * .2, y - 25, i + 1]);
  c.fillStyle = "#3f6e35"; c.strokeStyle = OUTLINE; c.lineWidth = 1.5;
  for (const [bx, by] of rows) for (const side of [-1, 1]) {
    c.beginPath(); c.ellipse(bx + side * 8, by + 4, 8, 3.5, side * -.4, 0, Math.PI * 2); c.fill(); c.stroke();
  }
  for (const [bx, by, i] of rows) bloom(c, bx, by, 11, i % 2 ? WHITE_BLOOM : GOLD);
  block(c, x - w / 2, y - 20, w, 20, STONE, 2.5);
  c.beginPath(); c.rect(x - w / 2 + 8, y - 16, w - 16, 11); ink(c, STONE.dark, 1.5);
  crest(c, x, y - 10.5, 4);
}

const WING_POSTS = [158, 226, 296, 366];
const WING_ROOF: RoofShape = { half: 124, flat: 70, eave: -155, tip: -180, ridgeHalf: 84, ridge: -200, fascia: 9 };
const SKIRT_ROOF: RoofShape = { half: 178, flat: 120, eave: -210, tip: -234, ridgeHalf: 128, ridge: -240, fascia: 10 };
const TOP_ROOF: RoofShape = { half: 206, flat: 120, eave: -302, tip: -336, ridgeHalf: 120, ridge: -350, fascia: 11 };

/** One wing: a long hall of lit lattice windows between lacquered posts, lanterns and banners under its eave. */
function hallWing(c: CanvasRenderingContext2D, side: number) {
  const x0 = side > 0 ? 150 : -388, w = 238;
  // The roof runs on behind the middle pavilion.
  c.save(); c.beginPath(); c.rect(side > 0 ? 150 : -400, -240, 250, 100); c.clip();
  tiledRoof(c, side * 270, WING_ROOF, -146, true);
  c.restore();
  c.beginPath(); c.rect(x0, -146, w, 92); c.fillStyle = WOOD.base; c.fill();
  c.lineWidth = 2.5; c.strokeStyle = OUTLINE; c.stroke();
  block(c, x0, -146, w, 10, WOOD, 2);
  block(c, x0 + 4, -140, w - 8, 3, GILT, 1);
  for (let i = 0; i < WING_POSTS.length - 1; i++) {
    const a = WING_POSTS[i], b = WING_POSTS[i + 1], left = side > 0 ? a : -b;
    latticeWindow(c, left + 12, -124, b - a - 24, 42);
    c.beginPath(); c.rect(left + 8, -76, b - a - 16, 18); ink(c, WOOD.dark, 1.5);
  }
  for (const px of [...WING_POSTS, 386]) {
    post(c, side * px, -146, -56, 7, LACQUER, 2.5);
    block(c, side * px - 8, -66, 16, 4, GILT, 1.5);
  }
  for (const px of [226, 296]) hangingBanner(c, side * px, -136, 16, 42, CLOTH.base);
  for (const px of [192, 331]) paperLantern(c, side * px, -146, 7);
}

/** The middle pavilion's ground floor: a lit doorway with a gold screen inside, lit lattice windows either side. */
function hallFront(c: CanvasRenderingContext2D) {
  c.beginPath(); c.rect(-150, -200, 300, 146); c.fillStyle = WOOD.base; c.fill();
  c.beginPath(); c.rect(-47, -188, 94, 134); c.fillStyle = SHADOW; c.fill();
  const glow = c.createRadialGradient(0, -90, 6, 0, -90, 90);
  glow.addColorStop(0, "rgba(255,190,100,.55)"); glow.addColorStop(1, "rgba(255,190,100,0)");
  c.fillStyle = glow; c.fillRect(-47, -188, 94, 134);
  c.beginPath(); c.rect(-34, -166, 68, 108); ink(c, "#7a6232", 2);
  c.save(); c.clip();
  bloom(c, 0, -112, 26, ["#93773c", "#a58744", "#b9994e", "#6b5428"]);
  c.restore();
  c.beginPath(); for (const lx of [-17, 0, 17]) { c.moveTo(lx, -166); c.lineTo(lx, -58); }
  c.lineWidth = 2; c.strokeStyle = "#2a2220"; c.stroke();
  c.fillStyle = "rgba(10,8,8,.35)"; c.fillRect(-47, -188, 94, 22);
  for (const side of [-1, 1]) latticeWindow(c, side * 41 - 5, -180, 10, 120);
  for (const side of [-1, 1]) {
    latticeWindow(c, side > 0 ? 70 : -134, -176, 64, 66);
    c.beginPath(); c.rect(side > 0 ? 68 : -136, -98, 68, 40); ink(c, WOOD.dark, 1.5);
    crest(c, side * 102, -78, 5);
  }
  for (const px of [-146, -56, 56, 146]) {
    post(c, px, -190, -58, 9, LACQUER, 2.5);
    block(c, px - 10, -182, 20, 5, GILT, 1.5);
    block(c, px - 10, -72, 20, 5, GILT, 1.5);
    c.beginPath(); c.rect(px - 13, -62, 26, 4); ink(c, STONE.light, 1.5);
    block(c, px - 13, -58, 26, 6, STONE, 1.5);
  }
  block(c, -158, -200, 316, 12, WOOD, 2.5);
  block(c, -150, -195, 300, 3, GILT, 1);
}

/** The upper floor: a lacquered railing, lit windows and the name board under the great roof. */
function hallUpper(c: CanvasRenderingContext2D) {
  c.beginPath(); c.rect(-124, -292, 248, 54); c.fillStyle = WOOD.base; c.fill();
  c.lineWidth = 2.5; c.strokeStyle = OUTLINE; c.stroke();
  for (const side of [-1, 1]) latticeWindow(c, side > 0 ? 72 : -114, -284, 42, 24);
  for (const px of [-122, -66, 66, 122]) post(c, px, -292, -240, 5, LACQUER, 2);
  block(c, -62, -290, 124, 36, GILT, 2.5);
  c.beginPath(); c.rect(-55, -283, 110, 22); ink(c, CLOTH.base, 1.5);
  for (const bx of [-30, 0, 30]) crest(c, bx, -272, 7);
  block(c, -126, -254, 252, 4, LACQUER, 1.5);
  c.beginPath(); for (let bx = -120; bx <= 120; bx += 10) { c.moveTo(bx, -250); c.lineTo(bx, -241); }
  c.lineWidth = 3.5; c.strokeStyle = OUTLINE; c.stroke(); c.lineWidth = 2; c.strokeStyle = LACQUER.light; c.stroke();
}

/** The stone terrace the hall stands on, its stair down from the doorway, stone lanterns at its foot. */
function hallTerrace(c: CanvasRenderingContext2D) {
  c.beginPath(); c.rect(-394, -60, 788, 8); ink(c, STONE.light, 2.5);
  block(c, -394, -52, 788, 40, STONE, 2.5);
  c.beginPath();
  for (let jx = -360; jx < 394; jx += 52) { c.moveTo(jx, -52); c.lineTo(jx, -32); c.moveTo(jx + 26, -32); c.lineTo(jx + 26, -12); }
  c.moveTo(-394, -32); c.lineTo(394, -32);
  c.lineWidth = 1.5; c.strokeStyle = OUTLINE; c.stroke();
}

function hallStair(c: CanvasRenderingContext2D) {
  for (let step = 3; step >= 0; step--) {
    const top = -13 * (step + 1);
    c.beginPath(); c.rect(-84, top, 168, 4); ink(c, STONE.light, 2);
    block(c, -84, top + 4, 168, 9, STONE, 2);
  }
  for (const side of [-1, 1]) {
    block(c, side > 0 ? 84 : -98, -58, 14, 58, STONE, 2.5);
    c.beginPath(); c.rect(side * 91 - 9, -66, 18, 8); ink(c, STONE.light, 2);
    c.beginPath(); c.arc(side * 91, -69, 4, 0, Math.PI * 2); ink(c, GILT.base, 1.5);
  }
}

/** The Grand Exchange: a two-storey pavilion with a great crest on its ridge, low wings either side, a stair down. */
export function drawHall(c: CanvasRenderingContext2D) {
  c.lineCap = "round";
  groundShadow(c, 0, -4, 396, 10);
  hallTerrace(c);
  for (const side of [-1, 1]) hallWing(c, side);
  hallUpper(c);
  tiledRoof(c, 0, TOP_ROOF, -292, true);
  hallFront(c);
  tiledRoof(c, 0, SKIRT_ROOF, null, false);
  for (const side of [-1, 1]) paperLantern(c, side * 102, -200, 9);
  bloom(c, 0, -358, 22, GOLD);
  hallStair(c);
  for (const side of [-1, 1]) {
    longPlanter(c, side * 270, -1, 112);
    at(c, side * 118, -1, 0, () => stoneLantern(c));
  }
}

/** The warehouse: plank walls under a tiled roof with a crested gable, its double doors open on crates and sacks. */
export function drawWarehouse(c: CanvasRenderingContext2D) {
  c.lineCap = "round";
  groundShadow(c, 0, -4, 166, 8);
  // The roof, its gable over the doors holding the crest.
  tiledRoof(c, 0, { half: 165, flat: 100, eave: -206, tip: -236, ridgeHalf: 104, ridge: -262, fascia: 10 }, -196, true);
  c.beginPath(); c.moveTo(-70, -206); c.lineTo(0, -282); c.lineTo(70, -206); c.closePath(); ink(c, WOOD.dark, 2.5);
  c.beginPath(); c.moveTo(-86, -198); c.quadraticCurveTo(-74, -206, -72, -214); c.lineTo(0, -292); c.lineTo(72, -214);
  c.quadraticCurveTo(74, -206, 86, -198); c.lineTo(80, -194); c.lineTo(0, -278); c.lineTo(-80, -194); c.closePath();
  ink(c, TILE.dark, 2.5);
  c.beginPath(); c.moveTo(-74, -205); c.lineTo(0, -284); c.lineTo(74, -205); c.lineWidth = 2; c.strokeStyle = GILT.base; c.stroke();
  c.beginPath(); c.arc(0, -294, 4, 0, Math.PI * 2); ink(c, GILT.base, 1.5);
  bloom(c, 0, -234, 20, GOLD);
  // Plank walls on a stone footing, lacquered corners, a lit window either side.
  c.beginPath(); c.rect(-148, -24, 296, 6); ink(c, STONE.light, 2.5);
  block(c, -150, -18, 300, 18, STONE, 2.5);
  c.beginPath(); c.rect(-138, -196, 276, 172); c.fillStyle = WOOD.base; c.fill();
  c.beginPath(); for (let px = -126; px < 138; px += 12) { c.moveTo(px, -196); c.lineTo(px, -24); }
  c.lineWidth = 1.5; c.strokeStyle = WOOD.dark; c.stroke();
  c.beginPath(); c.rect(-138, -196, 276, 172); c.lineWidth = 2.5; c.strokeStyle = OUTLINE; c.stroke();
  block(c, -138, -196, 276, 9, WOOD, 2);
  for (const side of [-1, 1]) {
    latticeWindow(c, side * 104 - 17, -172, 34, 26);
    post(c, side * 136, -196, -22, 8, LACQUER, 2.5);
    block(c, side * 136 - 9, -40, 18, 4, GILT, 1.5);
  }
  // The doorway: crates and sacks in the dark, the doors swung open.
  c.beginPath(); c.rect(-58, -152, 116, 130); c.fillStyle = SHADOW; c.fill();
  c.fillStyle = "#33271f"; c.fillRect(-58, -44, 116, 22);
  crate(c, -36, -30, 30, 26); crate(c, -34, -56, 26, 24); sack(c, 22, -28, 13); sack(c, 40, -30, 11); sack(c, 30, -48, 10);
  c.fillStyle = "rgba(10,8,8,.4)"; c.fillRect(-58, -152, 116, 26);
  for (const side of [-1, 1]) post(c, side * 62, -160, -22, 5, LACQUER, 2);
  block(c, -72, -164, 144, 12, WOOD, 2.5);
  block(c, -66, -159, 132, 3, GILT, 1);
  for (const side of [-1, 1]) {
    const door = () => {
      c.beginPath(); c.moveTo(side * 66, -154); c.lineTo(side * 98, -162); c.lineTo(side * 98, -6); c.lineTo(side * 66, -22); c.closePath();
    };
    door(); c.fillStyle = WOOD.base; c.fill();
    c.save(); door(); c.clip();
    c.beginPath(); for (const t of [.33, .66]) { c.moveTo(side * (66 + 32 * t), -170); c.lineTo(side * (66 + 32 * t), 0); }
    c.lineWidth = 1.5; c.strokeStyle = WOOD.dark; c.stroke();
    c.restore();
    door(); c.lineWidth = 2.5; c.strokeStyle = OUTLINE; c.stroke();
    for (const [y0, y1] of [[-132, -138], [-48, -40]]) {
      c.beginPath(); c.moveTo(side * 66, y0); c.lineTo(side * 98, y1); c.lineWidth = 6; c.strokeStyle = OUTLINE; c.stroke();
      c.lineWidth = 3.5; c.strokeStyle = GILT.dark; c.stroke();
    }
    c.beginPath(); c.arc(side * 90, -86, 4, 0, Math.PI * 2);
    c.lineWidth = 3.5; c.strokeStyle = OUTLINE; c.stroke(); c.lineWidth = 2; c.strokeStyle = GILT.base; c.stroke();
  }
  block(c, -64, -8, 128, 8, PALE_WOOD, 2.5);
  // Crates stacked outside on the right.
  crate(c, 116, 0, 30, 28); crate(c, 148, 0, 28, 26); crate(c, 130, -28, 28, 26);
  sack(c, 104, -1, 9);
}

/** The market's gate: two lacquered posts on stone, a beam through them and an upswept cap on top, the crest hung between. */
export function drawGate(c: CanvasRenderingContext2D) {
  c.lineCap = "round";
  // Nothing stands in the road's gap between x -64 and 64.
  for (const side of [-1, 1]) groundShadow(c, side * 86, -3, 22, 6);
  for (const side of [-1, 1]) {
    const x = side * 82;
    post(c, x, -244, -30, 9, LACQUER);
    block(c, x - 10, -60, 20, 6, GILT, 1.5);
    block(c, x - 10, -173, 20, 6, GILT, 1.5);
    // A stepped stone base.
    c.beginPath(); c.rect(x - 16, -16, 32, 5);
    ink(c, STONE.light, 2.5);
    block(c, x - 16, -11, 32, 11, STONE, 2.5);
    c.beginPath(); c.rect(x - 12, -36, 24, 6);
    ink(c, STONE.light, 2.5);
    block(c, x - 12, -30, 24, 16, STONE, 2.5);
    c.beginPath(); c.moveTo(x + side * 4, -11); c.lineTo(x + side * 4, 0); c.moveTo(x - 4, -30); c.lineTo(x - 4, -14);
    c.lineWidth = 1.5; c.strokeStyle = OUTLINE; c.stroke();
  }
  // The beam through both posts, its ends capped in gold, and the beam under the cap.
  block(c, -114, -192, 228, 16, WOOD, 2.5);
  for (const x of [-114, 104]) block(c, x, -192, 10, 16, GILT, 2);
  block(c, -118, -243, 236, 13, WOOD, 2.5);
  // The cap: a tiled beam whose ends sweep up, capped in gold.
  const cap = () => {
    c.beginPath(); c.moveTo(-128, -267);
    c.quadraticCurveTo(-74, -255, 0, -257); c.quadraticCurveTo(74, -255, 128, -267);
    c.lineTo(123, -253); c.quadraticCurveTo(72, -238, 0, -240); c.quadraticCurveTo(-72, -238, -123, -253); c.closePath();
  };
  cap(); c.fillStyle = TILE.base; c.fill();
  c.save(); c.clip();
  c.beginPath(); c.moveTo(-128, -265); c.quadraticCurveTo(-74, -253, 0, -255); c.quadraticCurveTo(74, -253, 128, -265);
  c.lineWidth = 4; c.strokeStyle = TILE.light; c.stroke();
  c.beginPath();
  for (let x = -100; x <= 100; x += 12) { c.moveTo(x, -262); c.lineTo(x, -236); }
  c.lineWidth = 1.5; c.strokeStyle = TILE.dark; c.stroke();
  c.fillStyle = GILT.base; c.fillRect(-132, -272, 22, 34); c.fillRect(110, -272, 22, 34);
  c.fillStyle = GILT.light; c.fillRect(-132, -272, 22, 8); c.fillRect(110, -272, 22, 8);
  c.beginPath(); c.moveTo(-110, -272); c.lineTo(-110, -238); c.moveTo(110, -272); c.lineTo(110, -238);
  c.lineWidth = 1.5; c.strokeStyle = OUTLINE; c.stroke();
  c.restore();
  cap(); c.lineWidth = 2.5; c.strokeStyle = OUTLINE; c.stroke();
  // The crest board, hung between the beams.
  block(c, -33, -238, 66, 56, GILT, 2.5);
  c.beginPath(); c.rect(-26, -231, 52, 42);
  ink(c, CLOTH.base, 2);
  bloom(c, 0, -210, 18, GOLD);
}

/** One arc of falling water: a pale stream with a darker edge, lit along its first half. */
function waterArc(c: CanvasRenderingContext2D, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, width = 6) {
  c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(cx, cy, x1, y1);
  c.lineWidth = width + 3; c.strokeStyle = "#3f8fc4"; c.stroke();
  c.lineWidth = width; c.strokeStyle = "#a6dcf4"; c.stroke();
  const mx = (x0 + 2 * cx + x1) / 4, my = (y0 + 2 * cy + y1) / 4;
  c.beginPath(); c.moveTo(x0, y0 - 1); c.quadraticCurveTo((x0 + cx) / 2, (y0 + cy) / 2 - 1, mx, my - 1);
  c.lineWidth = Math.max(1.5, width * .3); c.strokeStyle = "#ffffff"; c.stroke();
  // Where it lands: a ring and a few drops.
  c.beginPath(); c.ellipse(x1, y1 + 1, width + 6, (width + 6) * .4, 0, 0, Math.PI * 2);
  c.lineWidth = 1.5; c.strokeStyle = "#e6f6ff"; c.stroke();
  c.fillStyle = "#ffffff";
  for (const [dx, dy] of [[-7, -5], [6, -7], [1, -10]]) { c.beginPath(); c.arc(x1 + dx, y1 + dy, 1.5, 0, Math.PI * 2); c.fill(); }
}

/** A grand round fountain: a stone basin, a pedestal in its middle crowned with a great gold bloom pouring water. */
export function drawFountain(c: CanvasRenderingContext2D) {
  const rx = 180, ry = 90, cy = -90, wall = 22, irx = 160, iry = 74;
  c.lineCap = "round";
  groundShadow(c, 0, cy + wall + 2, rx + 6, ry + 4);
  // The kerb's front face in two courses of blocks, gold rosettes along it.
  c.beginPath(); c.ellipse(0, cy + wall, rx, ry, 0, 0, Math.PI); c.lineTo(-rx, cy); c.ellipse(0, cy, rx, ry, 0, Math.PI, 0, true); c.closePath();
  c.fillStyle = STONE.base; c.fill();
  c.save(); c.clip();
  c.beginPath(); c.ellipse(0, cy + wall, rx, ry, 0, 0, Math.PI); c.lineTo(-rx, cy + wall * .55); c.ellipse(0, cy + wall * .55, rx, ry, 0, Math.PI, 0, true);
  c.fillStyle = STONE.dark; c.fill();
  c.beginPath(); c.ellipse(0, cy + wall * .5, rx, ry, 0, 0, Math.PI);
  for (let joint = 0; joint <= 14; joint++) {
    const angle = joint / 14 * Math.PI, x = Math.cos(angle) * rx, y = cy + Math.sin(angle) * ry;
    c.moveTo(x, y); c.lineTo(x, y + wall * .5);
    const half = Math.cos(angle + Math.PI / 28) * rx, halfY = cy + Math.sin(angle + Math.PI / 28) * ry;
    if (joint < 14) { c.moveTo(half, halfY + wall * .5); c.lineTo(half, halfY + wall); }
  }
  c.lineWidth = 1.5; c.strokeStyle = OUTLINE; c.stroke();
  c.restore();
  c.beginPath(); c.ellipse(0, cy + wall, rx, ry, 0, 0, Math.PI); c.lineTo(-rx, cy); c.ellipse(0, cy, rx, ry, 0, Math.PI, 0, true); c.closePath();
  c.lineWidth = 3; c.strokeStyle = OUTLINE; c.stroke();
  for (const x of [-120, -60, 0, 60, 120]) crest(c, x, cy + ry * Math.sqrt(1 - (x / rx) ** 2) + wall * .27, 4.5);
  // The rim, cut into stones, and the inside wall behind the water.
  c.beginPath(); c.ellipse(0, cy, rx, ry, 0, 0, Math.PI * 2); c.ellipse(0, cy, irx, iry, 0, 0, Math.PI * 2);
  c.fillStyle = STONE.light; c.fill("evenodd");
  c.lineWidth = 3; c.strokeStyle = OUTLINE; c.stroke();
  c.beginPath();
  for (let stone = 0; stone < 24; stone++) {
    const angle = stone / 24 * Math.PI * 2 + .13, cos = Math.cos(angle), sin = Math.sin(angle);
    c.moveTo(cos * irx, cy + sin * iry); c.lineTo(cos * rx, cy + sin * ry);
  }
  c.lineWidth = 1.5; c.stroke();
  c.save();
  c.beginPath(); c.ellipse(0, cy, irx, iry, 0, 0, Math.PI * 2); c.clip();
  c.fillStyle = "#5d636a"; c.fill();
  // The water, deeper at the back, with rings and glints.
  c.beginPath(); c.ellipse(0, cy + 12, irx, iry, 0, 0, Math.PI * 2);
  c.fillStyle = "#3f9fd6"; c.fill();
  c.lineWidth = 1.5; c.strokeStyle = OUTLINE; c.stroke();
  c.beginPath(); c.ellipse(0, cy + 12, irx, iry, 0, 0, Math.PI * 2); c.ellipse(0, cy + 32, irx, iry, 0, 0, Math.PI * 2);
  c.fillStyle = "#3488c0"; c.fill("evenodd");
  c.lineWidth = 2; c.strokeStyle = "#86cdef";
  for (const [x, y, r] of [[0, -78, 62], [0, -78, 100], [0, -78, 132]]) {
    c.beginPath(); c.ellipse(x, y, r, r * .42, 0, .15 * Math.PI, .85 * Math.PI); c.stroke();
  }
  c.lineWidth = 2; c.strokeStyle = "#ffffff";
  for (const [x, y] of [[-118, -70], [-92, -40], [96, -46], [126, -82], [-40, -28], [44, -24]]) {
    c.beginPath(); c.moveTo(x - 6, y); c.quadraticCurveTo(x, y - 3, x + 6, y); c.stroke();
  }
  c.restore();
  // Streams falling behind the pedestal.
  for (const side of [-1, 1]) waterArc(c, side * 18, -198, side * 52, -232, side * 64, -134, 5);
  // The pedestal: two stepped drums in the water, a column with a gold band, a capital.
  c.beginPath(); c.ellipse(0, -80, 56, 18, 0, 0, Math.PI * 2); c.lineWidth = 2; c.strokeStyle = "#e6f6ff"; c.stroke();
  drum(c, 0, -100, 46, 16, 14, STONE, 2.5);
  drum(c, 0, -118, 32, 11, 12, STONE, 2.5);
  post(c, 0, -170, -116, 13, STONE, 2.5);
  block(c, -14, -150, 28, 6, GILT, 1.5);
  drum(c, 0, -174, 26, 9, 8, STONE, 2.5);
  // The sculpture: gold leaves under one great gold bloom, a jet rising from its heart.
  c.fillStyle = GILT.dark; c.strokeStyle = OUTLINE; c.lineWidth = 2;
  for (const [x, angle] of [[-34, .35], [34, -.35], [-20, .15], [20, -.15]]) {
    c.beginPath(); c.ellipse(x, -164, 18, 7, angle, 0, Math.PI * 2); c.fill(); c.stroke();
  }
  bloom(c, 0, -188, 44, GOLD);
  c.beginPath(); c.moveTo(0, -192); c.lineTo(0, -226);
  c.lineWidth = 7; c.strokeStyle = "#3f8fc4"; c.stroke();
  c.lineWidth = 4; c.strokeStyle = "#a6dcf4"; c.stroke();
  c.fillStyle = "#e6f6ff";
  for (const [x, y] of [[-6, -228], [6, -229], [0, -233], [-10, -222], [10, -223]]) { c.beginPath(); c.arc(x, y, 2, 0, Math.PI * 2); c.fill(); }
  // Streams pouring out to the sides and the front.
  for (const side of [-1, 1]) {
    waterArc(c, side * 40, -192, side * 104, -236, side * 134, -100, 6);
    waterArc(c, side * 24, -172, side * 66, -206, side * 78, -50, 6);
  }
}
