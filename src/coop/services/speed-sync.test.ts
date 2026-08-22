import { describe, expect, it } from "vitest";
import { SPEED_SYNC_RETRY_DELAY_MS, createSpeedSyncTracker } from "./speed-sync";

describe("movement speed synchronization", () => {
  it("does not resend an acknowledged speed or f32 transport drift", () => {
    const tracker = createSpeedSyncTracker();
    expect(tracker.begin(250.1, 0)).toBe(true);
    tracker.accept(250.1);
    tracker.observe(250.10000610351562);
    expect(tracker.begin(250.1, 1)).toBe(false);
  });

  it("resends when a later server write strips the research multiplier", () => {
    const tracker = createSpeedSyncTracker();
    tracker.observe(250.1);
    expect(tracker.begin(250.1, 0)).toBe(false);
    tracker.observe(205);
    expect(tracker.begin(250.1, 1)).toBe(true);
  });

  it("retries a rejected equipment transition after a short backoff", () => {
    const tracker = createSpeedSyncTracker();
    tracker.observe(198);
    expect(tracker.begin(225.5, 0)).toBe(true);
    tracker.reject(225.5, 10);
    expect(tracker.begin(225.5, 10 + SPEED_SYNC_RETRY_DELAY_MS - 1)).toBe(false);
    expect(tracker.begin(225.5, 10 + SPEED_SYNC_RETRY_DELAY_MS)).toBe(true);
  });

  it("serializes speed changes while a reducer is in flight", () => {
    const tracker = createSpeedSyncTracker();
    expect(tracker.begin(205, 0)).toBe(true);
    expect(tracker.begin(225.5, 1)).toBe(false);
    tracker.accept(205);
    expect(tracker.begin(225.5, 2)).toBe(true);
  });
});
