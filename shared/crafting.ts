import { GEAR_GRADES, type ArmorClass, type GearGrade } from "./gear-grades";

/**
 * Crafting: the other way to graded gear, all of it done at the Smith. Each craft has its own skill, levelled by
 * crafting: Smithing (swords, Medium and Heavy armor), Fletching (bows, Light armor), Enchanting (staffs, Magic
 * armor). The grade must still be open by Mastery, as for buying.
 */
export const CRAFT_SKILLS = ["smithing", "fletching", "enchanting"] as const;
export type CraftSkill = typeof CRAFT_SKILLS[number];
export const CRAFT_SKILL_NAMES: Readonly<Record<CraftSkill, string>> = { smithing: "Smithing", fletching: "Fletching", enchanting: "Enchanting" };

/** Wood from the Woodcutting trees, one kind per grade band, and crystal from the Copper Hills' crystal rocks. */
export const WOOD_IDS = ["pine_log", "oak_log", "yew_log", "elder_log"] as const;
export type WoodId = typeof WOOD_IDS[number];
export const ARCANE_CRYSTAL = "arcane_crystal" as const;
export const MATERIAL_NAMES: Readonly<Record<string, string>> = {
  pine_log: "Pine Log", oak_log: "Oak Log", yew_log: "Yew Log", elder_log: "Elder Log", arcane_crystal: "Arcane Crystal",
  copper_ore: "Copper Ore", iron_ore: "Iron Ore", mithril_ore: "Mithril Ore", adamant_ore: "Adamant Ore", starshard: "Starshard",
};

export type CraftKind = "bow" | "sword" | "staff" | "helmet" | "armor" | "dagger";
export type Materials = Readonly<Record<string, number>>;

/** The craft that makes a piece. */
export function craftSkillFor(kind: CraftKind, armorClass?: ArmorClass): CraftSkill {
  if (kind === "bow") return "fletching";
  if (kind === "staff") return "enchanting";
  if (kind === "sword") return "smithing";
  return armorClass === "light" ? "fletching" : armorClass === "magic" ? "enchanting" : "smithing";
}

const byGrade = <T>(values: readonly T[]) => Object.fromEntries(GEAR_GRADES.map((grade, index) => [grade, values[index]])) as Record<GearGrade, T>;

/** The craft skill level a grade needs, spread from 1 to 90. */
export const CRAFT_LEVEL: Readonly<Record<GearGrade, number>> = byGrade([1, 3, 6, 10, 15, 20, 26, 32, 39, 46, 54, 62, 71, 80, 90]);

/** Each four grades take the next ore and wood, the veins and stands deeper in the hills and the grove. */
const ORES = ["copper_ore", "iron_ore", "mithril_ore", "adamant_ore"] as const;
/** The recipe's size, about 1.3x a grade; the harder ore of each band makes it slower still. */
const AMOUNTS = byGrade([10, 13, 17, 22, 28, 36, 46, 60, 80, 100, 130, 170, 220, 290, 380]);
/** Starshards, from Legendary on. */
const STARSHARDS = byGrade([0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 5, 8, 12]);

/** Each grade's band: which ore and wood it takes, and how many. */
function bandOf(grade: GearGrade) {
  const index = GEAR_GRADES.indexOf(grade), band = Math.floor(index / 4), amount = AMOUNTS[grade];
  return { ore: ORES[band], wood: WOOD_IDS[band], amount, starshards: STARSHARDS[grade], crystals: Math.max(1, Math.round(amount / 10)) };
}

/**
 * What a piece costs to craft. Smithing is all ore; Fletching mostly wood with a little ore for fittings;
 * Enchanting wood for the haft and crystal for the focus. Helmets take half of what armor and weapons do.
 */
export function craftMaterials(grade: GearGrade, kind: CraftKind, armorClass?: ArmorClass): Materials {
  if (kind === "dagger") return {};
  const band = bandOf(grade), share = kind === "helmet" ? .5 : 1, skill = craftSkillFor(kind, armorClass);
  const n = (value: number) => Math.max(1, Math.round(value * share));
  const materials: Record<string, number> = {};
  if (skill === "smithing") materials[band.ore] = n(band.amount);
  if (skill === "fletching") { materials[band.wood] = n(band.amount); materials[band.ore] = n(band.amount / 5); }
  if (skill === "enchanting") { materials[band.wood] = n(band.amount / 2); materials[ARCANE_CRYSTAL] = n(band.crystals); }
  if (band.starshards) materials.starshard = n(band.starshards);
  return materials;
}

/** What a craft gives: a refine to start, and a weapon's skills rolled twice with better luck, keeping the higher. */
export const CRAFTED_REFINE = 2;
export const CRAFTED_SKILL_LUCK_RANKS = 3;

export const CRAFT_MAX_LEVEL = 99;
/** Total experience to reach a craft level. */
export function craftExperienceForLevel(level: number) {
  const clamped = Math.max(1, Math.min(CRAFT_MAX_LEVEL, Math.floor(Number.isFinite(level) ? level : 1)));
  // Rounded up, so level 2 takes a craft rather than none.
  return Math.ceil(.15 * (clamped - 1) ** 3.4);
}

/**
 * How many crafts of a grade carry its craft level to the next grade's (Eternal's to 99): one Crude, two each of
 * Common and Sturdy, rising to eight Divine and nine Eternal; 63 crafts in all from 1 to 90.
 */
const CRAFTS_TO_NEXT = byGrade([1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 9]);

/** Craft experience a piece gives: its share of the way from its grade's level to the next grade's. */
export function craftExperience(grade: GearGrade) {
  const next = GEAR_GRADES[GEAR_GRADES.indexOf(grade) + 1];
  const span = craftExperienceForLevel(next ? CRAFT_LEVEL[next] : CRAFT_MAX_LEVEL) - craftExperienceForLevel(CRAFT_LEVEL[grade]);
  return Math.ceil(span / CRAFTS_TO_NEXT[grade]);
}

export function craftLevel(experience: number | bigint) {
  const value = Math.max(0, Number(experience) || 0);
  let level = 1;
  while (level < CRAFT_MAX_LEVEL && value >= craftExperienceForLevel(level + 1)) level++;
  return level;
}
