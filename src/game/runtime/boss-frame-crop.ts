import crops from "../boss-frame-crops.json";
import { bossSheetFrameGeometry as geometry, type BossFrameCrop, type BossSheetFrameOptions } from "./boss-frame-geometry";
export type { BossFrameCrop, BossSheetFrameOptions } from "./boss-frame-geometry";

const EMPTY: BossFrameCrop = {};
const TABLE = crops as Record<string, Record<string, BossFrameCrop>>;
export function bossFrameCrop(bossId: string, frame: number): BossFrameCrop {
  return TABLE[bossId]?.[String(frame)] ?? EMPTY;
}
export function hasBossFrameCrops(bossId: string) { return Boolean(TABLE[bossId]); }
export function bossSheetFrameGeometry(options: BossSheetFrameOptions) {
  return geometry(options, bossFrameCrop(options.bossId, options.frame));
}

/**
 * Draws one cell of a boss's strip, with that frame's correction applied.
 *
 * With no correction this is the same `drawImage` the renderer made before:
 * the whole cell, into a box of `drawWidth` x `drawHeight` centred on the
 * origin the caller has already translated to.
 */
export function drawBossSheetFrame(
  ctx: CanvasRenderingContext2D,
  sheet: CanvasImageSource,
  options: BossSheetFrameOptions,
) {
  const frame = bossSheetFrameGeometry(options);
  if (!frame) return;
  ctx.drawImage(
    sheet, frame.sourceX, frame.sourceY, frame.sourceWidth, frame.sourceHeight,
    frame.x, frame.y, frame.width, frame.height,
  );
}
