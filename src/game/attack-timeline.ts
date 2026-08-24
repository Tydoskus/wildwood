export const ATTACK_ANIMATION_SECONDS = .42;
export const ATTACK_WINDUP_SECONDS = .12;
const ATTACK_RELEASE_PROGRESS = ATTACK_WINDUP_SECONDS / ATTACK_ANIMATION_SECONDS;
const ATTACK_TIMESTAMP_EPSILON_SECONDS = 1e-7;

/**
 * One attack's authoritative phase boundaries on an absolute seconds clock.
 * Animation, projectile release, and cadence must all derive from this record.
 */
export type AbsoluteAttackTimestamps = {
  startedAtSeconds: number;
  releaseAtSeconds: number;
  animationEndsAtSeconds: number;
  nextAttackAtSeconds: number;
};

function finiteSeconds(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

export function absoluteAttackTimestamps(
  startedAtSeconds: number,
  attackIntervalSeconds: number,
): AbsoluteAttackTimestamps {
  const startedAt = finiteSeconds(startedAtSeconds, 0);
  const interval = Math.max(.001, finiteSeconds(attackIntervalSeconds, .001));
  const animationSeconds = Math.min(ATTACK_ANIMATION_SECONDS, interval);
  return {
    startedAtSeconds: startedAt,
    releaseAtSeconds: startedAt + animationSeconds * ATTACK_RELEASE_PROGRESS,
    animationEndsAtSeconds: startedAt + animationSeconds,
    nextAttackAtSeconds: startedAt + interval,
  };
}

/** Remaining legacy .42-second animation clock, derived without accumulating dt. */
export function attackAnimationClockAt(timestamps: AbsoluteAttackTimestamps, nowSeconds: number) {
  const duration = Math.max(.001, timestamps.animationEndsAtSeconds - timestamps.startedAtSeconds);
  const elapsed = Math.max(0, finiteSeconds(nowSeconds, timestamps.startedAtSeconds) - timestamps.startedAtSeconds);
  if (elapsed + ATTACK_TIMESTAMP_EPSILON_SECONDS >= duration) return 0;
  return ATTACK_ANIMATION_SECONDS * (1 - elapsed / duration);
}

export function attackReleaseReached(timestamps: AbsoluteAttackTimestamps, nowSeconds: number) {
  return finiteSeconds(nowSeconds, timestamps.startedAtSeconds) + ATTACK_TIMESTAMP_EPSILON_SECONDS >= timestamps.releaseAtSeconds;
}

export function attackAnimationFinished(timestamps: AbsoluteAttackTimestamps, nowSeconds: number) {
  return finiteSeconds(nowSeconds, timestamps.startedAtSeconds) + ATTACK_TIMESTAMP_EPSILON_SECONDS >= timestamps.animationEndsAtSeconds;
}
