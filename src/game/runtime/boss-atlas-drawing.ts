type AtlasFrame = {
  x: number; y: number; w: number; h: number;
  drawX: number; drawY: number; drawWidth: number; drawHeight: number;
  contentBounds?: { x: number; y: number; w: number; h: number };
};

/** Draw only nonempty atlas pixels, preserving the original capture anchor. */
export function drawBossAtlasFrame(ctx: CanvasRenderingContext2D, page: CanvasImageSource, frame: AtlasFrame) {
  const bounds = frame.contentBounds;
  const x = bounds?.x ?? 0, y = bounds?.y ?? 0;
  const w = bounds?.w ?? frame.w, h = bounds?.h ?? frame.h;
  if (w <= 0 || h <= 0) return;
  const scaleX = frame.drawWidth / frame.w, scaleY = frame.drawHeight / frame.h;
  ctx.imageSmoothingEnabled = true;
  // Bilinear scaling avoids a high-quality resampling pass on every game frame.
  ctx.imageSmoothingQuality = "low";
  ctx.drawImage(page, frame.x + x, frame.y + y, w, h,
    frame.drawX + x * scaleX, frame.drawY + y * scaleY, w * scaleX, h * scaleY);
}
