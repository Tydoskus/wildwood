import {
  absoluteAttackTimestamps,
  ATTACK_ANIMATION_SECONDS,
  attackAnimationClockAt,
  attackAnimationFinished,
} from "../../game/attack-timeline";

const PROJECTILE_FLIGHT_SECONDS = .18;

export type RemoteBossAttackState = {
  startedAt: number;
  attackerX: number;
  attackerY: number;
  targetX: number;
  targetY: number;
  targetRadius: number;
  hits: number;
};

export type RemoteBossAttackVisual = {
  targetX: number;
  targetY: number;
  targetRadius: number;
  hits: number;
  projectileProgress: number;
};

export function createRemoteBossAttackState(event: Omit<RemoteBossAttackState, "startedAt">, receivedAt: number): RemoteBossAttackState {
  return {
    ...event,
    startedAt: receivedAt,
    hits: Math.max(1, Math.min(20, Math.floor(event.hits))),
  };
}

export function remoteBossAttackFrame(state: RemoteBossAttackState | undefined, now: number) {
  if (!state) return null;
  const timestamps = absoluteAttackTimestamps(state.startedAt / 1_000, ATTACK_ANIMATION_SECONDS);
  const nowSeconds = now / 1_000;
  const projectileProgress = (nowSeconds - timestamps.releaseAtSeconds) / PROJECTILE_FLIGHT_SECONDS;
  if (attackAnimationFinished(timestamps, nowSeconds)) return null;
  const visual: RemoteBossAttackVisual = {
    targetX: state.targetX,
    targetY: state.targetY,
    targetRadius: state.targetRadius,
    hits: state.hits,
    projectileProgress: Math.max(0, Math.min(1, projectileProgress)),
  };
  return {
    facing: Math.atan2(state.targetY - state.attackerY, state.targetX - state.attackerX),
    throwClock: attackAnimationClockAt(timestamps, nowSeconds),
    visual,
  };
}
