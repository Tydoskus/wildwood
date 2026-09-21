export const MOVEMENT_HEARTBEAT_MS = 500;
export const SOLO_MOVEMENT_CHECKPOINT_MS = 30_000;
export const TOUCH_MOVEMENT_MIN_INTERVAL_MS = 100;
/**
 * Steered movement (autofarm walking a route, click-to-move) is left to dead
 * reckoning. The server and every other client already extrapolate a player
 * from the position and velocity of their last packet, so a packet is only
 * worth sending once that prediction has gone wrong: the player has drifted
 * this far from where the last packet says they should be. Walking a straight
 * leg of a route sends nothing between its start and its end.
 */
export const STEER_MOVEMENT_DRIFT_PX = 64;
export const STEER_MOVEMENT_MIN_INTERVAL_MS = 250;
/** Long enough to be nearly free, short enough that a lost packet is corrected before anyone notices. */
export const STEER_MOVEMENT_HEARTBEAT_MS = 5_000;
export const TOUCH_MOVEMENT_VECTOR_THRESHOLD = .12;
export const TOUCH_MOVEMENT_DIRECTION_SECTORS = 24;

const VECTOR_EPSILON = 1e-6;
const TOUCH_DIRECTION_COSINE = Math.cos(Math.PI * 2 / TOUCH_MOVEMENT_DIRECTION_SECTORS);
const TOUCH_DIRECTION_COSINE_SQUARED = TOUCH_DIRECTION_COSINE * TOUCH_DIRECTION_COSINE;
const TOUCH_MAGNITUDE_RETAINED_SQUARED = (1 - TOUCH_MOVEMENT_VECTOR_THRESHOLD) ** 2;

export type MovementInputKind = "keyboard" | "touch" | "steer";
export type MovementVelocity = { vx: number; vy: number; moving: boolean };
/** `x`/`y` are where the player was when the packet was sent; steered movement measures its drift from them. */
export type SentMovementState = MovementVelocity & { sentAt: number; x?: number; y?: number };
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
  /** Where the player is now; only steered movement needs it. */
  position?: { x: number; y: number };
  force?: boolean;
  multiplayerEnabled?: boolean;
}): MovementUpdateReason | null {
  const { now, velocity, inputKind, lastSent, force = false } = options;
  if (force) return "forced";
  if (!lastSent) return velocity.moving ? "start" : null;
  // Invisible autofarm needs location checkpoints, not live steering updates.
  // Forced travel, reconnect, profile/bench and duel positions remain immediate.
  if (options.multiplayerEnabled === false && now - lastSent.sentAt < SOLO_MOVEMENT_CHECKPOINT_MS) return null;
  if (velocity.moving !== lastSent.moving) return velocity.moving ? "start" : "stop";
  if (!velocity.moving) return null;

  const elapsed = Math.max(0, now - lastSent.sentAt);
  if (inputKind === "steer" && options.position && lastSent.x !== undefined && lastSent.y !== undefined) {
    if (elapsed < STEER_MOVEMENT_MIN_INTERVAL_MS) return null;
    const predictedX = lastSent.x + lastSent.vx * elapsed / 1_000, predictedY = lastSent.y + lastSent.vy * elapsed / 1_000;
    if (Math.hypot(options.position.x - predictedX, options.position.y - predictedY) > STEER_MOVEMENT_DRIFT_PX) return "direction";
    return elapsed >= STEER_MOVEMENT_HEARTBEAT_MS ? "heartbeat" : null;
  }
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
    inputKind !== "keyboard" &&
    (directionChanged || magnitudeChanged) &&
    elapsed >= TOUCH_MOVEMENT_MIN_INTERVAL_MS
  ) return "direction";
  if (elapsed >= MOVEMENT_HEARTBEAT_MS) return "heartbeat";
  return null;
}
