import { describe, expect, it } from "vitest";
import { enemyWeaponAimRotation } from "./actor-renderer";

describe("enemy weapon aiming", () => {
  it("aims right-facing enemy weapons directly at target", () => {
    expect(enemyWeaponAimRotation(
      { x: 10, y: 10, facingX: 1 },
      { x: 30, y: 10 },
    )).toBeCloseTo(0);
    expect(enemyWeaponAimRotation(
      { x: 10, y: 10, facingX: 1 },
      { x: 30, y: 30 },
    )).toBeCloseTo(Math.PI / 4);
  });

  it("keeps left-facing enemy aim correct after actor mirroring", () => {
    expect(enemyWeaponAimRotation(
      { x: 30, y: 10, facingX: -1 },
      { x: 10, y: 10 },
    )).toBeCloseTo(0);
    expect(enemyWeaponAimRotation(
      { x: 30, y: 30, facingX: -1 },
      { x: 10, y: 10 },
    )).toBeCloseTo(-Math.PI / 4);
  });
});
