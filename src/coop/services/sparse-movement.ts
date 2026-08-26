export const MOVEMENT_HEARTBEAT_MS = 500;
export const TOUCH_MOVEMENT_MIN_INTERVAL_MS = 100;
export const TOUCH_MOVEMENT_VECTOR_THRESHOLD = .12;
export const TOUCH_MOVEMENT_DIRECTION_SECTORS = 24;

const VECTOR_EPSILON = 1e-6;
const TOUCH_DIRECTION_COSINE = Math.cos(Math.PI * 2 / TOUCH_MOVEMENT_DIRECTION_SECTORS);
const TOUCH_DIRECTION_COSINE_SQUARED = TOUCH_DIRECTION_COSINE * TOUCH_DIRECTION_COSINE;
const TOUCH_MAGNITUDE_RETAINED_SQUARED = (1 - TOUCH_MOVEMENT_VECTOR_THRESHOLD) ** 2;

export type MovementInputKind = "keyboard" | "touch";
export type MovementVelocity = { vx: number; vy: number; moving: boolean };
export type SentMovementState = MovementVelocity & { sentAt: number };
export type MovementUpdateReason = "forced" | "start" | "stop" | "direction" | "heartbeat";

export function sanitizeMovementVelocity(vx: number, vy: number): MovementVelocity {
  if (!Number.isFinite(vx) || !Number.isFinite(vy)) return { vx: 0, vy: 0, moving: false };
  if (Math.abs(vx) <= VECTOR_EPSILON && Math.abs(vy) <= VECTOR_EPSILON) return { vx: 0, vy: 0, moving: false };
  return { vx, vy, moving: true };
}

export function movementUpdateReason(options: {
  now: number;
  velocity: MovementVelocity;
  inputKind: MovementInputKind;
  lastSent: SentMovementState | null;
  force?: boolean;
}): MovementUpdateReason | null {
  const { now, velocity, inputKind, lastSent, force = false } = options;
  if (force) return "forced";
  if (!lastSent) return velocity.moving ? "start" : null;
  if (velocity.moving !== lastSent.moving) return velocity.moving ? "start" : "stop";
  if (!velocity.moving) return null;

  const elapsed = Math.max(0, now - lastSent.sentAt);
  const deltaX = velocity.vx - lastSent.vx;
  const deltaY = velocity.vy - lastSent.vy;
  if (inputKind === "keyboard" && (Math.abs(deltaX) > VECTOR_EPSILON || Math.abs(deltaY) > VECTOR_EPSILON)) return "direction";
  const speedSquared = velocity.vx * velocity.vx + velocity.vy * velocity.vy;
  const lastSpeedSquared = lastSent.vx * lastSent.vx + lastSent.vy * lastSent.vy;
  const directionDot = velocity.vx * lastSent.vx + velocity.vy * lastSent.vy;
  const directionChanged = directionDot <= 0 || directionDot * directionDot <= speedSquared * lastSpeedSquared * TOUCH_DIRECTION_COSINE_SQUARED;
  const minimumSpeedSquared = Math.min(speedSquared, lastSpeedSquared);
  const maximumSpeedSquared = Math.max(1, speedSquared, lastSpeedSquared);
  const magnitudeChanged = minimumSpeedSquared <= maximumSpeedSquared * TOUCH_MAGNITUDE_RETAINED_SQUARED;
  if (
    inputKind === "touch" &&
    (directionChanged || magnitudeChanged) &&
    elapsed >= TOUCH_MOVEMENT_MIN_INTERVAL_MS
  ) return "direction";
  if (elapsed >= MOVEMENT_HEARTBEAT_MS) return "heartbeat";
  return null;
}
