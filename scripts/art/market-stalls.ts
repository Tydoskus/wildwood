// The market's district stalls along its paths: a dark wood frame, a charcoal-and-gold awning and a counter whose
// top shows its district's goods. Each draws from its foot, the middle of the counter's foot, in world units.
import { ORE_COLORS } from "../../src/game/runtime/town/ore-rock-renderer";
import { FISH_COLORS } from "../../src/game/runtime/town/fishing-runtime";
import { block, CLOTH, crest, GILT, groundShadow, ICE, ink, OUTLINE, PALE_WOOD, post, SHADOW, VELVET, WOOD } from "./market-paint";
import {
  arrowBundle, axe, boots, bow, chestplate, crystalCluster, FLETCHES, fish, helmet, logBack, logEnd, LOGS, oreHeap, ORES, pickaxe,
  quiver, staff, starshard, sword,
} from "./market-goods";

type Paint = (c: CanvasRenderingContext2D) => void;
/** The counter's top, where goods stand. */
const TOP = -43;

/** The awning: charcoal and gold stripes under a ridge board, scalloped along its hem. */
function awning(c: CanvasRenderingContext2D) {
  const stripes = 8, top = -137, bottom = -116;
  const shape = () => {
    c.beginPath(); c.moveTo(-54, top); c.lineTo(54, top); c.lineTo(60, bottom);
    for (let i = stripes - 1; i >= 0; i--) { const x0 = -60 + i * 120 / stripes; c.quadraticCurveTo(x0 + 60 / stripes, bottom + 14, x0, bottom); }
    c.closePath();
  };
  shape(); c.save(); c.clip();
  for (let i = 0; i < stripes; i++) {
    c.beginPath(); c.moveTo(-54 + i * 108 / stripes, top); c.lineTo(-54 + (i + 1) * 108 / stripes, top);
    c.lineTo(-60 + (i + 1) * 120 / stripes, bottom + 10); c.lineTo(-60 + i * 120 / stripes, bottom + 10); c.closePath();
    c.fillStyle = i % 2 ? GILT.base : CLOTH.base; c.fill();
  }
  c.fillStyle = "rgba(255,255,255,.16)"; c.fillRect(-62, top, 124, 5);
  c.fillStyle = "rgba(0,0,0,.2)"; c.fillRect(-62, bottom - 3, 124, 14);
  c.restore();
  shape(); c.lineWidth = 2.5; c.strokeStyle = OUTLINE; c.stroke();
  block(c, -58, -143, 116, 7, WOOD, 2.5);
  for (const x of [-56, 56]) { c.beginPath(); c.arc(x, -143.5, 3.5, 0, Math.PI * 2); ink(c, GILT.base, 1.5); }
}

/** A stall round its goods: `goods` stands on the counter (its top at y TOP), `front` leans on it, `hang` hangs from the awning. */
function stall(c: CanvasRenderingContext2D, goods: Paint, front?: Paint, hang?: Paint) {
  groundShadow(c, 0, -3, 60, 8);
  c.beginPath(); c.rect(-50, -114, 100, 70);
  ink(c, SHADOW, 2);
  c.beginPath();
  for (const x of [-25, 0, 25]) { c.moveTo(x, -112); c.lineTo(x, -46); }
  c.lineWidth = 2; c.strokeStyle = "#221b19"; c.stroke();
  for (const x of [-52, 52]) post(c, x, -118, -36, 4.5, WOOD, 2.5);
  c.beginPath(); c.rect(-58, -48, 116, 9);
  ink(c, PALE_WOOD.base, 2.5);
  c.fillStyle = PALE_WOOD.light; c.fillRect(-56.5, -46.5, 113, 2.5);
  goods(c);
  block(c, -60, -40, 120, 5, GILT, 2);
  block(c, -58, -35, 116, 35, WOOD, 2.5);
  for (const x of [-52, 4]) {
    c.beginPath(); c.rect(x, -29, 48, 21);
    ink(c, WOOD.dark, 1.5);
    c.fillStyle = WOOD.light; c.fillRect(x + 1, -9.5, 46, 1.5);
  }
  crest(c, 0, -19, 4);
  front?.(c);
  awning(c);
  hang?.(c);
}

/** Heaps of the four ores, a pickaxe leaning on the counter. */
const oreStall: Paint = c => stall(c,
  () => ORES.forEach((ore, i) => oreHeap(c, -39 + i * 26, TOP + 1, 7.5, ore)),
  () => pickaxe(c, 51, -1, 40, -.32));

/** Arcane crystals and starshards on dark velvet, the velvet hanging over the counter's front. */
const crystalStall: Paint = c => stall(c,
  () => {
    c.beginPath(); c.rect(-59, -49, 118, 10);
    ink(c, VELVET.base, 2.5);
    c.fillStyle = VELVET.light; c.fillRect(-57.5, -47.5, 115, 2.5);
    crystalCluster(c, -31, TOP, 30, ORE_COLORS.arcane_crystal);
    crystalCluster(c, 34, TOP, 25, ORE_COLORS.arcane_crystal);
    block(c, -7, TOP - 8, 14, 8, GILT, 1.5);
    starshard(c, 0, TOP - 22, 12);
    starshard(c, -10, TOP - 2, 5);
    starshard(c, 14, TOP - 1, 4.5);
  },
  () => {
    c.beginPath(); c.moveTo(-60, -41); c.lineTo(60, -41); c.lineTo(60, -26);
    for (let i = 5; i >= 0; i--) c.quadraticCurveTo(-60 + (i + .5) * 20, -18, -60 + i * 20, -26);
    c.closePath();
    ink(c, VELVET.base, 2.5);
    c.beginPath(); c.moveTo(60, -30);
    for (let i = 5; i >= 0; i--) c.quadraticCurveTo(-60 + (i + .5) * 20, -23, -60 + i * 20, -30);
    c.lineWidth = 2; c.strokeStyle = GILT.base; c.stroke();
  });

/** Log ends stacked four, three and two, each wood in turn, an axe leaning on the counter. */
const timberStall: Paint = c => stall(c,
  () => {
    const logs: [number, number, number][] = [];
    [[4, -53], [3, -72], [2, -91]].forEach(([count, y], row) => {
      for (let i = 0; i < count; i++) logs.push([(i - (count - 1) / 2) * 21, y, (row * 3 + i) % LOGS.length]);
    });
    for (const [x, y, wood] of logs) logBack(c, x, y, 10, 5, LOGS[wood]);
    for (const [x, y, wood] of logs) logEnd(c, x, y, 10, LOGS[wood]);
  },
  () => axe(c, 50, -1, 42, -.3));

/** Fish laid on a tray of ice, one more hung from the awning. */
const fishStall: Paint = c => stall(c,
  () => {
    block(c, -52, -52, 104, 9, PALE_WOOD, 2);
    c.beginPath(); c.rect(-50, -59, 100, 7);
    ink(c, ICE.base, 1.5);
    fish(c, 0, -70, 46, FISH_COLORS.tuna);
    fish(c, -24, -61, 42, FISH_COLORS.salmon, 0, true);
    fish(c, 24, -60, 40, FISH_COLORS.perch);
    c.strokeStyle = OUTLINE;
    for (let x = -47; x < 46; x += 11) {
      c.beginPath(); c.rect(x, -56 + (x % 3), 7, 5);
      ink(c, x % 2 ? ICE.light : ICE.dark, 1);
    }
  },
  undefined,
  () => {
    c.beginPath(); c.moveTo(42, -110); c.lineTo(42, -98); c.lineWidth = 1.5; c.strokeStyle = OUTLINE; c.stroke();
    fish(c, 42, -80, 34, FISH_COLORS.pike, Math.PI / 2);
  });

/** Quivers of fletched arrows and a bundle tied in gold, another quiver leaning on the counter. */
const arrowStall: Paint = c => stall(c,
  () => {
    quiver(c, -38, TOP, 30, [FLETCHES[0], FLETCHES[1], FLETCHES[3]]);
    quiver(c, -14, TOP, 26, [FLETCHES[2], FLETCHES[4], FLETCHES[5]]);
    arrowBundle(c, 27, TOP + 1, 50, [FLETCHES[0], FLETCHES[1], FLETCHES[2], FLETCHES[3]]);
  },
  () => quiver(c, 50, -1, 28, [FLETCHES[1], FLETCHES[0], FLETCHES[3]], -.22));

/** A bow on the back wall and a sword on the counter; a sword and a staff leaning on it. */
const weaponStall: Paint = c => stall(c,
  () => {
    bow(c, 16, -82, 50);
    sword(c, -44, -45, 56, Math.PI / 2);
  },
  () => {
    sword(c, -52, -55, 56, Math.PI - .3);
    staff(c, 42, -1, 92, -.22);
  });

/** A stepped shelf: a chestplate and a plumed helmet above, boots and a helmet below. */
const armorStall: Paint = c => stall(c, () => {
  c.beginPath(); c.rect(-50, -81, 100, 7);
  ink(c, PALE_WOOD.base, 2);
  block(c, -50, -74, 100, 27, WOOD, 2);
  chestplate(c, -10, -77, 17);
  helmet(c, 31, -77, 10, "#d9452c");
  boots(c, -33, TOP, 11);
  helmet(c, 22, TOP, 10);
});

export const STALL_PAINTERS: Readonly<Record<string, Paint>> = {
  "stall-ore": oreStall, "stall-crystal": crystalStall, "stall-timber": timberStall, "stall-fish": fishStall,
  "stall-arrows": arrowStall, "stall-weapons": weaponStall, "stall-armor": armorStall,
};
