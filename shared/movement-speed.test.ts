import { describe, expect, it } from "vitest";
import {
  effectivePlayerMovementSpeed,
  movementSpeedMultiplier,
  movementSpeedsMatch,
  playerBaseMovementSpeed,
  PLAYER_SPEED,
} from "./rules";

describe("player movement speed", () => {
  it("keeps cosmetic boots from changing movement speed", () => {
    expect(playerBaseMovementSpeed(false)).toBe(PLAYER_SPEED);
    expect(playerBaseMovementSpeed(true)).toBe(PLAYER_SPEED);
  });

  it("applies every Move Speed research rank after equipment", () => {
    expect(movementSpeedMultiplier(5)).toBeCloseTo(1.1);
    expect(effectivePlayerMovementSpeed(true, 5)).toBeCloseTo(PLAYER_SPEED * 1.1);
    expect(effectivePlayerMovementSpeed(true, 11)).toBeCloseTo(PLAYER_SPEED * 1.22);
    expect(effectivePlayerMovementSpeed(true, 15)).toBeCloseTo(PLAYER_SPEED * 1.3);
  });

  it("uses a server-owned developer override as the researched base speed", () => {
    expect(effectivePlayerMovementSpeed(true, 15, 262.5)).toBeCloseTo(341.25);
  });

  it("treats f32 transport drift as the same speed", () => {
    expect(movementSpeedsMatch(250.1, 250.10000610351562)).toBe(true);
    expect(movementSpeedsMatch(205, 225.5)).toBe(false);
  });
});
