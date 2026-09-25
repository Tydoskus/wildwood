/**
 * A phone closes the page's socket within seconds of the player leaving the
 * app, and no page can keep it open. The server keeps the character either
 * way, so a return within this window reconnects behind the game with a small
 * badge instead of the full-screen reconnect overlay.
 */
export const QUIET_RETURN_ABSENCE_MS = 5 * 60_000;

/** A quiet reconnect that has not finished by then shows the full overlay, with its retry button. */
export const QUIET_RETURN_BUDGET_MS = 12_000;

export function createQuietReturn(options: {
  now: () => number;
  schedule: (callback: () => void, delayMs: number) => number;
  cancelTimer: (timer: number) => void;
  changed: () => void;
}) {
  let hiddenAt: number | null = null;
  let quietUntil = 0;
  let timer: number | undefined;

  function clearTimer() {
    if (timer !== undefined) options.cancelTimer(timer);
    timer = undefined;
  }

  function hide() {
    if (hiddenAt !== null) return;
    hiddenAt = options.now();
    quietUntil = 0;
    clearTimer();
  }

  function show() {
    if (hiddenAt === null) return;
    const absentMs = options.now() - hiddenAt;
    hiddenAt = null;
    if (absentMs >= QUIET_RETURN_ABSENCE_MS) return;
    quietUntil = options.now() + QUIET_RETURN_BUDGET_MS;
    clearTimer();
    timer = options.schedule(() => { timer = undefined; quietUntil = 0; options.changed(); }, QUIET_RETURN_BUDGET_MS);
  }

  /** The session is back; the next disconnect is judged on its own. */
  function settle() {
    quietUntil = 0;
    clearTimer();
  }

  /** True while away for less than the window, and for a short budget after coming back. */
  function active() {
    if (hiddenAt !== null) return options.now() - hiddenAt < QUIET_RETURN_ABSENCE_MS;
    return options.now() < quietUntil;
  }

  return { hide, show, settle, active };
}

/** Registered before the page wake tracker's listeners, so the reconnect that tracker starts is already quiet. */
export function installQuietReturn(doc: Document, win: Window, changed: () => void) {
  const quiet = createQuietReturn({ now: () => Date.now(), changed,
    schedule: (callback, delayMs) => win.setTimeout(callback, delayMs), cancelTimer: timer => win.clearTimeout(timer) });
  doc.addEventListener("visibilitychange", () => { if (doc.hidden) quiet.hide(); else quiet.show(); });
  win.addEventListener("pagehide", quiet.hide);
  win.addEventListener("pageshow", quiet.show);
  return quiet;
}
