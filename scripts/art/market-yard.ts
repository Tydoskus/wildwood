// The market's smaller props: the yards' racks, stacks, carts, tubs, crates and barrels, the districts' signs, the
// guardian lions, stone lanterns, flower beds and benches. Each draws from its foot, in world units.
import { FISH_COLORS } from "../../src/game/runtime/town/fishing-runtime";
import { ORE_COLORS } from "../../src/game/runtime/town/ore-rock-renderer";
import {
  block, bloom, CLOTH, GILT, GOLD, groundShadow, ICE, ink, LEATHER, OUTLINE, PALE_WOOD, post, SHADOW, STEEL, STONE, WHITE_BLOOM, WOOD, type Tone,
} from "./market-paint";
import {
  arrow, bow, chestplate, crate, crystalCluster, FLETCHES, fish, helmet, logBack, logEnd, logLying, LOGS, oreLump, ORES, staff, starshard, sword,
} from "./market-goods";

type Paint = (c: CanvasRenderingContext2D) => void;
const IRON: Tone = { base: "#5d6670", light: "#87919b", dark: "#3d444c" };
const LION: Tone = { base: "#a9a49b", light: "#cdc8bf", dark: "#7f7970" };

/** A rack of two uprights and two rails holding a sword, a bow and a staff on end. */
const weaponRack: Paint = c => {
  groundShadow(c, 0, -3, 46, 5);
  for (const x of [-42, 42]) { post(c, x, -78, -4, 4, WOOD, 2.5); block(c, x - 7, -6, 14, 6, WOOD, 2); }
  c.beginPath(); c.rect(-46, -22, 92, 5); ink(c, PALE_WOOD.base, 2);
  block(c, -46, -17, 92, 6, WOOD, 2);
  sword(c, -22, -19, 66);
  bow(c, 2, -64, 90);
  staff(c, 26, -19, 98, 0, "#b06fe8");
  block(c, -46, -72, 92, 7, WOOD, 2.5);
  for (const x of [-42, 42]) { c.beginPath(); c.arc(x, -80, 4.5, 0, Math.PI * 2); ink(c, GILT.base, 2); }
};

/** A wooden mannequin on a cross foot wearing a plumed helmet and a chestplate over a leather skirt. */
const armorStand: Paint = c => {
  groundShadow(c, 0, -3, 26, 5);
  block(c, -24, -8, 48, 8, WOOD, 2);
  post(c, 0, -94, -8, 3.5, WOOD, 2);
  block(c, -20, -86, 40, 5, WOOD, 2);
  c.beginPath();
  for (const x of [-15, -7, 1, 9]) c.rect(x, -56, 7, 16);
  ink(c, LEATHER.base, 1.5);
  chestplate(c, 0, -54, 20);
  helmet(c, 0, -91, 12, "#d9452c");
};

/** Logs stacked five, four and three between two stakes, their ends showing their rings. */
const lumberStack: Paint = c => {
  groundShadow(c, 0, -3, 68, 7);
  const logs: [number, number, number][] = [];
  [[5, -13], [4, -34.5], [3, -56]].forEach(([count, y], row) => {
    for (let i = 0; i < count; i++) logs.push([(i - (count - 1) / 2) * 25, y, (row * 2 + i) % LOGS.length]);
  });
  for (const [x, y, wood] of logs) logBack(c, x, y, 12.5, 6, LOGS[wood]);
  for (const [x, y, wood] of logs) logEnd(c, x, y, 12.5, LOGS[wood]);
  for (const x of [-65, 65]) post(c, x, -42, 0, 2.5, WOOD, 2);
};

/** A mine cart on small iron wheels, heaped with ore of every kind. */
const oreCart: Paint = c => {
  groundShadow(c, 0, -3, 52, 6);
  const lumps: [number, number, number, number][] = [
    [-30, -46, 9, 0], [-9, -47, 10, 1], [14, -46, 9, 2], [34, -45, 8, 3], [-20, -55, 8, 2], [3, -57, 9, 0], [24, -55, 8, 1],
  ];
  for (const [x, y, s, ore] of lumps) oreLump(c, x, y, s, ORES[ore]);
  c.beginPath(); c.moveTo(-50, -48); c.lineTo(50, -48); c.lineTo(41, -14); c.lineTo(-41, -14); c.closePath();
  ink(c, PALE_WOOD.base, 2.5);
  c.beginPath(); for (const y of [-37, -26]) { c.moveTo(-47 + (y + 48) * .26, y); c.lineTo(47 - (y + 48) * .26, y); }
  c.lineWidth = 1.5; c.strokeStyle = PALE_WOOD.dark; c.stroke();
  for (const side of [-1, 1]) {
    c.beginPath(); c.moveTo(side * 50, -48); c.lineTo(side * 42, -48); c.lineTo(side * 34, -14); c.lineTo(side * 41, -14); c.closePath();
    ink(c, IRON.base, 2);
  }
  block(c, -52, -52, 104, 6, IRON, 2);
  for (const x of [-28, 28]) {
    c.beginPath(); c.arc(x, -9, 9, 0, Math.PI * 2); ink(c, IRON.dark, 2.5);
    c.beginPath(); c.moveTo(x - 6, -9); c.lineTo(x + 6, -9); c.moveTo(x, -15); c.lineTo(x, -3); c.lineWidth = 1.5; c.strokeStyle = IRON.light; c.stroke();
    c.beginPath(); c.arc(x, -9, 3, 0, Math.PI * 2); ink(c, STEEL.base, 1.5);
  }
};

/** A hooped wooden tub of ice, fish tails sticking up out of it. */
const fishTub: Paint = c => {
  groundShadow(c, 0, -2, 32, 5);
  c.beginPath(); c.ellipse(0, -6, 26, 6, 0, 0, Math.PI); c.lineTo(-30, -30); c.ellipse(0, -30, 30, 8, 0, Math.PI, 0, true); c.closePath();
  ink(c, PALE_WOOD.base, 2.5);
  c.beginPath();
  for (const x of [-18, -6, 6, 18]) { c.moveTo(x * 1.12, -30 + 8 * Math.sqrt(1 - (x / 30) ** 2)); c.lineTo(x, -6 + 6 * Math.sqrt(1 - (x / 26) ** 2)); }
  c.lineWidth = 1.5; c.strokeStyle = PALE_WOOD.dark; c.stroke();
  for (const [y, rx, ry] of [[-24, 29, 7.5], [-11, 27, 6.5]]) {
    c.beginPath(); c.ellipse(0, y, rx, ry, 0, 0, Math.PI);
    c.lineWidth = 5; c.strokeStyle = OUTLINE; c.stroke(); c.lineWidth = 3; c.strokeStyle = STEEL.base; c.stroke();
  }
  c.beginPath(); c.ellipse(0, -30, 30, 8, 0, 0, Math.PI * 2); ink(c, ICE.base, 2.5);
  const tail = (x: number, y: number, angle: number, color: string) => {
    c.save(); c.translate(x, y); c.rotate(angle);
    c.beginPath(); c.moveTo(-3, 0); c.lineTo(-2, -7); c.lineTo(-8, -15); c.quadraticCurveTo(0, -11, 8, -15); c.lineTo(2, -7); c.lineTo(3, 0); c.closePath();
    ink(c, color, 2);
    c.restore();
  };
  tail(-13, -28, -.35, FISH_COLORS.salmon);
  tail(3, -28, .1, FISH_COLORS.tuna);
  tail(15, -27, .45, FISH_COLORS.perch);
  c.beginPath();
  for (const [x, y] of [[-22, -30], [-4, -27], [10, -26], [22, -31], [-14, -25]]) c.rect(x, y, 6, 4);
  ink(c, ICE.light, 1);
};

/** A hooped barrel standing full of arrows, their fletching up. */
const arrowBarrel: Paint = c => {
  groundShadow(c, 0, -2, 22, 4);
  c.beginPath(); c.moveTo(-17, -40); c.quadraticCurveTo(-23, -22, -17, -4); c.ellipse(0, -4, 17, 4, 0, Math.PI, 0, true);
  c.quadraticCurveTo(23, -22, 17, -40); c.ellipse(0, -40, 17, 5, 0, 0, Math.PI); c.closePath();
  ink(c, PALE_WOOD.base, 2.5);
  c.beginPath(); for (const x of [-9, 0, 9]) { c.moveTo(x, -36); c.quadraticCurveTo(x * 1.2, -22, x, -1); }
  c.lineWidth = 1.5; c.strokeStyle = PALE_WOOD.dark; c.stroke();
  for (const y of [-33, -12]) {
    c.beginPath(); c.moveTo(-20, y); c.quadraticCurveTo(0, y + 7, 20, y);
    c.lineWidth = 5; c.strokeStyle = OUTLINE; c.stroke(); c.lineWidth = 3; c.strokeStyle = IRON.light; c.stroke();
  }
  c.beginPath(); c.ellipse(0, -40, 17, 5, 0, 0, Math.PI * 2); ink(c, SHADOW, 2);
  [[-10, 0], [10, 1], [-4, 2], [5, 3], [0, 5], [-12, 4]].forEach(([x, color], i) => {
    arrow(c, x * 1.05, -64 + (i % 2) * 3, x * .45, -40, FLETCHES[color], false);
  });
};

/** A sign: a post with a crossbar, a charcoal board edged in gold hung from it, one icon on the board. */
function sign(c: CanvasRenderingContext2D, icon: () => void) {
  groundShadow(c, 0, -3, 16, 4);
  post(c, 0, -150, -8, 4.5, WOOD, 2.5);
  block(c, -11, -9, 22, 9, STONE, 2);
  block(c, -44, -148, 88, 7, WOOD, 2.5);
  c.beginPath(); c.arc(0, -153, 4.5, 0, Math.PI * 2); ink(c, GILT.base, 2);
  for (const x of [-30, 30]) {
    c.beginPath(); c.moveTo(x, -141); c.lineTo(x, -131);
    c.lineWidth = 4; c.strokeStyle = OUTLINE; c.stroke(); c.lineWidth = 2; c.strokeStyle = GILT.base; c.stroke();
  }
  block(c, -40, -132, 80, 62, GILT, 2.5);
  c.beginPath(); c.rect(-35, -127, 70, 52); ink(c, CLOTH.base, 1.5);
  c.fillStyle = GILT.light;
  for (const [x, y] of [[-37, -129], [37, -129], [-37, -73], [37, -73]]) { c.beginPath(); c.arc(x, y, 1.8, 0, Math.PI * 2); c.fill(); }
  icon();
}

const SIGN_PAINTERS: Readonly<Record<string, Paint>> = {
  "sign-ore": c => sign(c, () => { oreLump(c, -13, -82, 12, ORES[0]); oreLump(c, 15, -82, 11, ORES[2]); oreLump(c, 1, -95, 12, ORES[3]); }),
  "sign-timber": c => sign(c, () => logLying(c, -3, -101, 50, 13, LOGS[1])),
  "sign-fish": c => sign(c, () => fish(c, 0, -101, 58, FISH_COLORS.salmon, -.12)),
  "sign-arrows": c => sign(c, () => { arrow(c, -24, -80, 24, -122, FLETCHES[0]); arrow(c, 24, -80, -24, -122, FLETCHES[1]); }),
  "sign-weapons": c => sign(c, () => { sword(c, -19, -80, 54, .72); sword(c, 19, -80, 54, -.72); }),
  "sign-armor": c => sign(c, () => chestplate(c, 0, -82, 22)),
  "sign-crystal": c => sign(c, () => { crystalCluster(c, -6, -80, 34, ORE_COLORS.arcane_crystal); starshard(c, 20, -110, 7); }),
};

/** An open crate of crystals, one more cluster leaning on its side. */
const crystalCrate: Paint = c => {
  groundShadow(c, 0, -3, 40, 6);
  crystalCluster(c, -8, -30, 30, ORE_COLORS.arcane_crystal);
  crystalCluster(c, 13, -30, 22, ORE_COLORS.arcane_crystal);
  crate(c, 0, 0, 58, 32);
  crystalCluster(c, 36, 0, 20, ORE_COLORS.arcane_crystal);
};

/** A plank bench on two stone feet, seen a little from above. */
const bench: Paint = c => {
  groundShadow(c, 0, -3, 50, 6);
  for (const x of [-34, 34]) block(c, x - 8, -21, 16, 21, STONE, 2);
  c.beginPath(); c.rect(-48, -37, 96, 11); ink(c, PALE_WOOD.light, 2.5);
  c.beginPath(); for (const y of [-33.5, -29.5]) { c.moveTo(-46, y); c.lineTo(46, y); }
  c.lineWidth = 1.2; c.strokeStyle = PALE_WOOD.dark; c.stroke();
  block(c, -48, -26, 96, 7, PALE_WOOD, 2.5);
  c.fillStyle = GILT.base;
  for (const x of [-42, 42]) { c.beginPath(); c.arc(x, -22.5, 2, 0, Math.PI * 2); c.fill(); }
};

/** A stone guardian lion sitting up on a plinth, a ball under one paw. */
const lionStatue: Paint = c => {
  groundShadow(c, 0, -3, 40, 6);
  block(c, -41, -6, 82, 6, STONE, 2);
  c.beginPath(); c.rect(-37, -32, 74, 7); ink(c, STONE.light, 2.5);
  block(c, -37, -26, 74, 20, STONE, 2.5);
  c.beginPath(); c.rect(-29, -22, 58, 12); ink(c, STONE.dark, 1.5);
  // Haunches, chest and front legs.
  for (const side of [-1, 1]) { c.beginPath(); c.ellipse(side * 21, -44, 15, 15, 0, 0, Math.PI * 2); ink(c, LION.dark, 2.5); }
  c.beginPath(); c.ellipse(0, -56, 18, 26, 0, 0, Math.PI * 2); ink(c, LION.base, 2.5);
  c.fillStyle = LION.light; c.beginPath(); c.ellipse(-6, -58, 6, 16, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(19, -38, 7.5, 0, Math.PI * 2); ink(c, LION.light, 2);
  c.beginPath(); c.moveTo(13, -42); c.quadraticCurveTo(19, -36, 26, -41); c.lineWidth = 1.2; c.stroke();
  for (const [x, paw] of [[-10, -33], [12, -45]]) {
    c.beginPath(); c.rect(x - 6, -60, 12, paw + 60); ink(c, LION.base, 2);
    c.beginPath(); c.ellipse(x, paw, 8, 5, 0, 0, Math.PI * 2); ink(c, LION.light, 2);
    c.beginPath(); c.moveTo(x - 3, paw - 2); c.lineTo(x - 3, paw + 3); c.moveTo(x + 3, paw - 2); c.lineTo(x + 3, paw + 3); c.lineWidth = 1.2; c.stroke();
  }
  // The head in a mane of curls.
  for (let curl = 0; curl < 14; curl++) {
    const a = curl / 14 * Math.PI * 2;
    c.beginPath(); c.arc(Math.cos(a) * 18, -82 + Math.sin(a) * 17, 6.5, 0, Math.PI * 2); ink(c, LION.dark, 2);
  }
  for (const side of [-1, 1]) { c.beginPath(); c.ellipse(side * 14, -96, 5, 4, side * .5, 0, Math.PI * 2); ink(c, LION.base, 2); }
  c.beginPath(); c.arc(0, -82, 16, 0, Math.PI * 2); ink(c, LION.base, 2.5);
  c.beginPath(); c.ellipse(0, -75, 10, 7, 0, 0, Math.PI * 2); ink(c, LION.light, 1.5);
  c.beginPath(); c.ellipse(0, -79, 4.5, 3, 0, 0, Math.PI * 2); ink(c, LION.dark, 1.5);
  c.beginPath(); c.moveTo(-6, -71); c.quadraticCurveTo(0, -67, 6, -71); c.lineWidth = 1.5; c.stroke();
  for (const side of [-1, 1]) {
    c.beginPath(); c.arc(side * 7, -86, 3.6, 0, Math.PI * 2); ink(c, LION.light, 1.5);
    c.fillStyle = OUTLINE; c.beginPath(); c.arc(side * 7, -85.5, 1.6, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(side * 12, -91); c.quadraticCurveTo(side * 7, -94, side * 2, -91); c.lineWidth = 1.8; c.stroke();
  }
};

/** A squat stone lantern: a foot, a post, a box with a warm lit window, a roofed cap. */
export const stoneLantern: Paint = c => {
  groundShadow(c, 0, -2, 16, 4);
  const glow = c.createRadialGradient(0, -44, 2, 0, -44, 18);
  glow.addColorStop(0, "rgba(255,200,110,.6)"); glow.addColorStop(1, "rgba(255,200,110,0)");
  c.fillStyle = glow; c.beginPath(); c.arc(0, -44, 18, 0, Math.PI * 2); c.fill();
  block(c, -14, -7, 28, 7, STONE, 2);
  post(c, 0, -35, -7, 5.5, STONE, 2);
  block(c, -12, -54, 24, 20, STONE, 2);
  c.beginPath(); c.rect(-7, -50, 14, 12); ink(c, "#ffc861", 1.5);
  c.fillStyle = "#fff0b8"; c.fillRect(-4, -48, 8, 8);
  c.beginPath(); c.moveTo(0, -50); c.lineTo(0, -38); c.moveTo(-7, -44); c.lineTo(7, -44); c.lineWidth = 1.5; c.strokeStyle = OUTLINE; c.stroke();
  c.beginPath(); c.moveTo(-16.5, -60); c.quadraticCurveTo(-12, -55, -6, -55); c.lineTo(6, -55); c.quadraticCurveTo(12, -55, 16.5, -60);
  c.quadraticCurveTo(12, -61, 7, -66); c.lineTo(-7, -66); c.quadraticCurveTo(-12, -61, -16.5, -60); c.closePath();
  ink(c, STONE.base, 2);
  c.fillStyle = STONE.light; c.fillRect(-6, -65, 12, 2.5);
  c.beginPath(); c.arc(0, -69, 3.8, 0, Math.PI * 2); ink(c, STONE.light, 2);
};

/** A raised round stone bed heaped with yellow and white chrysanthemums. */
const flowerBed: Paint = c => {
  const rx = 64, ry = 26, cy = -26, wall = 8;
  c.fillStyle = "rgba(20,14,8,.22)"; c.beginPath(); c.ellipse(0, cy + 9, rx + 2, ry, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(0, cy + wall, rx, ry, 0, 0, Math.PI); c.lineTo(-rx, cy); c.ellipse(0, cy, rx, ry, 0, Math.PI, 0, true); c.closePath();
  ink(c, STONE.base, 2.5);
  c.beginPath(); c.ellipse(0, cy, rx, ry, 0, 0, Math.PI * 2); c.ellipse(0, cy, rx - 10, ry - 7, 0, 0, Math.PI * 2);
  c.fillStyle = STONE.light; c.fill("evenodd"); c.lineWidth = 2.5; c.strokeStyle = OUTLINE; c.stroke();
  c.beginPath();
  for (let stone = 0; stone < 14; stone++) {
    const a = stone / 14 * Math.PI * 2 + .2, cos = Math.cos(a), sin = Math.sin(a);
    c.moveTo(cos * (rx - 10), cy + sin * (ry - 7)); c.lineTo(cos * rx, cy + sin * ry);
    if (sin > .2) c.lineTo(cos * rx, cy + sin * ry + wall);
  }
  c.lineWidth = 1.5; c.stroke();
  c.beginPath(); c.ellipse(0, cy, rx - 10, ry - 7, 0, 0, Math.PI * 2); ink(c, "#5b3e2a", 1.5);
  c.fillStyle = "#3f6e35"; c.lineWidth = 1.5; c.strokeStyle = OUTLINE;
  for (let leaf = 0; leaf < 10; leaf++) {
    const a = leaf / 10 * Math.PI * 2; c.beginPath(); c.ellipse(Math.cos(a) * 42, cy - 2 + Math.sin(a) * 13, 9, 4.5, a, 0, Math.PI * 2); c.fill(); c.stroke();
  }
  const blooms: [number, number][] = [[-22, -39], [22, -39], [-40, -27], [0, -33], [40, -27], [-20, -21], [20, -21], [0, -43]];
  blooms.map((p, i) => ({ p, i })).sort((a, b) => a.p[1] - b.p[1]).forEach(({ p, i }) => bloom(c, p[0], p[1], 14, i % 2 ? WHITE_BLOOM : GOLD));
};

export const YARD_PAINTERS: Readonly<Record<string, Paint>> = {
  "weapon-rack": weaponRack, "armor-stand": armorStand, "lumber-stack": lumberStack, "ore-cart": oreCart, "fish-tub": fishTub,
  "arrow-barrel": arrowBarrel, ...SIGN_PAINTERS, "lion-statue": lionStatue, "stone-lantern": stoneLantern, "flower-bed": flowerBed,
  "crystal-crate": crystalCrate, bench,
};
