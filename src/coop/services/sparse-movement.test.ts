import { describe, expect, it } from "vitest";
import {
  MOVEMENT_HEARTBEAT_MS,
  SOLO_MOVEMENT_CHECKPOINT_MS,
  TOUCH_MOVEMENT_DIRECTION_SECTORS,
  TOUCH_MOVEMENT_MIN_INTERVAL_MS,
  STEER_MOVEMENT_HEARTBEAT_MS,
  STEER_MOVEMENT_MIN_INTERVAL_MS,
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
  /** Frames at 60 Hz for `seconds`, the heading given per frame; returns the packets sent. */
  function packets(inputKind: "keyboard" | "touch" | "steer", seconds: number, headingAt: (frame: number) => number) {
    let lastSent: SentMovementState | null = null;
    let x = 1_000, y = 1_000, sent = 0;
    for (let frame = 0; frame < seconds * 60; frame += 1) {
      const now = frame * (1000 / 60), heading = headingAt(frame);
      const velocity = sanitizeMovementVelocity(Math.cos(heading) * 200, Math.sin(heading) * 200);
      if (movementUpdateReason({ now, velocity, inputKind, lastSent, position: { x, y } })) { sent += 1; lastSent = { ...velocity, sentAt: now, x, y }; }
      x += velocity.vx / 60; y += velocity.vy / 60;
    }
    return sent;
  }
  const gentleCurve = (frame: number) => frame * (Math.PI / 180) * .25;   // a quarter of a degree per frame

  it("sent a packet on nearly every frame while it was reported as keyboard input", () => {
    expect(packets("keyboard", 1, gentleCurve)).toBeGreaterThanOrEqual(55);
  });
  it("walks a straight leg of a route on its first packet and the slow heartbeat alone", () => {
    expect(packets("steer", 10, () => 0)).toBe(1 + Math.floor(9_999 / STEER_MOVEMENT_HEARTBEAT_MS));   // the start, and one heartbeat at five seconds
  });
  it("speaks up only when the last packet's prediction has drifted, so a gentle curve costs about a packet a second", () => {
    const sent = packets("steer", 10, gentleCurve);
    expect(sent).toBeGreaterThanOrEqual(5);
    expect(sent).toBeLessThanOrEqual(14);
  });
  it("corrects a sharp turn at a waypoint within a third of a second", () => {
    let lastSent: SentMovementState | null = { vx: 200, vy: 0, moving: true, sentAt: 0, x: 0, y: 0 };
    let x = 0, y = 0, correctedAt = -1;
    for (let frame = 1; frame <= 60 && correctedAt < 0; frame += 1) {
      const now = frame * (1000 / 60);
      y += 200 / 60;                                                        // turned ninety degrees at the waypoint
      if (movementUpdateReason({ now, velocity: { vx: 0, vy: 200, moving: true }, inputKind: "steer", lastSent, position: { x, y } })) correctedAt = now;
    }
    expect(correctedAt).toBeGreaterThanOrEqual(STEER_MOVEMENT_MIN_INTERVAL_MS);
    expect(correctedAt).toBeLessThanOrEqual(340);
  });
});
