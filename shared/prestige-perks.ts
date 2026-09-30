/**
 * Prestige perks. One point per prestige and five ranks per perk (Reflect has seven), so maxing a
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
  riposte: { title: "Reflect", perRank: .06, maxRank: 7,
    detail: "Chance to throw half of a hit, before your armor, back at whoever dealt it: enemies, bosses and duel opponents." },
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

/** The chance a hit taken is thrown back, at this player's rank. */
export function prestigeRiposteChance(ranks: Partial<PrestigePerkRanks> | null | undefined) {
  return prestigePerkValue(ranks, "riposte");
}

export type PrestigePerkId = keyof typeof PRESTIGE_PERKS;
export const PRESTIGE_PERK_IDS = Object.keys(PRESTIGE_PERKS) as PrestigePerkId[];
export type PrestigePerkRanks = Record<PrestigePerkId, number>;

/** Five ranks a perk, except where one says otherwise (Reflect has seven). */
export function prestigePerkMaxRank(perk: PrestigePerkId) {
  const definition = PRESTIGE_PERKS[perk];
  return "maxRank" in definition ? definition.maxRank : PRESTIGE_PERK_MAX_RANK;
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
  return `+${chance} chance to reflect ${percent(RIPOSTE_REFLECT_SHARE)} of the hit`;
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
    + prestigeRiposteChance(ranks) * RIPOSTE_REFLECT_SHARE * preArmorFactor(armorReduction);
}

/** How much bigger a hit was before armor than what got through: 2 at half reduction. */
export function preArmorFactor(armorReduction: number) {
  return 1 / (1 - Math.max(0, Math.min(.999, Number.isFinite(armorReduction) ? armorReduction : 0)));
}
