import { challengeMinimumInterval } from "../../shared/prestige-challenge";
import { criticalDamageBonuses } from "../../shared/critical-damage";
import { DEFAULT_ATTACK_INTERVAL, MAX_BASE_ATTACKS_PER_SECOND } from "../../shared/rules";
import {
  ATTACK_SPEED_START, CRIT_DAMAGE_START, CRIT_DAMAGE_TARGET, RATING_MAX, attackIntervalForRating, attackSpeedRatingFor,
  attackSpeedRatingForInterval, critBonusLevels, critDamageLevelsFor, ratingForLevels, reflectAttackBonus,
} from "../../shared/stat-rating";
import { storedPrestigePerkRanks } from "./prestige";
import { updateSnapshotRow } from "./snapshot-row-writes";
import { readPlayerProgress } from "./wide-stats";
import { repinMapBalances } from "./map-balance";

/** The base cap before 0.901.47 (it is 3 now), and the most soul attack speed there was: a fresh character to the highest cap then. */
const LEGACY_BASE_CAP = 2.625;
const LEGACY_SOUL_ATTACK_SPEED_CEILING = LEGACY_BASE_CAP + 2 - 1 / DEFAULT_ATTACK_INTERVAL;
const finite = (value: unknown) => Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
const research = (ctx: any, identity: any) => criticalDamageBonuses({
  researchRank: ctx.db.playerResearch.identity.find(identity)?.criticalDamage, perks: storedPrestigePerkRanks(ctx, identity),
});

/**
 * Migration 53 (0.901.37), as it ran then: soul critical damage (a flat share
 * of the multiplier in those days) trimmed so the total stayed at 100× or
 * under. Kept for a database below 53, which runs it before 54 converts.
 */
export function trimStoredSoulCritDamage(ctx: any) {
  for (const row of [...ctx.db.playerSoulStats.iter()] as any[]) {
    const bonus = research(ctx, row.identity);
    const critDamage = Math.min(finite(row.critDamage), Math.max(0, CRIT_DAMAGE_TARGET - (CRIT_DAMAGE_START + bonus.research + bonus.perk)));
    if (critDamage < row.critDamage) ctx.db.playerSoulStats.identity.update({ ...row, critDamage });
  }
}

/**
 * Migration 54 (0.901.47): attack speed and crit damage become ratings
 * (shared/stat-rating.ts). Nobody is weaker on the day:
 *
 * - Soul attack speed was attacks a second added to the run's. It becomes the
 *   rating that gives exactly that much from a fresh start, so every run after
 *   a prestige starts at least as fast as it did (the cap and above: the
 *   rating's top; the base cap rose from 2.625 to 3 in the same release).
 * - The run's attack interval stays. Where soul and run combined on the rating
 *   come out slower than they added up to before, the run's interval is
 *   raised until they match.
 * - Soul crit damage was added to the multiplier. It becomes the rating that,
 *   with the player's research and Keen Edge, gives the multiplier they had.
 *   Nobody has a run crit rating yet.
 * - Every pinned map visit is resolved again, so it holds the new camps' pay.
 */
export function convertToStatRatings(ctx: any) {
  for (const row of [...ctx.db.playerSoulStats.iter()] as any[]) {
    const oldSpeed = Math.min(finite(row.attackSpeed), LEGACY_SOUL_ATTACK_SPEED_CEILING);
    const oldCrit = finite(row.critDamage);
    const attackSpeed = oldSpeed > 0 ? attackSpeedRatingFor(Math.min(MAX_BASE_ATTACKS_PER_SECOND, ATTACK_SPEED_START + oldSpeed)) : 0;
    let critDamage = 0;
    if (oldCrit > 0) {
      const bonus = research(ctx, row.identity);
      const had = Math.min(CRIT_DAMAGE_TARGET, CRIT_DAMAGE_START + bonus.research + bonus.perk + oldCrit);
      const levels = critDamageLevelsFor(had);
      critDamage = levels === Infinity ? RATING_MAX : ratingForLevels(levels - critBonusLevels(bonus.research + bonus.perk));
    }
    ctx.db.playerSoulStats.identity.update({ ...row, attackSpeed, critDamage });
    if (oldSpeed > 0) keepAttackSpeed(ctx, row.identity, oldSpeed, attackSpeed);
  }
  repinMapBalances(ctx);
}

/** Raises the run's interval where its rating and the soul's give less than the two used to add up to. */
function keepAttackSpeed(ctx: any, identity: any, oldSoul: number, soulRating: number) {
  // Soul stats were not in play during a challenge; its run is left as it stands.
  if (ctx.db.playerPrestigeChallenge.identity.find(identity)?.active || ctx.db.playerAggroChallenge?.identity.find(identity)?.active) return;
  const progress = readPlayerProgress(ctx, identity);
  if (!progress || !(progress.attackRate > 0)) return;
  const minInterval = challengeMinimumInterval(ctx.db.playerPrestigeChallenge.identity.find(identity));
  // What run and soul gave before, under the old 2.625 base cap and the same Reflect Only wins.
  const had = Math.min(LEGACY_BASE_CAP + reflectAttackBonus(minInterval), 1 / progress.attackRate + oldSoul) - reflectAttackBonus(minInterval);
  const needed = attackSpeedRatingFor(had);
  const run = attackSpeedRatingForInterval(progress.attackRate, minInterval);
  if (run + soulRating >= needed || soulRating >= RATING_MAX) return;
  const attackRate = Math.min(progress.attackRate, attackIntervalForRating(needed >= RATING_MAX ? RATING_MAX : needed - soulRating, minInterval));
  if (attackRate < progress.attackRate) updateSnapshotRow(ctx, "playerProgress", { ...progress, attackRate });
}
