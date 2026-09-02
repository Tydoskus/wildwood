export type ConnectionPhase =
  | "idle"
  | "connecting"
  | "preparing-session"
  | "hydrating"
  | "ready"
  | "retrying"
  | "blocked";

export type ConnectionIssueCode =
  | "connection-timeout"
  | "session-timeout"
  | "hydration-timeout"
  | "connection-error"
  | "connection-closed"
  | "session-error"
  | "subscription-error";

export type ConnectionIssue = {
  code: ConnectionIssueCode;
  message: string;
  phase: ConnectionPhase;
  attempt: number;
  elapsedMs: number;
  occurredAtMs: number;
};

export type ConnectionDiagnostics = {
  phase: ConnectionPhase;
  attempt: number;
  phaseElapsedMs: number;
  issue: ConnectionIssue | null;
  phaseDurationsMs: Partial<Record<ConnectionPhase, number>>;
};

type ConnectionLifecycleOptions = {
  now: () => number;
  scheduleTimer: (callback: () => void, delayMs: number) => number;
  cancelTimer: (timer: number) => void;
  onTimeout: (phase: ConnectionPhase) => void;
  onIssue?: (issue: ConnectionIssue) => void;
};

/** Tracks bounded connection phases without owning the connection itself. */
export function createConnectionLifecycle(options: ConnectionLifecycleOptions) {
  let phase: ConnectionPhase = "idle";
  let phaseStartedAt = options.now();
  let attempt = 0;
  let issue: ConnectionIssue | null = null;
  let timer: number | null = null;
  const phaseDurationsMs: Partial<Record<ConnectionPhase, number>> = {};

  function clearTimer() {
    if (timer === null) return;
    options.cancelTimer(timer);
    timer = null;
  }

  function transition(nextPhase: ConnectionPhase, timeoutMs?: number) {
    clearTimer();
    const now = options.now();
    if (nextPhase !== phase) {
      phaseDurationsMs[phase] = Math.max(0, now - phaseStartedAt);
      phase = nextPhase;
      phaseStartedAt = now;
    }
    if (timeoutMs === undefined) return;
    const expectedPhase = nextPhase;
    timer = options.scheduleTimer(() => {
      timer = null;
      if (phase === expectedPhase) options.onTimeout(expectedPhase);
    }, Math.max(0, timeoutMs));
  }

  function beginAttempt(timeoutMs: number) {
    attempt += 1;
    transition("connecting", timeoutMs);
  }

  function fail(code: ConnectionIssueCode, message: string) {
    const now = options.now();
    const nextIssue: ConnectionIssue = {
      code,
      message,
      phase,
      attempt,
      elapsedMs: Math.max(0, now - phaseStartedAt),
      occurredAtMs: now,
    };
    issue = nextIssue;
    transition("retrying");
    options.onIssue?.(nextIssue);
    return nextIssue;
  }

  function ready() {
    transition("ready");
    issue = null;
    attempt = 0;
  }

  function reset() {
    transition("idle");
    issue = null;
    attempt = 0;
  }

  function snapshot(): ConnectionDiagnostics {
    return {
      phase,
      attempt,
      phaseElapsedMs: Math.max(0, options.now() - phaseStartedAt),
      issue,
      phaseDurationsMs: { ...phaseDurationsMs },
    };
  }

  return { beginAttempt, fail, ready, reset, snapshot, transition };
}
