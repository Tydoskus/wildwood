type ReconnectWatchdogOptions = {
  delayMs: number;
  shouldWatch: () => boolean;
  onTimeout: () => void;
  schedule: (callback: () => void, delayMs: number) => number;
  cancel: (timer: number) => void;
};

/** Repeats recovery attempts only while a visible reconnect gate is unresolved. */
export function createReconnectWatchdog(options: ReconnectWatchdogOptions) {
  let timer: number | null = null;

  function clear() {
    if (timer === null) return;
    options.cancel(timer);
    timer = null;
  }

  function refresh() {
    clear();
    if (!options.shouldWatch()) return;
    timer = options.schedule(() => {
      timer = null;
      if (!options.shouldWatch()) return;
      options.onTimeout();
      refresh();
    }, options.delayMs);
  }

  return { clear, refresh, isArmed: () => timer !== null };
}
