import { describe, expect, it } from "vitest";
import {
  MOVEMENT_HEARTBEAT_MS,
  TOUCH_MOVEMENT_MIN_INTERVAL_MS,
  movementUpdateReason,
  normalizeMovementVector,
  type SentMovementState,
} from "./sparse-movement";

const movingRight: SentMovementState = { dx: 1, dy: 0, moving: true, sentAt: 1_000 };

describe("sparse movement sender", () => {
  it("sends every keyboard state transition immediately", () => {
    expect(movementUpdateReason({ now: 1_001, vector: normalizeMovementVector(1, -1), inputKind: "keyboard", lastSent: movingRight })).toBe("direction");
    expect(movementUpdateReason({ now: 1_001, vector: normalizeMovementVector(0, 0), inputKind: "keyboard", lastSent: movingRight })).toBe("stop");
    expect(movementUpdateReason({ now: 1_001, vector: normalizeMovementVector(1, 0), inputKind: "keyboard", lastSent: { ...movingRight, moving: false, dx: 0 } })).toBe("start");
  });

  it("coalesces touch noise and caps material steering at ten updates per second", () => {
    expect(movementUpdateReason({ now: 1_200, vector: normalizeMovementVector(.995, .05), inputKind: "touch", lastSent: movingRight })).toBeNull();
    expect(movementUpdateReason({ now: 1_050, vector: normalizeMovementVector(.8, .6), inputKind: "touch", lastSent: movingRight })).toBeNull();
    expect(movementUpdateReason({ now: 1_000 + TOUCH_MOVEMENT_MIN_INTERVAL_MS, vector: normalizeMovementVector(.8, .6), inputKind: "touch", lastSent: movingRight })).toBe("direction");
  });

  it("sends a one-second moving heartbeat and no stationary heartbeat", () => {
    expect(movementUpdateReason({ now: 1_000 + MOVEMENT_HEARTBEAT_MS, vector: normalizeMovementVector(1, 0), inputKind: "keyboard", lastSent: movingRight })).toBe("heartbeat");
    expect(movementUpdateReason({ now: 20_000, vector: normalizeMovementVector(0, 0), inputKind: "keyboard", lastSent: { dx: 0, dy: 0, moving: false, sentAt: 0 } })).toBeNull();
  });

  it("sanitizes invalid vectors and bounds combined inputs", () => {
    expect(normalizeMovementVector(Number.NaN, 1)).toEqual({ dx: 0, dy: 0, moving: false });
    const normalized = normalizeMovementVector(2, 2);
    expect(normalized.moving).toBe(true);
    expect(normalized.dx).toBeCloseTo(Math.SQRT1_2);
    expect(normalized.dy).toBeCloseTo(Math.SQRT1_2);
  });
});
