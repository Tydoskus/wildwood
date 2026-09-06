/** Shared limits for every continuously animated game canvas. */
export const MAX_RENDER_FPS = 60;
// Allow sub-millisecond timestamp jitter without dropping a 60 Hz screen to 30.
export const FRAME_DEADLINE_TOLERANCE_MS = 1;

export function frameDeadlineReached(now: number, nextFrameAt: number) {
  return now + FRAME_DEADLINE_TOLERANCE_MS >= nextFrameAt;
}

/** Keep the phase on 90/120/144 Hz screens without catch-up render bursts. */
export function nextPresentationDeadline(now: number, previousDeadline: number, fps = MAX_RENDER_FPS) {
  const interval = 1_000 / Math.min(MAX_RENDER_FPS, Math.max(1, fps));
  const next = previousDeadline + interval;
  return next < now ? now + interval : next;
}

/** 2× keeps canvas detail while bounding fill cost on 3×/4× phone displays.
 * DOM text and controls still use the screen's native resolution. */
export function canvasRenderPixelRatio(pixelRatio: number) {
  return Math.min(2, Math.max(1, Number.isFinite(pixelRatio) ? pixelRatio : 1));
}
