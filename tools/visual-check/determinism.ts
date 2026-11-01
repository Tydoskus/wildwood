/** The real clock, kept before it is pinned, for the perf scene's timings. */
export const realNow = performance.now.bind(performance);
/** The one moment every scene is drawn at. */
export const FIXED_NOW_MS = 100_000;
const FIXED_EPOCH_MS = Date.UTC(2026, 9, 20, 12, 0, 0);

const trackedImages = new Set<HTMLImageElement>();
const SEED = 0x5eed1234;
let seed = SEED;

/** Starts Math.random's sequence over, so a drawing that rolls dice draws the same on every pass. */
export function resetRandom() {
  seed = SEED;
}

/** Pins the clocks and Math.random, and records every image the game asks for. */
export function installDeterminism() {
  performance.now = () => FIXED_NOW_MS;
  Date.now = () => FIXED_EPOCH_MS;
  Math.random = () => {
    // mulberry32
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // No workers: the ground tiles a worker would paint in its own time are painted on the spot instead.
  Object.defineProperty(window, "Worker", { value: undefined, configurable: true, writable: true });
  const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src")!;
  Object.defineProperty(HTMLImageElement.prototype, "src", {
    ...descriptor,
    set(this: HTMLImageElement, value: string) {
      trackedImages.add(this);
      descriptor.set!.call(this, value);
    },
  });
}

const nextTask = (ms = 0) => new Promise<void>(resolve => setTimeout(resolve, ms));

function imageSettled(image: HTMLImageElement) {
  return !image.getAttribute("src") || image.complete;
}

/** Waits until every image asked for so far has loaded (or failed), and decodes it. Returns how many there are. */
export async function settleImages(timeoutMs = 30_000) {
  // Counted in sleeps: performance.now and Date.now are pinned.
  let waited = 0;
  while ([...trackedImages].some(image => !imageSettled(image))) {
    if (waited > timeoutMs) {
      const pending = [...trackedImages].filter(image => !imageSettled(image)).map(image => image.src);
      throw new Error(`Images still loading after ${timeoutMs}ms: ${pending.slice(0, 10).join(", ")}`);
    }
    await nextTask(25);
    waited += 25;
  }
  await Promise.all([...trackedImages].map(image => image.complete && image.naturalWidth > 0 ? image.decode().catch(() => {}) : null));
  return trackedImages.size;
}

export function failedImages() {
  return [...trackedImages].filter(image => image.getAttribute("src") && image.complete && image.naturalWidth === 0).map(image => image.src);
}

/** Two frames and a task, so pending bitmaps and layout have landed. */
export async function settleFrames() {
  for (let index = 0; index < 2; index += 1) await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
  await nextTask(50);
}

/**
 * Draws until nothing new is asked for: the first pass requests refine looks and other lazy art,
 * later passes draw it. At most `passes` passes.
 */
export async function drawUntilStable(draw: () => void | Promise<void>, passes = 6) {
  let known = -1;
  for (let pass = 0; pass < passes; pass += 1) {
    await draw();
    const count = await settleImages();
    await settleFrames();
    if (count === known) break;
    known = count;
  }
  // One last pass with everything loaded and every cache warm.
  await draw();
  await settleFrames();
}
