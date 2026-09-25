import { reducerErrorMessage } from "./reducer-errors";

/**
 * How long a tab may be hidden before returning to it is treated as waking
 * from a long absence: the overlay, and a session health check.
 *
 * Two minutes, raised from twenty seconds on 2026-09-22. A healthy socket
 * survives a tab switch perfectly well, and the old window meant anyone who
 * glanced at another window for half a minute came back to a reconnect notice
 * for a connection that was fine. A dead transport is still caught at once, by
 * the isActive check above this grace period rather than by waiting it out.
 *
 * Five minutes since 2026-09-25, to match the quiet return window: a live
 * socket is kept without a check for as long as a closed one reconnects quietly.
 */
export const TAB_AWAY_GRACE_MS = 5 * 60_000;
type WakeConnection = { isActive: boolean; reducers: { resumeSession: (args: {}) => Promise<unknown> } };

/** A short tab switch preserves healthy transports. A dead transport never waits
 * for the grace period; longer absences get one bounded health check. */
export function createWakeRecovery<T extends WakeConnection>(options: {
  now: () => number; hidden: () => boolean; blocked: () => boolean; connecting: () => boolean;
  connection: () => T | null; activityAge: () => number;
  refreshWatchdog: () => void; clearOverlay: () => void; clearNetworkOverlay: () => void;
  changed: () => void; touchActivity: () => void; restart: () => void;
  failure: (error: unknown) => void;
  diagnostic: (kind: "wake-resume" | "wake-reconnect", detail: string, hiddenForMs: number) => void;
  schedule: (callback: () => void, delay: number) => number; cancelTimer: (timer: number) => void;
}) {
  let generation = 0, probing = false, timer: number | undefined;
  let shortReturnAt = -Infinity;
  function cancel() {
    generation++; probing = false;
    if (timer !== undefined) options.cancelTimer(timer);
    timer = undefined;
  }
  function restart(reason: string, hiddenForMs: number) {
    options.diagnostic("wake-reconnect", reason, hiddenForMs);
    cancel(); options.restart();
  }
  function resume(force = false, hiddenForMs = 0) {
    if (options.blocked()) { options.clearOverlay(); options.clearNetworkOverlay(); return; }
    if (options.hidden()) return;
    options.refreshWatchdog();
    if (force && (options.connecting() || probing)) { restart("page-restored", hiddenForMs); return; }
    if (options.connecting() || probing) return;
    const conn = options.connection();
    if (force || !conn?.isActive) {
      restart(force ? "page-restored" : "socket-inactive", hiddenForMs);
      return;
    }
    if (hiddenForMs > 0 && hiddenForMs < TAB_AWAY_GRACE_MS) {
      shortReturnAt = options.now();
      options.diagnostic("wake-resume", "short-return-kept-connection", hiddenForMs);
      options.clearOverlay(); options.changed(); return;
    }
    // Browsers commonly send focus immediately after visibilitychange (or just
    // before it). Neither event should undo the short-return grace decision.
    if (options.now() - shortReturnAt < 3_000 || hiddenForMs < TAB_AWAY_GRACE_MS && options.activityAge() < 30_000) {
      options.changed(); return;
    }
    const attempt = ++generation;
    probing = true;
    options.diagnostic("wake-resume", "checking-session", hiddenForMs);
    const current = () => attempt === generation && options.connection() === conn;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = options.schedule(() => reject(new Error("Resume check timed out")), 5_000);
    });
    void Promise.race([Promise.resolve().then(() => conn.reducers.resumeSession({})), timeout]).then(() => {
      if (!current()) return;
      options.touchActivity(); options.clearOverlay(); options.changed();
    }).catch(error => {
      if (!current()) return;
      if (/active in another tab/i.test(reducerErrorMessage(error))) {
        options.failure(error); options.clearOverlay(); return;
      }
      restart(error instanceof Error && /timed out/i.test(error.message) ? "resume-check-timeout" : "resume-check-failed", hiddenForMs);
    }).finally(() => { if (attempt === generation) cancel(); });
  }
  return { resume, cancel };
}
