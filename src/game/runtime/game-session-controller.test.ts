import { describe, expect, it } from "vitest";
import {
  advanceFixedSimulationClock,
  frameDeadlineReached,
  MAX_SIMULATION_CATCH_UP_SECONDS,
  MAX_SIMULATION_STEPS_PER_FRAME,
  SIMULATION_STEP_SECONDS,
} from "./game-session-controller";

function countScheduledFrames(callbackTimes: number[], targetFps: number) {
  const interval = 1_000 / targetFps;
  let nextFrameAt = 0;
  let frames = 0;

  for (const now of callbackTimes) {
    if (!frameDeadlineReached(now, nextFrameAt)) continue;
    frames += 1;
    nextFrameAt += interval;
    if (nextFrameAt < now) nextFrameAt = now + interval;
  }

  return frames;
}

function simulationStepsFor(renderFps: number, seconds: number) {
  let accumulatorSeconds = 0;
  let steps = 0;
  for (let frame = 0; frame < renderFps * seconds; frame += 1) {
    const result = advanceFixedSimulationClock(accumulatorSeconds, 1 / renderFps);
    accumulatorSeconds = result.accumulatorSeconds;
    steps += result.steps;
  }
  return steps;
}

function attacksFor(renderFps: number, seconds: number, attackInterval: number) {
  let accumulatorSeconds = 0;
  let attackClock = 0;
  let attacks = 0;
  for (let frame = 0; frame < renderFps * seconds; frame += 1) {
    const result = advanceFixedSimulationClock(accumulatorSeconds, 1 / renderFps);
    accumulatorSeconds = result.accumulatorSeconds;
    for (let step = 0; step < result.steps; step += 1) {
      attackClock -= SIMULATION_STEP_SECONDS;
      if (attackClock > 0) continue;
      attacks += 1;
      attackClock += attackInterval;
    }
  }
  return attacks;
}

describe("game session frame scheduling", () => {
  it("does not collapse 60 Hz rendering to every other callback when timestamps arrive slightly early", () => {
    const interval = 1_000 / 60;
    const callbacks = Array.from({ length: 120 }, (_, index) =>
      index === 0 ? 0 : index * interval - .25,
    );

    expect(countScheduledFrames(callbacks, 60)).toBe(120);
  });

  it("still limits a 120 Hz callback stream to approximately 60 FPS", () => {
    const callbacks = Array.from({ length: 121 }, (_, index) => index * (1_000 / 120));

    expect(countScheduledFrames(callbacks, 60)).toBe(61);
  });

  it("keeps Low Performance mode at approximately 30 FPS on a 60 Hz display", () => {
    const callbacks = Array.from({ length: 121 }, (_, index) => index * (1_000 / 60));

    expect(countScheduledFrames(callbacks, 30)).toBe(61);
  });

  it("advances the same 60 Hz simulation at fast, low-performance, and dropped render rates", () => {
    expect([120, 60, 30, 20, 9].map((fps) => simulationStepsFor(fps, 10))).toEqual([600, 600, 600, 600, 600]);
  });

  it("keeps Frost Bow +9 attack totals independent of render FPS", () => {
    const frostBowPlusNineInterval = .32 / 1.56;
    expect([60, 30, 20, 9].map((fps) => attacksFor(fps, 10, frostBowPlusNineInterval))).toEqual([49, 49, 49, 49]);
  });

  it("bounds catch-up after a long stall instead of creating a resume burst", () => {
    const result = advanceFixedSimulationClock(0, .5);
    expect(result.steps).toBe(MAX_SIMULATION_STEPS_PER_FRAME);
    expect(result.accumulatorSeconds).toBeCloseTo(0);
    expect(result.droppedSeconds).toBeCloseTo(.5 - MAX_SIMULATION_CATCH_UP_SECONDS);
  });
});
