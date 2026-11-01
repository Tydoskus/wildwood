import { ARMOR_CLASS_DETAILS, ARMOR_CLASS_NAMES, CLASS_SET_DAMAGE_PERCENT } from "./gear-grades";
import { armorClassOf } from "./grade-equipment";
import { classSetActive } from "./items";
import { formatPercentMultiplier } from "./compact-number";

/**
 * What a graded helmet or armor's class does per piece worn (gear-grades.ts ARMOR_CLASS_DETAILS). Its share of the
 * grade's bonus is already in the item's stats; the class set's damage lives with the gear's in items.ts.
 */
const perPiece = (head: unknown, chest: unknown, field: "moveSpeedPercent" | "skillChancePercent") =>
  [head, chest].reduce<number>((total, itemId) => {
    const armorClass = armorClassOf(itemId);
    return total + (armorClass ? ARMOR_CLASS_DETAILS[armorClass][field] : 0);
  }, 0);

/** Move speed factor: Light +3% and Heavy -4% a piece, added up. */
export const armorMoveSpeedFactor = (head: unknown, chest: unknown) => 1 + perPiece(head, chest, "moveSpeedPercent") / 100;

/** What the server's movement checks allow for armor: Light's speed, never Heavy's slowdown, so it only loosens. */
export const armorMoveSpeedAllowance = (head: unknown, chest: unknown) => Math.max(1, armorMoveSpeedFactor(head, chest));

/** Weapon skill chances' factor: Magic's 3% of themselves a piece, like Skill Proficiency. */
export const armorSkillChanceFactor = (head: unknown, chest: unknown) => 1 + perPiece(head, chest, "skillChancePercent") / 100;

const SCHOOL_WEAPON = { archery: "Bow", swordplay: "Sword", sorcery: "Staff" } as const;

/** The class perk line of a graded helmet or armor ("Light: +3% Move Speed"), or none for Medium and other items. */
export function armorClassPerkLine(itemId: unknown) {
  const armorClass = armorClassOf(itemId), perk = armorClass ? ARMOR_CLASS_DETAILS[armorClass].perk : "";
  return perk ? `${ARMOR_CLASS_NAMES[armorClass!]}: ${perk}` : null;
}

/**
 * The class set line ("Set: Light Helmet + Armor + Bow · ×1.05 Damage"), and whether it is on when `worn` is this
 * piece's wearer. None for Heavy, which has no school, or for other items.
 */
export function armorClassSetLine(itemId: unknown, worn?: { weapon: unknown; head: unknown; chest: unknown }) {
  const armorClass = armorClassOf(itemId), school = armorClass ? ARMOR_CLASS_DETAILS[armorClass].school : null;
  if (!armorClass || !school) return null;
  const line = `Set: ${ARMOR_CLASS_NAMES[armorClass]} Helmet + Armor + ${SCHOOL_WEAPON[school]} · ${formatPercentMultiplier(CLASS_SET_DAMAGE_PERCENT)} Damage`;
  if (!worn) return line;
  return `${line} · ${classSetActive(worn.weapon, worn.head, worn.chest) ? "Active" : "Inactive"}`;
}
