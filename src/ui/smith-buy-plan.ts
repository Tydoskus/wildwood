import {
  bootArmorFactor, bootMoveSpeedFactor, bootSkillChanceFactor, itemDamageMultiplierBonus, itemDefinition, itemMaxHealthMultiplierBonus,
  itemRegenerationMultiplierBonus, type ItemLevel,
} from "../../shared/items";
import { ARMOR_CLASSES, ARMOR_CLASS_DETAILS, BOOT_STYLES, BOOT_STYLE_SCHOOL, BOOT_STYLE_STAT } from "../../shared/gear-grades";
import { GRADE_ARMOR_KINDS, bootStyleOf, type GradeItemId, type GradeWeaponKind } from "../../shared/grade-equipment";
import type { GradeShopLine } from "../../shared/grade-shop";
import type { WeaponSchool } from "../../shared/weapon-mastery";
import { formatMultiplierChange } from "./number-format";

/** What the player wears, as the bag saves it. */
export type WornLoadout = { equippedRightHand?: string; equippedLeftHand?: string; equippedHead?: string; equippedChest?: string; equippedFeet?: string };

const SCHOOL_WEAPON: Readonly<Record<WeaponSchool, GradeWeaponKind>> = { archery: "bow", swordplay: "sword", sorcery: "staff" };
const KIND_NAMES = { bow: "Bow", sword: "Sword", staff: "Staff", helmet: "Helmet", armor: "Armor", boots: "Boots" } as const;

/** "For Your Bow": the weapon a school fights with. */
export const schoolWeaponName = (school: WeaponSchool) => KIND_NAMES[SCHOOL_WEAPON[school]];

/** A school's lines, in the shop's order: its weapon, its armor class's helmet and armor, its boots. */
export function schoolLines(school: WeaponSchool): GradeShopLine[] {
  const armorClass = ARMOR_CLASSES.find(each => ARMOR_CLASS_DETAILS[each].school === school)!;
  const bootStyle = BOOT_STYLES.find(each => BOOT_STYLE_SCHOOL[each] === school)!;
  return [{ kind: SCHOOL_WEAPON[school] }, ...GRADE_ARMOR_KINDS.map(kind => ({ kind, armorClass })), { kind: "boots", bootStyle }];
}

/** The worn piece in an item's slot. */
export function wornInSlot(worn: WornLoadout, itemId: string) {
  const slot = itemDefinition(itemId)?.slot;
  if (slot === "HAND") return worn.equippedRightHand || worn.equippedLeftHand || "";
  return (slot === "HEAD" ? worn.equippedHead : slot === "CHEST" ? worn.equippedChest : slot === "FEET" ? worn.equippedFeet : "") ?? "";
}

/** The stat a piece is judged by, in percent at `level`: damage, regen, max health, or its boots' own stat. */
function slotStat(itemId: string, level: ItemLevel, bootStat?: "moveSpeed" | "armor" | "skillChance") {
  const slot = itemDefinition(itemId)?.slot;
  if (slot === "HAND") return { label: "Damage", value: itemDamageMultiplierBonus(itemId, level) * 100 };
  if (slot === "HEAD") return { label: "Regen", value: itemRegenerationMultiplierBonus(itemId, level) * 100 };
  if (slot === "CHEST") return { label: "Max Health", value: itemMaxHealthMultiplierBonus(itemId, level) * 100 };
  if (bootStat === "moveSpeed") return { label: "Move Speed", value: (bootMoveSpeedFactor(itemId, level) - 1) * 100 };
  if (bootStat === "armor") return { label: "Armor", value: (bootArmorFactor(itemId, level) - 1) * 100 };
  return { label: "Skill Chance", value: (bootSkillChanceFactor(itemId, level) - 1) * 100 };
}

export type GearComparison = { delta: number; label: string; text: string };

/**
 * What an offer changes against what the player wears in its slot: "×1.14 Damage vs Now".
 * The offer arrives unrefined at the slot's tier; the worn piece counts its refine.
 */
export function gearComparison(offerId: GradeItemId, worn: WornLoadout, levels: { tier: number; wornRefine: number }): GearComparison {
  const style = bootStyleOf(offerId), bootStat = style ? BOOT_STYLE_STAT[style] : undefined;
  const offer = slotStat(offerId, { tier: levels.tier, refine: 0 }, bootStat);
  const current = wornInSlot(worn, offerId);
  // Boots of another style, or Black Boots, raise a different stat: no number compares them.
  if (style && current && bootStyleOf(current) !== style) return { delta: 0, label: offer.label, text: "Different Stat from Now" };
  const now = current ? slotStat(current, { tier: levels.tier, refine: levels.wornRefine }, bootStat).value : 0;
  const delta = Math.round((offer.value - now) * 10) / 10;
  return { delta, label: offer.label, text: delta === 0 ? "Same as Now" : comparisonText(offer, now, delta) };
}

/** Move speed and skill chance in points ("+3% Move Speed vs Now"); the core stats as how much more they multiply ("×1.14 Damage vs Now"). */
function comparisonText(offer: { label: string; value: number }, now: number, delta: number) {
  if (offer.label === "Move Speed" || offer.label === "Skill Chance") return `${delta > 0 ? "+" : "-"}${Math.abs(delta)}% ${offer.label} vs Now`;
  const ratio = (1 + offer.value / 100) / (1 + now / 100);
  return `${formatMultiplierChange(ratio)} ${offer.label} vs Now`;
}
