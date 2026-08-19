import { describe, expect, it } from "vitest";
import { BOW_RIGHT_HAND_ANGLE_DEGREES, bowHeldRotationRadians } from "./player-appearance";

const degrees = (radians: number) => radians * 180 / Math.PI;

describe("Bow pose", () => {
  it("changes the right-facing right-hand pose from source-down 180° to 125°", () => {
    expect(BOW_RIGHT_HAND_ANGLE_DEGREES).toBe(125);
    expect(degrees(bowHeldRotationRadians({ facingLeft: false, heldInLeftHand: false }))).toBeCloseTo(-55);
  });

  it("reverses the pose for the other hand and follows combat aim", () => {
    expect(degrees(bowHeldRotationRadians({ facingLeft: false, heldInLeftHand: true }))).toBeCloseTo(55);
    expect(degrees(bowHeldRotationRadians({ combatFacing: Math.PI / 4, facingLeft: false, heldInLeftHand: false }))).toBeCloseTo(-10);
    expect(degrees(bowHeldRotationRadians({ combatFacing: Math.PI * .75, facingLeft: true, heldInLeftHand: false }))).toBeCloseTo(-10);
  });
});
