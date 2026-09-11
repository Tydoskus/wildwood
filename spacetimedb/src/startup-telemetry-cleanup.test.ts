import { expect, it, vi } from "vitest";
import { Timestamp } from "../../tests/helpers/spacetime-memory-db";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { STARTUP_TELEMETRY_MAX_ROWS, STARTUP_TELEMETRY_RETENTION_MICROS } from "./startup-telemetry-policy";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const sample = { stage: "hydrating", outcome: "failure", issueCode: "subscription-error",
  durationMs: 100, attempt: 1, clientVersion: "0.652", connectivity: "online" };

it("records startup diagnostics without scanning or deleting history", () => {
  const f = crystalFixture();
  f.seed("startupTelemetryEvent", { id: 1n, ...sample, recordedAt: new Timestamp(0n) });
  f.ctx.timestamp = new Timestamp(STARTUP_TELEMETRY_RETENTION_MICROS + 1n);
  const scan = vi.spyOn(f.db.startupTelemetryEvent, "iter");
  const remove = vi.spyOn(f.db.startupTelemetryEvent.id, "delete");
  f.run(server.recordStartupTelemetry, { samples: [sample] });
  expect(f.db.startupTelemetryEvent.count()).toBe(2n);
  expect(scan).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
  scan.mockRestore(); remove.mockRestore();
});

it("cleans expired diagnostics, excess rows, and expired rate limits on the dedicated run", () => {
  const f = crystalFixture();
  f.ctx.timestamp = new Timestamp(STARTUP_TELEMETRY_RETENTION_MICROS + 1n);
  f.seed("startupTelemetryEvent", { id: 1n, ...sample, recordedAt: new Timestamp(0n) });
  for (let n = 2; n <= STARTUP_TELEMETRY_MAX_ROWS + 2; n++)
    f.seed("startupTelemetryEvent", { id: BigInt(n), ...sample, recordedAt: f.ctx.timestamp });
  f.seed("startupTelemetryRateLimit", { sender: f.ctx.sender, windowStartedAt: new Timestamp(0n), sampleCount: 24 });
  f.run(server.cleanupStartupTelemetry);
  expect(f.db.startupTelemetryEvent.count()).toBe(BigInt(STARTUP_TELEMETRY_MAX_ROWS));
  expect(f.db.startupTelemetryEvent.id.find(1n)).toBeNull();
  expect(f.db.startupTelemetryEvent.id.find(2n)).toBeNull();
  expect(f.db.startupTelemetryRateLimit.count()).toBe(0n);
});

it("migrates to one 15-minute telemetry schedule without scanning telemetry in the five-minute sweep", () => {
  const f = crystalFixture();
  f.seed("moduleMigrationState", { id: 0, version: 30 });
  f.ctx.connectionId = null;
  f.run(server.onConnect);
  f.run(server.onConnect);
  expect(f.db.startupTelemetryCleanupSchedule.count()).toBe(1n);
  const at = f.db.startupTelemetryCleanupSchedule.scheduledId.find(0n).scheduledAt;
  expect(at.tag).toBe("Interval");
  expect(at.value.__time_duration_micros__).toBe(900_000_000n);
  const scans = [vi.spyOn(f.db.startupTelemetryEvent, "iter"), vi.spyOn(f.db.startupTelemetryRateLimit, "iter")];
  f.run(server.runMaintenanceSweep);
  for (const scan of scans) { expect(scan).not.toHaveBeenCalled(); scan.mockRestore(); }
});
