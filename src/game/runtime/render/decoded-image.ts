/**
 * Big sheets (the Town's, and enemy sheets), decoded off the main thread before they are first drawn. Drawn straight
 * from an <img>, a phone's browser decoded each one on the main thread the first time, all in the frame it appeared:
 * about 0.6 s of a mid phone's main thread for the Town's six sheets. Kept by the image they came from.
 */
const decoded = new WeakMap<HTMLImageElement, ImageBitmap>();

/** What to draw for an image: its decoded copy once it has one, the image itself until then. */
export function decodedImage(image: HTMLImageElement): HTMLImageElement | ImageBitmap {
  return decoded.get(image) ?? image;
}

/**
 * Chrome decodes a file (a Blob) for createImageBitmap on another thread, but an <img> on the main thread, so the
 * file is read again and decoded from that. The image has just loaded and checked it with the server, so the
 * cached copy is taken as it is: asking again cost a round trip per sheet. Without fetch, from the image.
 */
function decodeFile(image: HTMLImageElement): Promise<ImageBitmap> {
  const source = image.currentSrc || image.src;
  if (typeof fetch !== "function" || !source) return createImageBitmap(image);
  return fetch(source, { cache: "force-cache" })
    .then(response => response.ok ? response.blob() : Promise.reject(new Error(`${response.status}`)))
    .then(blob => createImageBitmap(blob))
    .catch(() => createImageBitmap(image));
}

/** Decodes a loaded image into a bitmap off the main thread; resolves either way (a failure draws the image). */
export function decodeOffThread(image: HTMLImageElement): Promise<void> {
  if (typeof createImageBitmap !== "function" || decoded.has(image)) return Promise.resolve();
  const source = image.src;
  return decodeFile(image).then(bitmap => {
    // Let go of (or moved to another file) while it decoded.
    if (image.src !== source || decoded.has(image)) { bitmap.close(); return; }
    decoded.set(image, bitmap);
  }, () => {});
}

/** Gives a released image's bitmap back. */
export function releaseDecoded(image: HTMLImageElement) {
  decoded.get(image)?.close();
  decoded.delete(image);
}
