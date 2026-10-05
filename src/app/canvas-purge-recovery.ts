/**
 * A phone can throw away the pixels of every off-page canvas while the game is
 * in the background (Chrome loses their 2D contexts with the GPU; the canvas
 * comes back blank). The game keeps nearly all its art in such canvases (the
 * sprite sheets after their green is keyed out, every player's body, enemy
 * tints, text labels), built once and never checked, so players came back to
 * an invisible character and missing sprites. Rebuilding each cache is a
 * dozen separate paths; instead a sentinel canvas, made the way they are, is
 * checked on every return, and a lost one saves and reloads the game, which
 * builds everything again. The on-page game canvas is watched too: after a
 * GPU crash Chrome can leave its context lost for good, and the game drew
 * every frame into nothing, so most of the screen stayed black. Its loss
 * reloads as soon as the page is in view, which also covers a long chat.
 */
export const SENTINEL_SIZE = 512;
const RETRY_MS = 5_000;
/** How often the watched canvases' lost flag is read: a boolean, no pixels. Chrome may never fire contextlost. */
export const WATCH_INTERVAL_MS = 1_000;

type SentinelContext = Pick<CanvasRenderingContext2D, "fillRect" | "getImageData"> & { fillStyle: unknown; isContextLost?: () => boolean };
type SentinelCanvas = { width: number; height: number; getContext(type: "2d"): SentinelContext | null; addEventListener(type: string, listener: () => void): void };

export function installCanvasPurgeRecovery(options: {
  /** Saves and reloads; resolves false when it could not save yet. */
  reload: () => Promise<boolean>;
  /** On-page 2D canvases whose lost context means a blank screen. */
  watch?: readonly SentinelCanvas[];
  doc?: Pick<Document, "hidden" | "addEventListener"> & { createElement(tag: "canvas"): SentinelCanvas };
}) {
  const doc = options.doc ?? (document as unknown as NonNullable<typeof options.doc>);
  // Large enough to be GPU-backed like the sprite sheets; a tiny canvas stays in memory and is never lost.
  const sentinel = doc.createElement("canvas");
  sentinel.width = sentinel.height = SENTINEL_SIZE;
  const context = sentinel.getContext("2d");
  if (!context) return { lost: () => false };
  context.fillStyle = "#ff00ff";
  context.fillRect(0, 0, SENTINEL_SIZE, SENTINEL_SIZE);
  let lostEvent = false, reloading = false;
  sentinel.addEventListener("contextlost", () => { lostEvent = true; });
  sentinel.addEventListener("contextrestored", () => { lostEvent = true; });
  const watched = (options.watch ?? []).map(canvas => canvas.getContext("2d")).filter(Boolean) as SentinelContext[];
  const lost = () => {
    if (lostEvent || context.isContextLost?.() || watched.some(watchedContext => watchedContext.isContextLost?.())) return true;
    // A context can come back blank without ever saying it was lost: look at one pixel, only on a return.
    try { return context.getImageData(SENTINEL_SIZE / 2, SENTINEL_SIZE / 2, 1, 1).data[3] !== 255; } catch { return false; }
  };
  const recover = () => {
    if (reloading || doc.hidden || !lost()) return;
    reloading = true;
    void options.reload().then(done => { if (!done) setTimeout(() => { reloading = false; recover(); }, RETRY_MS); },
      () => { setTimeout(() => { reloading = false; recover(); }, RETRY_MS); });
  };
  doc.addEventListener("visibilitychange", recover);
  for (const canvas of options.watch ?? []) canvas.addEventListener("contextlost", () => { lostEvent = true; setTimeout(recover, 0); });
  // After a GPU crash Chrome left the game canvas lost without firing contextlost (checked in headless Chrome).
  if (watched.length) setInterval(() => { if (!reloading && !doc.hidden && watched.some(watchedContext => watchedContext.isContextLost?.())) recover(); }, WATCH_INTERVAL_MS);
  if (typeof window !== "undefined") window.addEventListener("pageshow", recover);
  return { lost, recover };
}
