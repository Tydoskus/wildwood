import { describe, expect, it } from "vitest";
import { MIN_ATTACK_INTERVAL } from "../../../shared/rules";
import {
  advanceFixedSimulationClock,
  IDLE_PRESENTATION_DELAY_MS,
  idlePresentationThrottleActive,
  MAX_SIMULATION_CATCH_UP_SECONDS,
  MAX_SIMULATION_STEPS_PER_FRAME,
  SIMULATION_STEP_SECONDS,
  presentationFrameDue,
  presentationCombatActive,
} from "./game-session-controller";

function countScheduledFrames(callbackTimes: number[], lowPerformanceMode: boolean) {
  const interval = 1_000 / 30;
  let nextFrameAt = 0;
  let frames = 0;

  for (const now of callbackTimes) {
    if (!presentationFrameDue(lowPerformanceMode, now, nextFrameAt)) continue;
    frames += 1;
    if (!lowPerformanceMode) continue;
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

function interpolatedMotionDeltas(refreshRate: number, frameCount: number) {
  let accumulatorSeconds = 0;
  let previous = 0;
  let current = 0;
  const positions: number[] = [];
  for (let frame = 0; frame < frameCount; frame += 1) {
    const result = advanceFixedSimulationClock(accumulatorSeconds, 1 / refreshRate);
    accumulatorSeconds = result.accumulatorSeconds;
    for (let step = 0; step < result.steps; step += 1) {
      previous = current;
      current += 1;
    }
    positions.push(previous + (current - previous) * result.interpolationAlpha);
  }
  return positions.slice(4).map((position, index) => position - positions[index + 3]);
}

describe("game session frame scheduling", () => {
  it("does not collapse 60 Hz rendering to every other callback when timestamps arrive slightly early", () => {
    const interval = 1_000 / 60;
    const callbacks = Array.from({ length: 120 }, (_, index) =>
      index === 0 ? 0 : index * interval - .25,
    );

    expect(countScheduledFrames(callbacks, false)).toBe(120);
  });

  it("presents every callback on 90, 120, and 144 Hz displays", () => {
    for (const refreshRate of [90, 120, 144]) {
      const callbacks = Array.from({ length: refreshRate + 1 }, (_, index) => index * (1_000 / refreshRate));
      expect(countScheduledFrames(callbacks, false)).toBe(callbacks.length);
    }
  });

  it("keeps Low Performance mode at approximately 30 FPS on a 60 Hz display", () => {
    const callbacks = Array.from({ length: 121 }, (_, index) => index * (1_000 / 60));

    expect(countScheduledFrames(callbacks, true)).toBe(61);
  });

  it("enters idle presentation mode after two seconds and leaves immediately on input", () => {
    const lastInputAt = 1_000;
    expect(idlePresentationThrottleActive(false, lastInputAt + IDLE_PRESENTATION_DELAY_MS - 1, lastInputAt)).toBe(false);
    expect(idlePresentationThrottleActive(false, lastInputAt + IDLE_PRESENTATION_DELAY_MS, lastInputAt)).toBe(true);
    expect(idlePresentationThrottleActive(true, lastInputAt + IDLE_PRESENTATION_DELAY_MS, lastInputAt)).toBe(false);
  });

  it("restores native presentation for stationary combat, hits, and duels", () => {
    const idle = { hp: 100, combatFacing: null, throwClock: 0, hurtClock: 0 };
    expect(presentationCombatActive(idle, false)).toBe(false);
    for (const player of [
      { ...idle, combatFacing: 0 },
      { ...idle, throwClock: .1 },
      { ...idle, hurtClock: .1 },
    ]) {
      const active = presentationCombatActive(player, false);
      expect(active).toBe(true);
      expect(idlePresentationThrottleActive(active, 10_000, 0)).toBe(false);
    }
    expect(presentationCombatActive(idle, true)).toBe(true);
    expect(presentationCombatActive({ ...idle, hp: 0, combatFacing: 0 }, true)).toBe(false);
  });

  it("waits for the idle delay after combat ends and preserves the battery-mode cap", () => {
    let lastActivityAt = 0;
    for (const now of [3_000, 6_000, 9_000]) {
      const active = presentationCombatActive({ hp: 100, combatFacing: 0, throwClock: 0, hurtClock: 0 }, false);
      if (active) lastActivityAt = now;
      expect(idlePresentationThrottleActive(active, now, lastActivityAt)).toBe(false);
    }
    expect(idlePresentationThrottleActive(false, 10_999, lastActivityAt)).toBe(false);
    expect(idlePresentationThrottleActive(false, 11_000, lastActivityAt)).toBe(true);
    expect(presentationFrameDue(false, 9_001, 9_020)).toBe(true);
    expect(presentationFrameDue(true, 9_001, 9_020)).toBe(false);
  });

  it("exposes residual simulation time as presentation interpolation", () => {
    const result = advanceFixedSimulationClock(0, SIMULATION_STEP_SECONDS * 1.5);
    expect(result.steps).toBe(1);
    expect(result.interpolationAlpha).toBeCloseTo(.5);
  });

  it("turns fixed 60 Hz motion into even native-refresh presentation deltas", () => {
    for (const refreshRate of [90, 120, 144]) {
      const expectedDelta = 60 / refreshRate;
      for (const delta of interpolatedMotionDeltas(refreshRate, refreshRate)) {
        expect(delta).toBeCloseTo(expectedDelta, 6);
      }
    }
  });

  it("advances the same 60 Hz simulation at fast, low-performance, and dropped render rates", () => {
    expect([120, 60, 30, 20, 9].map((fps) => simulationStepsFor(fps, 10))).toEqual([600, 600, 600, 600, 600]);
  });

  it("keeps max base attack totals independent of render FPS", () => {
    expect([60, 30, 20, 9].map((fps) => attacksFor(fps, 10, MIN_ATTACK_INTERVAL))).toEqual([27, 27, 27, 27]);
  });

  it("bounds catch-up after a long stall instead of creating a resume burst", () => {
    const result = advanceFixedSimulationClock(0, .5);
    expect(result.steps).toBe(MAX_SIMULATION_STEPS_PER_FRAME);
    expect(result.accumulatorSeconds).toBeCloseTo(0);
    expect(result.droppedSeconds).toBeCloseTo(.5 - MAX_SIMULATION_CATCH_UP_SECONDS);
  });
});
