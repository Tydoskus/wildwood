import type { ArrowId } from "../../../../shared/arrows";

/** A crafted arrow's art (public/assets/wildstat/arrows), drawn pointing up and right. */
export const arrowArtSource = (arrowId: ArrowId) => `assets/wildstat/arrows/${arrowId}.webp`;
/** How long a crafted arrow is drawn in flight, and the turn that lays its art along the line of flight. */
export const ARROW_SPRITE_SIZE = 30;
export const ARROW_ART_ROTATION = Math.PI / 4;

const images = new Map<ArrowId, HTMLImageElement>();
/** The arrow's art, loaded on first use; drawable once it has loaded. */
export function arrowImage(arrowId: ArrowId): HTMLImageElement | null {
  if (typeof Image === "undefined") return null;
  let image = images.get(arrowId);
  if (!image) { image = new Image(); image.src = arrowArtSource(arrowId); images.set(arrowId, image); }
  return image.complete && image.naturalWidth > 0 ? image : null;
}
