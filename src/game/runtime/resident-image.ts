/** The canvas copy of an image, or null until the image has loaded. */
export type ResidentImage = () => HTMLCanvasElement | null;

/**
 * iOS throws away the decoded pixels of an <img> that is not on the page when
 * memory runs short, and a home-screen web app runs short early. Drawn every
 * frame from such an image, the overhead gender, prestige and power icons
 * dropped out for a frame at a time while it decoded again. A canvas keeps its
 * pixels, which is why the world sprites, all copied into canvases on load,
 * never flickered. Copy the image once, its longer side at most `maxSide` pixels.
 */
export function residentImage(image: HTMLImageElement, maxSide = 64): ResidentImage {
  let copy: HTMLCanvasElement | null = null;
  return () => {
    if (copy) return copy;
    if (!image.complete || !image.naturalWidth || !image.naturalHeight) return null;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    copy = canvas;
    return copy;
  };
}

const sharedCopies = new WeakMap<HTMLImageElement, ResidentImage>();

/** The canvas to draw in place of `image`, or the image itself until a copy can be made. */
export function residentDrawable<T extends CanvasImageSource>(image: T, maxSide = 768): CanvasImageSource {
  if (typeof HTMLImageElement === "undefined" || !(image instanceof HTMLImageElement)) return image;
  let copy = sharedCopies.get(image);
  if (!copy) sharedCopies.set(image, copy = residentImage(image, maxSide));
  return copy() ?? image;
}
