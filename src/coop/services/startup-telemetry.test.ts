import { describe, expect, it, vi } from "vitest";
import type { StartupTelemetrySample } from "../../../shared/startup-telemetry";
import { createStartupTelemetry } from "./startup-telemetry";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe("startup telemetry", () => {
  it("persists only the fixed, sanitized event contract", () => {
    const storage = new MemoryStorage();
    const telemetry = createStartupTelemetry({
      clientVersion: "0.591",
      storage,
      connectivity: () => "online",
    });

    telemetry.record({
      stage: "authentication",
      outcome: "failure",
      issueCode: "auth-network-error",
      durationMs: 1200,
    });

    const serialized = storage.getItem("wildstat-startup-telemetry-v1") ?? "";
    expect(JSON.parse(serialized)).toEqual([{
      stage: "authentication",
      outcome: "failure",
      issueCode: "auth-network-error",
      durationMs: 1200,
      attempt: 0,
      clientVersion: "0.591",
      connectivity: "online",
    }]);
    expect(serialized).not.toMatch(/token|identity|name|https?:|error message/i);
  });

  it("drops malformed persisted fields and caps the queue at the newest samples", () => {
    const storage = new MemoryStorage();
    storage.setItem("telemetry", JSON.stringify([
      {
        stage: "hydrating",
        outcome: "failure",
        issueCode: "subscription-error",
        durationMs: 50,
        attempt: 1,
        clientVersion: "0.591",
        connectivity: "online",
        token: "secret",
      },
      { stage: "https://example.test/?code=secret", error: "raw failure" },
    ]));
    const telemetry = createStartupTelemetry({
      clientVersion: "0.591",
      storage,
      storageKey: "telemetry",
      maxQueue: 2,
      connectivity: () => "unknown",
    });
    telemetry.record({ stage: "connecting", outcome: "failure", issueCode: "connection-error", durationMs: 10 });
    telemetry.record({ stage: "connecting", outcome: "timeout", issueCode: "connection-timeout", durationMs: 20 });

    expect(telemetry.snapshot()).toMatchObject({ pending: 2, dropped: 1 });
    expect(storage.getItem("telemetry") ?? "").not.toMatch(/secret|https?:|raw failure/);
  });

  it("measures connection phases once and classifies timeout failures", () => {
    let now = 100;
    const telemetry = createStartupTelemetry({
      clientVersion: "0.591",
      storage: null,
      now: () => now,
      connectivity: () => "offline",
    });
    const attempt = telemetry.beginConnectionAttempt(3);
    now = 350;
    attempt.advance("preparing-session");
    now = 500;
    attempt.advance("hydrating");
    now = 900;
    attempt.fail("hydration-timeout");
    attempt.ready();

    const sent: StartupTelemetrySample[][] = [];
    return telemetry.flush(async (samples) => { sent.push(samples); }).then(() => {
      expect(sent.flat()).toEqual([
        expect.objectContaining({ stage: "connecting", outcome: "success", durationMs: 250, attempt: 3 }),
        expect.objectContaining({ stage: "preparing-session", outcome: "success", durationMs: 150, attempt: 3 }),
        expect.objectContaining({ stage: "hydrating", outcome: "timeout", issueCode: "hydration-timeout", durationMs: 400, attempt: 3 }),
      ]);
    });
  });

  it("retains a failed batch, drains bounded batches, and coalesces concurrent flushes", async () => {
    const telemetry = createStartupTelemetry({
      clientVersion: "0.591",
      storage: null,
      maxBatch: 2,
      connectivity: () => "online",
    });
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      telemetry.record({ stage: "connecting", outcome: "failure", issueCode: "connection-error", durationMs: attempt, attempt });
    }
    const failed = await telemetry.flush(async () => { throw new Error("unavailable"); });
    expect(failed).toBe(false);
    expect(telemetry.snapshot().pending).toBe(3);

    let releaseFirstBatch = () => {};
    let submission = 0;
    const submit = vi.fn(async (_samples: StartupTelemetrySample[]) => {
      submission += 1;
      if (submission === 1) await new Promise<void>((resolve) => { releaseFirstBatch = resolve; });
    });
    const firstFlush = telemetry.flush(submit);
    const secondFlush = telemetry.flush(submit);
    expect(secondFlush).toBe(firstFlush);
    releaseFirstBatch();
    await firstFlush;
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls.map(([batch]) => batch.length)).toEqual([2, 1]);
    expect(telemetry.snapshot()).toMatchObject({ pending: 0, flushing: false });
  });
});
