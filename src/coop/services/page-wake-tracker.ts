type PageWakeTrackerOptions = {
  longWakeMs: number;
  nowMs: () => number;
  onLongWake: (hiddenForMs: number) => void;
  onResume: (force: boolean, hiddenForMs: number) => void;
};

/** Combines visibility and page lifecycle events without reusing stale hide times. */
export function createPageWakeTracker(options: PageWakeTrackerOptions) {
  let hidden = false;
  let hiddenAtMs = 0;

  function hide() {
    if (hidden) return;
    hidden = true;
    hiddenAtMs = options.nowMs();
  }

  function show(force = false) {
    const wasHidden = hidden;
    const hiddenForMs = wasHidden ? Math.max(0, options.nowMs() - hiddenAtMs) : 0;
    hidden = false;
    hiddenAtMs = 0;
    if (wasHidden && hiddenForMs >= options.longWakeMs) options.onLongWake(hiddenForMs);
    if (wasHidden || force) options.onResume(force, hiddenForMs);
  }

  return { hide, show, isHidden: () => hidden };
}
