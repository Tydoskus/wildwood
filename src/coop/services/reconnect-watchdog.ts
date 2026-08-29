type ReconnectWatchdogOptions = {
  delayMs: number;
  shouldWatch: () => boolean;
  onTimeout: () => void;
  deadlineMs?: number;
  shouldUseDeadline?: () => boolean;
  onDeadline?: () => void;
  schedule: (callback: () => void, delayMs: number) => number;
  cancel: (timer: number) => void;
};

/** Repeats recovery attempts only while a visible reconnect gate is unresolved. */
export function createReconnectWatchdog(options: ReconnectWatchdogOptions) {
  let timer: number | null = null;
  let deadlineTimer: number | null = null;

  function clearRetry() {
    if (timer === null) return;
    options.cancel(timer);
    timer = null;
  }

  function clearDeadline() {
    if (deadlineTimer === null) return;
    options.cancel(deadlineTimer);
    deadlineTimer = null;
  }

  function clear() {
    clearRetry();
    clearDeadline();
  }

  function refreshDeadline() {
    if (options.deadlineMs === undefined || !options.shouldUseDeadline?.()) {
      clearDeadline();
      return;
    }
    if (deadlineTimer !== null) return;
    deadlineTimer = options.schedule(() => {
      deadlineTimer = null;
      if (options.shouldUseDeadline?.()) options.onDeadline?.();
    }, options.deadlineMs);
  }

  function refresh() {
    clearRetry();
    refreshDeadline();
    if (!options.shouldWatch()) return;
    timer = options.schedule(() => {
      timer = null;
      if (!options.shouldWatch()) return;
      options.onTimeout();
      refresh();
    }, options.delayMs);
  }

  return { clear, refresh, isArmed: () => timer !== null || deadlineTimer !== null };
}
