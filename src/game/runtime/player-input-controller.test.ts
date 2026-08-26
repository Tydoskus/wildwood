import { describe, expect, it } from "vitest";
import { JOYSTICK_DEAD_ZONE, JOYSTICK_MAXIMUM, radialJoystickInput } from "./player-input-controller";

describe("radial touch joystick", () => {
  it("filters finger noise inside the dead zone", () => {
    expect(radialJoystickInput(JOYSTICK_DEAD_ZONE, 0)).toMatchObject({ x: 0, y: 0, moved: false });
  });

  it("ramps analog magnitude smoothly outside the dead zone", () => {
    const halfway = radialJoystickInput((JOYSTICK_DEAD_ZONE + JOYSTICK_MAXIMUM) / 2, 0);
    expect(halfway.x).toBeCloseTo(.5);
    expect(halfway.y).toBe(0);
    expect(halfway.moved).toBe(true);
  });

  it("clamps direction, speed, and visual travel at the outer radius", () => {
    const input = radialJoystickInput(300, 400);
    expect(Math.hypot(input.x, input.y)).toBeCloseTo(1);
    expect(Math.hypot(input.stickX, input.stickY)).toBeCloseTo(JOYSTICK_MAXIMUM);
  });
});
