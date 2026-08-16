import { describe, expect, it } from "vitest";
import {
  adaptiveRemoteRenderAt,
  appendRemoteTimelineSample,
  createRemoteInterpolationClock,
  createRestartRemoteInterpolationClock,
  observeRemoteSample,
  remoteMotionAt,
  type TimestampedRemoteMotionSample,
} from "./remote-interpolation";

describe("adaptive remote interpolation", () => {
  it("buffers a 3 Hz stream enough to keep a future sample available", () => {
    const clock = createRemoteInterpolationClock(0);
    observeRemoteSample(clock, 333, 333);
    for (let now = 16; now <= 500; now += 16) adaptiveRemoteRenderAt(clock, now);
    expect(clock.targetDelayMs).toBeGreaterThan(400);
    expect(clock.delayMs).toBeGreaterThan(400);
  });

  it("returns smoothly to a responsive delay for a 15 Hz stream", () => {
    const clock = createRemoteInterpolationClock(0);
    observeRemoteSample(clock, 333, 333);
    for (let now = 16; now <= 500; now += 16) adaptiveRemoteRenderAt(clock, now);
    let previousRenderAt = adaptiveRemoteRenderAt(clock, 516);
    for (let now = 550; now <= 2_500; now += 50) {
      observeRemoteSample(clock, 67, 67);
      const renderAt = adaptiveRemoteRenderAt(clock, now);
      expect(renderAt).toBeGreaterThanOrEqual(previousRenderAt);
      previousRenderAt = renderAt;
    }
    expect(clock.delayMs).toBeLessThan(175);
  });

  it("bridges the first distant-rate gap without an unbounded prediction", () => {
    const samples = [
      { timelineAt: -50, x: 0, y: 0, facing: 0, moving: true },
      { timelineAt: 0, x: 9, y: 0, facing: 0, moving: true },
    ];
    expect(remoteMotionAt(samples, 125, 180).x).toBeCloseTo(31.5);
    expect(remoteMotionAt(samples, 500, 180).x).toBeCloseTo(45);
  });

  it("never predicts beyond a confirmed stop", () => {
    const samples = [
      { timelineAt: 0, x: 0, y: 0, facing: 0, moving: true },
      { timelineAt: 50, x: 9, y: 0, facing: 0, moving: false },
    ];
    expect(remoteMotionAt(samples, 200, 180)).toMatchObject({ x: 9, y: 0, moving: false });
  });

  it("caps malformed sample velocity to the player's allowed speed", () => {
    const samples = [
      { timelineAt: 0, x: 0, y: 0, facing: 0, moving: true },
      { timelineAt: 50, x: 1_000, y: 0, facing: 0, moving: true },
    ];
    expect(remoteMotionAt(samples, 250, 100).x).toBeCloseTo(1_023);
  });

  it("rebases burst-delivered rows behind arrival time instead of into the future", () => {
    const samples: TimestampedRemoteMotionSample[] = [
      { timelineAt: 1_000, serverAtMs: 0, receivedAt: 1_000, x: 0, y: 0, facing: 0, moving: true },
    ];
    for (let index = 1; index <= 8; index += 1) {
      appendRemoteTimelineSample(samples, {
        serverAtMs: index * 67,
        receivedAt: 1_000,
        x: index * 10,
        y: 0,
        facing: 0,
        moving: true,
      });
    }
    expect(samples[samples.length - 1]?.timelineAt).toBe(1_000);
    expect(samples[0].timelineAt).toBe(464);
    expect(remoteMotionAt(samples, 875, 180).x).toBeGreaterThan(50);
  });

  it("drops a distant-rate delay when movement restarts", () => {
    const clock = createRemoteInterpolationClock(0);
    observeRemoteSample(clock, 333, 333);
    for (let now = 16; now <= 500; now += 16) adaptiveRemoteRenderAt(clock, now);
    const restarted = createRestartRemoteInterpolationClock(500);
    expect(restarted.delayMs).toBe(125);
    expect(restarted.delayMs).toBeLessThan(clock.delayMs);
  });
});
