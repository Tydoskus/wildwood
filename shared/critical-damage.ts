import { RESEARCH_DEFINITIONS } from "./research";
import { prestigeCriticalDamageBonus, type PrestigePerkRanks } from "./prestige-perks";
import { CRIT_DAMAGE_START, critBonusLevels, critDamageForLevels, ratingLevels } from "./stat-rating";

/**
 * The critical hit multiplier, for every place that rolls or shows one: client
 * combat, the server's kill bound, duels, the Soul Defense Force and the
 * profile. One function, so none of them can disagree about the cap.
 *
 * Since 0.901.47 critical damage is a rating on a curve (stat-rating.ts):
 * crit camps on every map add to the run's rating, the soul's adds to it, and
 * the curve turns the total into a multiplier, 1.05x at nothing, 3% closer to
 * 100x a map's worth. Critical Damage research (+0.05x a rank) and Keen Edge
 * (+0.12x a rank) are levels on the same curve, worth exactly their old bonus
 * from nothing. The total stops at the cap: 50x, 10x more for each Crit Cap
 * rank, up to 100x, which the curve never reaches.
 */
export const CRITICAL_DAMAGE_BASE = CRIT_DAMAGE_START;
export const CRITICAL_DAMAGE_PER_RANK = .05;
export const CRIT_CAP_BASE = 50;
export const CRIT_CAP_PER_RANK = 10;
export const CRIT_CAP_MAX_RANK = 5;
/** The highest cap research reaches. */
export const CRIT_CAP_CEILING = CRIT_CAP_BASE + CRIT_CAP_PER_RANK * CRIT_CAP_MAX_RANK;

export type CriticalDamageParts = {
  /** Critical Damage research rank. */
  researchRank?: number;
  /** Prestige perk ranks: Keen Edge adds critical damage. */
  perks?: Partial<PrestigePerkRanks> | null;
  /** Soul crit damage rating, as stored. */
  soul?: number;
  /** The run's crit damage rating, from crit camps. */
  rating?: number;
  /** Crit Cap research rank. */
  capRank?: number;
};

const whole = (value: unknown, max: number) => Number.isFinite(value) ? Math.min(max, Math.max(0, Math.floor(Number(value)))) : 0;
const amount = (value: unknown) => Number.isFinite(value) ? Math.max(0, Number(value)) : 0;

/** The cap a Crit Cap rank sets: 50×, 60×… 100×. */
export function critCapForRank(rank: unknown) {
  return CRIT_CAP_BASE + whole(rank, CRIT_CAP_MAX_RANK) * CRIT_CAP_PER_RANK;
}

/** What research and Keen Edge add, as flat multipliers (their worth from nothing). */
export function criticalDamageBonuses(parts: Pick<CriticalDamageParts, "researchRank" | "perks">) {
  return {
    research: whole(parts.researchRank, RESEARCH_DEFINITIONS.criticalDamage.maxRank) * CRITICAL_DAMAGE_PER_RANK,
    perk: prestigeCriticalDamageBonus(parts.perks),
  };
}

/** The multiplier and its parts: `multiplier` is what combat uses, `uncapped` what the curve gives. */
export function criticalDamage(parts: CriticalDamageParts) {
  const { research, perk } = criticalDamageBonuses(parts);
  const soul = amount(parts.soul), rating = amount(parts.rating);
  const bonusLevels = critBonusLevels(research + perk);
  const cap = critCapForRank(parts.capRank);
  const uncapped = critDamageForLevels(ratingLevels(rating + soul) + bonusLevels);
  const multiplier = Math.min(cap, uncapped);
  // Each part's share, as the profile lists it: what it adds on top of the parts before it.
  const fromRating = critDamageForLevels(ratingLevels(rating)) - CRITICAL_DAMAGE_BASE;
  const fromSoul = critDamageForLevels(ratingLevels(rating + soul)) - CRITICAL_DAMAGE_BASE - fromRating;
  return { multiplier, uncapped, cap, capped: uncapped > cap, research, perk, soul, rating, bonusLevels, fromRating, fromSoul,
    fromBonuses: uncapped - CRITICAL_DAMAGE_BASE - fromRating - fromSoul };
}

/** The capped critical damage multiplier. */
export function criticalDamageMultiplier(parts: CriticalDamageParts) {
  return criticalDamage(parts).multiplier;
}
