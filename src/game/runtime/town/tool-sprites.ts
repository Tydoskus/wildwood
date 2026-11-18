import { TOOL_MAX_LEVEL, normalizeToolLevel, type ToolId } from "../../../../shared/tools";
import { paintFishingRod } from "./fishing-rod-sprite";
import { hatchetArtSource } from "./hatchet-sprite";
import { PLAIN_STEEL, paintPickaxe, type ToolMetal } from "./pickaxe-sprite";

/**
 * Every tool's look by level (shared/tools.ts): the head recoloured from Worn steel through bronze and the metals
 * to a violet jewel at the top. The Hammer, Knife and Focus are painted here for the Smith's window, in the
 * pickaxe's style and canvas. The Hatchet is a real axe per level instead (hatchet-sprite.ts).
 */
export const TOOL_METALS: readonly ToolMetal[] = Object.freeze([
  PLAIN_STEEL,
  { light: "#dba268", dark: "#9a6232", edge: "#f6d3a4" },
  { light: "#a5abb0", dark: "#62696f", edge: "#d6dadd" },
  { light: "#e0e8ef", dark: "#97a7b5", edge: "#ffffff" },
  { light: "#f2f4f7", dark: "#b6bec8", edge: "#ffffff" },
  { light: "#9fcbf2", dark: "#4f84bd", edge: "#e4f2ff" },
  { light: "#6a9af2", dark: "#2a4fae", edge: "#c8dbff" },
  { light: "#71c98e", dark: "#2f7d4c", edge: "#d2f4dd" },
  { light: "#6b5a80", dark: "#2c2238", edge: "#ab9acb" },
  { light: "#cdf3f8", dark: "#6fb5c4", edge: "#ffffff" },
  { light: "#d993ff", dark: "#8a3fc4", edge: "#fbe8ff" },
]);
export const toolMetal = (level: number) => TOOL_METALS[Math.min(TOOL_MAX_LEVEL, normalizeToolLevel(level))];

const OUTLINE = "#14100c";
const WOOD = "#9b6a3f", WOOD_LIGHT = "#cf9a62", WRAP = "#5a3b22";
const CRYSTAL = "#8fd3ff", CRYSTAL_DARK = "#4a8fd0";

type Context = CanvasRenderingContext2D;
const line = (c: Context, width: number, color: string, from: [number, number], to: [number, number]) => {
  c.lineWidth = width; c.strokeStyle = color;
  c.beginPath(); c.moveTo(...from); c.lineTo(...to); c.stroke();
};
/** A haft as the pickaxe's: outlined, lit along its top, wrapped at the grip. */
function haft(c: Context, to: number) {
  c.lineJoin = "round"; c.lineCap = "round";
  line(c, 14, OUTLINE, [14, 30], [to, 30]);
  line(c, 8, WOOD, [14, 30], [to, 30]);
  line(c, 3, WOOD_LIGHT, [17, 27], [to - 2, 27]);
  line(c, 8, WRAP, [15, 30], [32, 30]);
}
/** Fills a shape outlined, its dark metal under a lit top half. */
function metalShape(c: Context, shape: () => void, metal: ToolMetal, litTo: number) {
  shape(); c.lineWidth = 6; c.strokeStyle = OUTLINE; c.stroke();
  shape(); c.fillStyle = metal.dark; c.fill();
  c.save(); shape(); c.clip(); c.fillStyle = metal.light; c.fillRect(0, 0, 118, litTo); c.restore();
}

/** The Smith's hammer: a haft and a squared head across its end. */
export function paintHammer(c: Context, metal: ToolMetal = PLAIN_STEEL) {
  haft(c, 80);
  metalShape(c, () => { c.beginPath(); c.rect(74, 10, 22, 40); }, metal, 26);
  c.lineWidth = 2; c.strokeStyle = metal.edge;
  c.beginPath(); c.moveTo(94, 13); c.lineTo(94, 47); c.stroke();
}

/** The fletcher's knife: a short wrapped handle, a guard, and a blade to a point. */
export function paintKnife(c: Context, metal: ToolMetal = PLAIN_STEEL) {
  c.lineJoin = "round"; c.lineCap = "round";
  line(c, 14, OUTLINE, [18, 30], [48, 30]);
  line(c, 8, WRAP, [18, 30], [48, 30]);
  line(c, 3, WOOD_LIGHT, [21, 27], [46, 27]);
  metalShape(c, () => { c.beginPath(); c.moveTo(52, 22); c.lineTo(84, 22); c.quadraticCurveTo(100, 26, 104, 30); c.lineTo(52, 38); c.closePath(); }, metal, 30);
  c.lineWidth = 2; c.strokeStyle = metal.edge;
  c.beginPath(); c.moveTo(56, 25); c.lineTo(86, 25); c.stroke();
  metalShape(c, () => { c.beginPath(); c.rect(47, 16, 6, 28); }, metal, 30);
}

/** The enchanter's focus: a short rod, its metal claws round a crystal at the end. */
export function paintFocus(c: Context, metal: ToolMetal = PLAIN_STEEL) {
  haft(c, 74);
  metalShape(c, () => { c.beginPath(); c.moveTo(70, 22); c.lineTo(80, 14); c.lineTo(84, 30); c.lineTo(80, 46); c.lineTo(70, 38); c.closePath(); }, metal, 30);
  const gem = () => { c.beginPath(); c.moveTo(88, 12); c.lineTo(101, 30); c.lineTo(88, 48); c.lineTo(78, 30); c.closePath(); };
  gem(); c.lineWidth = 5; c.strokeStyle = OUTLINE; c.stroke();
  gem(); c.fillStyle = CRYSTAL_DARK; c.fill();
  c.save(); gem(); c.clip(); c.fillStyle = CRYSTAL; c.fillRect(70, 0, 18, 60); c.restore();
  c.fillStyle = "rgba(255,255,255,.85)"; c.fillRect(85, 20, 3, 8);
}

/** The cook's skillet: a wrapped handle into a heavy metal pan with a lit rim. */
export function paintSkillet(c: Context, metal: ToolMetal = PLAIN_STEEL) {
  haft(c, 58);
  metalShape(c, () => { c.beginPath(); c.arc(82, 30, 20, 0, Math.PI * 2); }, metal, 28);
  c.beginPath(); c.arc(82, 30, 14, 0, Math.PI * 2);
  c.fillStyle = metal.dark; c.fill();
  c.lineWidth = 2; c.strokeStyle = metal.edge;
  c.beginPath(); c.arc(82, 30, 17, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
}

type PaintedTool = Exclude<ToolId, "hatchet">;
const PAINTERS: Readonly<Record<PaintedTool, (c: Context, metal?: ToolMetal) => void>> = {
  pickaxe: paintPickaxe, rod: paintFishingRod, skillet: paintSkillet, hammer: paintHammer, knife: paintKnife, focus: paintFocus,
};

/** A tool painted at its level onto the wooden sword's 118 × 59 canvas, or nothing where there is no canvas (tests). */
function paintedCanvas(tool: PaintedTool, level: number) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 118; canvas.height = 59;
  const context = canvas.getContext?.("2d");
  if (!context) return null;
  PAINTERS[tool](context, toolMetal(level));
  return canvas;
}

const sources = new Map<string, string>();
/** A tool's art at a level as an image source for the Smith's window; "" without a canvas. Painted once each. */
export function toolArtSource(tool: ToolId, level: number) {
  if (tool === "hatchet") return hatchetArtSource(level);
  const key = `${tool}:${normalizeToolLevel(level)}`;
  let source = sources.get(key);
  if (source === undefined) {
    source = paintedCanvas(tool, level)?.toDataURL("image/png") ?? "";
    sources.set(key, source);
  }
  return source;
}

const sprites = new Map<string, HTMLImageElement | undefined>();
/** The Pickaxe, Hatchet or Fishing Rod in hand at its level, an image the player's drawing can hold. Made once each. */
export function toolSprite(tool: "pickaxe" | "hatchet" | "rod", level: number) {
  const key = `${tool}:${normalizeToolLevel(level)}`;
  if (!sprites.has(key)) {
    const source = typeof Image === "undefined" ? "" : toolArtSource(tool, level);
    const image = source ? new Image() : undefined;
    if (image) image.src = source;
    sprites.set(key, image);
  }
  return sprites.get(key);
}
