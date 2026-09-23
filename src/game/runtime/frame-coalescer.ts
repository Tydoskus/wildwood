export type FrameCoalescerScheduler = {
  requestFrame: (callback: () => void) => number;
  cancelFrame: (handle: number) => void;
  setTimer: (callback: () => void, delayMs: number) => number;
  clearTimer: (handle: number) => void;
  hidden: () => boolean;
};

/**
 * A backstop for the animation frame. A hidden tab never runs animation frames,
 * and a tab can be hidden after a frame was requested, so a timer runs the
 * callback anyway. Browsers throttle it in the background; that is fine.
 */
export const FRAME_COALESCER_FALLBACK_MS = 250;

export function browserFrameScheduler(): FrameCoalescerScheduler {
  return {
    requestFrame: (callback) => requestAnimationFrame(() => callback()),
    cancelFrame: (handle) => cancelAnimationFrame(handle),
    setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimer: (handle) => window.clearTimeout(handle),
    hidden: () => typeof document !== "undefined" && document.hidden,
  };
}

/**
 * Runs `run` at most once per animation frame however many times it is
 * requested in between. `flush` runs a pending request now, for a caller that
 * must see the result before it continues.
 */
export function createFrameCoalescer(
  run: () => void,
  scheduler: FrameCoalescerScheduler = browserFrameScheduler(),
  fallbackMs = FRAME_COALESCER_FALLBACK_MS,
) {
  let pending = false;
  let frame: number | null = null;
  let timer: number | null = null;

  function cancel() {
    pending = false;
    if (frame !== null) scheduler.cancelFrame(frame);
    if (timer !== null) scheduler.clearTimer(timer);
    frame = null;
    timer = null;
  }

  function flush() {
    if (!pending) return;
    // Clear first: a request made while `run` executes schedules a fresh pass
    // rather than being swallowed by this one.
    cancel();
    run();
  }

  function request() {
    if (pending) return;
    pending = true;
    const hidden = scheduler.hidden();
    if (!hidden) frame = scheduler.requestFrame(flush);
    timer = scheduler.setTimer(flush, hidden ? 0 : fallbackMs);
  }

  return { request, flush, cancel, pending: () => pending };
}
