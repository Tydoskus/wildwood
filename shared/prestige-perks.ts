import { PRESTIGE_CHALLENGE_LIMIT, challengeMinimumInterval, type PrestigeChallenge } from "./prestige-challenge";
import type { AttackCap } from "./stat-rating";
import { QUICK_DRAW_CAP_PER_RANK } from "./rules";
/**
 * Prestige perks. One point per prestige and five ranks per perk (Reflect gains one per challenge won), so maxing a
 * line takes five runs and spreading points leaves you mediocre at all of them.
 * Percent bonuses use fractions; Long Shot adds world units of attack range.
 */
export const PRESTIGE_PERK_MAX_RANK = 5;

export const PRESTIGE_PERKS = {
  keenEdge: { title: "Keen Edge", perRank: .05,
    detail: "More critical hit chance and bigger critical hits. Adds to research." },
  doubleStrike: { title: "Double Strike", perRank: .04,
    detail: "Chance for a hit to land twice." },
  splitShot: { title: "Split Shot", perRank: .08,
    detail: "Chance for a shot to also hit a second nearby enemy. Not against bosses." },
  // Shown as Reflect; the id stays riposte because it names a database column.
  riposte: { title: "Reflect", perRank: .06,
    detail: "Chance to send an enemy's hit back at it, up to your max health. No limit in Reflect Only. Half in duels." },
  bossSlayer: { title: "Boss Slayer", perRank: .10, detail: "More weapon damage to bosses. Reflected damage is not boosted." },
  secondWind: { title: "Second Wind", perRank: .01, detail: "Heal part of your max health each time you kill a regular enemy." },
  longShot: { title: "Long Shot", perRank: 5, detail: "Longer attack range, for bows and melee weapons." },
  fleetFoot: { title: "Fleet Foot", perRank: .02, detail: "Move faster. Adds to Move Speed research." },
  // Attacks a second the attack speed cap rises a rank (0.901.47): the attack speed rating closes in on the higher cap.
  quickDraw: { title: "Quick Draw", perRank: QUICK_DRAW_CAP_PER_RANK, detail: "Raises the attack speed cap. Your attack speed climbs toward the higher cap." },
} as const;

/**
 * Keen Edge grants critical damage as well as chance. Chance alone was close to
 * worthless: a critical only lands for 1.05x until the critical damage research
 * line is deep, so the perk did nothing for anyone who had not spent days on
 * that line. With both, it stands alone and still rewards the research.
 */
export const KEEN_EDGE_CRITICAL_DAMAGE_PER_RANK = .12;

/**
 * Riposte is a chance to reflect, not a constant share, so a duel can turn on
 * one of them. Half the hit is thrown back at the attacker, as it arrived,
 * before the defender's armor: armor spares the defender, not the attacker.
 */
export const RIPOSTE_REFLECT_SHARE = .5;
/**
 * Against enemies and bosses (0.866), Reflect throws back the whole hit before
 * armor, but never more than the player's max health. Uncapped, it grew with
 * the enemy, so deep Endless was easier with Reflect than anything else.
 */
export const WORLD_REFLECT_SHARE = 1;
/**
 * What one reflected hit deals: the whole hit, up to the player's max health.
 * A Reflect Only run is uncapped: Reflect is the only damage it has.
 */
export function worldReflectDamage(hit: number, maxHealth: number, reflectOnly = false) {
  const whole = Math.max(0, hit) * WORLD_REFLECT_SHARE;
  return reflectOnly ? whole : Math.max(0, Math.min(whole, Number.isFinite(maxHealth) ? maxHealth : 0));
}

/** The chance a hit taken is thrown back, at this player's rank. */
export function prestigeRiposteChance(ranks: Partial<PrestigePerkRanks> | null | undefined) {
  return prestigePerkValue(ranks, "riposte");
}

export type PrestigePerkId = keyof typeof PRESTIGE_PERKS;
export const PRESTIGE_PERK_IDS = Object.keys(PRESTIGE_PERKS) as PrestigePerkId[];
export type PrestigePerkRanks = Record<PrestigePerkId, number>;

/** Each Reflect Only win raises Reflect's cap by one rank. */
export const REFLECT_RANKS_PER_CHALLENGE = 1;
/**
 * Five ranks a perk; Reflect gains one more for every Reflect Only win. With
 * no count given, the ceiling after every win: what a rank is clamped to.
 */
export function prestigePerkMaxRank(perk: PrestigePerkId, challengesWon = PRESTIGE_CHALLENGE_LIMIT) {
  const wins = Math.max(0, Math.min(PRESTIGE_CHALLENGE_LIMIT, Math.floor(Number.isFinite(challengesWon) ? challengesWon : 0)));
  return PRESTIGE_PERK_MAX_RANK + (perk === "riposte" ? wins * REFLECT_RANKS_PER_CHALLENGE : 0);
}

export function isPrestigePerkId(value: string): value is PrestigePerkId {
  return Object.prototype.hasOwnProperty.call(PRESTIGE_PERKS, value);
}

export function prestigePerkRank(ranks: Partial<PrestigePerkRanks> | null | undefined, perk: PrestigePerkId) {
  const rank = ranks?.[perk] ?? 0;
  return Math.max(0, Math.min(prestigePerkMaxRank(perk), Math.floor(Number.isFinite(rank) ? rank : 0)));
}

/** The perk's effect at the player's current rank, in its configured units. */
export function prestigePerkValue(ranks: Partial<PrestigePerkRanks> | null | undefined, perk: PrestigePerkId) {
  return prestigePerkRank(ranks, perk) * PRESTIGE_PERKS[perk].perRank;
}

/**
 * How much more damage a swing can do than the weapon alone: a second hit some
 * of the time. Used both by the client's own rolls and by the server's bound on
 * what a kill claim could plausibly contain.
 */
/**
 * What a perk is worth at a given rank, in the words the panel shows. Built
 * here so the numbers a player reads come from the same place combat uses.
 */
export function prestigePerkEffectLabel(perk: PrestigePerkId, rank: number) {
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  const ranks = { [perk]: rank } as Partial<PrestigePerkRanks>;
  const chance = percent(prestigePerkValue(ranks, perk));
  if (perk === "keenEdge") return `+${chance} crit chance, +${percent(prestigeCriticalDamageBonus(ranks))} crit damage`;
  if (perk === "doubleStrike") return `${chance} chance to hit twice`;
  if (perk === "splitShot") return `${chance} chance to hit a 2nd enemy`;
  if (perk === "bossSlayer") return `+${chance} damage to bosses`;
  if (perk === "secondWind") return `Heal ${chance} max health per kill`;
  if (perk === "longShot") return `+${prestigePerkValue(ranks, perk)} attack range`;
  if (perk === "fleetFoot") return `+${chance} move speed`;
  if (perk === "quickDraw") return `+${(prestigePerkValue(ranks, perk)).toFixed(1)} attack speed cap`;
  return `${chance} chance to reflect a hit`;
}

/** Extra critical damage from Keen Edge, added to the research multiplier. */
export function prestigeCriticalDamageBonus(ranks: Partial<PrestigePerkRanks> | null | undefined) {
  return prestigePerkRank(ranks, "keenEdge") * KEEN_EDGE_CRITICAL_DAMAGE_PER_RANK;
}

export function prestigeSwingMultiplier(ranks: Partial<PrestigePerkRanks> | null | undefined) {
  return 1 + prestigePerkValue(ranks, "doubleStrike");
}

/**
 * How many more enemies a swing can reach: a second target some of the time,
 * plus an allowance for kills finished by reflected damage. Both create kills
 * that the weapon's own damage per second cannot account for, so the server's
 * claim bound has to widen by the same amount the client can actually earn.
 * `armorReduction` is the player's own: Reflect throws back the hit before it,
 * so the more armor takes off, the more Reflect returns per hit that lands.
 */
export function prestigeReachMultiplier(ranks: Partial<PrestigePerkRanks> | null | undefined, armorReduction = 0) {
  // Riposte only reflects part of a hit, and only sometimes, so the claim bound
  // widens by what it is worth on average rather than by its full chance.
  return 1 + prestigePerkValue(ranks, "splitShot")
    + prestigeRiposteChance(ranks) * WORLD_REFLECT_SHARE * preArmorFactor(armorReduction);
}

/** How much bigger a hit was before armor than what got through: 2 at half reduction. */
export function preArmorFactor(armorReduction: number) {
  return 1 / (1 - Math.max(0, Math.min(.999, Number.isFinite(armorReduction) ? armorReduction : 0)));
}

/**
 * The attack speed cap a player plays under (stat-rating.ts AttackCap): Reflect Only's wins in play, and
 * Quick Draw's raise from the perk ranks in play (none during an Aggro run, whose callers pass no ranks).
 */
export function playerAttackCap(challenge: PrestigeChallenge | null | undefined, ranks: Partial<PrestigePerkRanks> | null | undefined): AttackCap {
  return { minInterval: challengeMinimumInterval(challenge), raise: prestigePerkValue(ranks, "quickDraw") };
}
