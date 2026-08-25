import { PLAYER_DEATH_FALL_DURATION_MS } from "../game/runtime/player-death-animation";

export const DEATH_RESPAWN_DELAY_MS = 3_000;
export const DEATH_SCREEN_REVEAL_DELAY_MS = PLAYER_DEATH_FALL_DURATION_MS;

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
  revealDelayMs?: number;
  clock?: DeathScreenClock;
}) {
  const clock = options.clock ?? {
    now: () => performance.now(),
    setTimeout: (callback: () => void, delayMs: number) => globalThis.setTimeout(callback, delayMs),
    clearTimeout: (timer: ReturnType<typeof globalThis.setTimeout>) => globalThis.clearTimeout(timer),
  };
  const delayMs = Math.max(0, options.delayMs ?? DEATH_RESPAWN_DELAY_MS);
  const revealDelayMs = Math.max(0, options.revealDelayMs ?? DEATH_SCREEN_REVEAL_DELAY_MS);
  let deadline = 0;
  let timer: ReturnType<typeof globalThis.setTimeout> | null = null;

  function clearTimer() {
    if (timer === null) return;
    clock.clearTimeout(timer);
    timer = null;
  }

  function hide() {
    clearTimer();
    options.screen.classList?.remove("is-visible");
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

  function reveal() {
    deadline = clock.now() + delayMs;
    options.screen.hidden = false;
    void options.screen.offsetWidth;
    options.screen.classList?.add("is-visible");
    tick();
  }

  function show() {
    clearTimer();
    options.screen.classList?.remove("is-visible");
    options.screen.hidden = true;
    options.countdown.textContent = formatDeathCountdown(delayMs);
    if (revealDelayMs === 0) {
      reveal();
      return;
    }
    timer = clock.setTimeout(() => {
      timer = null;
      reveal();
    }, revealDelayMs);
  }

  return { hide, show };
}
