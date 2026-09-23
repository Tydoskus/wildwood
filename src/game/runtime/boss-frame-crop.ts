import crops from "../boss-frame-crops.json";

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

const EMPTY: BossFrameCrop = {};
const TABLE = crops as Record<string, Record<string, BossFrameCrop>>;

export function bossFrameCrop(bossId: string, frame: number): BossFrameCrop {
  return TABLE[bossId]?.[String(frame)] ?? EMPTY;
}

export function hasBossFrameCrops(bossId: string) {
  return Boolean(TABLE[bossId]);
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
  options: {
    bossId: string;
    frame: number;
    cellWidth: number;
    cellHeight: number;
    columns?: number;
    drawWidth: number;
    drawHeight: number;
    /** Draw from this top edge instead of centring, for a boss placed by its feet. */
    top?: number;
    /** Already-resolved source origin, for a sheet read by something else. */
    sourceX?: number;
    sourceY?: number;
  },
) {
  const columns = options.columns ?? 0;
  const crop = bossFrameCrop(options.bossId, options.frame);
  const column = columns > 0 ? options.frame % columns : options.frame;
  const row = columns > 0 ? Math.floor(options.frame / columns) : 0;
  const sourceX = (options.sourceX ?? column * options.cellWidth) + (crop.sourceX ?? 0);
  const sourceY = (options.sourceY ?? row * options.cellHeight) + (crop.sourceY ?? 0);
  const sourceWidth = options.cellWidth + (crop.sourceWidth ?? 0);
  const sourceHeight = options.cellHeight + (crop.sourceHeight ?? 0);
  if (sourceWidth <= 0 || sourceHeight <= 0) return;
  // The source window and the draw box keep the same proportions, so widening
  // the crop shows more of the sheet rather than stretching what it had.
  const scale = 1 + (crop.scale ?? 0);
  const width = options.drawWidth * (sourceWidth / options.cellWidth) * scale;
  const height = options.drawHeight * (sourceHeight / options.cellHeight) * scale;
  const top = options.top ?? -height / 2;
  ctx.drawImage(
    sheet, sourceX, sourceY, sourceWidth, sourceHeight,
    -width / 2 + (crop.offsetX ?? 0), top + (crop.offsetY ?? 0), width, height,
  );
}
