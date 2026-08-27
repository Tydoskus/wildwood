import {
  PLAYER_RADIUS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "./rules";

export const PLAYER_SIMULATION_HZ = 60;
export const PLAYER_MOTION_ANCHOR_TIMEOUT_MICROS = 1_500_000n;

export type PlayerMotionAnchor = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  moving: boolean;
  simulationTick: number;
  anchoredAtMicros: bigint;
};

export type AnalyticalPlayerMotion = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  moving: boolean;
  simulationTick: number;
};

/**
 * Samples a constant-velocity motion anchor without creating a server tick.
 * A missing heartbeat stops extrapolation after a bounded grace period so a
 * backgrounded or disconnected sender cannot drift across the world forever.
 */
export function analyticalPlayerMotionAt(
  anchor: PlayerMotionAnchor,
  sampledAtMicros: bigint,
): AnalyticalPlayerMotion {
  const rawElapsedMicros = sampledAtMicros > anchor.anchoredAtMicros
    ? sampledAtMicros - anchor.anchoredAtMicros
    : 0n;
  const elapsedMicros = rawElapsedMicros > PLAYER_MOTION_ANCHOR_TIMEOUT_MICROS
    ? PLAYER_MOTION_ANCHOR_TIMEOUT_MICROS
    : rawElapsedMicros;
  const elapsedSeconds = Number(elapsedMicros) / 1_000_000;
  const moving = Boolean(anchor.moving) && rawElapsedMicros <= PLAYER_MOTION_ANCHOR_TIMEOUT_MICROS;
  const anchorVx = anchor.moving && Number.isFinite(anchor.vx) ? anchor.vx : 0;
  const anchorVy = anchor.moving && Number.isFinite(anchor.vy) ? anchor.vy : 0;
  const vx = moving ? anchorVx : 0;
  const vy = moving ? anchorVy : 0;
  const anchorX = Number.isFinite(anchor.x) ? anchor.x : PLAYER_RADIUS;
  const anchorY = Number.isFinite(anchor.y) ? anchor.y : PLAYER_RADIUS;
  const x = Math.max(PLAYER_RADIUS, Math.min(WORLD_WIDTH - PLAYER_RADIUS, anchorX + anchorVx * elapsedSeconds));
  const y = Math.max(PLAYER_RADIUS, Math.min(WORLD_HEIGHT - PLAYER_RADIUS, anchorY + anchorVy * elapsedSeconds));
  const baseTick = Number.isFinite(anchor.simulationTick) ? Math.max(0, Math.floor(anchor.simulationTick)) >>> 0 : 0;
  const elapsedTicks = Math.floor(Number(elapsedMicros) * PLAYER_SIMULATION_HZ / 1_000_000);

  return {
    x,
    y,
    vx,
    vy,
    moving,
    simulationTick: (baseTick + elapsedTicks) >>> 0,
  };
}
