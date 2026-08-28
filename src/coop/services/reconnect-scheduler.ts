type ReconnectSchedulerOptions = {
  canAttempt: () => boolean;
  onlineHint: () => boolean;
  connect: () => void;
  scheduleTimer: (callback: () => void, delayMs: number) => number;
  cancelTimer: (timer: number) => void;
};

/**
 * Schedules reconnects while treating navigator.onLine as a hint, not proof.
 * Wake recovery may bypass a stale offline hint; ordinary retries still wait.
 */
export function createReconnectScheduler(options: ReconnectSchedulerOptions) {
  let timer: number | null = null;

  function clear() {
    if (timer === null) return;
    options.cancelTimer(timer);
    timer = null;
  }

  function schedule(delayMs = 500, bypassOnlineHint = false) {
    if (timer !== null || !options.canAttempt()) return false;
    if (!bypassOnlineHint && !options.onlineHint()) return false;
    timer = options.scheduleTimer(() => {
      timer = null;
      if (!options.canAttempt()) return;
      if (!bypassOnlineHint && !options.onlineHint()) return;
      options.connect();
    }, delayMs);
    return true;
  }

  return { clear, schedule, isScheduled: () => timer !== null };
}
