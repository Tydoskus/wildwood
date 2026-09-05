import { describe, expect, it } from "vitest";
import {
  adaptiveRemoteRenderAt,
  applyRemoteMotionCorrection,
  appendRemoteCorrectionSample,
  appendRemoteTimelineSample,
  createRemoteMotionCorrection,
  createRemoteInterpolationClock,
  createRestartRemoteInterpolationClock,
  constrainRemoteMotionToLatestStop,
  duplicateRemoteMotionSample,
  observeRemoteSample,
  remoteMotionAt,
  remoteMotionAtServerTime,
  remoteMotionTransition,
  type RemoteMotionSample,
  type TimestampedRemoteMotionSample,
} from "./remote-interpolation";

function motion(timelineAt: number, x: number, vx = 180, overrides: Partial<RemoteMotionSample> = {}): RemoteMotionSample {
  return {
    timelineAt,
    x,
    y: 0,
    vx,
    vy: 0,
    simulationTick: Math.round(timelineAt * .06) & 0xffff,
    motionEpoch: 1,
    facing: 0,
    moving: vx !== 0,
    ...overrides,
  };
}

describe("adaptive remote interpolation", () => {
  it("keeps a deliberate buffer for the 3 Hz nearby heartbeat", () => {
    const clock = createRemoteInterpolationClock(0);
    observeRemoteSample(clock, 333, 333);
    for (let now = 16; now <= 500; now += 16) adaptiveRemoteRenderAt(clock, now);
    expect(clock.targetDelayMs).toBe(220);
    expect(clock.delayMs).toBeCloseTo(220, 1);
  });

  it("does not collapse the stop-safe buffer during a high-rate burst", () => {
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
    expect(clock.delayMs).toBeCloseTo(220, 1);
  });

  it("bridges the first distant-rate gap without an unbounded prediction", () => {
    const samples = [motion(-50, 0), motion(0, 9)];
    expect(remoteMotionAt(samples, 125).x).toBeCloseTo(31.5);
    expect(remoteMotionAt(samples, 500).x).toBeCloseTo(99);
    expect(remoteMotionAt(samples, 2_000).x).toBeCloseTo(279);
  });

  it("never predicts beyond a confirmed stop", () => {
    const samples = [motion(0, 0), motion(50, 9, 0)];
    expect(remoteMotionAt(samples, 200)).toMatchObject({ x: 9, y: 0, vx: 0, moving: false });
  });

  it("uses transmitted world velocity without reconstructing remote speed", () => {
    const samples = [motion(0, 0, 100), motion(50, 1_000, 100)];
    expect(remoteMotionAt(samples, 250).x).toBeCloseTo(1_020);
  });

  it("rebases burst-delivered rows behind arrival time instead of into the future", () => {
    const samples: TimestampedRemoteMotionSample[] = [
      { ...motion(1_000, 0, 150, { simulationTick: 0 }), serverAtMs: 0, receivedAt: 1_000 },
    ];
    for (let index = 1; index <= 8; index += 1) {
      appendRemoteTimelineSample(samples, {
        ...motion(1_000, index * 10, 150, { simulationTick: index * 4 }),
        serverAtMs: index * 67,
        receivedAt: 1_000,
      });
    }
    expect(samples[samples.length - 1]?.timelineAt).toBe(1_000);
    expect(samples[0].timelineAt).toBe(464);
    expect(remoteMotionAt(samples, 875).x).toBeGreaterThan(50);
  });

  it("blends heartbeat corrections across the buffered interval", () => {
    const samples = [motion(0, 0), motion(1_000, 182)];
    expect(remoteMotionAt(samples, 500).x).toBeCloseTo(91);
    expect(remoteMotionAt(samples, 800).x).toBeCloseTo(145.6);
  });

  it.each([1_000 / 3, 500, 1_000])("preserves steady speed through a burst with %s ms source spacing", (intervalMs) => {
    const speed = 180;
    const samples: TimestampedRemoteMotionSample[] = [{
      ...motion(2_000, 0, speed, { simulationTick: 0 }),
      serverAtMs: 0,
      receivedAt: 2_000,
    }];
    for (let index = 1; index <= 3; index += 1) {
      appendRemoteTimelineSample(samples, {
        ...motion(2_000, speed * index * intervalMs / 1_000, speed, {
          simulationTick: Math.round(index * intervalMs * .06),
        }),
        serverAtMs: index * intervalMs,
        receivedAt: 2_000,
      });
    }
    // Sample within the presentation buffer, then across its transition to
    // extrapolation. A network burst must not change a constant world speed.
    const before = remoteMotionAt(samples, 1_800);
    const after = remoteMotionAt(samples, 1_900);
    expect(after.x - before.x).toBeCloseTo(speed * .1);
    expect(remoteMotionAt(samples, 2_050).x - remoteMotionAt(samples, 1_950).x).toBeCloseTo(speed * .1);
    expect(samples[samples.length - 1].timelineAt).toBe(2_000);
    expect(samples[1].timelineAt - samples[0].timelineAt).toBeCloseTo(intervalMs);
  });

  it("keeps the short restart anchor when an idle player moves in a burst", () => {
    const samples: TimestampedRemoteMotionSample[] = [{
      ...motion(2_000, 0, 0, { simulationTick: 0 }),
      serverAtMs: 0,
      receivedAt: 2_000,
    }];
    appendRemoteTimelineSample(samples, {
      ...motion(2_000, 20, 180, { simulationTick: 60 }),
      serverAtMs: 1_000,
      receivedAt: 2_000,
    });
    expect(samples[0].timelineAt).toBe(1_750);
  });

  it("does not manufacture a correction when a correct movement sample arrives late", () => {
    const samples: TimestampedRemoteMotionSample[] = [{
      ...motion(80, 100), serverAtMs: 0, receivedAt: 80,
    }];
    const correction = createRemoteMotionCorrection(80);
    appendRemoteCorrectionSample(samples, {
      ...motion(600, 160), serverAtMs: 1_000 / 3, receivedAt: 600,
    }, 380, 180, correction);
    expect(samples[1].timelineAt).toBeCloseTo(80 + 1_000 / 3);
    expect(correction.x).toBeCloseTo(0);
    expect(correction.y).toBeCloseTo(0);
    expect(remoteMotionAt(samples, 480).x).toBeCloseTo(172);
  });

  it("keeps the clock offset through a delayed restart after a long idle", () => {
    const samples: TimestampedRemoteMotionSample[] = [{
      ...motion(80, 100, 0), serverAtMs: 0, receivedAt: 80,
    }];
    const correction = createRemoteMotionCorrection(80);
    appendRemoteCorrectionSample(samples, {
      ...motion(5_180, 145), serverAtMs: 5_000, receivedAt: 5_180,
    }, 4_980, 180, correction);
    expect(samples[1].timelineAt).toBe(5_080);
    expect(samples[0].timelineAt).toBe(4_830);
    expect(applyRemoteMotionCorrection(remoteMotionAt(samples, 4_980), correction, 5_180, 180).x).toBeCloseTo(100);
    // Presentation anchors never change the server-time gameplay history.
    expect(samples[0].serverAtMs).toBe(0);
    expect(samples[1].serverAtMs).toBe(5_000);
  });

  it("keeps real publication spacing after a gap longer than the prediction horizon", () => {
    const samples: TimestampedRemoteMotionSample[] = [{
      ...motion(80, 100), serverAtMs: 0, receivedAt: 80,
    }];
    appendRemoteTimelineSample(samples, {
      ...motion(3_180, 640), serverAtMs: 3_000, receivedAt: 3_180,
    });
    expect(samples[1].timelineAt).toBe(3_080);
    expect(remoteMotionAt(samples, 2_980).x).toBeCloseTo(622);
  });

  it("preserves the visible pose when a faster delivery improves the clock offset", () => {
    const samples: TimestampedRemoteMotionSample[] = [{
      ...motion(200, 100), serverAtMs: 0, receivedAt: 200,
    }];
    const correction = createRemoteMotionCorrection(200);
    const renderAt = 380;
    const before = remoteMotionAt(samples, renderAt);
    appendRemoteCorrectionSample(samples, {
      ...motion(600, 190), serverAtMs: 500, receivedAt: 600,
    }, renderAt, 180, correction);
    expect(samples[0].timelineAt).toBe(100);
    expect(samples[1].timelineAt).toBe(600);
    expect(applyRemoteMotionCorrection(remoteMotionAt(samples, renderAt), correction, 600, 180).x).toBeCloseTo(before.x);
  });

  it("anchors a late correction to the pose already being presented", () => {
    const samples: TimestampedRemoteMotionSample[] = [
      { ...motion(0, 0), serverAtMs: 0, receivedAt: 0 },
    ];
    const correction = createRemoteMotionCorrection(0);
    const before = remoteMotionAt(samples, 920);
    appendRemoteCorrectionSample(samples, {
      ...motion(1_000, 160, 160),
      serverAtMs: 1_000,
      receivedAt: 1_000,
    }, 920, 180, correction);
    const corrected = applyRemoteMotionCorrection(remoteMotionAt(samples, 920), correction, 1_000, 180);
    expect(corrected.x).toBeCloseTo(before.x);
    const initialError = Math.abs(corrected.x - remoteMotionAt(samples, 920).x);
    let previousX = corrected.x;
    for (let now = 1_016; now <= 1_288; now += 16) {
      const renderAt = now - 80;
      const raw = remoteMotionAt(samples, renderAt);
      const presented = applyRemoteMotionCorrection(raw, correction, now, 180);
      expect(presented.x).toBeGreaterThan(previousX);
      previousX = presented.x;
    }
    const finalRaw = remoteMotionAt(samples, 1_208);
    expect(Math.abs(previousX - finalRaw.x)).toBeLessThan(initialError);
  });

  it("preserves the stationary pose when the first moving sample arrives", () => {
    const samples: TimestampedRemoteMotionSample[] = [{
      ...motion(667, 100, 0),
      serverAtMs: 667,
      receivedAt: 667,
    }];
    const correction = createRemoteMotionCorrection(667);
    appendRemoteCorrectionSample(samples, {
      ...motion(1_000, 145, 180),
      serverAtMs: 1_000,
      receivedAt: 1_000,
    }, 800, 180, correction);

    const firstPresented = applyRemoteMotionCorrection(remoteMotionAt(samples, 800), correction, 1_000, 180);
    expect(firstPresented.x).toBeCloseTo(100);
    expect(samples).toHaveLength(2);

    const nextPresented = applyRemoteMotionCorrection(remoteMotionAt(samples, 816), correction, 1_016, 180);
    expect(nextPresented.x).toBeGreaterThan(firstPresented.x);
    expect(nextPresented.x - firstPresented.x).toBeLessThan(10);
  });

  it("never lets continuity correction carry a player beyond a confirmed stop", () => {
    const samples: TimestampedRemoteMotionSample[] = [{
      ...motion(667, 120, 180),
      serverAtMs: 667,
      receivedAt: 667,
    }];
    const correction = createRemoteMotionCorrection(667);
    appendRemoteCorrectionSample(samples, {
      ...motion(1_000, 170, 0),
      serverAtMs: 1_000,
      receivedAt: 1_000,
    }, 780, 180, correction);

    const corrected = applyRemoteMotionCorrection(remoteMotionAt(samples, 1_100), correction, 1_100, 180);
    expect(corrected.x).toBeGreaterThan(170);
    expect(constrainRemoteMotionToLatestStop(corrected, samples)).toMatchObject({
      x: 170,
      moving: false,
      vx: 0,
    });
  });

  it("extrapolates with the sender's velocity instead of repeating drift", () => {
    const samples: TimestampedRemoteMotionSample[] = [
      { ...motion(0, 0, 160), serverAtMs: 0, receivedAt: 0 },
    ];
    const correction = createRemoteMotionCorrection(0);
    appendRemoteCorrectionSample(samples, {
      ...motion(1_000, 160, 160),
      serverAtMs: 1_000,
      receivedAt: 1_000,
    }, 920, 180, correction);
    expect(remoteMotionAt(samples, 1_500).x).toBeCloseTo(240);
  });

  it("predicts an upgraded player from the transmitted velocity", () => {
    const speed = 266.5;
    const previous = motion(0, 0, speed);
    const next = motion(1_000, speed, speed);
    expect(remoteMotionAt([previous, next], 1_500).x).toBeCloseTo(speed * 1.5);
  });

  it("samples a consensus pose from server time instead of local arrival time", () => {
    const samples: TimestampedRemoteMotionSample[] = [
      { ...motion(100, 0, 100), serverAtMs: 1_000, receivedAt: 100 },
      { ...motion(900, 100, 100), serverAtMs: 2_000, receivedAt: 900 },
    ];
    expect(remoteMotionAtServerTime(samples, 1_500).x).toBeCloseTo(50);
    // A second observer may receive the same rows on another local timeline.
    const delayed = samples.map((sample) => ({ ...sample, timelineAt: sample.timelineAt + 5_000, receivedAt: sample.receivedAt + 5_000 }));
    expect(remoteMotionAtServerTime(delayed, 1_500).x).toBeCloseTo(50);
  });

  it.each([54, 65_531, 65_520])("uses publication time when the sender tick wraps, pauses, or resets to %s", (simulationTick) => {
    const samples: TimestampedRemoteMotionSample[] = [{
      ...motion(80, 100, 180, { simulationTick: 65_530 }),
      serverAtMs: 0, receivedAt: 80,
    }];
    appendRemoteTimelineSample(samples, {
      ...motion(1_280, 298, 180, { simulationTick }),
      serverAtMs: 1_100, receivedAt: 1_280,
    });
    expect(samples[1].timelineAt).toBe(1_180);
    expect(remoteMotionAt(samples, 580).x).toBeCloseTo(190);
  });

  it("uses motion epoch—not distance—as the hard discontinuity guard", () => {
    expect(remoteMotionTransition(
      { motionEpoch: 41, moving: true },
      { motionEpoch: 41, moving: true },
    )).toBe("continuous");
    expect(remoteMotionTransition(
      { motionEpoch: 41, moving: true },
      { motionEpoch: 41, moving: false },
    )).toBe("stop");
    expect(remoteMotionTransition(
      { motionEpoch: 41, moving: true },
      { motionEpoch: 42, moving: false },
    )).toBe("discontinuity");
  });

  it("recognizes a cold-row and scheduled-frame copy of one sender tick", () => {
    expect(duplicateRemoteMotionSample(
      { simulationTick: 120, motionEpoch: 4, moving: true },
      { simulationTick: 120, motionEpoch: 4, moving: true },
    )).toBe(true);
    expect(duplicateRemoteMotionSample(
      { simulationTick: 120, motionEpoch: 4, moving: true },
      { simulationTick: 121, motionEpoch: 4, moving: true },
    )).toBe(false);
  });

  it("keeps a shorter but still buffered delay when movement restarts", () => {
    const clock = createRemoteInterpolationClock(0);
    observeRemoteSample(clock, 333, 333);
    for (let now = 16; now <= 500; now += 16) adaptiveRemoteRenderAt(clock, now);
    const restarted = createRestartRemoteInterpolationClock(500);
    expect(restarted.delayMs).toBe(200);
    expect(restarted.delayMs).toBeLessThan(clock.delayMs);
  });
});
