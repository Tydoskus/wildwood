type ReconnectSchedulerOptions = {
  canAttempt: () => boolean;
  onlineHint: () => boolean;
  connect: () => void;
  scheduleTimer: (callback: () => void, delayMs: number) => number;
  cancelTimer: (timer: number) => void;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  random?: () => number;
};

/**
 * Schedules reconnects while treating navigator.onLine as a hint, not proof.
 * Wake recovery may bypass a stale offline hint; ordinary retries still wait.
 */
export function createReconnectScheduler(options: ReconnectSchedulerOptions) {
  let timer: number | null = null;
  let consecutiveAttempts = 0;
  let pendingDelayMs: number | null = null;
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 1_000);
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? 30_000);
  const jitterRatio = Math.min(1, Math.max(0, options.jitterRatio ?? .2));
  const random = options.random ?? Math.random;

  function clear() {
    if (timer === null) return;
    options.cancelTimer(timer);
    timer = null;
    pendingDelayMs = null;
  }

  function automaticDelayMs() {
    const unjittered = Math.min(maxDelayMs, baseDelayMs * (2 ** consecutiveAttempts));
    const multiplier = 1 - jitterRatio + random() * jitterRatio * 2;
    return Math.min(maxDelayMs, Math.max(0, Math.round(unjittered * multiplier)));
  }

  function schedule(delayMs?: number, bypassOnlineHint = false) {
    if (timer !== null || !options.canAttempt()) return false;
    if (!bypassOnlineHint && !options.onlineHint()) return false;
    const automatic = delayMs === undefined;
    const scheduledDelayMs = automatic ? automaticDelayMs() : Math.max(0, delayMs);
    pendingDelayMs = scheduledDelayMs;
    timer = options.scheduleTimer(() => {
      timer = null;
      pendingDelayMs = null;
      if (!options.canAttempt()) return;
      if (!bypassOnlineHint && !options.onlineHint()) return;
      if (automatic) consecutiveAttempts += 1;
      options.connect();
    }, scheduledDelayMs);
    return true;
  }

  function reset() {
    clear();
    consecutiveAttempts = 0;
  }

  return {
    clear,
    reset,
    schedule,
    attemptCount: () => consecutiveAttempts,
    isScheduled: () => timer !== null,
    pendingDelayMs: () => pendingDelayMs,
  };
}
