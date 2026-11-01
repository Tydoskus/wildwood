type OutlinedText = (text: string, x: number, y: number, color: string, strokeWidth?: number) => void;

// Built once per scale rather than every frame.
const fonts = new Map<number, string>();
export function playerPowerFont(scale = 1) {
  let font = fonts.get(scale);
  if (!font) fonts.set(scale, font = `900 ${+(10 * scale).toFixed(2)}px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif`);
  return font;
}

/**
 * The power icon's square, relative to the digits' bottom. Centred on the
 * digits rather than sitting on their baseline: the glyphs are cap-height, so
 * the icon's middle belongs a little above the bottom. The pixel back down is
 * measured against the drawn artwork, whose ink sits high in its own square.
 */
export function playerPowerIconBox(scale = 1) {
  const size = 16 * scale;
  const textHeight = 10 * scale;
  const opticalDrop = scale;
  const top = -textHeight / 2 - size / 2 + opticalDrop;
  return { top, bottom: top + size, size };
}

export type PlayerPowerLabelStyle = {
  /** The world's overhead plates pass NAMEPLATE_SCALE; previews keep the full size. */
  scale?: number;
  strokeWidth?: number;
  /** "bottom" puts `y` at the digits' bottom; "alphabetic" at their baseline. */
  baseline?: "bottom" | "alphabetic";
  /** The icon's square relative to `y`, when the caller sizes it to its line. */
  iconBox?: { top: number; size: number };
};

// Widths per context, font and text: a power changes rarely, so each is measured once, not every frame.
const WIDTH_CACHE_LIMIT = 256;
const widths = new WeakMap<object, Map<string, number>>();
function measuredWidth(ctx: CanvasRenderingContext2D, value: string) {
  let known = widths.get(ctx);
  if (!known) widths.set(ctx, known = new Map());
  const key = `${ctx.font}\u0000${value}`;
  let width = known.get(key);
  if (width === undefined) {
    if (known.size >= WIDTH_CACHE_LIMIT) known.clear();
    known.set(key, width = ctx.measureText(value).width);
  }
  return width;
}

/** One rendering path for overhead power in the world and character previews. */
export function drawPlayerPowerLabel(
  ctx: CanvasRenderingContext2D,
  outlinedText: OutlinedText,
  icon: HTMLCanvasElement | ImageBitmap | null,
  value: string,
  centerX: number,
  y: number,
  style: PlayerPowerLabelStyle = {},
) {
  const scale = style.scale ?? 1;
  ctx.save();
  // 10px at full size, as the name above it and the health bar's numbers.
  ctx.font = playerPowerFont(scale);
  ctx.textBaseline = style.baseline ?? "bottom";
  ctx.textAlign = "left";
  const iconBox = icon ? style.iconBox ?? playerPowerIconBox(scale) : null;
  const iconGap = icon ? 3 * scale : 0;
  const textWidth = measuredWidth(ctx, value);
  const left = centerX - (textWidth + (iconBox?.size ?? 0) + iconGap) / 2;
  outlinedText(value, left, y, "#ffffff", style.strokeWidth ?? 4 * scale);
  if (icon && iconBox) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(icon, left + textWidth + iconGap, y + iconBox.top, iconBox.size, iconBox.size);
  }
  ctx.restore();
}
