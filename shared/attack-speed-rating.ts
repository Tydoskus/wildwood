import { DEFAULT_ATTACK_INTERVAL, MAX_BASE_ATTACKS_PER_SECOND, MAX_PLAYER_STAT } from './rules';

/**
 * Speed as a rating, the way armor is: rewards add Speed points, and the
 * points set attacks per second. Every 10× Speed closes SPEED_RATING_CLOSER of
 * the gap between a new run's rate and the cap, so it keeps paying at every
 * size and never reaches the cap. 0 Speed is a new run's rate; 9 closes 20%,
 * 99 36%, 999 49%, a million 79%.
 *
 * Only a map balanced from the curve pays Speed (its snapshot carries
 * SPEED_RATING); the authored maps still pay attacks per second directly.
 * Progress keeps storing the attack interval, so the rating is read back from
 * it before each reward.
 */
export const SPEED_RATING_CLOSER = .2;
const START = 1 / DEFAULT_ATTACK_INTERVAL;
const GAP = MAX_BASE_ATTACKS_PER_SECOND - START;

export function attacksPerSecondFromSpeed(speed: number) {
  const value = Number.isFinite(speed) ? Math.max(0, speed) : 0;
  return MAX_BASE_ATTACKS_PER_SECOND - GAP * (1 - SPEED_RATING_CLOSER) ** Math.log10(1 + value);
}

export function speedFromAttacksPerSecond(attacksPerSecond: number) {
  if (!(attacksPerSecond > START)) return 0;
  if (attacksPerSecond >= MAX_BASE_ATTACKS_PER_SECOND) return MAX_PLAYER_STAT;
  const decades = Math.log((MAX_BASE_ATTACKS_PER_SECOND - attacksPerSecond) / GAP) / Math.log(1 - SPEED_RATING_CLOSER);
  return Math.min(MAX_PLAYER_STAT, 10 ** decades - 1);
}

/** The attack interval after `points` more Speed. */
export function addSpeedRating(attackInterval: number, points: number) {
  const speed = Math.min(MAX_PLAYER_STAT, speedFromAttacksPerSecond(1 / attackInterval) + Math.max(0, points));
  return 1 / attacksPerSecondFromSpeed(speed);
}
