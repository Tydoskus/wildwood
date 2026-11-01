import type { WeaponSchool } from "./weapon-mastery";

/**
 * Long-term gear: fifteen grades that each last a few maps, bought from the Smith with gold or crafted, instead of
 * a new piece every map. A school's Mastery level opens a grade for buying and crafting; gear owned never locks.
 */
export const GEAR_GRADES = ["crude", "common", "sturdy", "fine", "superior", "rare", "exquisite", "epic", "heroic", "legendary", "mythic", "ancient", "celestial", "divine", "eternal"] as const;
export type GearGrade = typeof GEAR_GRADES[number];

export const GEAR_GRADE_NAMES: Readonly<Record<GearGrade, string>> = {
  crude: "Crude",
  common: "Common",
  sturdy: "Sturdy",
  fine: "Fine",
  superior: "Superior",
  rare: "Rare",
  exquisite: "Exquisite",
  epic: "Epic",
  heroic: "Heroic",
  legendary: "Legendary",
  mythic: "Mythic",
  ancient: "Ancient",
  celestial: "Celestial",
  divine: "Divine",
  eternal: "Eternal",
};

const byGrade = <T>(values: readonly T[]) => Object.fromEntries(GEAR_GRADES.map((grade, index) => [grade, values[index]])) as Record<GearGrade, T>;

/** The grade's base bonus in percent (damage on a weapon, regen on a helmet, max health on armor): 1.5x the old map tier of the same number. */
export const GRADE_BONUS_PERCENT: Readonly<Record<GearGrade, number>> = byGrade([8, 12, 17, 23, 29, 36, 43, 51, 59, 68, 77, 87, 98, 108, 120]);

/** The Mastery level that opens a grade: one a level early, so the campaign reaches about the tenth, slow toward the fifteenth. */
export const GRADE_MASTERY_LEVEL: Readonly<Record<GearGrade, number>> = byGrade([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 17, 24, 35, 50]);

/**
 * The Smith's price in gold: Mastery opens a grade, gold buys it. About double a grade, to a million for Divine,
 * so crafting is the cheaper road past the first few grades. Kills drop about 0.2 gold each.
 */
export const GRADE_GOLD_PRICE: Readonly<Record<GearGrade, number>> = byGrade([
  120, 250, 500, 1_000, 2_000, 4_000, 8_000, 15_000, 30_000, 60_000, 125_000, 250_000, 500_000, 1_000_000, 2_000_000,
]);

/** What the Smith pays for a graded piece: a tenth of its price, whatever its refine or however it was made. */
export const gradeSalePrice = (grade: GearGrade) => Math.floor(GRADE_GOLD_PRICE[grade] / 10);

/** The old map tier a grade stands in for where tiers still decide things (weapon skill rolls, refine grade). */
export const GRADE_ITEM_TIER: Readonly<Record<GearGrade, number>> = byGrade(GEAR_GRADES.map((_grade, index) => index + 1));

export const ARMOR_CLASSES = ["light", "medium", "heavy", "magic"] as const;
export type ArmorClass = typeof ARMOR_CLASSES[number];

export const ARMOR_CLASS_NAMES: Readonly<Record<ArmorClass, string>> = { light: "Light", medium: "Medium", heavy: "Heavy", magic: "Magic" };

/**
 * What each class trades: the share of the grade's bonus it gives, and its perk per piece worn (Medium has none). Heavy
 * belongs to no school: it opens at the wearer's best school and pays for its strength in speed.
 */
export const ARMOR_CLASS_DETAILS: Readonly<Record<ArmorClass, {
  school: WeaponSchool | null; bonusShare: number; moveSpeedPercent: number; skillChancePercent: number; perk: string;
}>> = {
  light: { school: "archery", bonusShare: .8, moveSpeedPercent: 3, skillChancePercent: 0, perk: "+3% Move Speed" },
  medium: { school: "swordplay", bonusShare: 1, moveSpeedPercent: 0, skillChancePercent: 0, perk: "" },
  heavy: { school: null, bonusShare: 1.3, moveSpeedPercent: -4, skillChancePercent: 0, perk: "-4% Move Speed" },
  magic: { school: "sorcery", bonusShare: .8, moveSpeedPercent: 0, skillChancePercent: 3, perk: "+3% Skill Chance" },
};

/** Helmet and armor both of the class that matches the weapon's school: this much more damage. */
export const CLASS_SET_DAMAGE_PERCENT = 5;

/** Boots come in one style per weapon school rather than the four armor classes, each with its school's stat. */
export const BOOT_STYLES = ["ranger", "warrior", "mystic"] as const;
export type BootStyle = typeof BOOT_STYLES[number];
export const BOOT_STYLE_NAMES: Readonly<Record<BootStyle, string>> = { ranger: "Ranger", warrior: "Warrior", mystic: "Mystic" };
export const BOOT_STYLE_SCHOOL: Readonly<Record<BootStyle, WeaponSchool>> = { ranger: "archery", warrior: "swordplay", mystic: "sorcery" };
/** The stat each style raises: Ranger move speed, Warrior armor, Mystic weapon skill chance (relative, as Skill Proficiency). */
export const BOOT_STYLE_STAT: Readonly<Record<BootStyle, "moveSpeed" | "armor" | "skillChance">> = { ranger: "moveSpeed", warrior: "armor", mystic: "skillChance" };

/** Ranger Boots' move speed in percent: +2% at Crude to +20% at Eternal. */
export const BOOT_MOVE_SPEED_PERCENT: Readonly<Record<GearGrade, number>> = byGrade([2, 3, 5, 6, 7, 8, 10, 11, 12, 14, 15, 16, 17, 19, 20]);
/** Mystic Boots' weapon skill chance in percent of itself: +2% at Crude to +30% at Eternal. */
export const BOOT_SKILL_CHANCE_PERCENT: Readonly<Record<GearGrade, number>> = byGrade([2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30]);

export const isBootStyle = (value: unknown): value is BootStyle => (BOOT_STYLES as readonly unknown[]).includes(value);

/** A pair's stat in percent before refines: Warrior Boots' armor is the grade's own bonus, as other gear's. */
export function bootBonusPercent(grade: GearGrade, style: BootStyle) {
  const stat = BOOT_STYLE_STAT[style];
  return stat === "moveSpeed" ? BOOT_MOVE_SPEED_PERCENT[grade] : stat === "skillChance" ? BOOT_SKILL_CHANCE_PERCENT[grade] : GRADE_BONUS_PERCENT[grade];
}

export const gradeIndex = (grade: GearGrade) => GEAR_GRADES.indexOf(grade);
export const isGearGrade = (value: unknown): value is GearGrade => (GEAR_GRADES as readonly unknown[]).includes(value);
export const isArmorClass = (value: unknown): value is ArmorClass => (ARMOR_CLASSES as readonly unknown[]).includes(value);

/** The bonus percent of a helmet or armor piece of `grade` and `armorClass`. */
export const armorBonusPercent = (grade: GearGrade, armorClass: ArmorClass) =>
  GRADE_BONUS_PERCENT[grade] * ARMOR_CLASS_DETAILS[armorClass].bonusShare;

/** The Mastery a class's grade is opened by: its school's level, or the best school's for Heavy. */
export function armorClassMasteryLevel(armorClass: ArmorClass, levels: Readonly<Partial<Record<WeaponSchool, number>>>) {
  const school = ARMOR_CLASS_DETAILS[armorClass].school;
  return school ? levels[school] ?? 0 : Math.max(0, ...Object.values(levels).map(level => level ?? 0));
}

/** The highest grade a Mastery level opens. */
export function highestGradeFor(level: number): GearGrade {
  let best: GearGrade = "common";
  for (const grade of GEAR_GRADES) if (level >= GRADE_MASTERY_LEVEL[grade]) best = grade;
  return best;
}

/**
 * The grade an old map-tier piece converts to: the one whose bonus is nearest the piece's own (`bonusPercent`, before
 * slot tiers and refines), ties going up, so a converted piece is about as strong as it was.
 */
export function gradeForOldBonus(bonusPercent: number) {
  let best: GearGrade = "common", gap = Infinity;
  for (const grade of GEAR_GRADES) {
    const distance = Math.abs(GRADE_BONUS_PERCENT[grade] - bonusPercent);
    if (distance <= gap) { best = grade; gap = distance; }
  }
  return best;
}

/** The grade prices when migration 62 paid for old gear, kept so its payout never moves. */
const PAYOUT_GRADE_PRICE = [12, 13, 15, 17, 19, 21, 24, 27, 30, 33, 43, 56, 73, 95, 124] as const;
/** What the Smith paid for an old map-tier piece when gear moved to grades: a quarter of that price. */
export const oldTierSalePrice = (tier: number) =>
  Math.max(1, Math.round(PAYOUT_GRADE_PRICE[Math.min(15, Math.max(1, Math.floor(tier))) - 1] / 4));
