import { RESEARCH_DEFINITIONS } from "./research";
import { prestigeCriticalDamageBonus, type PrestigePerkRanks } from "./prestige-perks";

/**
 * The critical hit multiplier, for every place that rolls or shows one: client
 * combat, the server's kill bound, duels, the Soul Defense Force and the
 * profile. One function, so none of them can disagree about the cap.
 *
 * 1.05× before anything, +0.05× a Critical Damage rank, Keen Edge's share, and
 * the soul's. The total stops at the cap: 50×, and 10× more for each Crit Cap
 * rank, up to 100×. Research and Keen Edge alone reach 2.65× at most, so the
 * cap only ever holds soul critical damage back.
 */
export const CRITICAL_DAMAGE_BASE = 1.05;
export const CRITICAL_DAMAGE_PER_RANK = .05;
export const CRIT_CAP_BASE = 50;
export const CRIT_CAP_PER_RANK = 10;
export const CRIT_CAP_MAX_RANK = 5;
/** The highest cap research reaches, and the most a player's total may ever be stored at. */
export const CRIT_CAP_CEILING = CRIT_CAP_BASE + CRIT_CAP_PER_RANK * CRIT_CAP_MAX_RANK;

export type CriticalDamageParts = {
  /** Critical Damage research rank. */
  researchRank?: number;
  /** Prestige perk ranks: Keen Edge adds critical damage. */
  perks?: Partial<PrestigePerkRanks> | null;
  /** Soul critical damage, as stored. */
  soul?: number;
  /** Crit Cap research rank. */
  capRank?: number;
};

const whole = (value: unknown, max: number) => Number.isFinite(value) ? Math.min(max, Math.max(0, Math.floor(Number(value)))) : 0;
const amount = (value: unknown) => Number.isFinite(value) ? Math.max(0, Number(value)) : 0;

/** The cap a Crit Cap rank sets: 50×, 60×… 100×. */
export function critCapForRank(rank: unknown) {
  return CRIT_CAP_BASE + whole(rank, CRIT_CAP_MAX_RANK) * CRIT_CAP_PER_RANK;
}

/** Everything but the soul's share, uncapped. */
function nonSoulTotal(parts: CriticalDamageParts) {
  return CRITICAL_DAMAGE_BASE + whole(parts.researchRank, RESEARCH_DEFINITIONS.criticalDamage.maxRank) * CRITICAL_DAMAGE_PER_RANK
    + prestigeCriticalDamageBonus(parts.perks);
}

/** The multiplier and its parts: `multiplier` is what combat uses, `uncapped` what the parts add to. */
export function criticalDamage(parts: CriticalDamageParts) {
  const research = whole(parts.researchRank, RESEARCH_DEFINITIONS.criticalDamage.maxRank) * CRITICAL_DAMAGE_PER_RANK;
  const perk = prestigeCriticalDamageBonus(parts.perks);
  const soul = amount(parts.soul);
  const cap = critCapForRank(parts.capRank);
  const uncapped = CRITICAL_DAMAGE_BASE + research + perk + soul;
  const multiplier = Math.min(cap, uncapped);
  return { multiplier, uncapped, cap, capped: uncapped > cap, research, perk, soul };
}

/** The capped critical damage multiplier. */
export function criticalDamageMultiplier(parts: CriticalDamageParts) {
  return criticalDamage(parts).multiplier;
}

/** The most soul critical damage that may be stored: what brings the total to exactly 100×. */
export function soulCritDamageCeiling(parts: Omit<CriticalDamageParts, "soul" | "capRank">) {
  return Math.max(0, CRIT_CAP_CEILING - nonSoulTotal(parts));
}

/** Stored soul critical damage, trimmed so the total is never above 100×. Anything at or under it is kept. */
export function trimSoulCritDamage(soul: unknown, parts: Omit<CriticalDamageParts, "soul" | "capRank">) {
  return Math.min(amount(soul), soulCritDamageCeiling(parts));
}
