import { describe, expect, it } from "vitest";
import { PLAYER_RADIUS, WORLD_HEIGHT, WORLD_WIDTH } from "../../../shared/rules";
import { normalizeVirtualPlayerCount } from "../../../shared/virtual-player-load-test";
import { advanceVirtualPlayerMotion } from "./virtual-player-load-test";

describe("virtual-player count", () => {
  it("accepts any whole count from 1 through 3000", () => {
    expect(normalizeVirtualPlayerCount(1)).toBe(1);
    expect(normalizeVirtualPlayerCount(137)).toBe(137);
    expect(normalizeVirtualPlayerCount(3_000)).toBe(3_000);
  });

  it("clamps invalid and out-of-range counts", () => {
    expect(normalizeVirtualPlayerCount(0)).toBe(1);
    expect(normalizeVirtualPlayerCount(3_001)).toBe(3_000);
    expect(normalizeVirtualPlayerCount(12.9)).toBe(12);
    expect(normalizeVirtualPlayerCount(Number.NaN)).toBe(10);
  });
});

describe("virtual-player random walk", () => {
  it("turns and moves using bounded elapsed time", () => {
    const randomValues = [0, .5, 0];
    const next = advanceVirtualPlayerMotion({
      x: 100,
      y: 100,
      facing: Math.PI,
      moving: false,
      nextTurnAt: 0,
    }, 10, 1_000, () => randomValues.shift() ?? 0);

    expect(next.moving).toBe(true);
    expect(next.x).toBeGreaterThan(100);
    expect(next.x).toBeLessThanOrEqual(127);
    expect(next.nextTurnAt).toBeGreaterThan(1_000);
  });

  it("bounces inside world bounds", () => {
    const next = advanceVirtualPlayerMotion({
      x: WORLD_WIDTH - PLAYER_RADIUS - 1,
      y: WORLD_HEIGHT - PLAYER_RADIUS - 1,
      facing: Math.PI / 4,
      moving: true,
      nextTurnAt: 10_000,
    }, .15, 1_000);

    expect(next.x).toBeGreaterThanOrEqual(PLAYER_RADIUS);
    expect(next.x).toBeLessThanOrEqual(WORLD_WIDTH - PLAYER_RADIUS);
    expect(next.y).toBeGreaterThanOrEqual(PLAYER_RADIUS);
    expect(next.y).toBeLessThanOrEqual(WORLD_HEIGHT - PLAYER_RADIUS);
  });
});
