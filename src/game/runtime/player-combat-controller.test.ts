import { describe, expect, it } from "vitest";
import { playerAttackAnimationSpeed, playerAttackWindupSeconds } from "./player-combat-controller";

describe("player attack timing", () => {
  it("keeps the normal windup for slower attacks", () => {
    expect(playerAttackWindupSeconds(1.56)).toBeCloseTo(.12);
    expect(playerAttackAnimationSpeed(1.56)).toBe(1);
  });

  it("fits the complete throw animation inside a 10.5 attacks-per-second interval", () => {
    const interval = 1 / 10.5;
    expect(playerAttackWindupSeconds(interval)).toBeLessThan(interval);
    expect(playerAttackAnimationSpeed(interval)).toBeCloseTo(.42 / interval);
  });
});
