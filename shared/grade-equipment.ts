import { DAGGER_DAMAGE_FACTOR, DAGGER_REACH, SWORD_DAMAGE_FACTOR, SWORD_REACH } from "./campaign-equipment";
import {
  ARMOR_CLASSES, ARMOR_CLASS_NAMES, BOOT_STYLES, BOOT_STYLE_NAMES, BOOT_STYLE_STAT, GEAR_GRADES, GEAR_GRADE_NAMES, GRADE_BONUS_PERCENT, GRADE_ITEM_TIER, GRADE_ROLL_RANGE,
  armorBonusPercent, bootBonusPercent, isArmorClass, isBootStyle, isGearGrade, type ArmorClass, type BootStyle, type GearGrade,
} from "./gear-grades";
import type { ItemDefinition } from "./items";
import { itemStatLine } from "./item-stat-line";

/**
 * The graded gear: a bow, sword, staff and dagger per grade, a helmet and armor per class and grade, and boots per style
 * and grade. Bought from the
 * Smith or crafted, never dropped, so no map's loot lists them. They are kept like the Smith's Starter Staff
 * (TOWN_DROP): in the bag, and can be thrown away.
 */
export const GRADE_WEAPON_KINDS = ["bow", "sword", "staff", "dagger"] as const;
export type GradeWeaponKind = typeof GRADE_WEAPON_KINDS[number];
export const GRADE_ARMOR_KINDS = ["helmet", "armor"] as const;
export type GradeArmorKind = typeof GRADE_ARMOR_KINDS[number];
export type GradeEquipmentKind = GradeWeaponKind | GradeArmorKind | "boots";

export type GradeWeaponId = `${GearGrade}_${GradeWeaponKind}`;
export type GradeArmorId = `${GearGrade}_${ArmorClass}_${GradeArmorKind}`;
export type GradeBootsId = `${GearGrade}_${BootStyle}_boots`;
export type GradeItemId = GradeWeaponId | GradeArmorId | GradeBootsId;

/** Each piece's name after its grade, in grade order; each matches its art (scripts/art/grade-equipment.json). */
const WEAPON_NAMES: Readonly<Record<GradeWeaponKind, readonly string[]>> = {
  bow: [
    "Shortbow", "Hunting Bow", "Recurve Bow", "Longbow", "Composite Bow", "Forked Bow", "Talon Bow", "Coiled Bow",
    "Finned Bow", "Ramhorn Bow", "Leafwing Bow", "Bonewing Bow", "Angelwing Bow", "Antler Bow", "Stormwing Bow",
  ],
  sword: [
    "Iron Blade", "Cleaver", "Broadsword", "Arming Sword", "Longsword", "Sawtooth Blade", "Hook Blade", "Coil Blade",
    "Twin Blade", "Fang Blade", "Crescent Blade", "Leaf Blade", "Arrow Blade", "Fork Blade", "Crystal Blade",
  ],
  staff: [
    "Sprouting Staff", "Crooked Staff", "Banded Staff", "Walking Stick", "Orb Staff", "Seer Staff", "Crystal Staff", "Claw Staff",
    "Orbclaw Staff", "Crescent Staff", "Ramskull Staff", "Horned Staff", "Starbloom Staff", "Sunburst Staff", "Serpent Staff",
  ],
  dagger: [
    "Shiv", "Skinning Knife", "Dirk", "Stiletto", "Kris", "Rondel", "Kukri", "Fang Dagger",
    "Talon Dagger", "Viper Dagger", "Crescent Dagger", "Shadow Dagger", "Moon Dagger", "Wraith Dagger", "Starfang Dagger",
  ],
};
const ARMOR_NAMES: Readonly<Record<ArmorClass, Readonly<Record<GradeArmorKind, readonly string[]>>>> = {
  light: {
    helmet: [
      "Felt Cap", "Field Cap", "Bobble Hat", "Bandana", "Ranger Hood", "Scout Hood", "Badge Beret", "Ramshorn Hood",
      "Wolf Hood", "Horned Fur Hat", "Antler Hood", "Beast Hood", "Leaf Crown", "Feather Helm", "Eagle Hood",
    ],
    armor: [
      "Linen Shirt", "Striped Vest", "Leather Jerkin", "Sash Tunic", "Collared Tunic", "Fur Jerkin", "Traveler Cloak", "Hunter Capelet",
      "Ranger Cloak", "Hooded Cloak", "Warden Cloak", "Beast Pelt", "Mane Mantle", "Wild Mantle", "Feather Mantle",
    ],
  },
  medium: {
    helmet: [
      "Kettle Hat", "Morion", "Skullcap", "Nasal Helm", "Plumed Helm", "Barred Helm", "Crested Helm", "Visored Helm",
      "Sallet", "Viking Helm", "Warden Helm", "Winged Helm", "Hawk Helm", "Paladin Helm", "Valkyrie Helm",
    ],
    armor: [
      "Padded Jerkin", "Fur Gambeson", "Chainmail", "Breastplate", "Pauldron Mail", "Checked Mail", "Steel Cuirass", "Banded Mail",
      "Tabard Mail", "Knight Cuirass", "Soldier Plate", "Captain Tabard", "Moon Cuirass", "Horned Mail", "Paladin Mail",
    ],
  },
  heavy: {
    helmet: [
      "Pot Helm", "Brimmed Helm", "Coif Helm", "Grille Helm", "Bascinet", "Knight Helm", "Great Helm", "Raider Helm",
      "Barbarian Helm", "Bull Helm", "Crested Greathelm", "Dragon Helm", "Skull Helm", "Demon Helm", "Horned Greathelm",
    ],
    armor: [
      "Barrel Plate", "Iron Plate", "Heavy Mail", "Strapped Plate", "Pauldron Plate", "Bulwark Plate", "Pelt Plate", "Layered Plate",
      "Gilded Plate", "Warplate", "Crescent Plate", "Vanguard Plate", "Horned Plate", "Dread Plate", "Titan Plate",
    ],
  },
  magic: {
    helmet: [
      "Pointed Hat", "Novice Cap", "Mage Hood", "Cowl", "Wizard Hat", "Turban", "Scholar Beret", "Mystic Hood",
      "Flame Cowl", "Fae Crown", "Circlet", "Wing Visor", "Seraph Helm", "Sorcerer Crown", "Archmage Crown",
    ],
    armor: [
      "Acolyte Shirt", "Initiate Tunic", "Apprentice Tunic", "Mage Cloak", "Scholar Capelet", "Mystic Cloak", "Seer Cloak", "Enchanter Cloak",
      "Arcane Robe", "Spirit Mantle", "Sorcerer Robe", "Shadow Mantle", "Phoenix Mantle", "Astral Vestment", "Archmage Vestments",
    ],
  },
};

/** Each style's boots after their grade; the art is the game's boot recoloured per piece (scripts/art/import-grade-boots.mjs). */
const BOOT_NAMES: Readonly<Record<BootStyle, readonly string[]>> = {
  ranger: [
    "Trail Shoes", "Moccasins", "Hide Boots", "Tracker Boots", "Scout Boots", "Stalker Boots", "Strider Boots", "Pathfinder Boots",
    "Wolfpelt Boots", "Fleetfoot Boots", "Windrunner Boots", "Thornstep Boots", "Stagleap Boots", "Galeborn Boots", "Hawkwind Boots",
  ],
  warrior: [
    "Hobnail Boots", "Ironcap Boots", "Studded Boots", "Mail Boots", "Sabatons", "Plated Boots", "Steel Sabatons", "Knight Sabatons",
    "Vanguard Boots", "Warlord Sabatons", "Bulwark Boots", "Champion Sabatons", "Dragonscale Boots", "Titan Sabatons", "Warmaster Boots",
  ],
  mystic: [
    "Cloth Slippers", "Acolyte Sandals", "Novice Slippers", "Silk Slippers", "Rune Sandals", "Mage Boots", "Moonstep Slippers", "Spellweave Boots",
    "Starlit Slippers", "Arcane Boots", "Voidstep Boots", "Astral Slippers", "Ethereal Boots", "Sorcerer Boots", "Archmage Boots",
  ],
};

const percentText = (percent: number) => Math.round(percent * 100) / 100;
const gradeName = (grade: GearGrade, names: readonly string[]) => `${GEAR_GRADE_NAMES[grade]} ${names[GEAR_GRADES.indexOf(grade)]}`.toUpperCase();

function gradeWeapon(grade: GearGrade, kind: GradeWeaponKind): ItemDefinition {
  const id = gradeItemId(kind, grade), name = gradeName(grade, WEAPON_NAMES[kind]), tier = GRADE_ITEM_TIER[grade];
  if (kind === "sword") {
    const percent = percentText(GRADE_BONUS_PERCENT[grade] * SWORD_DAMAGE_FACTOR);
    return {
      id, name, slot: "HAND", acquisition: "TOWN_DROP",
      description: "A sword that increases damage. It strikes up close.",
      stats: [itemStatLine("DAMAGE", percent)], weapon: { mode: "MELEE", range: SWORD_REACH, damageMultiplierBonus: percent / 100, rollRange: GRADE_ROLL_RANGE[grade], tier },
    };
  }
  if (kind === "dagger") {
    const percent = percentText(GRADE_BONUS_PERCENT[grade] * DAGGER_DAMAGE_FACTOR);
    return {
      id, name, slot: "HAND", acquisition: "TOWN_DROP",
      description: "A dagger that increases damage. It strikes fast, up close.",
      stats: [itemStatLine("DAMAGE", percent)],
      weapon: { mode: "MELEE", range: DAGGER_REACH, damageMultiplierBonus: percent / 100, rollRange: GRADE_ROLL_RANGE[grade], tier, dagger: true },
    };
  }
  const percent = percentText(GRADE_BONUS_PERCENT[grade]);
  return {
    id, name, slot: "HAND", acquisition: "TOWN_DROP",
    description: kind === "staff" ? "A staff that increases damage. Its bolts burst on whatever they hit." : "A bow that increases damage.",
    stats: [itemStatLine("DAMAGE", percent)],
    weapon: { mode: "RANGED", projectile: kind === "staff" ? "BOLT" : "ARROW", damageMultiplierBonus: percent / 100, rollRange: GRADE_ROLL_RANGE[grade], tier },
  };
}

function gradeArmor(grade: GearGrade, armorClass: ArmorClass, kind: GradeArmorKind): ItemDefinition {
  const percent = percentText(armorBonusPercent(grade, armorClass)), className = ARMOR_CLASS_NAMES[armorClass].toLowerCase();
  const base = { id: gradeItemId(kind, grade, armorClass), name: gradeName(grade, ARMOR_NAMES[armorClass][kind]), acquisition: "TOWN_DROP" as const };
  return kind === "helmet"
    ? { ...base, slot: "HEAD", description: `A ${className} helmet that increases regeneration.`, stats: [itemStatLine("REGEN", percent)], modifiers: { regenerationMultiplierBonus: percent / 100 } }
    : { ...base, slot: "CHEST", description: `${ARMOR_CLASS_NAMES[armorClass]} armor that increases maximum health.`, stats: [itemStatLine("MAX HEALTH", percent)], modifiers: { maxHealthMultiplierBonus: percent / 100 } };
}

const BOOT_STAT_TEXT = { moveSpeed: "MOVE SPEED", armor: "ARMOR", skillChance: "SKILL CHANCE" } as const;
const BOOT_MODIFIER = { moveSpeed: "moveSpeedMultiplierBonus", armor: "armorMultiplierBonus", skillChance: "skillChanceMultiplierBonus" } as const;
const BOOT_DESCRIPTION = { moveSpeed: "move speed", armor: "armor", skillChance: "the chance of weapon skills" } as const;

function gradeBoots(grade: GearGrade, style: BootStyle): ItemDefinition {
  const stat = BOOT_STYLE_STAT[style], percent = percentText(bootBonusPercent(grade, style));
  return {
    id: gradeItemId("boots", grade, style), name: gradeName(grade, BOOT_NAMES[style]), slot: "FEET", acquisition: "TOWN_DROP",
    description: `${BOOT_STYLE_NAMES[style]} boots that increase ${BOOT_DESCRIPTION[stat]}.`,
    stats: [itemStatLine(BOOT_STAT_TEXT[stat], percent)], modifiers: { [BOOT_MODIFIER[stat]]: percent / 100 },
  };
}

/** The id of a graded piece: `rare_bow`, `epic_light_helmet` with a class, or `epic_ranger_boots` with a style. */
export function gradeItemId(kind: GradeWeaponKind, grade: GearGrade): GradeWeaponId;
export function gradeItemId(kind: GradeArmorKind, grade: GearGrade, armorClass: ArmorClass): GradeArmorId;
export function gradeItemId(kind: "boots", grade: GearGrade, style: BootStyle): GradeBootsId;
export function gradeItemId(kind: GradeEquipmentKind, grade: GearGrade, variant?: ArmorClass | BootStyle): GradeItemId {
  return (variant ? `${grade}_${variant}_${kind}` : `${grade}_${kind}`) as GradeItemId;
}

export const GRADE_ITEM_DEFINITIONS = Object.fromEntries([
  ...GEAR_GRADES.flatMap(grade => GRADE_WEAPON_KINDS.map(kind => gradeWeapon(grade, kind))),
  ...GEAR_GRADES.flatMap(grade => ARMOR_CLASSES.flatMap(armorClass => GRADE_ARMOR_KINDS.map(kind => gradeArmor(grade, armorClass, kind)))),
  ...GEAR_GRADES.flatMap(grade => BOOT_STYLES.map(style => gradeBoots(grade, style))),
].map(item => [item.id, item])) as { [Id in GradeItemId]: ItemDefinition & { id: Id } };

export const GRADE_EQUIPMENT_IDS = Object.keys(GRADE_ITEM_DEFINITIONS) as GradeItemId[];

const GRADE_IDS = new Set<string>(GRADE_EQUIPMENT_IDS);
export const isGradeItemId = (itemId: unknown): itemId is GradeItemId => typeof itemId === "string" && GRADE_IDS.has(itemId);

/** A graded piece's grade, or undefined for any other item. */
export function gradeOf(itemId: unknown): GearGrade | undefined {
  if (!isGradeItemId(itemId)) return undefined;
  const grade = itemId.slice(0, itemId.indexOf("_"));
  return isGearGrade(grade) ? grade : undefined;
}

/** A graded helmet's or armor's class, or undefined for weapons and any other item. */
export function armorClassOf(itemId: unknown): ArmorClass | undefined {
  if (!isGradeItemId(itemId)) return undefined;
  const armorClass = itemId.split("_")[1];
  return isArmorClass(armorClass) ? armorClass : undefined;
}

/** Graded boots' style, or undefined for any other item. */
export function bootStyleOf(itemId: unknown): BootStyle | undefined {
  if (!isGradeItemId(itemId)) return undefined;
  const style = itemId.split("_")[1];
  return isBootStyle(style) ? style : undefined;
}

/** A graded piece's kind: bow, sword, staff, helmet, armor or boots. */
export function gradeEquipmentKindOf(itemId: unknown): GradeEquipmentKind | undefined {
  return isGradeItemId(itemId) ? itemId.slice(itemId.lastIndexOf("_") + 1) as GradeEquipmentKind : undefined;
}
