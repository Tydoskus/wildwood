import { describe, expect, it } from "vitest";
import {
  STARTUP_TELEMETRY_RATE_LIMIT,
  STARTUP_TELEMETRY_RATE_WINDOW_MICROS,
  STARTUP_TELEMETRY_RETENTION_MICROS,
  nextStartupTelemetryRateState,
  startupTelemetryIdsToDelete,
} from "./startup-telemetry-policy";

describe("startup telemetry policy", () => {
  it("accepts only the remaining per-identity allowance", () => {
    const current = { windowStartedAtMicros: 10n, sampleCount: STARTUP_TELEMETRY_RATE_LIMIT - 3 };
    expect(nextStartupTelemetryRateState(20n, 8, current)).toEqual({
      windowStartedAtMicros: 10n,
      sampleCount: STARTUP_TELEMETRY_RATE_LIMIT,
      acceptedCount: 3,
    });
    expect(nextStartupTelemetryRateState(30n, 8, {
      windowStartedAtMicros: 10n,
      sampleCount: STARTUP_TELEMETRY_RATE_LIMIT,
    }).acceptedCount).toBe(0);
  });

  it("starts a new allowance after the fixed window or a backwards clock", () => {
    const current = { windowStartedAtMicros: 100n, sampleCount: STARTUP_TELEMETRY_RATE_LIMIT };
    expect(nextStartupTelemetryRateState(100n + STARTUP_TELEMETRY_RATE_WINDOW_MICROS, 4, current))
      .toMatchObject({ acceptedCount: 4, sampleCount: 4 });
    expect(nextStartupTelemetryRateState(99n, 2, current))
      .toEqual({ windowStartedAtMicros: 99n, acceptedCount: 2, sampleCount: 2 });
  });

  it("removes expired rows and then the oldest rows needed for a hard cap", () => {
    const now = STARTUP_TELEMETRY_RETENTION_MICROS + 100n;
    const rows = [
      { id: 4n, recordedAtMicros: now },
      { id: 1n, recordedAtMicros: 99n },
      { id: 3n, recordedAtMicros: now - 1n },
      { id: 2n, recordedAtMicros: now - 2n },
    ];
    expect(startupTelemetryIdsToDelete(rows, now, 2)).toEqual([1n, 2n]);
  });
});
