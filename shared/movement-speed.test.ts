import { describe, expect, it } from "vitest";
import {
  effectivePlayerMovementSpeed,
  movementSpeedMultiplier,
  movementSpeedsMatch,
  playerBaseMovementSpeed,
} from "./rules";

describe("player movement speed", () => {
  it("keeps cosmetic boots from changing movement speed", () => {
    expect(playerBaseMovementSpeed(false)).toBe(180);
    expect(playerBaseMovementSpeed(true)).toBe(180);
  });

  it("applies every Move Speed research rank after equipment", () => {
    expect(movementSpeedMultiplier(5)).toBeCloseTo(1.1);
    expect(effectivePlayerMovementSpeed(true, 5)).toBeCloseTo(198);
    expect(effectivePlayerMovementSpeed(true, 11)).toBeCloseTo(219.6);
    expect(effectivePlayerMovementSpeed(true, 15)).toBeCloseTo(234);
  });

  it("uses a server-owned developer override as the researched base speed", () => {
    expect(effectivePlayerMovementSpeed(true, 15, 262.5)).toBeCloseTo(341.25);
  });

  it("treats f32 transport drift as the same speed", () => {
    expect(movementSpeedsMatch(250.1, 250.10000610351562)).toBe(true);
    expect(movementSpeedsMatch(205, 225.5)).toBe(false);
  });
});
