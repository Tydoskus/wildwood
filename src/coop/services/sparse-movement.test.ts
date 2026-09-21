import { describe, expect, it } from "vitest";
import {
  MOVEMENT_HEARTBEAT_MS,
  SOLO_MOVEMENT_CHECKPOINT_MS,
  TOUCH_MOVEMENT_DIRECTION_SECTORS,
  TOUCH_MOVEMENT_MIN_INTERVAL_MS,
  movementUpdateReason,
  sanitizeMovementVelocity,
  type SentMovementState,
} from "./sparse-movement";

const movingRight: SentMovementState = { vx: 180, vy: 0, moving: true, sentAt: 1_000 };

describe("sparse movement sender", () => {
  it("coalesces invisible autofarm into thirty-second checkpoints and preserves forced actions", () => {
    const input = { now: 1_001, velocity: sanitizeMovementVelocity(0, 180), inputKind: "keyboard" as const,
      lastSent: movingRight, multiplayerEnabled: false };
    for (const elapsed of [1, 100, 500, 5_000, 29_999]) {
      expect(movementUpdateReason({ ...input, now: movingRight.sentAt + elapsed })).toBeNull();
    }
    expect(movementUpdateReason({ ...input, now: movingRight.sentAt + SOLO_MOVEMENT_CHECKPOINT_MS })).toBe("direction");
    expect(movementUpdateReason({ ...input, force: true })).toBe("forced");
    expect(movementUpdateReason({ ...input, multiplayerEnabled: true })).toBe("direction");
  });
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

describe("movement the game or the mouse aims", () => {
  /** One second of 60 Hz frames walking a gentle curve, as autofarm does on the way to a waypoint. */
  function packetsInOneSecond(inputKind: "keyboard" | "touch") {
    let lastSent: { vx: number; vy: number; moving: boolean; sentAt: number } | null = null;
    let sent = 0;
    for (let frame = 0; frame < 60; frame += 1) {
      const now = frame * (1000 / 60);
      const angle = frame * (Math.PI / 180) * .25;                       // a quarter of a degree per frame
      const velocity = sanitizeMovementVelocity(Math.cos(angle) * 200, Math.sin(angle) * 200);
      if (movementUpdateReason({ now, velocity, inputKind, lastSent })) { sent += 1; lastSent = { ...velocity, sentAt: now }; }
    }
    return sent;
  }
  it("sends a packet on nearly every frame if it is reported as keyboard input", () => {
    expect(packetsInOneSecond("keyboard")).toBeGreaterThanOrEqual(55);
  });
  it("sends a handful a second once it is rate-limited like touch", () => {
    expect(packetsInOneSecond("touch")).toBeLessThanOrEqual(4);
  });
});
