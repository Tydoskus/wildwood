import { textSpriteLayout, type TextSegment } from "../../canvas";
import type { CanvasAtlas } from "./canvas-atlas";
import { frozenCopyOf } from "./frozen-canvas";

/** An outlined label on an atlas page, drawn as canvas.ts draws a text sprite. Sizes in text pixels unless named pixel. */
export type PlateLabelSprite = {
  canvas: HTMLCanvasElement; sx: number; sy: number; pixelWidth: number; pixelHeight: number;
  padding: number; textWidth: number; ascent: number;
};

/**
 * Labels every enemy of a kind shares (its name, its reward), kept on the plate pages so they draw
 * with the bar from one image, and so a frame looks nothing up by string. Same pixels as canvas.ts's
 * text sprites. Cleared when the atlas starts over or the scale changes.
 */
export function createPlateLabelSprites(atlas: CanvasAtlas) {
  const names = new Map<string, PlateLabelSprite | null>();
  const runs = new Map<readonly TextSegment[], PlateLabelSprite | null>();
  let scale = 0;
  let measure: CanvasRenderingContext2D | null | undefined;
  atlas.onReset(() => { names.clear(); runs.clear(); });

  function atScale(next: number) {
    if (next === scale) return;
    scale = next;
    names.clear();
    runs.clear();
  }

  function build(text: string, segments: readonly TextSegment[], font: string, strokeWidth: number, direction: CanvasDirection): PlateLabelSprite | null {
    if (measure === undefined) measure = document.createElement("canvas").getContext("2d");
    if (!measure) return null;
    measure.font = font;
    measure.direction = direction;
    const metrics = measure.measureText(text);
    const widths = segments.map(segment => measure!.measureText(segment.text).width);
    const runWidth = widths.reduce((sum, width) => sum + width, 0);
    const fontSize = Number.parseFloat(font.match(/([\d.]+)px/)?.[1] ?? "16");
    const { textWidth, ascent, padding, logicalWidth, logicalHeight } = textSpriteLayout(
      segments.length > 1 ? { ...metrics, width: runWidth } : metrics, fontSize, strokeWidth);
    const pixelWidth = Math.ceil(logicalWidth * scale), pixelHeight = Math.ceil(logicalHeight * scale);
    const region = atlas.allocate(pixelWidth, pixelHeight);
    const drawn = region && atlas.drawInto(region, target => {
      target.transform(scale, 0, 0, scale, 0, 0);
      target.font = font;
      target.direction = direction;
      target.textAlign = "left";
      target.textBaseline = "alphabetic";
      target.lineJoin = "round";
      let x = padding;
      segments.forEach((run, index) => {
        target.lineWidth = strokeWidth;
        target.strokeStyle = "#000";
        target.strokeText(run.text, x, padding + ascent);
        target.fillStyle = run.color;
        target.fillText(run.text, x, padding + ascent);
        x += widths[index];
      });
    });
    if (!region || !drawn) return null;
    return { canvas: region.canvas, sx: region.x, sy: region.y, pixelWidth, pixelHeight, padding, textWidth, ascent };
  }

  return {
    /** A one-colour name at `labelScale` device pixels per text pixel, or null without room on the pages. */
    name(text: string, color: string, font: string, strokeWidth: number, labelScale: number, direction: CanvasDirection) {
      atScale(labelScale);
      let sprite = names.get(text);
      if (sprite === undefined) names.set(text, sprite = build(text, [{ text, color }], font, strokeWidth, direction));
      return sprite;
    },
    /** Runs in several colours (a reward), keyed by the runs' own array. */
    segments(segments: readonly TextSegment[], font: string, strokeWidth: number, labelScale: number, direction: CanvasDirection) {
      atScale(labelScale);
      let sprite = runs.get(segments);
      if (sprite === undefined) {
        runs.set(segments, sprite = build(segments.map(segment => segment.text).join(""), segments, font, strokeWidth, direction));
      }
      return sprite;
    },
  };
}

/**
 * Draws a label centred on x with its alphabetic baseline at y, placed by `grid` (the transform at the label's
 * scale) on the whole device pixels canvas.ts's blit picks. The context must be untransformed.
 */
export function drawPlateLabel(ctx: CanvasRenderingContext2D, grid: { a: number; d: number; e: number; f: number }, sprite: PlateLabelSprite, x: number, y: number) {
  const left = Math.round(grid.a * (x - (sprite.padding + sprite.textWidth / 2)) + grid.e);
  const top = Math.round(grid.d * (y - (sprite.padding + sprite.ascent)) + grid.f);
  if (!sprite.canvas.width) return;
  ctx.drawImage(frozenCopyOf(sprite.canvas), sprite.sx, sprite.sy, sprite.pixelWidth, sprite.pixelHeight, left, top, sprite.pixelWidth, sprite.pixelHeight);
}