import { textSpriteLayout } from "../../canvas";
import { cameraZoomPreference } from "./camera-zoom-preference";
import { createCanvasAtlas, type AtlasRegion } from "./canvas-atlas";
import { frozenCopyOf } from "./frozen-canvas";
import { canvasRenderPixelRatio } from "./render-budget";

/**
 * Outlined text (damage numbers) drawn from glyphs pre-drawn once on shared atlas pages instead of a canvas and
 * bitmap per string: a number is a few sub-rectangles of one texture, so a crowd of them is one sprite batch.
 * It lays out like the text sprites of canvas.ts (same measure, same padding, kerning from the whole string) and
 * draws every outline before any fill, as strokeText then fillText do. Glyphs are kept at a quarter device pixel
 * across, as Chrome places glyphs in a line, so at the plates' scale the result matches the text sprite.
 */

/** Device pixels per text pixel within this of the plates' own scale count as it (canvas.ts SCALE_MATCH). */
const SCALE_MATCH = .01;
/** Glyph positions across, in steps of a device pixel. */
const PHASES = 4;
/** Strings remembered, with their layout and glyphs. */
const RUN_LIMIT = 512;
/**
 * While the text fades, an outline is drawn with its own glyph's fill cut out of it (for a fade of one half),
 * so it does not darken the fill drawn over it; whole text keeps the plain outline under the fill.
 */
const KNOCKOUT_ALPHA = .5;

type Cell = { region: AtlasRegion; ox: number; oy: number };
type Run = { anchorX: number; anchorY: number; outlines: Cell[]; fills: Cell[]; x: number[]; y: number[] };
type Kind = "outline" | "knocked" | "fill";

export function createOutlinedGlyphs(createCanvas: () => HTMLCanvasElement = () => document.createElement("canvas")) {
  const atlas = createCanvasAtlas({ pageSize: 512, maxPages: 8, createCanvas });
  const cells = new Map<string, Cell>();
  const runs = new Map<string, Run | null>();
  atlas.onReset(() => { cells.clear(); runs.clear(); });
  const measure = createCanvas().getContext("2d");
  const scratch = createCanvas(), fillScratch = createCanvas();
  const scratchContext = scratch.getContext("2d", { willReadFrequently: true });
  const fillContext = fillScratch.getContext("2d", { willReadFrequently: true });

  function paintGlyph(target: CanvasRenderingContext2D, kind: Kind | "solid", font: string, color: string, strokeWidth: number, char: string) {
    target.font = font;
    target.textAlign = "left";
    target.textBaseline = "alphabetic";
    target.lineJoin = "round";
    if (kind === "fill" || kind === "solid") {
      target.fillStyle = color;
      target.fillText(char, 0, 0);
    } else {
      target.lineWidth = strokeWidth;
      target.strokeStyle = "#000";
      target.strokeText(char, 0, 0);
    }
  }

  /** One glyph drawn at a phase across and down, with its origin (ox, oy) in whole device pixels inside its region. */
  function cell(font: string, color: string, strokeWidth: number, scale: number, kind: Kind, char: string, phase: number, rise: number) {
    const key = `${font}\u0000${scale}\u0000${strokeWidth}\u0000${kind}\u0000${kind === "fill" ? color : ""}\u0000${char}\u0000${phase}\u0000${rise}`;
    const found = cells.get(key);
    if (found) return found;
    if (!measure) return null;
    measure.font = font;
    const box = measure.measureText(char);
    const pad = strokeWidth / 2 + 1;
    const ox = Math.ceil(scale * ((box.actualBoundingBoxLeft || 0) + pad)) + 1, oy = Math.ceil(scale * ((box.actualBoundingBoxAscent || 0) + pad)) + 1;
    const width = ox + Math.ceil(scale * ((box.actualBoundingBoxRight || 0) + pad)) + 2;
    const height = oy + Math.ceil(scale * ((box.actualBoundingBoxDescent || 0) + pad)) + 2;
    const region = atlas.allocate(width, height);
    if (!region) return null;
    const place = (target: CanvasRenderingContext2D) => target.transform(scale, 0, 0, scale, ox + phase / PHASES, oy + rise);
    if (kind === "knocked") {
      if (!knockout(width, height, place, font, strokeWidth, char)) return null;
      atlas.drawInto(region, target => target.drawImage(scratch, 0, 0));
    } else {
      atlas.drawInto(region, target => { place(target); paintGlyph(target, kind, font, color, strokeWidth, char); });
    }
    const made = { region, ox, oy };
    cells.set(key, made);
    return made;
  }

  /** The outline less its own fill, in `scratch`: alpha × (1 − fill) / (1 − KNOCKOUT_ALPHA × fill). */
  function knockout(width: number, height: number, place: (target: CanvasRenderingContext2D) => void, font: string, strokeWidth: number, char: string) {
    if (!scratchContext || !fillContext) return false;
    for (const [canvas, target, kind] of [[scratch, scratchContext, "outline"], [fillScratch, fillContext, "solid"]] as const) {
      canvas.width = width;
      canvas.height = height;
      place(target);
      paintGlyph(target, kind, font, "#fff", strokeWidth, char);
    }
    const outline = scratchContext.getImageData(0, 0, width, height), fill = fillContext.getImageData(0, 0, width, height).data;
    for (let index = 3; index < outline.data.length; index += 4) {
      const covered = fill[index] / 255;
      outline.data[index] = Math.round(outline.data[index] * (1 - covered) / (1 - KNOCKOUT_ALPHA * covered));
    }
    scratchContext.putImageData(outline, 0, 0);
    return true;
  }

  /** A string's glyphs at a scale: where each lands from the sprite's corner, and the sprite's anchor (centre, bottom). */
  function run(text: string, font: string, color: string, strokeWidth: number, scale: number, knocked: boolean) {
    const key = `${scale}\u0000${font}\u0000${color}\u0000${strokeWidth}\u0000${knocked ? 1 : 0}\u0000${text}`;
    const found = runs.get(key);
    if (found !== undefined) return found;
    let made: Run | null = null;
    if (measure) {
      measure.font = font;
      const fontSize = Number.parseFloat(font.match(/([\d.]+)px/)?.[1] ?? "16");
      const { textWidth, ascent, padding, logicalHeight } = textSpriteLayout(measure.measureText(text), fontSize, strokeWidth);
      const baseline = scale * (padding + ascent), top = Math.floor(baseline), rise = baseline - top;
      made = { anchorX: padding + textWidth / 2, anchorY: logicalHeight - padding, outlines: [], fills: [], x: [], y: [] };
      for (let index = 0; index < text.length && made; index += 1) {
        // Where the whole string puts this glyph, kerning and all.
        const across = scale * (padding + (index ? measure.measureText(text.slice(0, index)).width : 0));
        let left = Math.floor(across), phase = Math.round((across - left) * PHASES);
        if (phase === PHASES) { left += 1; phase = 0; }
        const outline = cell(font, color, strokeWidth, scale, knocked ? "knocked" : "outline", text[index], phase, rise);
        const fill = cell(font, color, strokeWidth, scale, "fill", text[index], phase, rise);
        if (!outline || !fill || outline.oy !== fill.oy || outline.ox !== fill.ox) { made = null; break; }
        made.outlines.push(outline);
        made.fills.push(fill);
        made.x.push(left - outline.ox);
        made.y.push(top - outline.oy);
      }
    }
    if (runs.size >= RUN_LIMIT) runs.delete(runs.keys().next().value!);
    runs.set(key, made);
    return made;
  }

  function blit(ctx: CanvasRenderingContext2D, glyph: Cell, x: number, y: number) {
    const { region } = glyph;
    ctx.drawImage(frozenCopyOf(region.canvas), region.x, region.y, region.width, region.height, x, y, region.width, region.height);
  }

  return {
    /** Before a frame's text: starts the atlas over if it filled, so nothing drawn this frame loses its glyphs. */
    startFrame() { atlas.resetIfFull(); },
    /**
     * Draws `text` centred on x with its bottom on y, outlined `strokeWidth` wide in black and filled with `color`,
     * at the context's alpha. False when the context is not at a text sprite's one-to-one scale (or a glyph has
     * no room), and the caller draws it as before.
     */
    draw(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, color: string, strokeWidth: number) {
      if (typeof ctx.getTransform !== "function") return false;
      const m = ctx.getTransform();
      const pixelRatio = canvasRenderPixelRatio(window.devicePixelRatio || 1);
      const plates = pixelRatio * cameraZoomPreference();
      const scale = Math.abs(Math.hypot(m.a, m.b) - plates) < SCALE_MATCH ? plates : pixelRatio;
      if (m.b !== 0 || m.c !== 0 || Math.abs(m.a - scale) >= SCALE_MATCH || Math.abs(m.d - scale) >= SCALE_MATCH) return false;
      const glyphs = run(text, font, color, strokeWidth, scale, ctx.globalAlpha < 1);
      if (!glyphs) return false;
      const left = Math.round(m.a * (x - glyphs.anchorX) + m.e), top = Math.round(m.d * (y - glyphs.anchorY) + m.f);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (let index = 0; index < glyphs.outlines.length; index += 1) blit(ctx, glyphs.outlines[index], left + glyphs.x[index], top + glyphs.y[index]);
      for (let index = 0; index < glyphs.fills.length; index += 1) blit(ctx, glyphs.fills[index], left + glyphs.x[index], top + glyphs.y[index]);
      ctx.setTransform(m);
      return true;
    },
  };
}

let shared: ReturnType<typeof createOutlinedGlyphs> | null | undefined;
/** The game's one set of glyph pages; null without a document. */
export function outlinedGlyphs() {
  if (shared === undefined) shared = typeof document === "undefined" ? null : createOutlinedGlyphs();
  return shared;
}
