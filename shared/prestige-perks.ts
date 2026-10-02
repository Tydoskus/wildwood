import { PRESTIGE_CHALLENGE_LIMIT } from "./prestige-challenge";
/**
 * Prestige perks. One point per prestige and five ranks per perk (Reflect gains one per challenge won), so maxing a
 * line takes five runs and spreading points leaves you mediocre at all of them.
 * Percent bonuses use fractions; Long Shot adds world units of attack range.
 */
export const PRESTIGE_PERK_MAX_RANK = 5;

export const PRESTIGE_PERKS = {
  keenEdge: { title: "Keen Edge", perRank: .05,
    detail: "Critical chance and harder criticals, on top of research." },
  doubleStrike: { title: "Double Strike", perRank: .04,
    detail: "Chance for a hit to land twice." },
  splitShot: { title: "Split Shot", perRank: .08,
    detail: "Chance to strike a second enemy at the same time. Nothing to split against a boss." },
  // Shown as Reflect; the id stays riposte because it names a database column.
  riposte: { title: "Reflect", perRank: .06,
    detail: "Chance to throw a hit, before your armor, back at whoever dealt it, up to your own damage. Duels throw back half." },
  bossSlayer: { title: "Boss Slayer", perRank: .10, detail: "Deal more weapon damage to bosses. Does not amplify reflected damage." },
  secondWind: { title: "Second Wind", perRank: .01, detail: "Restore a share of your maximum health after each regular enemy kill." },
  longShot: { title: "Long Shot", perRank: 5, detail: "Extend your attack range, for bows and melee weapons alike." },
  fleetFoot: { title: "Fleet Foot", perRank: .02, detail: "Move faster, on top of Move Speed research." },
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
 * Against enemies and bosses (0.865), Reflect throws back the whole hit before
 * armor, but never more than one of the player's own normal hits. Uncapped, it
 * grew with the enemy, so deep Endless was easier with Reflect than anything.
 */
export const WORLD_REFLECT_SHARE = 1;
/** What one reflected hit deals: the whole hit, up to the player's own damage. */
export function worldReflectDamage(hit: number, ownDamage: number) {
  return Math.max(0, Math.min(Math.max(0, hit) * WORLD_REFLECT_SHARE, Number.isFinite(ownDamage) ? ownDamage : 0));
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
  if (perk === "keenEdge") return `+${chance} critical chance, +${percent(prestigeCriticalDamageBonus(ranks))} critical damage`;
  if (perk === "doubleStrike") return `+${chance} chance to strike twice`;
  if (perk === "splitShot") return `+${chance} chance to hit a second enemy`;
  if (perk === "bossSlayer") return `+${chance} weapon damage to bosses`;
  if (perk === "secondWind") return `Restore ${chance} maximum health per kill`;
  if (perk === "longShot") return `+${prestigePerkValue(ranks, perk)} attack range`;
  if (perk === "fleetFoot") return `+${chance} move speed`;
  return `+${chance} chance to reflect a hit, up to your damage`;
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
