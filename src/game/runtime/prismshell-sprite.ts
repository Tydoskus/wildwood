// One high-resolution texture with procedural motion keeps the feet planted
// without downloading additional animation sheets.
export const PRISMSHELL_ATLAS = {
  pages: [{ src: "assets/wildstat/prismshell-amethyst-v1.webp", width: 1254, height: 1254 }],
  bounds: { left: 17, top: 15, right: 1242, bottom: 1239 },
};
export const PRISMSHELL_SPRITE_HEIGHT = 340;
export const PRISMSHELL_USED_PAGES = [0];

export function prismshellSpriteFrame(timeSeconds: number, attackElapsedSeconds?: number) {
  const time = Number.isFinite(timeSeconds) ? Math.max(0, timeSeconds) : 0;
  const attack = attackElapsedSeconds !== undefined && Number.isFinite(attackElapsedSeconds)
    ? Math.max(0, attackElapsedSeconds) : 0;
  const breath = Math.sin(time * Math.PI) * 0.012;
  const pulse = attack > 0 && attack < 0.7 ? Math.sin(attack / 0.7 * Math.PI) : 0;
  const { bounds, pages } = PRISMSHELL_ATLAS;
  const scale = PRISMSHELL_SPRITE_HEIGHT / (bounds.bottom - bounds.top);
  const scaleX = scale * (1 - breath * 0.4 + pulse * 0.04);
  const scaleY = scale * (1 + breath - pulse * 0.035);
  return {
    page: 0, x: 0, y: 0, w: pages[0].width, h: pages[0].height,
    drawX: -(bounds.left + bounds.right) / 2 * scaleX,
    drawY: PRISMSHELL_SPRITE_HEIGHT / 2 - bounds.bottom * scaleY,
    drawWidth: pages[0].width * scaleX,
    drawHeight: pages[0].height * scaleY,
    // Keep the health bar stable throughout the breathing cycle.
    top: -PRISMSHELL_SPRITE_HEIGHT / 2,
  };
}
