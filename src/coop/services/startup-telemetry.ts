import {
  STARTUP_TELEMETRY_MAX_BATCH,
  STARTUP_TELEMETRY_MAX_CLIENT_QUEUE,
  isStartupTelemetryClientVersion,
  isStartupTelemetryIssueCode,
  normalizeStartupTelemetrySample,
  type StartupTelemetryConnectivity,
  type StartupTelemetryIssueCode,
  type StartupTelemetryOutcome,
  type StartupTelemetrySample,
  type StartupTelemetryStage,
} from "../../../shared/startup-telemetry";

type TelemetryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StartupTelemetryInput = {
  stage: StartupTelemetryStage;
  outcome: StartupTelemetryOutcome;
  durationMs: number;
  attempt?: number;
  issueCode?: StartupTelemetryIssueCode;
};

type StartupTelemetryOptions = {
  clientVersion: string;
  storage?: TelemetryStorage | null;
  storageKey?: string;
  now?: () => number;
  connectivity?: () => StartupTelemetryConnectivity;
  maxQueue?: number;
  maxBatch?: number;
};

export type StartupTelemetrySubmit = (samples: StartupTelemetrySample[]) => Promise<unknown>;

export type StartupStageTimer = {
  finish: (outcome?: StartupTelemetryOutcome, issueCode?: StartupTelemetryIssueCode) => StartupTelemetrySample | null;
};

export type ConnectionTelemetryAttempt = {
  advance: (stage: "preparing-session" | "hydrating") => void;
  fail: (issueCode: StartupTelemetryIssueCode) => void;
  ready: () => void;
};

const DEFAULT_STORAGE_KEY = "wildstat-startup-telemetry-v1";
const CONNECTION_STAGES = new Set<StartupTelemetryStage>([
  "connecting",
  "preparing-session",
  "hydrating",
]);

function browserSessionStorage(): TelemetryStorage | undefined {
  try { return sessionStorage; } catch { return undefined; }
}

function browserConnectivity(): StartupTelemetryConnectivity {
  try {
    if (navigator.onLine === true) return "online";
    if (navigator.onLine === false) return "offline";
  } catch {}
  return "unknown";
}

function failureOutcome(issueCode: StartupTelemetryIssueCode): StartupTelemetryOutcome {
  if (issueCode === "auth-cancelled") return "cancelled";
  return issueCode.endsWith("-timeout") ? "timeout" : "failure";
}

/**
 * Durable, privacy-minimal startup diagnostics. The queue contains only the
 * shared allowlisted sample shape and survives an OAuth navigation/reload in
 * the same tab. Delivery never blocks startup and retries on the next flush.
 */
export function createStartupTelemetry(options: StartupTelemetryOptions) {
  const storage = options.storage === undefined ? browserSessionStorage() : options.storage ?? undefined;
  const storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
  const now = options.now ?? (() => performance.now());
  const connectivity = options.connectivity ?? browserConnectivity;
  const clientVersion = isStartupTelemetryClientVersion(options.clientVersion)
    ? options.clientVersion
    : "unknown";
  const maxQueue = Math.max(1, Math.min(
    STARTUP_TELEMETRY_MAX_CLIENT_QUEUE,
    Math.floor(options.maxQueue ?? STARTUP_TELEMETRY_MAX_CLIENT_QUEUE),
  ));
  const maxBatch = Math.max(1, Math.min(
    STARTUP_TELEMETRY_MAX_BATCH,
    Math.floor(options.maxBatch ?? STARTUP_TELEMETRY_MAX_BATCH),
  ));
  let queue: StartupTelemetrySample[] = [];
  let dropped = 0;
  let flushing = false;
  let flushPromise: Promise<boolean> | null = null;

  function persist() {
    if (!storage) return;
    try {
      if (queue.length) storage.setItem(storageKey, JSON.stringify(queue));
      else storage.removeItem(storageKey);
    } catch {}
  }

  function restore() {
    if (!storage) return;
    try {
      const parsed = JSON.parse(storage.getItem(storageKey) || "[]") as unknown;
      if (!Array.isArray(parsed)) throw new Error("Invalid telemetry queue");
      const restored = parsed
        .map(normalizeStartupTelemetrySample)
        .filter((sample): sample is StartupTelemetrySample => sample !== null);
      if (restored.length > maxQueue) dropped += restored.length - maxQueue;
      queue = restored.slice(-maxQueue);
      persist();
    } catch {
      queue = [];
      try { storage.removeItem(storageKey); } catch {}
    }
  }

  function record(input: StartupTelemetryInput) {
    const defaultIssueCode: StartupTelemetryIssueCode = input.outcome === "success" ? "none" : "startup-error";
    const issueCode = isStartupTelemetryIssueCode(input.issueCode)
      ? input.issueCode
      : defaultIssueCode;
    const sample = normalizeStartupTelemetrySample({
      stage: input.stage,
      outcome: input.outcome,
      issueCode,
      durationMs: input.durationMs,
      attempt: input.attempt ?? 0,
      clientVersion,
      connectivity: connectivity(),
    });
    if (!sample) return null;
    queue.push(sample);
    if (queue.length > maxQueue) {
      // Never evict the prefix currently awaiting acknowledgement. If a flush
      // stalls while the queue is full, dropping the newest diagnostic is
      // safer than deleting a different unsent sample after that batch lands.
      if (flushing) queue.pop();
      else queue.splice(0, queue.length - maxQueue);
      dropped += 1;
    }
    persist();
    return sample;
  }

  function beginStage(stage: StartupTelemetryStage, attempt = 0): StartupStageTimer {
    const startedAt = now();
    let finished = false;
    return {
      finish(outcome = "success", issueCode = outcome === "success" ? "none" : "startup-error") {
        if (finished) return null;
        finished = true;
        return record({ stage, outcome, issueCode, durationMs: now() - startedAt, attempt });
      },
    };
  }

  function beginConnectionAttempt(attempt: number): ConnectionTelemetryAttempt {
    let activeStage: StartupTelemetryStage | null = "connecting";
    let stageStartedAt = now();

    function finishActive(outcome: StartupTelemetryOutcome, issueCode: StartupTelemetryIssueCode) {
      if (!activeStage) return;
      record({ stage: activeStage, outcome, issueCode, durationMs: now() - stageStartedAt, attempt });
      activeStage = null;
    }

    return {
      advance(stage) {
        if (!activeStage || activeStage === stage || !CONNECTION_STAGES.has(stage)) return;
        finishActive("success", "none");
        activeStage = stage;
        stageStartedAt = now();
      },
      fail(issueCode) {
        const safeIssueCode = isStartupTelemetryIssueCode(issueCode) && issueCode !== "none"
          ? issueCode
          : "startup-error";
        finishActive(failureOutcome(safeIssueCode), safeIssueCode);
      },
      ready() {
        finishActive("success", "none");
      },
    };
  }

  function flush(submit: StartupTelemetrySubmit): Promise<boolean> {
    if (flushPromise) return flushPromise;
    flushing = true;
    flushPromise = (async () => {
      while (queue.length) {
        const batch = queue.slice(0, maxBatch);
        try {
          await submit(batch);
        } catch {
          return false;
        }
        queue.splice(0, batch.length);
        persist();
      }
      return true;
    })().finally(() => {
      flushing = false;
      flushPromise = null;
    });
    return flushPromise;
  }

  restore();

  return {
    beginConnectionAttempt,
    beginStage,
    clear() {
      queue = [];
      persist();
    },
    flush,
    record,
    snapshot: () => ({ pending: queue.length, dropped, flushing }),
  };
}
