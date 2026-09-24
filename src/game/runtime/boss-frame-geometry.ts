/**
 * A per-frame correction to a boss's spritesheet.
 *
 * A sheet is otherwise read as equal cells: frame N is the Nth slice of the
 * strip, drawn into the same box as every other frame. That is true until one
 * pose is drawn a little off inside its own cell, or carries a reach the box
 * has to grow for, and then the only fixes are repainting the sheet or nudging
 * every frame with it.
 *
 * Each field is a correction, so all of them default to zero and an untouched
 * frame draws exactly as it did before this existed.
 */
export type BossFrameCrop = {
  /** Moves the source window inside the cell, in sheet pixels. */
  sourceX?: number;
  sourceY?: number;
  /** Trim the isolated cell edges; negative values extend an edge for an overhanging pose. */
  clipLeft?: number;
  clipRight?: number;
  clipTop?: number;
  clipBottom?: number;
  /** Grows or shrinks the source window, in sheet pixels. */
  sourceWidth?: number;
  sourceHeight?: number;
  /** Moves where the frame lands, in world units. */
  offsetX?: number;
  offsetY?: number;
  /** Scales the frame about its own centre. 0 means no change. */
  scale?: number;
  /** Moves the status bar for a pose that rises above its idle artwork. */
  statusOffsetY?: number;
};

export type BossSheetFrameOptions = {
  bossId: string;
  frame: number;
  cellWidth: number;
  cellHeight: number;
  columns?: number;
  drawWidth: number;
  drawHeight: number;
  /** Draw from this top edge instead of centring, for a boss placed by its feet. */
  top?: number;
  left?: number;
  /** Already-resolved source origin, for a sheet read by something else. */
  sourceX?: number;
  sourceY?: number;
};

/** The source window and destination box `drawBossSheetFrame` uses, or null for an empty crop. */
export function bossSheetFrameGeometry(options: BossSheetFrameOptions, crop: BossFrameCrop = {}) {
  const columns = options.columns ?? 0;
  const column = columns > 0 ? options.frame % columns : options.frame;
  const row = columns > 0 ? Math.floor(options.frame / columns) : 0;
  const sourceX = (options.sourceX ?? column * options.cellWidth) + (crop.sourceX ?? 0);
  const sourceY = (options.sourceY ?? row * options.cellHeight) + (crop.sourceY ?? 0);
  const sourceWidth = options.cellWidth + (crop.sourceWidth ?? 0);
  const sourceHeight = options.cellHeight + (crop.sourceHeight ?? 0);
  if (sourceWidth <= 0 || sourceHeight <= 0) return null;
  // The source window and the draw box keep the same proportions, so widening
  // the crop shows more of the sheet rather than stretching what it had.
  const scale = 1 + (crop.scale ?? 0);
  const width = options.drawWidth * (sourceWidth / options.cellWidth) * scale;
  const height = options.drawHeight * (sourceHeight / options.cellHeight) * scale;
  const top = options.top ?? -height / 2;
  const geometry = {
    sourceX, sourceY, sourceWidth, sourceHeight,
    x: (options.left ?? -width / 2) + (crop.offsetX ?? 0), y: top + (crop.offsetY ?? 0), width, height,
  };
  // Keep adjacent poses out of an expanded/moved crop. Empty space remains
  // transparent instead of stretching the surviving artwork to fill the box.
  const cellX = options.sourceX ?? column * options.cellWidth;
  const cellY = options.sourceY ?? row * options.cellHeight;
  const left = Math.max(sourceX, cellX + (crop.clipLeft ?? 0));
  const right = Math.min(sourceX + sourceWidth, cellX + options.cellWidth - (crop.clipRight ?? 0));
  const upper = Math.max(sourceY, cellY + (crop.clipTop ?? 0));
  const lower = Math.min(sourceY + sourceHeight, cellY + options.cellHeight - (crop.clipBottom ?? 0));
  if (right <= left || lower <= upper) return null;
  return { ...geometry, sourceX: left, sourceY: upper,
    sourceWidth: right - left, sourceHeight: lower - upper,
    x: geometry.x + (left - sourceX) * width / sourceWidth,
    y: geometry.y + (upper - sourceY) * height / sourceHeight,
    width: (right - left) * width / sourceWidth, height: (lower - upper) * height / sourceHeight };
}
