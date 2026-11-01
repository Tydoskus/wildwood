import { bagSlotsUsed } from "./equipment-copies";
import type { MiningNode } from "./mining";
import { REFINE_ORES, tierGrade, type OreId } from "./refine";
import { GEAR_GRADES, GEAR_GRADE_NAMES } from "./gear-grades";
import { ARCANE_CRYSTAL, WOOD_IDS } from "./crafting";
import { WOOD_TREE_KINDS, WOOD_TREES } from "./woodcutting";
import { ARROW_IDS, ARROW_KINDS, isArrowId } from "./arrows";

/**
 * Ores in the bag: every kind held takes one bag slot,
 * however many are in the stack, and counts toward the bag's capacity like any item. A kind the player holds none
 * of needs a free slot before it can come in, so a full bag stops a new kind from being mined.
 */

/** The ores the Smith and the Card Seller list: the grade ores, then the Starshard. */
export const REFINE_ORE_ORDER: readonly OreId[] = Object.freeze(["copper_ore", "iron_ore", "mithril_ore", "adamant_ore", "starshard"]);
/** Every stack in the order the bag lists them: the ores, then the crafting wood and crystal, then crafted arrows. */
export const ORE_ORDER: readonly OreId[] = Object.freeze([...REFINE_ORE_ORDER, ...WOOD_IDS, ARCANE_CRYSTAL, ...ARROW_IDS]);

export type OreCounts = Readonly<Partial<Record<OreId, number>>>;

/** The kinds held, in bag order. */
export const oreKindsHeld = (ores: OreCounts) => ORE_ORDER.filter(oreId => (ores[oreId] ?? 0) > 0);

/** What a rock can give: its ore (a crystal rock's is crystal), and from a Mysterious rock a Starshard too. */
export const rockOreKinds = (node: Pick<MiningNode, "ore" | "kind">): OreId[] => node.kind === "mysterious" ? [node.ore, "starshard"] : [node.ore];

export type BagSpace = {
  /** Distinct items the player owns (inventoryJson) and the ones worn, as bagSlotsUsed counts them. */
  owned: readonly string[];
  equipped: readonly string[];
  /** Copies kept beyond each item's first: each takes its own slot. */
  extraCopies: number;
  ores: OreCounts;
  capacity: number;
};

/** Bag slots in use, ore stacks included. */
export const bagSlotsWithOres = (bag: BagSpace) => bagSlotsUsed(bag.owned, bag.equipped, bag.extraCopies, oreKindsHeld(bag.ores).length);

/** Whether these ores can come in: the kinds not held yet each need a free slot. */
export function roomForOres(bag: BagSpace, oreIds: readonly OreId[]) {
  const needed = [...new Set(oreIds)].filter(oreId => !((bag.ores[oreId] ?? 0) > 0));
  return { needed, room: !needed.length || bagSlotsWithOres(bag) + needed.length <= bag.capacity };
}

/** "Your bag is full. Free a slot for Iron Ore." */
export function bagFullForOres(needed: readonly OreId[]) {
  const names = needed.map(oreId => REFINE_ORES[oreId].name).join(" and ");
  return `Your bag is full. Free ${needed.length === 1 ? "a slot" : `${needed.length} slots`} for ${names}.`;
}

/** The stack's own lines in the item window: what it is for, and where it comes from. */
export function oreDescription(oreId: OreId) {
  if (isArrowId(oreId)) return { use: `Nock them for a bow: each shot spends one. ${ARROW_KINDS[oreId].text}.`, from: "Crafted at the Smith from a log and an ore." };
  if (oreId === "starshard") return { use: "Refining from ★11 up takes one a try, with the gear's ore.", from: "Every Mysterious rock in the Copper Hills holds one; the rocks are rare." };
  if (oreId === ARCANE_CRYSTAL) return { use: "Crafting staffs and Magic armor takes it.", from: "Mined from crystal rocks in the Copper Hills, east of Town." };
  const tree = WOOD_TREE_KINDS.find(kind => WOOD_TREES[kind].log === oreId);
  if (tree) return { use: "Crafting bows, staffs and Light or Magic armor takes it.", from: `Chopped from ${WOOD_TREES[tree].name}s in Timberwood, west of Town.` };
  const grade = REFINE_ORES[oreId].grade as 1 | 2 | 3 | 4;
  // Four grades to an ore, the last three (refine.ts tierGrade).
  const graded = GEAR_GRADES.filter((_name, index) => tierGrade(index + 1) === grade);
  const span = `${GEAR_GRADE_NAMES[graded[0]]} to ${GEAR_GRADE_NAMES[graded[graded.length - 1]]}`;
  return { use: `The Smith refines ${span} gear with it, one a try.`, from: "Mined in the Copper Hills, east of Town." };
}
