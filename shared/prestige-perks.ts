/**
 * Prestige perks. One point per prestige and five ranks per perk, so maxing a
 * line takes five runs and spreading points leaves you mediocre at all of them.
 * Every value here is a fraction; the combat code multiplies, never adds.
 */
export const PRESTIGE_PERK_MAX_RANK = 5;

export const PRESTIGE_PERKS = {
  keenEdge: { title: "Keen Edge", perRank: .03,
    detail: "Critical chance, on top of research." },
  doubleStrike: { title: "Double Strike", perRank: .04,
    detail: "Chance for a hit to land twice." },
  splitShot: { title: "Split Shot", perRank: .05,
    detail: "Chance to strike a second enemy at the same time. Nothing to split against a boss." },
  riposte: { title: "Riposte", perRank: .06,
    detail: "Share of the damage you take thrown back at whoever dealt it." },
} as const;

export type PrestigePerkId = keyof typeof PRESTIGE_PERKS;
export const PRESTIGE_PERK_IDS = Object.keys(PRESTIGE_PERKS) as PrestigePerkId[];
export type PrestigePerkRanks = Record<PrestigePerkId, number>;

export function isPrestigePerkId(value: string): value is PrestigePerkId {
  return Object.prototype.hasOwnProperty.call(PRESTIGE_PERKS, value);
}

export function prestigePerkRank(ranks: Partial<PrestigePerkRanks> | null | undefined, perk: PrestigePerkId) {
  const rank = ranks?.[perk] ?? 0;
  return Math.max(0, Math.min(PRESTIGE_PERK_MAX_RANK, Math.floor(Number.isFinite(rank) ? rank : 0)));
}

/** The perk's effect at the player's current rank, as a fraction. */
export function prestigePerkValue(ranks: Partial<PrestigePerkRanks> | null | undefined, perk: PrestigePerkId) {
  return prestigePerkRank(ranks, perk) * PRESTIGE_PERKS[perk].perRank;
}

/**
 * How much more damage a swing can do than the weapon alone: a second hit some
 * of the time. Used both by the client's own rolls and by the server's bound on
 * what a kill claim could plausibly contain.
 */
export function prestigeSwingMultiplier(ranks: Partial<PrestigePerkRanks> | null | undefined) {
  return 1 + prestigePerkValue(ranks, "doubleStrike");
}

/**
 * How many more enemies a swing can reach: a second target some of the time,
 * plus an allowance for kills finished by reflected damage. Both create kills
 * that the weapon's own damage per second cannot account for, so the server's
 * claim bound has to widen by the same amount the client can actually earn.
 */
export function prestigeReachMultiplier(ranks: Partial<PrestigePerkRanks> | null | undefined) {
  return 1 + prestigePerkValue(ranks, "splitShot") + prestigePerkValue(ranks, "riposte");
}
