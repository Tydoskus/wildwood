import {
  ARMOR_CLASSES, ARMOR_CLASS_DETAILS, BOOT_STYLES, BOOT_STYLE_SCHOOL, GEAR_GRADES, GRADE_GOLD_PRICE, GRADE_MASTERY_LEVEL, armorClassMasteryLevel, gradeIndex, gradeSalePrice,
  type ArmorClass, type BootStyle, type GearGrade,
} from "./gear-grades";
import {
  GRADE_ARMOR_KINDS, GRADE_WEAPON_KINDS, armorClassOf, bootStyleOf, gradeEquipmentKindOf, gradeItemId, gradeOf, isGradeItemId,
  type GradeArmorKind, type GradeItemId, type GradeWeaponKind,
} from "./grade-equipment";
import { WEAPON_SCHOOL_NAMES, masteryLevel, type WeaponSchool } from "./weapon-mastery";

/**
 * The sellers' gear for gold (buy_grade_gear): a piece can be bought once its grade is open and it is above the best
 * held on its line, so grades in between can be skipped. Shared so the window and the server judge a buy the same way.
 */
export type MasteryLevels = Readonly<Partial<Record<WeaponSchool, number>>>;

const WEAPON_SCHOOL: Readonly<Record<GradeWeaponKind, WeaponSchool>> = { bow: "archery", sword: "swordplay", staff: "sorcery", dagger: "swordplay" };

/** One line of the shop: a weapon, a class's helmet or armor, or a style's boots. */
export type GradeShopLine = { kind: GradeWeaponKind } | { kind: GradeArmorKind; armorClass: ArmorClass } | { kind: "boots"; bootStyle: BootStyle };

export const GRADE_SHOP_LINES: readonly GradeShopLine[] = [
  ...GRADE_WEAPON_KINDS.map(kind => ({ kind })),
  ...ARMOR_CLASSES.flatMap(armorClass => GRADE_ARMOR_KINDS.map(kind => ({ kind, armorClass }))),
  ...BOOT_STYLES.map(bootStyle => ({ kind: "boots" as const, bootStyle })),
];

export const gradeShopItemId = (line: GradeShopLine, grade: GearGrade): GradeItemId =>
  "armorClass" in line ? gradeItemId(line.kind, grade, line.armorClass)
    : "bootStyle" in line ? gradeItemId("boots", grade, line.bootStyle) : gradeItemId(line.kind, grade);

/** The Town's two gear sellers: weapons (bows, swords, staves), and armor (helmets, armor, boots). */
export type GearSeller = "weapons" | "armor";
export const gearSellerOfLine = (line: GradeShopLine): GearSeller => (GRADE_WEAPON_KINDS as readonly string[]).includes(line.kind) ? "weapons" : "armor";
export const gearSellerOf = (itemId: GradeItemId): GearSeller => gearSellerOfLine(gradeShopLineOf(itemId));

/** A line's key for a window's picks: "helmet:light", "boots:ranger" or "bow:". */
export const gradeShopLineKey = (line: GradeShopLine) =>
  `${line.kind}:${"armorClass" in line ? line.armorClass : "bootStyle" in line ? line.bootStyle : ""}`;

/** Each school's level from its points. */
export const masteryLevels = (points: Readonly<Partial<Record<WeaponSchool, number | bigint>>>): MasteryLevels =>
  Object.fromEntries(Object.entries(points).map(([school, value]) => [school, masteryLevel(value ?? 0)]));

/** The school whose level opens a piece's grade; null for Heavy, which any school opens. Boots go by their style's. */
export function gradeShopSchool(itemId: GradeItemId): WeaponSchool | null {
  const armorClass = armorClassOf(itemId), bootStyle = bootStyleOf(itemId);
  if (bootStyle) return BOOT_STYLE_SCHOOL[bootStyle];
  return armorClass ? ARMOR_CLASS_DETAILS[armorClass].school : WEAPON_SCHOOL[gradeEquipmentKindOf(itemId) as GradeWeaponKind];
}

/** The Mastery level that counts for a piece: its school's, or the best school's for Heavy. */
export function gradeShopLevel(itemId: GradeItemId, levels: MasteryLevels) {
  const armorClass = armorClassOf(itemId);
  return armorClass ? armorClassMasteryLevel(armorClass, levels) : levels[gradeShopSchool(itemId)!] ?? 0;
}

/** The level a piece needs: "Lv 10 Archery", or "Lv 10 Any School" for Heavy. */
export function gradeShopNeed(itemId: GradeItemId) {
  const school = gradeShopSchool(itemId), level = GRADE_MASTERY_LEVEL[gradeOf(itemId)!];
  return `Lv ${level} ${school ? WEAPON_SCHOOL_NAMES[school] : "Any School"}`;
}

export const gradeShopOpen = (itemId: GradeItemId, levels: MasteryLevels) => gradeShopLevel(itemId, levels) >= GRADE_MASTERY_LEVEL[gradeOf(itemId)!];

/** The Smith's price in gold, or undefined for anything he does not sell. */
export const gradeShopPrice = (itemId: unknown) => {
  const grade = isGradeItemId(itemId) ? gradeOf(itemId) : undefined;
  return grade ? GRADE_GOLD_PRICE[grade] : undefined;
};

/** What the Smith pays for a graded piece (sell_graded_item), or undefined for anything he does not buy. */
export const gradeShopSalePrice = (itemId: unknown) => {
  const grade = isGradeItemId(itemId) ? gradeOf(itemId) : undefined;
  return grade ? gradeSalePrice(grade) : undefined;
};

/** The line a graded piece belongs to. */
export function gradeShopLineOf(itemId: GradeItemId): GradeShopLine {
  const kind = gradeEquipmentKindOf(itemId)!, armorClass = armorClassOf(itemId), bootStyle = bootStyleOf(itemId);
  if (bootStyle) return { kind: "boots", bootStyle };
  return armorClass ? { kind: kind as GradeArmorKind, armorClass } : { kind: kind as GradeWeaponKind };
}

/** The best grade held on a line, as its index; -1 when none is. */
export function bestHeldGradeIndex(line: GradeShopLine, held: ReadonlySet<string>) {
  let best = -1;
  for (const grade of GEAR_GRADES) if (held.has(gradeShopItemId(line, grade))) best = gradeIndex(grade);
  return best;
}

export type GradeLineOffer = {
  itemId: GradeItemId; grade: GearGrade;
  /** The top grade, already held. */
  owned: boolean;
  /** Whether the offer can be had now; when none above the best held is, the offer is the next grade, locked. */
  open: boolean;
  /** Every grade above the best held that can be had now, lowest first: what a stepper picks from. */
  grades: GearGrade[];
  /** The first grade past the highest open one that is still locked: what to work toward. */
  next?: GradeItemId;
};

/**
 * What a line offers when `opens` says which pieces can be had: the highest above the best one held (or the highest
 * `affordable` allows, when one is), skipping the grades between; the next grade, locked, when none is open; or the
 * top grade, already held.
 */
export function gradeLineOffer(line: GradeShopLine, held: ReadonlySet<string>, opens: (itemId: GradeItemId) => boolean,
  affordable?: (grade: GearGrade) => boolean): GradeLineOffer {
  const best = bestHeldGradeIndex(line, held), top = GEAR_GRADES.length - 1;
  if (best >= top) return { itemId: gradeShopItemId(line, GEAR_GRADES[top]), grade: GEAR_GRADES[top], owned: true, open: false, grades: [] };
  const grades = GEAR_GRADES.slice(best + 1).filter(grade => opens(gradeShopItemId(line, grade)));
  const highest = grades.at(-1);
  if (!highest) {
    const grade = GEAR_GRADES[best + 1];
    return { itemId: gradeShopItemId(line, grade), grade, owned: false, open: false, grades };
  }
  const grade = (affordable && grades.filter(affordable).at(-1)) || highest, nextGrade = GEAR_GRADES[gradeIndex(highest) + 1];
  return { itemId: gradeShopItemId(line, grade), grade, owned: false, open: true, grades, ...(nextGrade ? { next: gradeShopItemId(line, nextGrade) } : {}) };
}

/**
 * What the Smith offers on a line: any grade Mastery opens above the best one held. With `gold`, the highest it
 * covers (the highest open when it covers none); without, the highest open.
 */
export const gradeShopOffer = (line: GradeShopLine, held: ReadonlySet<string>, levels: MasteryLevels = {}, gold?: number) =>
  gradeLineOffer(line, held, itemId => gradeShopOpen(itemId, levels), gold === undefined ? undefined : grade => GRADE_GOLD_PRICE[grade] <= gold);

/**
 * Why a piece cannot be had on its line, or null when it can: one at or below the best held on the line, or one
 * whose grade is still locked. The server's check for a buy, and for a craft with its craft level on top.
 */
export function gradeLineRefusal(itemId: GradeItemId, held: ReadonlySet<string>, levels: MasteryLevels) {
  if (held.has(itemId)) return "You already have that.";
  if (gradeIndex(gradeOf(itemId)!) <= bestHeldGradeIndex(gradeShopLineOf(itemId), held)) return "You already have a better one.";
  return gradeShopOpen(itemId, levels) ? null : `You need ${gradeShopNeed(itemId)}.`;
}
