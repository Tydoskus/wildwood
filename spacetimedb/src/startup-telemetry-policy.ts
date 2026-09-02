import { STARTUP_TELEMETRY_MAX_BATCH } from "../../shared/startup-telemetry";

export const STARTUP_TELEMETRY_RATE_LIMIT = 24;
export const STARTUP_TELEMETRY_RATE_WINDOW_MICROS = 15n * 60n * 1_000_000n;
export const STARTUP_TELEMETRY_RETENTION_MICROS = 7n * 24n * 60n * 60n * 1_000_000n;
export const STARTUP_TELEMETRY_MAX_ROWS = 5_000;

export type StartupTelemetryRateState = {
  windowStartedAtMicros: bigint;
  sampleCount: number;
};

export function nextStartupTelemetryRateState(
  nowMicros: bigint,
  requestedCount: number,
  current?: StartupTelemetryRateState,
): StartupTelemetryRateState & { acceptedCount: number } {
  const requested = Math.max(0, Math.min(STARTUP_TELEMETRY_MAX_BATCH, Math.floor(requestedCount)));
  const windowExpired = !current || nowMicros < current.windowStartedAtMicros ||
    nowMicros - current.windowStartedAtMicros >= STARTUP_TELEMETRY_RATE_WINDOW_MICROS;
  const windowStartedAtMicros = windowExpired ? nowMicros : current.windowStartedAtMicros;
  const sampleCount = windowExpired ? 0 : Math.max(0, current.sampleCount);
  const acceptedCount = Math.min(requested, Math.max(0, STARTUP_TELEMETRY_RATE_LIMIT - sampleCount));
  return {
    windowStartedAtMicros,
    sampleCount: sampleCount + acceptedCount,
    acceptedCount,
  };
}

type StartupTelemetryRetentionRow = {
  id: bigint;
  recordedAtMicros: bigint;
};

/** Returns stale rows first, then the oldest retained rows needed for the cap. */
export function startupTelemetryIdsToDelete(
  rows: readonly StartupTelemetryRetentionRow[],
  nowMicros: bigint,
  maxRows = STARTUP_TELEMETRY_MAX_ROWS,
) {
  const cutoff = nowMicros - STARTUP_TELEMETRY_RETENTION_MICROS;
  const staleIds: bigint[] = [];
  const retained: StartupTelemetryRetentionRow[] = [];
  for (const row of rows) {
    if (row.recordedAtMicros < cutoff) staleIds.push(row.id);
    else retained.push(row);
  }
  retained.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const overflow = Math.max(0, retained.length - Math.max(0, Math.floor(maxRows)));
  return [...staleIds, ...retained.slice(0, overflow).map(({ id }) => id)];
}
