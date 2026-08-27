import { describe, expect, it } from "vitest";
import {
  PLAYER_MOTION_ANCHOR_TIMEOUT_MICROS,
  analyticalPlayerMotionAt,
} from "./analytical-player-motion";
import { PLAYER_RADIUS, WORLD_WIDTH } from "./rules";

describe("analyticalPlayerMotionAt", () => {
  it("advances a moving anchor to the publication time", () => {
    expect(analyticalPlayerMotionAt({
      x: 100,
      y: 200,
      vx: 180,
      vy: -60,
      moving: true,
      simulationTick: 120,
      anchoredAtMicros: 1_000_000n,
    }, 1_500_000n)).toEqual({
      x: 190,
      y: 170,
      vx: 180,
      vy: -60,
      moving: true,
      simulationTick: 150,
    });
  });

  it("clamps analytical positions to the playable world", () => {
    const sampled = analyticalPlayerMotionAt({
      x: WORLD_WIDTH - PLAYER_RADIUS - 5,
      y: PLAYER_RADIUS + 5,
      vx: 180,
      vy: -180,
      moving: true,
      simulationTick: 0,
      anchoredAtMicros: 0n,
    }, 500_000n);

    expect(sampled.x).toBe(WORLD_WIDTH - PLAYER_RADIUS);
    expect(sampled.y).toBe(PLAYER_RADIUS);
  });

  it("stops a stale anchor at the bounded extrapolation horizon", () => {
    const sampled = analyticalPlayerMotionAt({
      x: 100,
      y: 100,
      vx: 100,
      vy: 0,
      moving: true,
      simulationTick: 10,
      anchoredAtMicros: 0n,
    }, PLAYER_MOTION_ANCHOR_TIMEOUT_MICROS + 1n);

    expect(sampled).toMatchObject({
      x: 250,
      y: 100,
      vx: 0,
      vy: 0,
      moving: false,
      simulationTick: 100,
    });
  });

  it("does not move a stationary anchor", () => {
    expect(analyticalPlayerMotionAt({
      x: 320,
      y: 640,
      vx: 0,
      vy: 0,
      moving: false,
      simulationTick: 50,
      anchoredAtMicros: 5_000_000n,
    }, 5_500_000n)).toMatchObject({
      x: 320,
      y: 640,
      vx: 0,
      vy: 0,
      moving: false,
      simulationTick: 80,
    });
  });
});
