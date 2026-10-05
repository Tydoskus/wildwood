/**
 * A phone can throw away the pixels of every off-page canvas while the game is
 * in the background (Chrome loses their 2D contexts with the GPU; the canvas
 * comes back blank). The game keeps nearly all its art in such canvases (the
 * sprite sheets after their green is keyed out, every player's body, enemy
 * tints, text labels), built once and never checked, so players came back to
 * an invisible character and missing sprites. Rebuilding each cache is a
 * dozen separate paths; instead a sentinel canvas, made the way they are, is
 * checked on every return, and a wiped one saves and reloads the game, which
 * builds everything again. The on-page game canvas is watched too: after a
 * GPU crash Chrome can leave its context lost for good, and the game drew
 * every frame into nothing, so most of the screen stayed black.
 *
 * 0.899.0 reloaded far too readily: a desktop player was reloaded on every
 * tab switch. Browsers that guard against fingerprinting add noise to every
 * canvas read, so "the sentinel's pixel is not exactly what was drawn" was
 * true each time; and a context Chrome loses and restores by itself counted
 * as lost for good. Now only a sentinel read back as fully blank (all four
 * channels zero, at several points), or a game canvas still lost after
 * LOST_GRACE_MS, counts; and it never reloads twice inside RELOAD_COOLDOWN_MS.
 */
export const SENTINEL_SIZE = 512;
const RETRY_MS = 5_000;
/** How often the watched canvases' lost flag is read: a boolean, no pixels. Chrome may never fire contextlost. */
export const WATCH_INTERVAL_MS = 1_000;
/** A game canvas lost this long, while in view, is lost for good; Chrome restores a passing loss sooner. */
export const LOST_GRACE_MS = 3_000;
/** Never reload for this more than once in this long, whatever the checks say: a loop is worse than the bug. */
export const RELOAD_COOLDOWN_MS = 5 * 60_000;
const RELOADED_AT_KEY = "wildstat:canvas-purge-reloaded-at";

type SentinelContext = Pick<CanvasRenderingContext2D, "fillRect" | "getImageData"> & { fillStyle: unknown; isContextLost?: () => boolean };
type SentinelCanvas = { width: number; height: number; getContext(type: "2d"): SentinelContext | null; addEventListener(type: string, listener: () => void): void };
type SessionStore = Pick<Storage, "getItem" | "setItem">;

/** A wiped canvas reads back as nothing at all; noise from fingerprinting guards never reads as all zeros everywhere. */
function wiped(context: SentinelContext) {
  try {
    for (const [x, y] of [[SENTINEL_SIZE / 4, SENTINEL_SIZE / 4], [SENTINEL_SIZE / 2, SENTINEL_SIZE / 2], [SENTINEL_SIZE * 3 / 4, SENTINEL_SIZE * 3 / 4]]) {
      const data = context.getImageData(x, y, 1, 1).data;
      if (data[0] || data[1] || data[2] || data[3]) return false;
    }
    return true;
  } catch { return false; }
}

export function installCanvasPurgeRecovery(options: {
  /** Saves and reloads; resolves false when it could not save yet. */
  reload: () => Promise<boolean>;
  /** On-page 2D canvases whose lost context means a blank screen. */
  watch?: readonly SentinelCanvas[];
  doc?: Pick<Document, "hidden" | "addEventListener"> & { createElement(tag: "canvas"): SentinelCanvas };
  now?: () => number;
  /** Remembers the last reload across it (sessionStorage), so a reload cannot loop. */
  session?: () => SessionStore | undefined;
}) {
  const doc = options.doc ?? (document as unknown as NonNullable<typeof options.doc>);
  const now = options.now ?? (() => Date.now());
  const session = options.session ?? (() => { try { return sessionStorage; } catch { return undefined; } });
  // Large enough to be GPU-backed like the sprite sheets; a tiny canvas stays in memory and is never lost.
  const sentinel = doc.createElement("canvas");
  sentinel.width = sentinel.height = SENTINEL_SIZE;
  const context = sentinel.getContext("2d");
  if (!context) return { lost: () => false, recover: () => {} };
  context.fillStyle = "#ff00ff";
  context.fillRect(0, 0, SENTINEL_SIZE, SENTINEL_SIZE);
  const watched = (options.watch ?? []).map(canvas => canvas.getContext("2d")).filter(Boolean) as SentinelContext[];
  let reloading = false, watchedLostSince: number | null = null;
  const watchedLost = () => watched.some(watchedContext => watchedContext.isContextLost?.());
  const lost = () => (watchedLostSince !== null && now() - watchedLostSince >= LOST_GRACE_MS) || wiped(context);
  const recentlyReloaded = () => {
    try { const at = Number(session()?.getItem(RELOADED_AT_KEY)); return Number.isFinite(at) && at > 0 && now() - at < RELOAD_COOLDOWN_MS; } catch { return false; }
  };
  const recover = () => {
    if (reloading || doc.hidden || recentlyReloaded() || !lost()) return;
    reloading = true;
    try { session()?.setItem(RELOADED_AT_KEY, String(now())); } catch { /* The cooldown then lasts this page only. */ }
    // Not saved, not reloaded: the cooldown is for reloads that happen, so the retry may go ahead.
    const retry = () => { try { session()?.setItem(RELOADED_AT_KEY, "0"); } catch { /* No cooldown was kept. */ }
      setTimeout(() => { reloading = false; recover(); }, RETRY_MS); };
    void options.reload().then(done => { if (!done) retry(); }, retry);
  };
  doc.addEventListener("visibilitychange", recover);
  if (typeof window !== "undefined") window.addEventListener("pageshow", recover);
  // After a GPU crash Chrome left the game canvas lost without firing contextlost (checked in headless Chrome).
  if (watched.length) setInterval(() => {
    if (doc.hidden) return;
    if (!watchedLost()) { watchedLostSince = null; return; }
    watchedLostSince ??= now();
    recover();
  }, WATCH_INTERVAL_MS);
  return { lost, recover };
}
