import { describe, expect, it } from "vitest";
import {
  attackReadyAtWithoutTarget,
  playerAttackAnimationSpeed,
  playerAttackWindupSeconds,
  projectileSimulationSeconds,
} from "./player-combat-controller";

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

  it("moves a newly released projectile for only the part of the fixed step after release", () => {
    expect(projectileSimulationSeconds(10.012, 10.016, .016)).toBeCloseTo(.004);
    expect(projectileSimulationSeconds(9.9, 10.016, .016)).toBeCloseTo(.016);
    expect(projectileSimulationSeconds(10.02, 10.016, .016)).toBe(0);
  });

  it("keeps a ready attack armed while targets change instead of adding repeated delays", () => {
    expect(attackReadyAtWithoutTarget(9.8, 10)).toBe(9.8);
    expect(attackReadyAtWithoutTarget(10.5, 10)).toBeCloseTo(10.08);
    expect(attackReadyAtWithoutTarget(9.8, 10.08)).toBe(9.8);
  });
});
