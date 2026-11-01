import type { OreId } from "../../shared/refine";
import type { WoodId } from "../../shared/crafting";
import { isArrowId } from "../../shared/arrows";
import { LOG_COLORS } from "../game/runtime/town/wood-tree-renderer";
import { ORE_COLORS } from "../game/runtime/town/ore-rock-renderer";

const ROCK = "#aab5bc", ROCK_DARK = "#8796a0", ROCK_LIGHT = "#c9d2d8", OUTLINE = "#23292e";

function gem(c: CanvasRenderingContext2D, x: number, y: number, size: number, colors: { light: string; dark: string; rim: string }) {
  const w = size * .72, h = size;
  const outline = () => {
    c.beginPath();
    c.moveTo(x, y - h); c.lineTo(x + w / 2, y - h * .45); c.lineTo(x + w / 2, y + h * .15);
    c.lineTo(x, y + h * .4); c.lineTo(x - w / 2, y + h * .15); c.lineTo(x - w / 2, y - h * .45); c.closePath();
  };
  outline(); c.fillStyle = colors.dark; c.fill();
  c.beginPath();
  c.moveTo(x, y - h); c.lineTo(x, y + h * .4); c.lineTo(x - w / 2, y + h * .15); c.lineTo(x - w / 2, y - h * .45); c.closePath();
  c.fillStyle = colors.light; c.fill();
  outline(); c.lineJoin = "round"; c.lineWidth = 2.5; c.strokeStyle = colors.rim; c.stroke();
  c.fillStyle = "rgba(255,255,255,.85)"; c.fillRect(x - w * .3, y - h * .62, Math.max(2, w * .14), h * .3);
}

/** A log lying across the icon, its cut end towards the viewer, outlined as the pack's art is. */
function paintLog(c: CanvasRenderingContext2D, colors: (typeof LOG_COLORS)[WoodId]) {
  c.save();
  c.translate(31, 34);
  c.rotate(-.38);
  c.scale(1.22, 1.22);
  c.lineJoin = "round";
  const body = () => {
    c.beginPath();
    c.moveTo(16, -12); c.lineTo(-20, -12); c.quadraticCurveTo(-27, -12, -27, 0); c.quadraticCurveTo(-27, 12, -20, 12); c.lineTo(16, 12); c.closePath();
  };
  body(); c.fillStyle = colors.bark; c.fill();
  c.save(); body(); c.clip();
  c.fillStyle = colors.barkDark; c.fillRect(-30, 4, 50, 10);
  c.strokeStyle = colors.barkDark; c.lineWidth = 2;
  for (const [x, y, w] of [[-18, -6, 12], [-4, -2, 14], [-14, 2, 8]] as const) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y); c.stroke(); }
  c.restore();
  body(); c.lineWidth = 3; c.strokeStyle = OUTLINE; c.stroke();
  // The cut end: its face, two rings, and the heart.
  c.beginPath(); c.ellipse(16, 0, 8, 12, 0, 0, Math.PI * 2); c.fillStyle = colors.face; c.fill();
  c.lineWidth = 3; c.strokeStyle = OUTLINE; c.stroke();
  c.lineWidth = 1.5; c.strokeStyle = colors.ring;
  c.beginPath(); c.ellipse(16, 0, 5, 8, 0, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.ellipse(16, 0, 2.2, 3.6, 0, 0, Math.PI * 2); c.stroke();
  c.restore();
}

/**
 * Paints a stack's bag icon into a 64 × 64 canvas, in the map rocks' style (ore-rock-renderer.ts): a lump of grey
 * rock with its ore's crystals standing out of it, the Starshard a pale four-pointed star, Arcane Crystal its
 * glowing crystals alone, and each wood a log of its own colours.
 */
export function paintOreIcon(c: CanvasRenderingContext2D, oreId: OreId) {
  c.clearRect(0, 0, 64, 64);
  if (oreId in LOG_COLORS) { paintLog(c, LOG_COLORS[oreId as WoodId]); return; }
  if (oreId === "arcane_crystal") {
    // Lit from within, as the crystal rocks' shards are.
    const colors = ORE_COLORS.arcane_crystal, glow = c.createRadialGradient(32, 36, 2, 32, 36, 30);
    glow.addColorStop(0, "rgba(255, 70, 190, .55)"); glow.addColorStop(1, "rgba(255, 70, 190, 0)");
    c.fillStyle = glow; c.fillRect(0, 0, 64, 64);
    gem(c, 21, 42, 18, colors);
    gem(c, 43, 44, 15, colors);
    gem(c, 32, 34, 26, colors);
    return;
  }
  if (oreId === "starshard") {
    const glow = c.createRadialGradient(32, 32, 2, 32, 32, 30);
    glow.addColorStop(0, "rgba(240, 214, 255, .9)"); glow.addColorStop(1, "rgba(240, 214, 255, 0)");
    c.fillStyle = glow; c.fillRect(0, 0, 64, 64);
    c.beginPath();
    c.moveTo(32, 6); c.quadraticCurveTo(35, 29, 58, 32); c.quadraticCurveTo(35, 35, 32, 58); c.quadraticCurveTo(29, 35, 6, 32); c.quadraticCurveTo(29, 29, 32, 6); c.closePath();
    c.fillStyle = "#fbf2ff"; c.fill();
    c.lineJoin = "round"; c.lineWidth = 3; c.strokeStyle = "#5b3f86"; c.stroke();
    c.fillStyle = "#e6c9ff";
    c.beginPath(); c.moveTo(32, 32); c.lineTo(58, 32); c.quadraticCurveTo(35, 35, 32, 58); c.closePath(); c.fill();
    return;
  }
  const lump = () => {
    c.beginPath();
    c.moveTo(8, 46); c.lineTo(12, 30); c.lineTo(24, 20); c.lineTo(42, 18); c.lineTo(55, 28); c.lineTo(57, 45); c.lineTo(46, 56); c.lineTo(20, 57); c.closePath();
  };
  lump(); c.fillStyle = ROCK; c.fill();
  c.save(); lump(); c.clip();
  c.fillStyle = ROCK_DARK; c.beginPath(); c.moveTo(34, 64); c.lineTo(64, 34); c.lineTo(64, 64); c.closePath(); c.fill();
  c.fillStyle = ROCK_LIGHT; c.beginPath(); c.moveTo(0, 30); c.lineTo(30, 0); c.lineTo(40, 0); c.lineTo(0, 40); c.closePath(); c.fill();
  c.restore();
  lump(); c.lineJoin = "round"; c.lineWidth = 3; c.strokeStyle = OUTLINE; c.stroke();
  const colors = ORE_COLORS[oreId as keyof typeof ORE_COLORS];
  gem(c, 24, 38, 15, colors);
  gem(c, 38, 32, 19, colors);
  gem(c, 46, 46, 12, colors);
}

const icons = new Map<OreId, string>();
/**
 * An ore's bag icon as an image source (a PNG data URL), painted once at twice its 64-unit design so it stays crisp
 * at the item window's size; "" where there is no canvas (tests). A crafted arrow has drawn art instead.
 */
export function oreIconSource(oreId: OreId) {
  if (isArrowId(oreId)) return `assets/wildstat/arrows/${oreId}.webp`;
  const cached = icons.get(oreId);
  if (cached !== undefined) return cached;
  let source = "";
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = 128; canvas.height = 128;
    const context = canvas.getContext?.("2d");
    if (context) {
      context.scale(2, 2);
      paintOreIcon(context, oreId);
      source = canvas.toDataURL("image/png");
    }
  }
  icons.set(oreId, source);
  return source;
}
