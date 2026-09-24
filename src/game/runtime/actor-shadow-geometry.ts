/** Both the game and boss tuner use this sprite's original 86:33 aspect ratio. */
export function actorShadowDimensions(width: number) {
  return { width: Math.round(width), height: Math.max(8, Math.round(width * 33 / 86)) };
}
