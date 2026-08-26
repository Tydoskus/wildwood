import { describe, expect, it } from "vitest";
import { clampMovementVector } from "./player-controller";

describe("player movement vector", () => {
  it("preserves analog magnitude below full speed", () => {
    expect(clampMovementVector(.3, .4)).toEqual({ x: .3, y: .4 });
  });

  it("caps diagonal and combined input at full speed", () => {
    const movement = clampMovementVector(1, 1);
    expect(Math.hypot(movement.x, movement.y)).toBeCloseTo(1);
  });

  it("rejects malformed input", () => {
    expect(clampMovementVector(Number.NaN, 1)).toEqual({ x: 0, y: 0 });
  });
});
