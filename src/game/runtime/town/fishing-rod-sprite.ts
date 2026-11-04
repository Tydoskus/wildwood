import type { WorldSpritePresentation } from "../../item-presentation";

/**
 * The fishing rod, held while fishing in place of the player's weapon. Not an item: it lives only in the hand, drawn
 * at the wooden sword's size with its grip where the sword's is, as the pickaxe is (pickaxe-sprite.ts).
 */
export const FISHING_ROD = "fishing_rod";
const ROD_PRESENTATION: WorldSpritePresentation = { kind: "SPRITE", source: "", layer: "HAND", top: 116, handAction: "SWING", weaponCategory: "SWORD" };
export const FISHING_ROD_OVERRIDES: Readonly<Record<string, WorldSpritePresentation>> = Object.freeze({ [FISHING_ROD]: ROD_PRESENTATION });

const OUTLINE = "#14100c";
const CORK = "#c99a5e", CORK_DARK = "#9a6f3e", BLANK = "#5b3b24", BLANK_LIGHT = "#8f6440";
const REEL = "#c7d0d6", REEL_DARK = "#7f8b95";

/** Paints the rod into a 118 x 59 canvas (the wooden sword's size): the cork grip and reel on the left, tapering to the tip. */
export function paintFishingRod(c: CanvasRenderingContext2D) {
  c.lineJoin = "round"; c.lineCap = "round";
  const line = (width: number, color: string, from: [number, number], to: [number, number]) => {
    c.lineWidth = width; c.strokeStyle = color;
    c.beginPath(); c.moveTo(...from); c.lineTo(...to); c.stroke();
  };
  // The blank, outlined and lit along its top, thinning to the tip.
  line(9, OUTLINE, [12, 30], [60, 30]);
  line(7, OUTLINE, [60, 30], [112, 30]);
  line(5, BLANK, [12, 30], [60, 30]);
  line(3, BLANK, [60, 30], [111, 30]);
  line(1.5, BLANK_LIGHT, [36, 28.5], [108, 29]);
  // The cork grip, ringed.
  line(12, OUTLINE, [10, 30], [32, 30]);
  line(8, CORK, [10, 30], [32, 30]);
  for (const x of [16, 22, 28]) line(1.5, CORK_DARK, [x, 26], [x, 34]);
  // The reel under the grip's end, and the line's guides along the blank.
  c.beginPath(); c.arc(38, 38, 7, 0, Math.PI * 2);
  c.fillStyle = REEL; c.fill(); c.lineWidth = 3; c.strokeStyle = OUTLINE; c.stroke();
  c.beginPath(); c.arc(38, 38, 2.5, 0, Math.PI * 2); c.fillStyle = REEL_DARK; c.fill();
  line(3, OUTLINE, [38, 31], [38, 34]);
  for (const x of [58, 78, 96]) {
    c.beginPath(); c.arc(x, 34, 2.4, 0, Math.PI * 2); c.lineWidth = 1.6; c.strokeStyle = REEL_DARK; c.stroke();
  }
}

/** The rod as an image the player's drawing can hold, or nothing where there is no canvas (tests). */
export function createFishingRodSprite(): HTMLImageElement | undefined {
  if (typeof document === "undefined" || typeof Image === "undefined") return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = 118; canvas.height = 59;
  const context = canvas.getContext?.("2d");
  if (!context) return undefined;
  paintFishingRod(context);
  const image = new Image();
  image.src = canvas.toDataURL("image/png");
  return image;
}
