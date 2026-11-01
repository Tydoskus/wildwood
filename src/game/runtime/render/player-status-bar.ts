import { createCanvasAtlas, drawAtlasImage, type AtlasImage } from "./canvas-atlas";

/** A player's health bar in label pixels: the channel's box, its frame's pad, the fill's width and colour. */
export type PlayerStatusBar = {
  x: number; y: number; width: number; height: number; pad: number; radius: number; fillWidth: number; fillColor: string;
};

/** The rounded rectangle canvas.ts's roundRect makes. */
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const corner = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + corner, y);
  ctx.arcTo(x + width, y, x + width, y + height, corner);
  ctx.arcTo(x + width, y + height, x, y + height, corner);
  ctx.arcTo(x, y + height, x, y, corner);
  ctx.arcTo(x, y, x + width, y, corner);
  ctx.closePath();
}

/** The frame, the empty channel and the fill clipped to it, drawn under the context's transform. */
export function paintPlayerStatusBar(ctx: CanvasRenderingContext2D, bar: PlayerStatusBar) {
  const { x, y, width, height, pad, radius, fillWidth } = bar;
  ctx.fillStyle = "rgba(0,0,0,.88)";
  roundedRect(ctx, x - pad, y - pad, width + pad * 2, height + pad * 2, radius + pad);
  ctx.fill();
  ctx.fillStyle = "#000";
  roundedRect(ctx, x, y, width, height, radius);
  ctx.fill();
  if (fillWidth <= 0) return;
  ctx.save();
  // Clip to the channel so a part-full bar keeps the rounded left end
  // and stops square against the clip, instead of bulging at the join.
  roundedRect(ctx, x, y, width, height, radius);
  ctx.clip();
  ctx.fillStyle = bar.fillColor;
  ctx.fillRect(x, y, fillWidth, height);
  ctx.fillStyle = "rgba(255,255,255,.25)";
  ctx.fillRect(x, y, fillWidth, 1);
  ctx.restore();
}

/**
 * Players' health bars drawn once per look and copied to the screen, instead of two rounded fills and a
 * rounded clip per player per frame. Each is drawn at the fraction of a device pixel it lands on, so the
 * copy is the pixels drawing it in place gives.
 */
export function createPlayerStatusBars() {
  const atlas = createCanvasAtlas({ maxPages: 4 });
  const bars = new Map<string, AtlasImage | null>();
  atlas.onReset(() => bars.clear());

  /** Draws the bar under an unrotated transform and returns true; false where the caller must draw it. */
  return function drawPlayerStatusBar(ctx: CanvasRenderingContext2D, bar: PlayerStatusBar) {
    const m = typeof ctx.getTransform === "function" ? ctx.getTransform() : null;
    if (!m || m.b !== 0 || m.c !== 0 || !(m.a > 0) || !(m.d > 0)) return false;
    atlas.resetIfFull();
    const left = m.a * (bar.x - bar.pad) + m.e, top = m.d * (bar.y - bar.pad) + m.f;
    const pixelX = Math.floor(left), pixelY = Math.floor(top);
    const offsetX = left - pixelX, offsetY = top - pixelY;
    const width = Math.ceil(offsetX + m.a * (bar.width + bar.pad * 2)) + 1;
    const height = Math.ceil(offsetY + m.d * (bar.height + bar.pad * 2)) + 1;
    const key = `${m.a}|${m.d}|${offsetX.toFixed(4)}|${offsetY.toFixed(4)}|${bar.width}|${bar.height}|${bar.pad}|${bar.radius}|${bar.fillWidth}|${bar.fillColor}`;
    let image = bars.get(key);
    if (image === undefined) {
      const region = atlas.allocate(width, height);
      image = region && atlas.drawInto(region, target => {
        target.transform(m.a, 0, 0, m.d, offsetX - m.a * (bar.x - bar.pad), offsetY - m.d * (bar.y - bar.pad));
        paintPlayerStatusBar(target, bar);
      }) ? { canvas: region.canvas, sx: region.x, sy: region.y, sw: width, sh: height } : null;
      bars.set(key, image);
    }
    if (!image) return false;
    // Restored rather than set back: a read transform set again can move text on a half pixel by one.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawAtlasImage(ctx, image, pixelX, pixelY, width, height);
    ctx.restore();
    return true;
  };
}
