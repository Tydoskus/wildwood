import { describe, expect, it } from "vitest";
import {
  MOVEMENT_HEARTBEAT_MS,
  TOUCH_MOVEMENT_DIRECTION_SECTORS,
  TOUCH_MOVEMENT_MIN_INTERVAL_MS,
  movementUpdateReason,
  sanitizeMovementVelocity,
  type SentMovementState,
} from "./sparse-movement";

const movingRight: SentMovementState = { vx: 180, vy: 0, moving: true, sentAt: 1_000 };

describe("sparse movement sender", () => {
  it("sends every keyboard state transition immediately", () => {
    expect(movementUpdateReason({ now: 1_001, velocity: sanitizeMovementVelocity(127, -127), inputKind: "keyboard", lastSent: movingRight })).toBe("direction");
    expect(movementUpdateReason({ now: 1_001, velocity: sanitizeMovementVelocity(0, 0), inputKind: "keyboard", lastSent: movingRight })).toBe("stop");
    expect(movementUpdateReason({ now: 1_001, velocity: sanitizeMovementVelocity(180, 0), inputKind: "keyboard", lastSent: { ...movingRight, moving: false, vx: 0 } })).toBe("start");
    expect(movementUpdateReason({ now: 1_001, velocity: sanitizeMovementVelocity(266.5, 0), inputKind: "keyboard", lastSent: movingRight })).toBe("direction");
  });

  it("coalesces touch noise and caps material steering at ten updates per second", () => {
    expect(movementUpdateReason({ now: 1_200, velocity: sanitizeMovementVelocity(179.1, 9), inputKind: "touch", lastSent: movingRight })).toBeNull();
    expect(movementUpdateReason({ now: 1_050, velocity: sanitizeMovementVelocity(144, 108), inputKind: "touch", lastSent: movingRight })).toBeNull();
    expect(movementUpdateReason({ now: 1_000 + TOUCH_MOVEMENT_MIN_INTERVAL_MS, velocity: sanitizeMovementVelocity(144, 108), inputKind: "touch", lastSent: movingRight })).toBe("direction");
    const fourteenDegrees = 14 / 180 * Math.PI;
    const sixteenDegrees = 16 / 180 * Math.PI;
    expect(movementUpdateReason({
      now: 1_200,
      velocity: sanitizeMovementVelocity(Math.cos(fourteenDegrees) * 180, Math.sin(fourteenDegrees) * 180),
      inputKind: "touch",
      lastSent: movingRight,
    })).toBeNull();
    expect(movementUpdateReason({
      now: 1_200,
      velocity: sanitizeMovementVelocity(Math.cos(sixteenDegrees) * 180, Math.sin(sixteenDegrees) * 180),
      inputKind: "touch",
      lastSent: movingRight,
    })).toBe("direction");
    expect(TOUCH_MOVEMENT_DIRECTION_SECTORS).toBe(24);
  });

  it("sends a 2 Hz moving heartbeat and no stationary heartbeat", () => {
    expect(movementUpdateReason({ now: 1_000 + MOVEMENT_HEARTBEAT_MS, velocity: sanitizeMovementVelocity(180, 0), inputKind: "keyboard", lastSent: movingRight })).toBe("heartbeat");
    expect(movementUpdateReason({ now: 20_000, velocity: sanitizeMovementVelocity(0, 0), inputKind: "keyboard", lastSent: { vx: 0, vy: 0, moving: false, sentAt: 0 } })).toBeNull();
  });

  it("sanitizes invalid velocities without discarding world speed", () => {
    expect(sanitizeMovementVelocity(Number.NaN, 1)).toEqual({ vx: 0, vy: 0, moving: false });
    expect(sanitizeMovementVelocity(266.5, -188.4)).toEqual({ vx: 266.5, vy: -188.4, moving: true });
  });
});
