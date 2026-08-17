export const MOVEMENT_HEARTBEAT_MS = 1_000;
export const TOUCH_MOVEMENT_MIN_INTERVAL_MS = 100;
export const TOUCH_MOVEMENT_VECTOR_THRESHOLD = .12;

const VECTOR_EPSILON = 1e-6;

export type MovementInputKind = "keyboard" | "touch";
export type MovementVector = { dx: number; dy: number; moving: boolean };
export type SentMovementState = MovementVector & { sentAt: number };
export type MovementUpdateReason = "forced" | "start" | "stop" | "direction" | "heartbeat";

export function normalizeMovementVector(dx: number, dy: number): MovementVector {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { dx: 0, dy: 0, moving: false };
  const length = Math.hypot(dx, dy);
  if (length <= VECTOR_EPSILON) return { dx: 0, dy: 0, moving: false };
  if (length <= 1) return { dx, dy, moving: true };
  return { dx: dx / length, dy: dy / length, moving: true };
}

export function movementUpdateReason(options: {
  now: number;
  vector: MovementVector;
  inputKind: MovementInputKind;
  lastSent: SentMovementState | null;
  force?: boolean;
}): MovementUpdateReason | null {
  const { now, vector, inputKind, lastSent, force = false } = options;
  if (force) return "forced";
  if (!lastSent) return vector.moving ? "start" : null;
  if (vector.moving !== lastSent.moving) return vector.moving ? "start" : "stop";
  if (!vector.moving) return null;

  const elapsed = Math.max(0, now - lastSent.sentAt);
  const delta = Math.hypot(vector.dx - lastSent.dx, vector.dy - lastSent.dy);
  if (inputKind === "keyboard" && delta > VECTOR_EPSILON) return "direction";
  if (
    inputKind === "touch" &&
    delta >= TOUCH_MOVEMENT_VECTOR_THRESHOLD &&
    elapsed >= TOUCH_MOVEMENT_MIN_INTERVAL_MS
  ) return "direction";
  if (elapsed >= MOVEMENT_HEARTBEAT_MS) return "heartbeat";
  return null;
}
