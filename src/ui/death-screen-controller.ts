export const DEATH_RESPAWN_DELAY_MS = 5_000;

type DeathScreenClock = {
  now: () => number;
  setTimeout: (callback: () => void, delayMs: number) => ReturnType<typeof globalThis.setTimeout>;
  clearTimeout: (timer: ReturnType<typeof globalThis.setTimeout>) => void;
};

export function formatDeathCountdown(remainingMs: number) {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1_000));
  return seconds > 0 ? `returning to spawn in ${seconds}` : "returning to spawn";
}

/** Owns death-screen visibility and its automatic return-to-spawn timer. */
export function createDeathScreenController(options: {
  screen: HTMLElement;
  countdown: HTMLElement;
  onRespawn: () => void;
  delayMs?: number;
  clock?: DeathScreenClock;
}) {
  const clock = options.clock ?? {
    now: () => performance.now(),
    setTimeout: (callback: () => void, delayMs: number) => globalThis.setTimeout(callback, delayMs),
    clearTimeout: (timer: ReturnType<typeof globalThis.setTimeout>) => globalThis.clearTimeout(timer),
  };
  const delayMs = Math.max(0, options.delayMs ?? DEATH_RESPAWN_DELAY_MS);
  let deadline = 0;
  let timer: ReturnType<typeof globalThis.setTimeout> | null = null;

  function clearTimer() {
    if (timer === null) return;
    clock.clearTimeout(timer);
    timer = null;
  }

  function hide() {
    clearTimer();
    options.screen.hidden = true;
  }

  function tick() {
    const remainingMs = Math.max(0, deadline - clock.now());
    options.countdown.textContent = formatDeathCountdown(remainingMs);
    if (remainingMs <= 0) {
      timer = null;
      options.onRespawn();
      return;
    }
    timer = clock.setTimeout(tick, Math.min(250, remainingMs));
  }

  function show() {
    clearTimer();
    deadline = clock.now() + delayMs;
    options.screen.hidden = false;
    tick();
  }

  return { hide, show };
}
