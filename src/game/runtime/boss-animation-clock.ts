/** A finished attack returns to idle even while its damage effects remain active. */
export function bossAnimationClock(timeSeconds: number, attackElapsedSeconds: number | undefined, attackDurationMs: number) {
  const attacking = attackElapsedSeconds !== undefined && Number.isFinite(attackElapsedSeconds)
    && attackElapsedSeconds >= 0 && attackElapsedSeconds * 1000 < attackDurationMs;
  const seconds = attacking ? attackElapsedSeconds : timeSeconds;
  return { attacking, elapsed: Number.isFinite(seconds) ? Math.max(0, seconds) * 1000 : 0 };
}
