import { describe, expect, it } from "vitest";
import { BOW_RIGHT_HAND_ANGLE_DEGREES, bowHeldAlignment, bowHeldRotationRadians, heldWeaponRunMotion } from "./player-appearance";

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

  it("mirrors the tuned bow position and sprite for the left hand", () => {
    expect(bowHeldAlignment(false)).toEqual({ x: 4, y: -2, scaleX: 1 });
    expect(bowHeldAlignment(true)).toEqual({ x: -4, y: -2, scaleX: -1 });
  });
});

describe("held weapon running motion", () => {
  it("keeps every held weapon steady while idle", () => {
    expect(heldWeaponRunMotion({ moving: false, gameTime: .25, heldInLeftHand: false })).toEqual({ x: 0, y: 0, rotation: 0 });
  });

  it("adds subtle mirrored arm sway while running", () => {
    const right = heldWeaponRunMotion({ moving: true, gameTime: .125, heldInLeftHand: false });
    const left = heldWeaponRunMotion({ moving: true, gameTime: .125, heldInLeftHand: true });
    expect(right.x).not.toBe(0);
    expect(right.y).not.toBe(0);
    expect(left.x).toBeCloseTo(-right.x);
    expect(left.y).toBeCloseTo(right.y);
    expect(left.rotation).toBeCloseTo(-right.rotation);
  });
});
