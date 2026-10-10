type OutlinedText = (text: string, x: number, y: number, color: string, strokeWidth?: number) => void;

/** One rendering path for overhead power in the world and character previews. */
export function drawPlayerPowerLabel(
  ctx: CanvasRenderingContext2D,
  outlinedText: OutlinedText,
  icon: HTMLCanvasElement | null,
  value: string,
  centerX: number,
  bottom: number,
) {
  ctx.save();
  // 10px, as the name above it and the health bar's numbers (Ryan).
  ctx.font = '900 10px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
  ctx.textBaseline = "bottom";
  ctx.textAlign = "left";
  const hasIcon = Boolean(icon);
  const iconSize = hasIcon ? 16 : 0;
  const iconGap = hasIcon ? 3 : 0;
  const textWidth = ctx.measureText(value).width;
  const left = centerX - (textWidth + iconSize + iconGap) / 2;
  outlinedText(value, left, bottom, "#ffffff", 4);
  if (hasIcon) {
    ctx.imageSmoothingEnabled = true;
      // Centred on the digits rather than sitting on their baseline: the glyphs
    // are cap-height, so the icon's middle belongs a little above the bottom.
    // The two pixels back down are measured against the drawn artwork, whose
    // ink sits high in its own square.
    const textHeight = 10;
    const opticalDrop = 1;
    ctx.drawImage(icon!, left + textWidth + iconGap, bottom - textHeight / 2 - iconSize / 2 + opticalDrop, iconSize, iconSize);
  }
  ctx.restore();
}
