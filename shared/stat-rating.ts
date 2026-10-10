import { DEFAULT_ATTACK_INTERVAL, MAX_BASE_ATTACKS_PER_SECOND, MIN_ATTACK_INTERVAL } from "./rules";

/**
 * Attack speed and critical damage as ratings (Ryan, 0.901.47).
 *
 * Kills add plain rating points; a formula turns the points into attacks a
 * second or a critical multiplier. The formula is a log: every doubling of
 * (1 + rating / 100) is one "level", and each level closes a fixed share of
 * what is left to the cap:
 *
 *   attacks/s = 2.625 - (2.625 - 0.641) x 0.95 ^ level    (5% closer a level)
 *   crit      = 100   - (100   - 1.05 ) x 0.97 ^ level    (3% closer a level)
 *
 * Each map's attack speed and crit camps pay so that a map's worth of kills
 * (RATING_MAP_WORTH_KILLS) doubles the rating: one level a map, so 5% / 3%
 * closer every map, slower and slower in absolute terms, and never at the cap.
 * Farming a map past its worth still pays, but the log makes it worth less and
 * less: twice a map's worth is 1.6 levels, not 2.
 *
 * The run's rating resets on prestige like any stat; the Soul Dimension's adds
 * to it and is kept. Reflect Only wins add their attacks a second on top and
 * raise the cap by as much (prestige-challenge.ts), so the curve is the same
 * shape under every cap.
 */
export const RATING_UNIT = 100;
/** Ratings stop here: far past where either curve shows its cap. */
export const RATING_MAX = 1e300;
export const ATTACK_SPEED_CLOSER = .05;
export const CRIT_DAMAGE_CLOSER = .03;
export const CRIT_DAMAGE_START = 1.05;
export const CRIT_DAMAGE_TARGET = 100;
export const ATTACK_SPEED_START = 1 / DEFAULT_ATTACK_INTERVAL;
const ATTACK_SPEED_GAP = MAX_BASE_ATTACKS_PER_SECOND - ATTACK_SPEED_START;
const CRIT_GAP = CRIT_DAMAGE_TARGET - CRIT_DAMAGE_START;

export function cleanRating(rating: unknown) {
  const value = Number(rating);
  return Number.isFinite(value) ? Math.min(RATING_MAX, Math.max(0, value)) : value === Infinity ? RATING_MAX : 0;
}
/** Levels a rating stands for: how many maps' worth it is. */
export function ratingLevels(rating: unknown) {
  return Math.log2(1 + cleanRating(rating) / RATING_UNIT);
}
export function ratingForLevels(levels: number) {
  if (!(levels > 0)) return 0;
  return Math.min(RATING_MAX, RATING_UNIT * (2 ** levels - 1));
}

// ---- Attack speed ----

/** Attacks a second a rating gives, before Reflect Only's bonus. */
export function attacksPerSecondForRating(rating: unknown) {
  return MAX_BASE_ATTACKS_PER_SECOND - ATTACK_SPEED_GAP * (1 - ATTACK_SPEED_CLOSER) ** ratingLevels(rating);
}
/** The rating that gives these attacks a second (the cap and above: RATING_MAX). */
export function attackSpeedRatingFor(attacksPerSecond: number) {
  if (!(attacksPerSecond > ATTACK_SPEED_START)) return 0;
  if (attacksPerSecond >= MAX_BASE_ATTACKS_PER_SECOND) return RATING_MAX;
  return ratingForLevels(Math.log((MAX_BASE_ATTACKS_PER_SECOND - attacksPerSecond) / ATTACK_SPEED_GAP) / Math.log(1 - ATTACK_SPEED_CLOSER));
}
/** Reflect Only's attacks a second, read from the cap they set (challengeMinimumInterval). */
export function reflectAttackBonus(minInterval = MIN_ATTACK_INTERVAL) {
  return Number.isFinite(minInterval) && minInterval > 0 ? Math.max(0, 1 / minInterval - MAX_BASE_ATTACKS_PER_SECOND) : 0;
}
/** The attack interval a rating gives, Reflect Only's bonus (`minInterval`) included. */
export function attackIntervalForRating(rating: unknown, minInterval = MIN_ATTACK_INTERVAL) {
  return Math.max(minInterval, 1 / (attacksPerSecondForRating(rating) + reflectAttackBonus(minInterval)));
}
/**
 * The rating behind an attack interval as progress stores it (Reflect Only's
 * bonus in it). Progress keeps the interval, so every reward reads it back.
 */
export function attackSpeedRatingForInterval(interval: number, minInterval = MIN_ATTACK_INTERVAL) {
  if (!(interval > 0) || !Number.isFinite(interval)) return 0;
  return attackSpeedRatingFor(1 / interval - reflectAttackBonus(minInterval));
}
/** The attack interval after `amount` more rating. Never slower than it was. */
export function addAttackSpeedRating(interval: number, amount: number, minInterval = MIN_ATTACK_INTERVAL) {
  const next = attackIntervalForRating(attackSpeedRatingForInterval(interval, minInterval) + Math.max(0, Number(amount) || 0), minInterval);
  return interval > 0 && Number.isFinite(interval) ? Math.min(interval, next) : next;
}

// ---- Critical damage ----

export function critDamageForLevels(levels: number) {
  return CRIT_DAMAGE_TARGET - CRIT_GAP * (1 - CRIT_DAMAGE_CLOSER) ** Math.max(0, levels);
}
/** The levels that give this multiplier from nothing (100x and above: Infinity). */
export function critDamageLevelsFor(multiplier: number) {
  if (!(multiplier > CRIT_DAMAGE_START)) return 0;
  if (multiplier >= CRIT_DAMAGE_TARGET) return Infinity;
  return Math.log((CRIT_DAMAGE_TARGET - multiplier) / CRIT_GAP) / Math.log(1 - CRIT_DAMAGE_CLOSER);
}
/**
 * Levels a flat critical damage bonus is worth (research ranks and Keen Edge):
 * exactly that bonus from nothing, and the same share closer to 100x on top of
 * any rating, so what was paid for keeps paying at every stage.
 */
export function critBonusLevels(bonus: number) {
  return Number.isFinite(bonus) && bonus > 0 ? critDamageLevelsFor(CRIT_DAMAGE_START + bonus) : 0;
}

// ---- What a kill pays ----

/**
 * Kills of a map's attack speed (or crit) camp that make up the map's worth:
 * about what the Balance Lab's typical player kills of that camp on the map
 * (npm run balance:scorecard prints it), held to at most twice the last map's
 * so a kill never pays less than one on the map before. Endless keeps map 15's.
 */
export const RATING_MAP_WORTH_KILLS: readonly number[] = Object.freeze([
  12, 18, 36, 72, 110, 100, 115, 95, 125, 135, 185, 230, 270, 260, 300,
]);
export function ratingMapWorthKills(mapNumber: number) {
  const index = Math.max(1, Math.min(RATING_MAP_WORTH_KILLS.length, Math.floor(mapNumber))) - 1;
  return RATING_MAP_WORTH_KILLS[index];
}
/**
 * What one attack speed or crit kill pays on map `mapNumber` (1 the forest, 15
 * Ion Citadel, 15 + n Endless n): the map's worth is the rating it takes to go
 * from map N - 1's level to map N's.
 */
export function ratingRewardPerKill(mapNumber: number) {
  const number = Math.max(1, Math.floor(Number.isFinite(mapNumber) ? mapNumber : 1));
  return Math.min(RATING_MAX, RATING_UNIT * 2 ** (number - 1) / ratingMapWorthKills(number));
}

// ---- Display ----

/** Within half a hundredth of the cap: two decimals cannot tell it from the cap, so it shows as the cap. */
const atCap = (value: number, cap: number) => cap - value < .005;
/** Shown to two decimals; "(Max)" once that reads the same as the cap. */
export function attackSpeedLabel(attacksPerSecond: number, cap: number) {
  return atCap(attacksPerSecond, cap) ? `${cap.toFixed(2)}/s (Max)` : `${attacksPerSecond.toFixed(2)}/s`;
}
export function critDamageLabel(multiplier: number, cap: number) {
  return atCap(multiplier, cap) ? `${cap.toFixed(2)}× (Max)` : `${multiplier.toFixed(2)}×`;
}
