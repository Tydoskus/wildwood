/** Art-only replacement: the desert encounter keeps its existing server identity. */
export const SCORPION_SPRITE = {
  source: "assets/wildstat/desert-scorpion-boss-spritesheet-v1.png",
  frames: 4,
  framesPerSecond: 4,
  drawWidth: 330,
  groundOffset: 55,
  groundBaseline: .88,
} as const;

export function scorpionSpriteFrame(time: number, sheetWidth: number, sheetHeight: number) {
  const sourceWidth = sheetWidth / SCORPION_SPRITE.frames;
  const frame = Math.floor(Math.max(0, time) * SCORPION_SPRITE.framesPerSecond) % SCORPION_SPRITE.frames;
  const drawHeight = SCORPION_SPRITE.drawWidth * sheetHeight / sourceWidth;
  return {
    sourceX: frame * sourceWidth,
    sourceY: 0,
    sourceWidth,
    sourceHeight: sheetHeight,
    drawWidth: SCORPION_SPRITE.drawWidth,
    drawHeight,
    topOffset: SCORPION_SPRITE.groundOffset - drawHeight * SCORPION_SPRITE.groundBaseline,
  };
}
