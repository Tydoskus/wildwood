// The market's goods for its stalls, pavilions, yard props and signs: ore, crystals, logs, fish, weapons, arrows,
// armour and the trade's own things (crates, sacks, scales, ledgers, lanterns). Each takes its place in world units.
import { ORE_COLORS } from "../../src/game/runtime/town/ore-rock-renderer";
import { LOG_COLORS } from "../../src/game/runtime/town/wood-tree-renderer";
import { at, BURLAP, CLOTH, crest, GILT, ink, LEATHER, mix, OUTLINE, PALE_WOOD, STEEL, toneOf, WOOD, type Tone } from "./market-paint";

export type OreTone = { light: string; dark: string; rim: string };
export type LogTone = { bark: string; barkDark: string; face: string; ring: string };
export const ORES: readonly OreTone[] = [ORE_COLORS.copper_ore, ORE_COLORS.iron_ore, ORE_COLORS.mithril_ore, ORE_COLORS.adamant_ore];
export const LOGS: readonly LogTone[] = [LOG_COLORS.pine_log, LOG_COLORS.oak_log, LOG_COLORS.yew_log, LOG_COLORS.elder_log];
export const FLETCHES = ["#e0533d", "#3f8fe0", "#5fb84a", "#f5c13e", "#f4f1ea", "#9a5fe0"] as const;

/** A lump of ore lit on its upper left, its foot's middle at (x, y). */
export function oreLump(c: CanvasRenderingContext2D, x: number, y: number, s: number, ore: OreTone) {
  const shape = () => {
    c.beginPath(); c.moveTo(x - s, y); c.lineTo(x - s * .92, y - s * .72); c.lineTo(x - s * .4, y - s * 1.25);
    c.lineTo(x + s * .45, y - s * 1.15); c.lineTo(x + s, y - s * .55); c.lineTo(x + s * .86, y); c.closePath();
  };
  shape(); c.fillStyle = ore.dark; c.fill();
  c.beginPath(); c.moveTo(x - s * .92, y - s * .72); c.lineTo(x - s * .4, y - s * 1.25); c.lineTo(x + s * .45, y - s * 1.15);
  c.lineTo(x + s * .15, y - s * .5); c.lineTo(x - s * .55, y - s * .4); c.closePath();
  c.fillStyle = ore.light; c.fill();
  c.lineWidth = 1; c.strokeStyle = ore.rim; c.stroke();
  shape(); c.lineWidth = 2; c.strokeStyle = OUTLINE; c.stroke();
  c.fillStyle = "rgba(255,255,255,.85)";
  c.beginPath(); c.ellipse(x - s * .42, y - s * .9, s * .17, s * .1, -.5, 0, Math.PI * 2); c.fill();
}

/** Three lumps of one ore heaped, two below and one on top. */
export function oreHeap(c: CanvasRenderingContext2D, x: number, y: number, s: number, ore: OreTone) {
  oreLump(c, x - s * .8, y, s, ore);
  oreLump(c, x + s * .85, y, s * .95, ore);
  oreLump(c, x + s * .05, y - s * .95, s, ore);
}

/** A smelted bar, a little from above, its foot's middle at (x, y). */
export function ingot(c: CanvasRenderingContext2D, x: number, y: number, w: number, ore: OreTone) {
  const h = w * .32, inset = w * .16;
  c.beginPath(); c.moveTo(x - w / 2, y); c.lineTo(x + w / 2, y); c.lineTo(x + w / 2 - inset, y - h); c.lineTo(x - w / 2 + inset, y - h); c.closePath();
  ink(c, ore.dark, 2);
  c.beginPath(); c.moveTo(x - w / 2 + inset, y - h); c.lineTo(x + w / 2 - inset, y - h); c.lineTo(x + w / 2 - inset * 1.4, y - h - w * .14);
  c.lineTo(x - w / 2 + inset * 1.4, y - h - w * .14); c.closePath();
  ink(c, ore.light, 2);
}

/** One crystal standing from its foot, lit down its left face, leaning by `lean`. */
export function crystal(c: CanvasRenderingContext2D, x: number, y: number, h: number, w: number, ore: OreTone, lean = 0) {
  at(c, x, y, lean, () => {
    const shape = () => {
      c.beginPath(); c.moveTo(-w / 2, 0); c.lineTo(-w / 2, -h * .72); c.lineTo(0, -h); c.lineTo(w / 2, -h * .72); c.lineTo(w / 2, 0); c.closePath();
    };
    shape(); c.fillStyle = ore.dark; c.fill();
    c.beginPath(); c.moveTo(-w / 2, 0); c.lineTo(-w / 2, -h * .72); c.lineTo(0, -h); c.lineTo(0, 0); c.closePath();
    c.fillStyle = ore.light; c.fill();
    shape(); c.lineWidth = 2; c.strokeStyle = OUTLINE; c.stroke();
    c.fillStyle = "rgba(255,255,255,.85)"; c.fillRect(-w * .34, -h * .66, Math.max(1.5, w * .14), h * .3);
  });
}

/** Three crystals from one foot, the middle one tallest, lit from within. */
export function crystalCluster(c: CanvasRenderingContext2D, x: number, y: number, h: number, ore: OreTone) {
  const glow = c.createRadialGradient(x, y - h * .5, 1, x, y - h * .5, h * 1.1);
  glow.addColorStop(0, "rgba(255,70,190,.45)"); glow.addColorStop(1, "rgba(255,70,190,0)");
  c.fillStyle = glow; c.beginPath(); c.arc(x, y - h * .5, h * 1.1, 0, Math.PI * 2); c.fill();
  crystal(c, x - h * .3, y, h * .62, h * .32, ore, -.4);
  crystal(c, x + h * .32, y, h * .55, h * .3, ore, .42);
  crystal(c, x, y + 1, h, h * .38, ore);
}

/** A pale four-pointed starshard with a soft glow, its middle at (x, y). */
export function starshard(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const glow = c.createRadialGradient(x, y, 1, x, y, r * 1.7);
  glow.addColorStop(0, "rgba(240,214,255,.85)"); glow.addColorStop(1, "rgba(240,214,255,0)");
  c.fillStyle = glow; c.beginPath(); c.arc(x, y, r * 1.7, 0, Math.PI * 2); c.fill();
  const star = () => {
    c.beginPath(); c.moveTo(x, y - r);
    c.quadraticCurveTo(x + r * .14, y - r * .14, x + r, y); c.quadraticCurveTo(x + r * .14, y + r * .14, x, y + r);
    c.quadraticCurveTo(x - r * .14, y + r * .14, x - r, y); c.quadraticCurveTo(x - r * .14, y - r * .14, x, y - r); c.closePath();
  };
  star(); c.fillStyle = "#fbf2ff"; c.fill();
  c.save(); star(); c.clip();
  c.fillStyle = "#dcbcff"; c.fillRect(x, y, r, r);
  c.restore();
  star(); c.lineWidth = 2; c.strokeStyle = "#5b3f86"; c.stroke();
}

/** A log's length going back from its cut end, seen above the end: draw before the ends in front of it. */
export function logBack(c: CanvasRenderingContext2D, x: number, y: number, r: number, depth: number, wood: LogTone) {
  c.beginPath(); c.moveTo(x - r, y); c.lineTo(x - r, y - depth); c.arc(x, y - depth, r, Math.PI, 0); c.lineTo(x + r, y); c.closePath();
  ink(c, wood.bark, 2);
  c.beginPath(); c.moveTo(x - r * .4, y - depth - r * .7); c.lineTo(x - r * .4, y - r * .6);
  c.moveTo(x + r * .35, y - depth - r * .8); c.lineTo(x + r * .35, y - r * .7);
  c.lineWidth = 1.5; c.strokeStyle = wood.barkDark; c.stroke();
}

/** A log's cut end seen face on: bark round a pale face with rings, its middle at (x, y). */
export function logEnd(c: CanvasRenderingContext2D, x: number, y: number, r: number, wood: LogTone) {
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
  ink(c, wood.bark, 2.5);
  c.beginPath(); c.arc(x, y, r * .78, 0, Math.PI * 2);
  c.fillStyle = wood.face; c.fill();
  c.lineWidth = 1; c.strokeStyle = wood.barkDark; c.stroke();
  c.lineWidth = 1.5; c.strokeStyle = wood.ring;
  c.beginPath(); c.arc(x, y, r * .5, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.arc(x, y, r * .2, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.moveTo(x + r * .1, y - r * .1); c.lineTo(x + r * .55, y - r * .45); c.stroke();
}

/** A log lying on its side, its cut end to the right, its middle at (x, y). */
export function logLying(c: CanvasRenderingContext2D, x: number, y: number, len: number, r: number, wood: LogTone) {
  const left = x - len / 2, right = x + len / 2;
  const body = () => {
    c.beginPath(); c.moveTo(right, y - r); c.lineTo(left + r * .5, y - r); c.quadraticCurveTo(left, y - r, left, y);
    c.quadraticCurveTo(left, y + r, left + r * .5, y + r); c.lineTo(right, y + r); c.closePath();
  };
  body(); c.fillStyle = wood.bark; c.fill();
  c.save(); body(); c.clip();
  c.fillStyle = wood.barkDark; c.fillRect(left, y + r * .35, len, r);
  c.beginPath();
  for (const [dx, dy, w] of [[.12, -.45, .3], [.45, -.1, .28], [.2, .2, .22]]) {
    c.moveTo(left + len * dx, y + r * dy); c.lineTo(left + len * (dx + w), y + r * dy);
  }
  c.lineWidth = 1.5; c.strokeStyle = wood.barkDark; c.stroke();
  c.restore();
  body(); c.lineWidth = 2.5; c.strokeStyle = OUTLINE; c.stroke();
  c.beginPath(); c.ellipse(right, y, r * .6, r, 0, 0, Math.PI * 2);
  ink(c, wood.face, 2.5);
  c.lineWidth = 1.5; c.strokeStyle = wood.ring;
  c.beginPath(); c.ellipse(right, y, r * .38, r * .64, 0, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.ellipse(right, y, r * .15, r * .26, 0, 0, Math.PI * 2); c.stroke();
}

/** A fish side on, facing right (left when `flip`), its middle at (x, y), turned by `angle`. */
export function fish(c: CanvasRenderingContext2D, x: number, y: number, len: number, color: string, angle = 0, flip = false) {
  const light = mix(color, "#ffffff", .5), dark = mix(color, "#000000", .3), L = len, H = len * .2, root = -L / 2 + L * .2;
  at(c, x, y, angle, () => {
    c.beginPath(); c.moveTo(root + 3, 0); c.lineTo(-L / 2, -H * .9); c.quadraticCurveTo(-L / 2 + L * .08, 0, -L / 2, H * .9); c.closePath();
    ink(c, dark, 2);
    c.beginPath(); c.moveTo(L * .14, -H * .75); c.quadraticCurveTo(-L * .02, -H * 1.45, -L * .2, -H * .6); c.closePath();
    ink(c, dark, 2);
    const body = () => {
      c.beginPath(); c.moveTo(L / 2, 0);
      c.bezierCurveTo(L * .32, -H * 1.3, -L * .12, -H * 1.15, root, 0); c.bezierCurveTo(-L * .12, H * 1.15, L * .32, H * 1.3, L / 2, 0); c.closePath();
    };
    body(); c.fillStyle = color; c.fill();
    c.save(); body(); c.clip();
    c.fillStyle = light; c.fillRect(-L / 2, H * .2, L, H * 2);
    c.fillStyle = dark; c.fillRect(-L / 2, -H * 2, L, H * 1.4);
    c.restore();
    body(); c.lineWidth = 2; c.strokeStyle = OUTLINE; c.stroke();
    c.beginPath(); c.moveTo(L * .22, -H * .6); c.quadraticCurveTo(L * .13, 0, L * .22, H * .6); c.lineWidth = 1.5; c.stroke();
    c.beginPath(); c.arc(L * .33, -H * .22, Math.max(1.8, H * .24), 0, Math.PI * 2);
    ink(c, "#ffffff", 1.2);
    c.fillStyle = OUTLINE; c.beginPath(); c.arc(L * .345, -H * .22, Math.max(.9, H * .12), 0, Math.PI * 2); c.fill();
  }, flip);
}

/** A sword from its pommel at (x, y), the blade along `angle` (0 points up). */
export function sword(c: CanvasRenderingContext2D, x: number, y: number, len: number, angle = 0) {
  const bw = Math.max(3, len * .07), gw = len * .2, grip = len * .2, guard = -grip - 1;
  at(c, x, y, angle, () => {
    const blade = () => {
      c.beginPath(); c.moveTo(-bw, guard); c.lineTo(-bw, -len + bw * 2.4); c.lineTo(0, -len); c.lineTo(bw, -len + bw * 2.4); c.lineTo(bw, guard); c.closePath();
    };
    blade(); c.fillStyle = STEEL.base; c.fill();
    c.beginPath(); c.moveTo(-bw, guard); c.lineTo(-bw, -len + bw * 2.4); c.lineTo(0, -len); c.lineTo(0, guard); c.closePath();
    c.fillStyle = STEEL.light; c.fill();
    blade(); c.lineWidth = 2; c.strokeStyle = OUTLINE; c.stroke();
    c.beginPath(); c.rect(-bw * .75, -grip, bw * 1.5, grip);
    ink(c, LEATHER.dark, 2);
    c.beginPath(); c.rect(-gw, guard - bw * .8, gw * 2, bw * 1.6);
    ink(c, GILT.base, 2);
    c.beginPath(); c.arc(0, 1, bw * .95, 0, Math.PI * 2);
    ink(c, GILT.base, 2);
  });
}

/** An axe from the end of its handle at (x, y), the head at the top, turned by `angle`. */
export function axe(c: CanvasRenderingContext2D, x: number, y: number, len: number, angle = 0) {
  at(c, x, y, angle, () => {
    c.beginPath(); c.rect(-2.5, -len, 5, len);
    ink(c, PALE_WOOD.base, 2);
    c.beginPath(); c.moveTo(1, -len + 2); c.lineTo(len * .28, -len - len * .1); c.quadraticCurveTo(len * .38, -len + len * .12, len * .3, -len + len * .34);
    c.lineTo(1, -len + len * .22); c.closePath();
    ink(c, STEEL.base, 2);
    c.beginPath(); c.moveTo(len * .26, -len - len * .06); c.quadraticCurveTo(len * .34, -len + len * .12, len * .27, -len + len * .29);
    c.lineWidth = 2; c.strokeStyle = STEEL.light; c.stroke();
  });
}

/** A pickaxe from the end of its handle at (x, y), the head across the top, turned by `angle`. */
export function pickaxe(c: CanvasRenderingContext2D, x: number, y: number, len: number, angle = 0) {
  at(c, x, y, angle, () => {
    c.beginPath(); c.rect(-2.5, -len + 4, 5, len - 4);
    ink(c, PALE_WOOD.base, 2);
    c.beginPath(); c.moveTo(-len * .45, -len + len * .12); c.quadraticCurveTo(0, -len - len * .16, len * .45, -len + len * .12);
    c.lineWidth = 7; c.strokeStyle = OUTLINE; c.stroke();
    c.lineWidth = 4; c.strokeStyle = STEEL.base; c.stroke();
  });
}

/** A round shield face on: wood in a steel rim, a gold boss in the middle, its middle at (x, y). */
export function shield(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
  ink(c, STEEL.dark, 2.5);
  c.beginPath(); c.arc(x, y, r * .82, 0, Math.PI * 2);
  ink(c, "#8e3a2a", 1.5);
  c.beginPath(); c.moveTo(x - r * .82, y); c.lineTo(x + r * .82, y); c.moveTo(x, y - r * .82); c.lineTo(x, y + r * .82);
  c.lineWidth = r * .16; c.strokeStyle = GILT.dark; c.stroke();
  c.beginPath(); c.arc(x, y, r * .3, 0, Math.PI * 2);
  ink(c, GILT.base, 2);
  c.fillStyle = GILT.light; c.beginPath(); c.arc(x - r * .1, y - r * .1, r * .1, 0, Math.PI * 2); c.fill();
}

/** A bow strung, its middle at (x, y), the limbs bending left of the string; turned by `angle`. */
export function bow(c: CanvasRenderingContext2D, x: number, y: number, len: number, angle = 0) {
  const h = len / 2, bend = len * .3;
  at(c, x, y, angle, () => {
    c.beginPath(); c.moveTo(0, -h); c.lineTo(0, h); c.lineWidth = 1.4; c.strokeStyle = "#efe6d0"; c.stroke();
    c.beginPath(); c.moveTo(0, -h); c.quadraticCurveTo(-bend, 0, 0, h);
    c.lineWidth = 7; c.strokeStyle = OUTLINE; c.stroke();
    c.lineWidth = 4; c.strokeStyle = PALE_WOOD.light; c.stroke();
    c.beginPath(); c.rect(-bend / 2 - 3.5, -6, 7, 12);
    ink(c, LEATHER.dark, 1.5);
    for (const side of [-1, 1]) { c.beginPath(); c.arc(0, side * h, 2.4, 0, Math.PI * 2); ink(c, GILT.base, 1.2); }
  });
}

/** A staff from its foot at (x, y), an orb held in gold at its top; turned by `angle`. */
export function staff(c: CanvasRenderingContext2D, x: number, y: number, len: number, angle = 0, orb = "#5ab8f0") {
  at(c, x, y, angle, () => {
    c.beginPath(); c.rect(-2.5, -len + 12, 5, len - 12);
    ink(c, PALE_WOOD.base, 2);
    c.fillStyle = PALE_WOOD.light; c.fillRect(-1.5, -len + 13, 1.5, len - 14);
    c.beginPath(); c.moveTo(-2.5, -len + 13); c.quadraticCurveTo(-9, -len + 8, -5, -len); c.moveTo(2.5, -len + 13); c.quadraticCurveTo(9, -len + 8, 5, -len);
    c.lineWidth = 5; c.strokeStyle = OUTLINE; c.stroke();
    c.lineWidth = 2.5; c.strokeStyle = GILT.base; c.stroke();
    c.beginPath(); c.arc(0, -len + 6, 7, 0, Math.PI * 2);
    ink(c, orb, 2);
    c.fillStyle = mix(orb, "#ffffff", .65); c.beginPath(); c.arc(-2.2, -len + 3.8, 2.4, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.rect(-4, -len + 13, 8, 3.5);
    ink(c, GILT.base, 1.2);
  });
}

/** An arrow from its nock at (x0, y0) to its point at (x1, y1); `head` false when the point is hidden. */
export function arrow(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, fletch: string, head = true) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  at(c, x0, y0, Math.atan2(y1 - y0, x1 - x0), () => {
    c.beginPath(); c.moveTo(1, 0); c.lineTo(len - 5, 0);
    c.lineWidth = 4; c.strokeStyle = OUTLINE; c.stroke();
    c.lineWidth = 2; c.strokeStyle = PALE_WOOD.light; c.stroke();
    if (head) { c.beginPath(); c.moveTo(len, 0); c.lineTo(len - 9, -4); c.lineTo(len - 6, 0); c.lineTo(len - 9, 4); c.closePath(); ink(c, STEEL.base, 1.5); }
    for (const side of [-1, 1]) {
      c.beginPath(); c.moveTo(1, 0); c.lineTo(-1, side * 5); c.lineTo(10, side * 4.5); c.lineTo(14, 0); c.closePath();
      ink(c, fletch, 1.5);
    }
  });
}

/** A leather quiver standing on its foot at (x, y), `h` tall, its arrows' fletching out of the top. */
export function quiver(c: CanvasRenderingContext2D, x: number, y: number, h: number, fletches: readonly string[], lean = 0) {
  at(c, x, y, lean, () => {
    fletches.forEach((color, i) => {
      const dx = (i - (fletches.length - 1) / 2) * 5;
      arrow(c, dx * 1.3, -h - 14 + Math.abs(dx) * .4, dx * .4, -h + 12, color, false);
    });
    c.beginPath(); c.moveTo(-8, -h); c.lineTo(8, -h); c.lineTo(7, -2); c.quadraticCurveTo(0, 2, -7, -2); c.closePath();
    ink(c, LEATHER.base, 2.5);
    c.fillStyle = LEATHER.light; c.fillRect(-5, -h + 4, 3, h - 8);
    c.beginPath(); c.rect(-9, -h - 2, 18, 5);
    ink(c, LEATHER.dark, 2);
    c.beginPath(); c.rect(-8, -h * .5, 16, 3.5);
    ink(c, GILT.base, 1.5);
  });
}

/** Arrows lying in a bundle tied with a gold cord, their points to the right, the bundle's foot middle at (x, y). */
export function arrowBundle(c: CanvasRenderingContext2D, x: number, y: number, len: number, fletches: readonly string[]) {
  fletches.forEach((color, i) => arrow(c, x - len / 2 + (i % 2) * 3, y - 4 - i * 4, x + len / 2 + (i % 2) * 3, y - 4 - i * 4, color));
  c.beginPath(); c.rect(x - 4, y - 7 - fletches.length * 4, 8, fletches.length * 4 + 6);
  ink(c, GILT.base, 1.5);
}

/** A helmet on its rim's middle at (x, y): a steel dome, a gold ridge and rim, an eye slit, a plume if given. */
export function helmet(c: CanvasRenderingContext2D, x: number, y: number, s: number, plume?: string) {
  if (plume) {
    c.beginPath(); c.moveTo(x - s * .1, y - s * 1.3); c.quadraticCurveTo(x + s * .4, y - s * 2.15, x + s * 1.15, y - s * 1.5);
    c.quadraticCurveTo(x + s * .6, y - s * 1.55, x + s * .2, y - s * 1.1); c.closePath();
    ink(c, plume, 2);
  }
  const dome = () => {
    c.beginPath(); c.moveTo(x - s, y); c.lineTo(x - s, y - s * .55); c.ellipse(x, y - s * .55, s, s * .85, 0, Math.PI, 0); c.lineTo(x + s, y); c.closePath();
  };
  dome(); c.fillStyle = STEEL.base; c.fill();
  c.save(); dome(); c.clip();
  c.fillStyle = STEEL.light; c.fillRect(x - s, y - s * 1.5, s * .7, s * 1.5);
  c.fillStyle = STEEL.dark; c.fillRect(x + s * .45, y - s * 1.5, s * .6, s * 1.5);
  c.restore();
  dome(); c.lineWidth = 2.5; c.strokeStyle = OUTLINE; c.stroke();
  c.beginPath(); c.rect(x - s * .62, y - s * .66, s * 1.24, s * .2);
  ink(c, CLOTH.dark, 1.5);
  c.beginPath(); c.rect(x - s * .12, y - s * 1.4, s * .24, s * .74);
  ink(c, GILT.base, 1.5);
  c.beginPath(); c.rect(x - s * 1.06, y - s * .24, s * 2.12, s * .26);
  ink(c, GILT.base, 1.5);
}

/** A steel chestplate on its waist's middle at (x, y), `s` about half its width: gold trim and a crest. */
export function chestplate(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const plate = () => {
    c.beginPath(); c.moveTo(x - s * .62, y); c.lineTo(x - s * .7, y - s * .7);
    c.quadraticCurveTo(x - s * 1.05, y - s * .95, x - s, y - s * 1.35); c.lineTo(x - s * .42, y - s * 1.55);
    c.quadraticCurveTo(x, y - s * 1.25, x + s * .42, y - s * 1.55); c.lineTo(x + s, y - s * 1.35);
    c.quadraticCurveTo(x + s * 1.05, y - s * .95, x + s * .7, y - s * .7); c.lineTo(x + s * .62, y);
    c.quadraticCurveTo(x, y + s * .14, x - s * .62, y); c.closePath();
  };
  plate(); c.fillStyle = STEEL.base; c.fill();
  c.save(); plate(); c.clip();
  c.fillStyle = STEEL.light; c.fillRect(x - s * 1.1, y - s * 1.6, s * 1.1, s * 1.8);
  c.fillStyle = STEEL.dark; c.fillRect(x + s * .5, y - s * 1.6, s * .6, s * 1.8);
  c.restore();
  plate(); c.lineWidth = 2.5; c.strokeStyle = OUTLINE; c.stroke();
  c.beginPath(); c.moveTo(x, y - s * 1.3); c.lineTo(x, y - s * .1); c.lineWidth = 1.5; c.stroke();
  c.beginPath(); c.moveTo(x - s * .42, y - s * 1.55); c.quadraticCurveTo(x, y - s * 1.25, x + s * .42, y - s * 1.55);
  c.moveTo(x - s * .62, y - 1); c.quadraticCurveTo(x, y + s * .12, x + s * .62, y - 1);
  c.lineWidth = 3; c.strokeStyle = GILT.base; c.stroke();
  for (const side of [-1, 1]) {
    c.beginPath(); c.ellipse(x + side * s * .8, y - s * 1.3, s * .36, s * .24, side * .35, 0, Math.PI * 2);
    ink(c, STEEL.light, 2);
  }
  crest(c, x, y - s * .85, Math.max(3, s * .2));
}

/** A pair of leather boots standing side by side, their soles' middle at (x, y). */
export function boots(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  for (const [dx, tone] of [[-s * .45, toneOf(LEATHER.dark)], [s * .3, LEATHER]] as const) {
    const bx = x + dx;
    const boot = () => {
      c.beginPath(); c.moveTo(bx - s * .3, y - s * 1.3); c.lineTo(bx - s * .36, y); c.lineTo(bx + s * .75, y);
      c.quadraticCurveTo(bx + s * .8, y - s * .38, bx + s * .3, y - s * .46); c.lineTo(bx + s * .26, y - s * 1.3); c.closePath();
    };
    boot(); ink(c, tone.base, 2);
    c.beginPath(); c.rect(bx - s * .34, y - s * 1.36, s * .64, s * .26);
    ink(c, tone.dark, 1.5);
    c.beginPath(); c.rect(bx - s * .38, y - s * .14, s * 1.14, s * .14);
    ink(c, WOOD.dark, 1.5);
    c.fillStyle = tone.light; c.fillRect(bx - s * .2, y - s * 1.05, s * .14, s * .7);
  }
}

/** A wooden crate on its foot's middle at (x, y), braced corner to corner. */
export function crate(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tone: Tone = PALE_WOOD) {
  const left = x - w / 2, top = y - h, edge = Math.max(3, w * .12);
  c.beginPath(); c.rect(left, top, w, h);
  ink(c, tone.base, 2.5);
  c.fillStyle = tone.light; c.fillRect(left + 1, top + 1, w - 2, 3);
  c.beginPath(); c.moveTo(left + edge, top + edge); c.lineTo(left + w - edge, y - edge); c.moveTo(left + w - edge, top + edge); c.lineTo(left + edge, y - edge);
  c.lineWidth = 2.5; c.strokeStyle = tone.dark; c.stroke();
  c.beginPath(); c.rect(left + edge, top + edge, w - edge * 2, h - edge * 2);
  c.lineWidth = 1.5; c.strokeStyle = OUTLINE; c.stroke();
}

/** A tied burlap sack slumped on its foot's middle at (x, y). */
export function sack(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const body = () => {
    c.beginPath(); c.moveTo(x - s, y); c.quadraticCurveTo(x - s * 1.2, y - s * .95, x - s * .35, y - s * 1.35); c.lineTo(x - s * .22, y - s * 1.65);
    c.lineTo(x + s * .22, y - s * 1.65); c.lineTo(x + s * .35, y - s * 1.35); c.quadraticCurveTo(x + s * 1.2, y - s * .95, x + s, y);
    c.quadraticCurveTo(x, y + s * .12, x - s, y); c.closePath();
  };
  body(); c.fillStyle = BURLAP.base; c.fill();
  c.save(); body(); c.clip();
  c.fillStyle = BURLAP.light; c.fillRect(x - s * 1.2, y - s * 1.7, s * .75, s * 1.8);
  c.fillStyle = BURLAP.dark; c.fillRect(x + s * .5, y - s * 1.7, s * .8, s * 1.8);
  c.restore();
  body(); c.lineWidth = 2; c.strokeStyle = OUTLINE; c.stroke();
  c.beginPath(); c.moveTo(x - s * .36, y - s * 1.36); c.lineTo(x + s * .36, y - s * 1.36); c.lineWidth = 2.5; c.strokeStyle = WOOD.base; c.stroke();
}

/** A gold balance scale standing on its foot at (x, y), its pans level. */
export function scale(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.beginPath(); c.rect(x - s * .5, y - s * .22, s, s * .22);
  ink(c, WOOD.base, 1.5);
  c.beginPath(); c.rect(x - s * .07, y - s * 1.5, s * .14, s * 1.3);
  ink(c, GILT.base, 1.5);
  c.beginPath(); c.moveTo(x - s * .95, y - s * 1.42); c.lineTo(x + s * .95, y - s * 1.42);
  c.lineWidth = 4.5; c.strokeStyle = OUTLINE; c.stroke(); c.lineWidth = 2.2; c.strokeStyle = GILT.base; c.stroke();
  for (const side of [-1, 1]) {
    const px = x + side * s * .9;
    c.beginPath(); c.moveTo(px, y - s * 1.42); c.lineTo(px - s * .3, y - s * .72); c.moveTo(px, y - s * 1.42); c.lineTo(px + s * .3, y - s * .72);
    c.lineWidth = 1; c.strokeStyle = OUTLINE; c.stroke();
    c.beginPath(); c.ellipse(px, y - s * .72, s * .38, s * .14, 0, 0, Math.PI);
    c.closePath(); ink(c, GILT.base, 1.5);
  }
  c.beginPath(); c.arc(x, y - s * 1.55, s * .12, 0, Math.PI * 2);
  ink(c, GILT.light, 1);
}

/** An open ledger lying on its foot's middle at (x, y): two pale pages of ruled lines in a dark binding. */
export function ledger(c: CanvasRenderingContext2D, x: number, y: number, w: number) {
  const h = w * .36;
  c.beginPath(); c.moveTo(x - w / 2 - 2, y); c.lineTo(x + w / 2 + 2, y); c.lineTo(x + w / 2, y - h); c.lineTo(x - w / 2, y - h); c.closePath();
  ink(c, "#7a2f24", 2);
  for (const side of [-1, 1]) {
    c.beginPath(); c.moveTo(x, y - 1.5); c.lineTo(x + side * (w / 2 - 1), y - 2); c.lineTo(x + side * (w / 2 - 2.5), y - h + 2);
    c.quadraticCurveTo(x + side * w * .2, y - h - 1, x, y - h + 3); c.closePath();
    ink(c, "#f3ead6", 1.5);
    c.beginPath();
    for (let line = 1; line <= 3; line++) { const ly = y - 2 - line * (h - 4) / 4; c.moveTo(x + side * 3, ly); c.lineTo(x + side * (w / 2 - 5), ly); }
    c.lineWidth = 1; c.strokeStyle = "#a89a80"; c.stroke();
  }
}

/** A red paper lantern hung from (x, y) on a short cord, `s` its half width; its glow behind it. */
export function paperLantern(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const cy = y + s * 1.9, ry = s * 1.15;
  const glow = c.createRadialGradient(x, cy, 1, x, cy, s * 3.2);
  glow.addColorStop(0, "rgba(255,170,90,.45)"); glow.addColorStop(1, "rgba(255,170,90,0)");
  c.fillStyle = glow; c.beginPath(); c.arc(x, cy, s * 3.2, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.moveTo(x, y); c.lineTo(x, cy - ry); c.lineWidth = 1.5; c.strokeStyle = OUTLINE; c.stroke();
  c.beginPath(); c.ellipse(x, cy, s, ry, 0, 0, Math.PI * 2); c.fillStyle = "#d9452c"; c.fill();
  c.fillStyle = "#f07a40"; c.beginPath(); c.ellipse(x, cy, s * .66, ry * .94, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#ffc46a"; c.beginPath(); c.ellipse(x - s * .15, cy - ry * .1, s * .26, ry * .62, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(x, cy, s * .45, ry, 0, 0, Math.PI * 2); c.lineWidth = 1; c.strokeStyle = "#a3301e"; c.stroke();
  c.beginPath(); c.ellipse(x, cy, s, ry, 0, 0, Math.PI * 2); c.lineWidth = 2; c.strokeStyle = OUTLINE; c.stroke();
  c.beginPath(); c.rect(x - s * .55, cy - ry - s * .3, s * 1.1, s * .35); ink(c, CLOTH.base, 1.5);
  c.beginPath(); c.rect(x - s * .5, cy + ry - s * .05, s, s * .3); ink(c, CLOTH.base, 1.5);
  c.beginPath(); c.moveTo(x, cy + ry + s * .25); c.lineTo(x, cy + ry + s * .95);
  c.lineWidth = 3.5; c.strokeStyle = OUTLINE; c.stroke(); c.lineWidth = 1.8; c.strokeStyle = GILT.base; c.stroke();
}

/** A small hanging banner from (x, y) down: a cloth with a gold border and a crest, `w` wide and `h` long. */
export function hangingBanner(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cloth: string) {
  c.beginPath(); c.rect(x - w / 2 - 3, y, w + 6, 3.5);
  ink(c, WOOD.base, 1.5);
  c.beginPath(); c.moveTo(x - w / 2, y + 3); c.lineTo(x + w / 2, y + 3); c.lineTo(x + w / 2, y + h); c.lineTo(x, y + h - w * .3);
  c.lineTo(x - w / 2, y + h); c.closePath();
  ink(c, cloth, 2);
  c.beginPath(); c.moveTo(x - w / 2 + 3, y + 6); c.lineTo(x + w / 2 - 3, y + 6); c.lineTo(x + w / 2 - 3, y + h - 4.5); c.lineTo(x, y + h - w * .3 - 3.5);
  c.lineTo(x - w / 2 + 3, y + h - 4.5); c.closePath();
  c.lineWidth = 1.5; c.strokeStyle = GILT.base; c.stroke();
  crest(c, x, y + h * .42, w * .26);
}
