import { bossFrameCrop } from "./boss-frame-crop";
import { bossSheetFrameGeometry } from "./boss-frame-geometry";
type AtlasFrame = {
  x: number; y: number; w: number; h: number;
  drawX: number; drawY: number; drawWidth: number; drawHeight: number;
  tuningFrame?: number;
  contentBounds?: { x: number; y: number; w: number; h: number };
};

/** Draw only nonempty atlas pixels, preserving the original capture anchor. */
export function drawBossAtlasFrame(ctx: CanvasRenderingContext2D, page: CanvasImageSource, frame: AtlasFrame, bossId?: string) {
  const bounds = frame.contentBounds;
  const x = bounds?.x ?? 0, y = bounds?.y ?? 0;
  const w = bounds?.w ?? frame.w, h = bounds?.h ?? frame.h;
  if (w <= 0 || h <= 0) return;
  ctx.imageSmoothingEnabled = true;
  // Bilinear scaling avoids a high-quality resampling pass on every game frame.
  ctx.imageSmoothingQuality = "low";
  const crop = bossId ? bossFrameCrop(bossId, frame.tuningFrame ?? 0) : {};
  const geometry = bossSheetFrameGeometry({ bossId: bossId ?? "", frame: 0,
    sourceX: frame.x, sourceY: frame.y, cellWidth: frame.w, cellHeight: frame.h,
    drawWidth: frame.drawWidth, drawHeight: frame.drawHeight, left: frame.drawX, top: frame.drawY,
  }, { ...crop, clipLeft: Math.max(x, crop.clipLeft ?? 0), clipTop: Math.max(y, crop.clipTop ?? 0),
    clipRight: Math.max(frame.w - x - w, crop.clipRight ?? 0), clipBottom: Math.max(frame.h - y - h, crop.clipBottom ?? 0) });
  if (geometry) ctx.drawImage(page, geometry.sourceX, geometry.sourceY, geometry.sourceWidth, geometry.sourceHeight,
    geometry.x, geometry.y, geometry.width, geometry.height);
}
