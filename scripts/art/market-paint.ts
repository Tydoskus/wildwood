// Shared paint for the market's baked sprites, in the ForestVillage pack's style: flat fills, one lighter and one
// darker tone, a dark brown outline and round joins. Bake time only; the game never imports this.

export const OUTLINE = "#3b2a1e";

/** One chrysanthemum: rings of narrow petals round a small middle, seen a little from above. */
export function bloom(c: CanvasRenderingContext2D, x: number, y: number, r: number, colors: readonly string[]) {
  const rings = colors.length - 1;
  for (let ring = 0; ring < rings; ring++) {
    const reach = r * (1 - ring / (rings + 1)), count = Math.max(8, Math.round(22 - ring * 5)), turn = ring * .37;
    c.fillStyle = colors[ring];
    c.strokeStyle = OUTLINE;
    c.lineWidth = ring ? 1 : 1.5;
    for (let petal = 0; petal < count; petal++) {
      const angle = turn + petal / count * Math.PI * 2;
      const px = x + Math.cos(angle) * reach * .55, py = y + Math.sin(angle) * reach * .55 * .72;
      c.beginPath();
      c.ellipse(px, py, reach * .5, Math.max(2, reach * .16), Math.atan2(Math.sin(angle) * .72, Math.cos(angle)), 0, Math.PI * 2);
      c.fill(); c.stroke();
    }
  }
  c.fillStyle = colors[rings];
  c.beginPath(); c.ellipse(x, y, r * .2, r * .15, 0, 0, Math.PI * 2); c.fill();
  c.lineWidth = 1; c.strokeStyle = OUTLINE; c.stroke();
}

export const GOLD = ["#e9a426", "#f5c13e", "#ffe08a", "#b5651d"] as const;

export type Tone = { base: string; light: string; dark: string };
export const STONE: Tone = { base: "#7f858c", light: "#a9aeb3", dark: "#656b72" };
export const WOOD: Tone = { base: "#5a3b2a", light: "#8a5d36", dark: "#432b1e" };
export const PALE_WOOD: Tone = { base: "#8a5d36", light: "#a8743f", dark: "#6b4529" };
export const LACQUER: Tone = { base: "#4b2a22", light: "#6e4031", dark: "#331b16" };
export const GILT: Tone = { base: "#e9b23a", light: "#ffe08a", dark: "#b9822a" };
export const CLOTH: Tone = { base: "#2a2b2f", light: "#3e4047", dark: "#1d1e21" };
export const TILE: Tone = { base: "#3d4657", light: "#5a6780", dark: "#2a313d" };
export const WHITE_BLOOM = ["#e2ddd2", "#f4f1ea", "#ffffff", "#e0b84a"] as const;
export const EMBER_BLOOM = ["#d24a24", "#ec6a34", "#ff9f5a", "#8a2e14"] as const;

/** Fills the path just traced, then outlines it. */
export function ink(c: CanvasRenderingContext2D, fill: string | CanvasGradient, width = 3) {
  c.fillStyle = fill; c.fill();
  c.lineWidth = width; c.strokeStyle = OUTLINE; c.stroke();
}

/** A box in one tone: lighter along its top, darker along its foot, outlined. */
export function block(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tone: Tone, width = 3) {
  const band = Math.min(4, h / 4);
  c.fillStyle = tone.base; c.fillRect(x, y, w, h);
  c.fillStyle = tone.light; c.fillRect(x, y, w, band);
  c.fillStyle = tone.dark; c.fillRect(x, y + h - band, w, band);
  c.beginPath(); c.rect(x, y, w, h);
  c.lineWidth = width; c.strokeStyle = OUTLINE; c.stroke();
}

/** An upright post: lit down its left side, shaded down its right. */
export function post(c: CanvasRenderingContext2D, x: number, top: number, bottom: number, half: number, tone: Tone, width = 3) {
  const h = bottom - top;
  c.fillStyle = tone.base; c.fillRect(x - half, top, half * 2, h);
  c.fillStyle = tone.light; c.fillRect(x - half * .7, top, half * .45, h);
  c.fillStyle = tone.dark; c.fillRect(x + half * .4, top, half * .6, h);
  c.beginPath(); c.rect(x - half, top, half * 2, h);
  c.lineWidth = width; c.strokeStyle = OUTLINE; c.stroke();
}

/** A round drum seen a little from above: its front face, then its top, whose middle is at `top`. */
export function drum(c: CanvasRenderingContext2D, x: number, top: number, rx: number, ry: number, h: number, tone: Tone, width = 3) {
  c.beginPath(); c.ellipse(x, top + h, rx, ry, 0, 0, Math.PI);
  c.lineTo(x - rx, top); c.ellipse(x, top, rx, ry, 0, Math.PI, 0, true); c.closePath();
  ink(c, tone.base, width);
  c.beginPath(); c.ellipse(x, top, rx, ry, 0, 0, Math.PI * 2);
  ink(c, tone.light, width);
}

export function groundShadow(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  c.fillStyle = "rgba(20,14,8,.22)";
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill();
}

/** A small flat gold crest seen face on, for inlays too small for a bloom. */
export function crest(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
  ink(c, GILT.base, 1.5);
  c.beginPath();
  for (let petal = 0; petal < 12; petal++) {
    const angle = petal / 12 * Math.PI * 2, cos = Math.cos(angle), sin = Math.sin(angle);
    c.moveTo(x + cos * r * .4, y + sin * r * .4); c.lineTo(x + cos * r * .9, y + sin * r * .9);
  }
  c.lineWidth = 1; c.strokeStyle = GILT.dark; c.stroke();
  c.beginPath(); c.arc(x, y, r * .38, 0, Math.PI * 2);
  ink(c, GILT.light, 1);
}

/** A colour moved `amount` of the way towards another. */
export function mix(hex: string, toward: string, amount: number) {
  const a = parseInt(hex.slice(1), 16), b = parseInt(toward.slice(1), 16);
  const channel = (shift: number) => Math.round(((a >> shift) & 255) * (1 - amount) + ((b >> shift) & 255) * amount);
  return `#${((1 << 24) | (channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).slice(1)}`;
}

/** One colour as a tone: itself, lighter and darker. */
export function toneOf(hex: string): Tone {
  return { base: hex, light: mix(hex, "#ffffff", .42), dark: mix(hex, "#000000", .3) };
}

/** Paints in a frame moved to (x, y), turned by `angle` and mirrored when `flip`. */
export function at(c: CanvasRenderingContext2D, x: number, y: number, angle: number, paint: () => void, flip = false) {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  if (flip) c.scale(-1, 1);
  paint();
  c.restore();
}

export const STEEL: Tone = { base: "#a9b4bf", light: "#dde4ea", dark: "#727e8a" };
export const LEATHER: Tone = { base: "#8a5233", light: "#b0703f", dark: "#5e3420" };
export const BURLAP: Tone = { base: "#c9a46a", light: "#e2c48e", dark: "#9c7a48" };
export const VELVET: Tone = { base: "#3d2142", light: "#5a3361", dark: "#28152c" };
export const ICE: Tone = { base: "#dff3fc", light: "#ffffff", dark: "#a9d6ec" };
/** The dark inside of a stall or a doorway. */
export const SHADOW = "#2b2422";
