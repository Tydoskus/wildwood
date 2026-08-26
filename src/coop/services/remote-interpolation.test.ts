import { describe, expect, it } from "vitest";
import {
  adaptiveRemoteRenderAt,
  applyRemoteMotionCorrection,
  appendRemoteCorrectionSample,
  appendRemoteTimelineSample,
  createRemoteMotionCorrection,
  createRemoteInterpolationClock,
  createRestartRemoteInterpolationClock,
  observeRemoteSample,
  remoteMotionAt,
  remoteMotionSnapDistance,
  type TimestampedRemoteMotionSample,
} from "./remote-interpolation";

describe("adaptive remote interpolation", () => {
  it("does not mistake a sparse heartbeat for network jitter", () => {
    const clock = createRemoteInterpolationClock(0);
    observeRemoteSample(clock, 1_000, 1_000);
    for (let now = 16; now <= 500; now += 16) adaptiveRemoteRenderAt(clock, now);
    expect(clock.targetDelayMs).toBeLessThan(100);
    expect(clock.delayMs).toBeLessThan(100);
  });

  it("returns smoothly to a responsive delay for a high-rate stream", () => {
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
      { timelineAt: -50, x: 0, y: 0, dx: 1, dy: 0, facing: 0, moving: true },
      { timelineAt: 0, x: 9, y: 0, dx: 1, dy: 0, facing: 0, moving: true },
    ];
    expect(remoteMotionAt(samples, 125, 180).x).toBeCloseTo(31.5);
    expect(remoteMotionAt(samples, 500, 180).x).toBeCloseTo(99);
    expect(remoteMotionAt(samples, 2_000, 180).x).toBeCloseTo(279);
  });

  it("never predicts beyond a confirmed stop", () => {
    const samples = [
      { timelineAt: 0, x: 0, y: 0, dx: 1, dy: 0, facing: 0, moving: true },
      { timelineAt: 50, x: 9, y: 0, dx: 0, dy: 0, facing: 0, moving: false },
    ];
    expect(remoteMotionAt(samples, 200, 180)).toMatchObject({ x: 9, y: 0, moving: false });
  });

  it("bounds malformed vectors to the player's speed", () => {
    const samples = [
      { timelineAt: 0, x: 0, y: 0, dx: 1, dy: 0, facing: 0, moving: true },
      { timelineAt: 50, x: 1_000, y: 0, dx: 4, dy: 0, facing: 0, moving: true },
    ];
    expect(remoteMotionAt(samples, 250, 100).x).toBeCloseTo(1_020);
  });

  it("rebases burst-delivered rows behind arrival time instead of into the future", () => {
    const samples: TimestampedRemoteMotionSample[] = [
      { timelineAt: 1_000, serverAtMs: 0, receivedAt: 1_000, x: 0, y: 0, dx: 1, dy: 0, facing: 0, moving: true },
    ];
    for (let index = 1; index <= 8; index += 1) {
      appendRemoteTimelineSample(samples, {
        serverAtMs: index * 67,
        receivedAt: 1_000,
        x: index * 10,
        y: 0,
        dx: 1,
        dy: 0,
        facing: 0,
        moving: true,
      });
    }
    expect(samples[samples.length - 1]?.timelineAt).toBe(1_000);
    expect(samples[0].timelineAt).toBe(464);
    expect(remoteMotionAt(samples, 875, 180).x).toBeGreaterThan(50);
  });

  it("blends heartbeat corrections across the buffered interval", () => {
    const samples = [
      { timelineAt: 0, x: 0, y: 0, dx: 1, dy: 0, facing: 0, moving: true },
      { timelineAt: 1_000, x: 182, y: 0, dx: 1, dy: 0, facing: 0, moving: true },
    ];
    expect(remoteMotionAt(samples, 500, 180).x).toBeCloseTo(91);
    expect(remoteMotionAt(samples, 800, 180).x).toBeCloseTo(145.6);
  });

  it("anchors a late correction to the pose already being presented", () => {
    const samples: TimestampedRemoteMotionSample[] = [
      { timelineAt: 0, serverAtMs: 0, receivedAt: 0, x: 0, y: 0, dx: 1, dy: 0, facing: 0, moving: true },
    ];
    const correction = createRemoteMotionCorrection(0);
    const before = remoteMotionAt(samples, 920, 180);
    appendRemoteCorrectionSample(samples, {
      serverAtMs: 1_000,
      receivedAt: 1_000,
      x: 160,
      y: 0,
      dx: 1,
      dy: 0,
      facing: 0,
      moving: true,
    }, 920, 180, correction);
    const corrected = applyRemoteMotionCorrection(remoteMotionAt(samples, 920, 180), correction, 1_000, 180);
    expect(corrected.x).toBeCloseTo(before.x);
    const initialError = Math.abs(corrected.x - remoteMotionAt(samples, 920, 180).x);
    let previousX = corrected.x;
    for (let now = 1_016; now <= 1_288; now += 16) {
      const renderAt = now - 80;
      const raw = remoteMotionAt(samples, renderAt, 180);
      const presented = applyRemoteMotionCorrection(raw, correction, now, 180);
      expect(presented.x).toBeGreaterThan(previousX);
      previousX = presented.x;
    }
    const finalRaw = remoteMotionAt(samples, 1_208, 180);
    expect(Math.abs(previousX - finalRaw.x)).toBeLessThan(initialError);
  });

  it("extrapolates with realized straight-line velocity instead of repeating drift", () => {
    const samples: TimestampedRemoteMotionSample[] = [
      { timelineAt: 0, serverAtMs: 0, receivedAt: 0, x: 0, y: 0, dx: 1, dy: 0, facing: 0, moving: true },
    ];
    const correction = createRemoteMotionCorrection(0);
    appendRemoteCorrectionSample(samples, {
      serverAtMs: 1_000,
      receivedAt: 1_000,
      x: 160,
      y: 0,
      dx: 1,
      dy: 0,
      facing: 0,
      moving: true,
    }, 920, 180, correction);
    expect(remoteMotionAt(samples, 1_500, 180).x).toBeCloseTo(240);
  });

  it("does not classify an upgraded player's one-second heartbeat as a teleport", () => {
    const speed = 266.5;
    const previous = { timelineAt: 0, serverAtMs: 0, x: 0, y: 0, dx: 1, dy: 0, facing: 0, moving: true };
    const next = { timelineAt: 1_000, serverAtMs: 1_000, x: speed, y: 0, dx: 1, dy: 0, facing: 0, moving: true };
    expect(Math.hypot(next.x - previous.x, next.y - previous.y)).toBeLessThan(
      remoteMotionSnapDistance(previous, next, speed),
    );
    expect(remoteMotionAt([previous, next], 1_500, speed).x).toBeCloseTo(speed * 1.5);
  });

  it("still identifies a large same-map discontinuity", () => {
    const speed = 266.5;
    const previous = { timelineAt: 0, serverAtMs: 0, x: 0, y: 0, dx: 1, dy: 0, facing: 0, moving: true };
    const next = { timelineAt: 1_000, serverAtMs: 1_000, x: 900, y: 0, dx: 1, dy: 0, facing: 0, moving: true };
    expect(Math.hypot(next.x - previous.x, next.y - previous.y)).toBeGreaterThan(
      remoteMotionSnapDistance(previous, next, speed),
    );
  });

  it("drops a distant-rate delay when movement restarts", () => {
    const clock = createRemoteInterpolationClock(0);
    observeRemoteSample(clock, 333, 333);
    for (let now = 16; now <= 500; now += 16) adaptiveRemoteRenderAt(clock, now);
    const restarted = createRestartRemoteInterpolationClock(500);
    expect(restarted.delayMs).toBe(75);
    expect(restarted.delayMs).toBeLessThan(clock.delayMs);
  });
});
