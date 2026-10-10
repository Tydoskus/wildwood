/**
 * Canvases that are otherwise drawn once and left — a profile portrait, a
 * podium character — but show something that moves (a Galaxy piece's finish).
 * One shared loop redraws them up to twenty times a second, and only while
 * each is on the page, laid out and the tab is visible; it stops when none are
 * left. Reduced motion never registers anything: one still frame is right.
 */
const canvases = new Map<HTMLCanvasElement, () => void>();
const FRAME_MS = 1_000 / 20;
let request = 0, painted = 0;
let reducedMotion: MediaQueryList | null | undefined;

function prefersReducedMotion() {
  if (reducedMotion === undefined) {
    reducedMotion = typeof globalThis.matchMedia === "function" ? globalThis.matchMedia("(prefers-reduced-motion: reduce)") : null;
  }
  return reducedMotion?.matches === true;
}

function tick(now: number) {
  request = 0;
  if (!canvases.size) return;
  if (now - painted >= FRAME_MS && (typeof document === "undefined" || document.visibilityState !== "hidden")) {
    painted = now;
    for (const [canvas, repaint] of [...canvases]) {
      if (!canvas.isConnected) { canvases.delete(canvas); continue; }
      // A closed window's or a hidden row's canvas has no boxes and costs nothing.
      if (!canvas.getClientRects().length) continue;
      try { repaint(); } catch { canvases.delete(canvas); }
    }
  }
  if (canvases.size) request = globalThis.requestAnimationFrame?.(tick) ?? 0;
}

/** Keeps `canvas` redrawn by `repaint` while it is shown; null (or a still look) stops it. */
export function keepCanvasMoving(canvas: HTMLCanvasElement, repaint: (() => void) | null) {
  if (!repaint || prefersReducedMotion()) { canvases.delete(canvas); return; }
  canvases.set(canvas, repaint);
  if (!request) request = globalThis.requestAnimationFrame?.(tick) ?? 0;
}

/** Tests only. */
export function movingCanvasCount() { return canvases.size; }
