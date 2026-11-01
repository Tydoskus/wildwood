import { canonicalItemId, hasBootStat, isUpgradeableItem, itemDefinition } from "./items";
import { itemTier } from "./item-tier";
import { gradeOf } from "./grade-equipment";
import { GRADE_ITEM_TIER } from "./gear-grades";
import { REFINE_MAX, normalizeRefineLevel } from "./refine-multiplier";
import { chanceWithLuck } from "./luck-research";
export { REFINE_MAX, REFINE_STEP_PAST_TEN, REFINE_STEP_TO_TEN, normalizeRefineLevel, refineMultiplier } from "./refine-multiplier";

/**
 * Refining, after Ragnarok Online: every item refines on its own from +0 to +30 at the
 * Town anvil, one ore a try, decided on the spot. Up to its safe limit a try always works; past it the odds
 * fall, and a failed try costs only its ore: the item keeps its level. Gems never buy odds or protection.
 *
 * This is its own layer, separate from the slot tiers (+N on the Weapon, Helmet and Armor tracks).
 */

/** Ragnarok's weapon levels: an item's grade follows its Tier, four tiers to a grade (the last one three). */
export type RefineGrade = 1 | 2 | 3 | 4;

/**
 * Every material the bag stacks, one slot a kind: the ore a try costs (one grade ore, plus a Starshard from +11 on),
 * and the crafting wood and crystal, which refining never takes.
 */
export const REFINE_ORES = {
  copper_ore: { name: "Copper Ore", grade: 1 },
  iron_ore: { name: "Iron Ore", grade: 2 },
  mithril_ore: { name: "Mithril Ore", grade: 3 },
  adamant_ore: { name: "Adamant Ore", grade: 4 },
  starshard: { name: "Starshard", grade: null },
  pine_log: { name: "Pine Log", grade: null },
  oak_log: { name: "Oak Log", grade: null },
  yew_log: { name: "Yew Log", grade: null },
  elder_log: { name: "Elder Log", grade: null },
  arcane_crystal: { name: "Arcane Crystal", grade: null },
  // Crafted arrows (arrows.ts): stacked as materials, spent by the bow.
  steel_arrow: { name: "Steel Arrow", grade: null },
  fire_arrow: { name: "Fire Arrow", grade: null },
  venom_arrow: { name: "Venom Arrow", grade: null },
  frost_arrow: { name: "Frost Arrow", grade: null },
  piercing_arrow: { name: "Piercing Arrow", grade: null },
  star_arrow: { name: "Star Arrow", grade: null },
} as const;
export type OreId = keyof typeof REFINE_ORES;
/** The four ores a grade refines with. */
export type GradeOreId = "copper_ore" | "iron_ore" | "mithril_ore" | "adamant_ore";
export const GRADE_ORES: Readonly<Record<RefineGrade, GradeOreId>> = { 1: "copper_ore", 2: "iron_ore", 3: "mithril_ore", 4: "adamant_ore" };
/** From this level on, a try also takes a Starshard. */
export const STARSHARD_FROM_LEVEL = 11;

/**
 * Where a try stops being certain. Weapons as Ragnarok's weapon levels: the higher the grade, the lower the
 * limit. Helmets and armor are +4 at every grade, as Ragnarok's armor.
 */
export const WEAPON_SAFE_LIMITS: Readonly<Record<RefineGrade, number>> = { 1: 7, 2: 6, 3: 5, 4: 4 };
export const ARMOR_SAFE_LIMIT = 4;

/**
 * The chance a try past the safe limit works, by the level it is for: Ragnarok's classic table to +10 (rounded),
 * then far lower to +30. A fail costs only the ore and raises the next try's chance (refineChanceAfterFails): a
 * top-grade item about 26 tries to +10, about 1,300 to +20 and about 14,600 to +30, every try from +11 a Starshard as well.
 */
const WEAPON_ODDS: Readonly<Record<RefineGrade, Readonly<Record<number, number>>>> = {
  1: { 8: .6, 9: .4, 10: .2 },
  2: { 7: .6, 8: .4, 9: .2, 10: .2 },
  3: { 6: .6, 7: .5, 8: .2, 9: .2, 10: .2 },
  4: { 5: .6, 6: .4, 7: .4, 8: .2, 9: .2, 10: .1 },
};
const ARMOR_ODDS: Readonly<Record<number, number>> = { 5: .6, 6: .6, 7: .4, 8: .4, 9: .2, 10: .1 };
/** Past +10, never better than the +10 try was for that item. */
const HIGH_ODDS: Readonly<Record<number, number>> = {
  11: .02, 12: .015, 13: .012, 14: .01, 15: .008, 16: .006, 17: .005, 18: .004, 19: .0035, 20: .003,
  21: .0015, 22: .0012, 23: .001, 24: .0008, 25: .0007, 26: .0006, 27: .0005, 28: .0004, 29: .00035, 30: .0003,
};

/** The ore a piece of gear gives back when destroyed: one of its refine grade's ore. Null for anything else. */
export function salvageOre(itemId: unknown): OreId | null {
  const grade = refineGrade(itemId);
  return grade ? GRADE_ORES[grade] : null;
}

/** Equipment with a stat to refine: every bow, sword, helmet and armor with a bonus, and graded boots. */
export function isRefinableItem(itemId: unknown) {
  return isUpgradeableItem(itemId) || hasBootStat(itemId);
}

export function refineGrade(itemId: unknown): RefineGrade | null {
  const id = canonicalItemId(itemId);
  if (!id || !isRefinableItem(id)) return null;
  const grade = gradeOf(id);
  // Graded gear refines at its grade's stand-in tier, helmets and armor too.
  return tierGrade(itemTier(id) ?? (grade ? GRADE_ITEM_TIER[grade] : itemDefinition(id)?.weapon?.tier) ?? 1);
}

/** A map tier's grade: four tiers to a grade, the last one three. */
export function tierGrade(tier: number): RefineGrade {
  return tier <= 4 ? 1 : tier <= 8 ? 2 : tier <= 12 ? 3 : 4;
}

export function refineSafeLimit(itemId: unknown) {
  const grade = refineGrade(itemId);
  if (!grade) return 0;
  return itemDefinition(itemId)?.slot === "HAND" ? WEAPON_SAFE_LIMITS[grade] : ARMOR_SAFE_LIMIT;
}

/**
 * Each failed try in a row at a level makes the next likelier: half the chance again after an average run of
 * tries (one over the chance), double after two. It cuts long dry streaks short; a success starts it over.
 */
export function refineChanceAfterFails(chance: number, fails: number) {
  if (!(chance > 0) || chance >= 1 || !(fails > 0)) return chance;
  return Math.min(1, chance * (1 + Math.floor(fails) * chance / 2));
}

/**
 * The chance a try for `toLevel` works: certain up to the safe limit, then the tables above, raised by
 * Refine Luck up to certainty, then by the fails in a row before it. Zero when it can't be tried.
 */
export function refineSuccessChance(itemId: unknown, toLevel: number, refineLuckRank = 0, fails = 0) {
  const grade = refineGrade(itemId);
  if (!grade || !Number.isInteger(toLevel) || toLevel < 1 || toLevel > REFINE_MAX) return 0;
  if (toLevel <= refineSafeLimit(itemId)) return 1;
  const table = itemDefinition(itemId)?.slot === "HAND" ? WEAPON_ODDS[grade] : ARMOR_ODDS;
  const chance = toLevel > 10 ? HIGH_ODDS[toLevel] ?? 0 : table[toLevel] ?? 0;
  return refineChanceAfterFails(chanceWithLuck(chance, "refineLuck", refineLuckRank), fails);
}

/** What a try for `toLevel` costs, or null when the item can't be refined to it. */
export function refineCost(itemId: unknown, toLevel: number): Partial<Record<OreId, number>> | null {
  const grade = refineGrade(itemId);
  if (!grade || !Number.isInteger(toLevel) || toLevel < 1 || toLevel > REFINE_MAX) return null;
  const cost: Partial<Record<OreId, number>> = { [GRADE_ORES[grade]]: 1 };
  if (toLevel >= STARSHARD_FROM_LEVEL) cost.starshard = 1;
  return cost;
}

/** Where a try leaves the item: one up when it works, where it was when it fails. Tries within the safe limit never fail. */
export function refineResultLevel(currentLevel: number, succeeded: boolean) {
  const current = normalizeRefineLevel(currentLevel);
  return succeeded ? Math.min(REFINE_MAX, current + 1) : current;
}

/**
 * The expected number of tries to bring an item from +0 to each level, failures included: index n holds the
 * tries to reach +n. For the refine window's "about N tries" and the balance checks.
 */
export function expectedRefineTries(itemId: unknown): number[] {
  const totals = [0];
  let total = 0;
  for (let level = 1; level <= REFINE_MAX; level++) {
    total += expectedTriesAt(refineSuccessChance(itemId, level));
    totals.push(total);
  }
  return totals;
}

/** A level's average tries from its first: a fail keeps the level, and each fail raises the next try's chance. */
function expectedTriesAt(chance: number) {
  if (!(chance > 0)) return Number.POSITIVE_INFINITY;
  let tries = 0, unlucky = 1;
  for (let fails = 0; unlucky > 1e-12; fails++) {
    tries += unlucky;
    unlucky *= 1 - refineChanceAfterFails(chance, fails);
  }
  return tries;
}

/**
 * Rolls one try. `roll` is a number in [0, 1) from the server's random source; a try works when it lands
 * under the chance. Returns the level the item ends on.
 */
export function rollRefine(itemId: unknown, currentLevel: number, roll: number, refineLuckRank = 0, fails = 0) {
  const current = normalizeRefineLevel(currentLevel);
  const succeeded = roll < refineSuccessChance(itemId, current + 1, refineLuckRank, fails);
  return { succeeded, level: refineResultLevel(current, succeeded) };
}
