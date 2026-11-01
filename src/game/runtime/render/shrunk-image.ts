import { freezeEntry, releaseFrozen, type FrozenImage } from "./frozen-canvas";

type Source = HTMLImageElement | HTMLCanvasElement | ImageBitmap;
type Rect = { x: number; y: number; w: number; h: number };

/**
 * An image, or a frame of a sheet, cut and sized once to what it lands at on screen: Firefox's software canvas
 * re-samples the source on every draw, and a large sheet scaled down is most of a frame there.
 * Kept per image up to a pixel budget (frames at a few zoom levels); the oldest go first. Each is frozen once made.
 */
export function createShrunkImages(pixelsPerImage = 6_000_000) {
  const kept = new WeakMap<Source, { canvases: Map<string, FrozenImage>; pixels: number }>();
  /** `grow` also sizes up a frame drawn larger than its art, for a canvas that draws it itself. */
  return function shrunk(image: Source, width: number, height: number, smoothing: boolean, frame?: Rect, grow = false): Source | null {
    const sourceWidth = frame ? frame.w : image instanceof HTMLImageElement ? image.naturalWidth : image.width;
    const sourceHeight = frame ? frame.h : image instanceof HTMLImageElement ? image.naturalHeight : image.height;
    const w = Math.round(width), h = Math.round(height);
    if (typeof document === "undefined" || w <= 0 || h <= 0 || (w === sourceWidth && h === sourceHeight) || (!grow && (w > sourceWidth || h > sourceHeight))) return null;
    let entry = kept.get(image);
    if (!entry) kept.set(image, entry = { canvases: new Map(), pixels: 0 });
    const key = `${frame ? `${frame.x},${frame.y},${frame.w},${frame.h}` : ""}|${w}x${h}${smoothing ? "s" : ""}`;
    const hit = entry.canvases.get(key);
    if (hit) return hit;
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const target = canvas.getContext("2d");
    if (!target) return null;
    target.imageSmoothingEnabled = smoothing;
    // A frame sized up keeps the canvas's own filter, as a live draw would sample it.
    if (smoothing && w <= sourceWidth && h <= sourceHeight) target.imageSmoothingQuality = "high";
    if (frame) target.drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, w, h);
    else target.drawImage(image, 0, 0, w, h);
    entry.canvases.set(key, canvas);
    freezeEntry(entry.canvases, key, canvas);
    entry.pixels += w * h;
    for (const [oldKey, old] of entry.canvases) {
      if (entry.pixels <= pixelsPerImage || old === canvas) break;
      entry.canvases.delete(oldKey);
      entry.pixels -= old.width * old.height;
      releaseFrozen(old);
    }
    return canvas;
  };
}

/** How many device pixels one unit of the context's current transform covers. */
export function deviceScale(ctx: CanvasRenderingContext2D) {
  // Zero where it cannot be read (a stand-in context): the caller then draws from the source.
  const transform = typeof ctx.getTransform === "function" ? ctx.getTransform() : null;
  return transform ? Math.hypot(transform.a, transform.b) : 0;
}
