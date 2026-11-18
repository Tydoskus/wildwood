import { ARCANE_CRYSTAL, CRAFT_SKILL_NAMES, MATERIAL_NAMES, WOOD_IDS, type CraftSkill, type Materials } from "./crafting";

/**
 * Tools: one for every skill, upgraded at the Smith for gold and materials. Every player holds all seven from the
 * start. Each starts Worn (level 0) and goes up ten levels, each gated by its skill.
 *
 * - Gathering tools (Pickaxe, Hatchet, Fishing Rod): faster breaks, fells and bites, and a chance of one more ore, log or fish.
 * - Craft tools (Hammer for Smithing, Knife for Fletching, Focus for Enchanting): a share of each material saved,
 *   and more craft experience.
 * - Cooking Skillet: more gold and Cooking experience from each dish, and a chance to save one fish.
 */
export const TOOL_IDS = ["pickaxe", "hatchet", "rod", "skillet", "hammer", "knife", "focus"] as const;
export type ToolId = typeof TOOL_IDS[number];
export type ToolSkill = "mining" | "woodcutting" | "fishing" | "cooking" | CraftSkill;

export const TOOLS: Readonly<Record<ToolId, { name: string; skill: ToolSkill; gathers: boolean }>> = {
  pickaxe: { name: "Pickaxe", skill: "mining", gathers: true },
  hatchet: { name: "Hatchet", skill: "woodcutting", gathers: true },
  rod: { name: "Fishing Rod", skill: "fishing", gathers: true },
  skillet: { name: "Cooking Skillet", skill: "cooking", gathers: false },
  hammer: { name: "Hammer", skill: "smithing", gathers: false },
  knife: { name: "Knife", skill: "fletching", gathers: false },
  focus: { name: "Focus", skill: "enchanting", gathers: false },
};
/** Each craft's tool. */
export const CRAFT_TOOL: Readonly<Record<CraftSkill, ToolId>> = { smithing: "hammer", fletching: "knife", enchanting: "focus" };
export const TOOL_SKILL_NAMES: Readonly<Record<ToolSkill, string>> = {
  mining: "Mining", woodcutting: "Woodcutting", fishing: "Fishing", ...CRAFT_SKILL_NAMES,
};

export const TOOL_MAX_LEVEL = 10;
/** Each level's name, the same for every tool: Worn as the Smith hands it over, Starshard at the top. */
export const TOOL_LEVEL_NAMES: readonly string[] = Object.freeze([
  "Worn", "Bronze", "Iron", "Steel", "Silver", "Mithril", "Cobalt", "Adamant", "Obsidian", "Moonsteel", "Starshard",
]);

export const isToolId = (value: unknown): value is ToolId => (TOOL_IDS as readonly unknown[]).includes(value);

export function normalizeToolLevel(level: unknown) {
  const value = Number(level);
  return Number.isFinite(value) ? Math.max(0, Math.min(TOOL_MAX_LEVEL, Math.floor(value))) : 0;
}

/** "Bronze Pickaxe". */
export const toolName = (tool: ToolId, level: number) => `${TOOL_LEVEL_NAMES[normalizeToolLevel(level)]} ${TOOLS[tool].name}`;

/** The skill each level needs, levels 1 to 10: the Mining or Woodcutting stat, or the skill's level (1 to 99). */
const GATHER_GATES = [10, 50, 125, 250, 400, 600, 900, 1_300, 2_000, 3_000];
const CRAFT_GATES = [3, 10, 20, 30, 40, 50, 60, 70, 80, 90];
export function toolLevelNeed(tool: ToolId, level: number) {
  const gates = tool === "pickaxe" || tool === "hatchet" ? GATHER_GATES : CRAFT_GATES;
  return gates[Math.max(1, Math.min(TOOL_MAX_LEVEL, Math.floor(level))) - 1];
}
/** "Lv 250 Mining". */
export const toolNeedText = (tool: ToolId, level: number) => `Lv ${toolLevelNeed(tool, level).toLocaleString("en-US")} ${TOOL_SKILL_NAMES[TOOLS[tool].skill]}`;

/** Each level's gold, and the band of materials it takes: copper/pine to adamant/elder, Starshards at the top. */
const GOLD = [10, 15, 22, 30, 40, 55, 75, 100, 130, 170];
const BAND = [0, 0, 0, 1, 1, 2, 2, 3, 3, 3];
const AMOUNTS = [15, 30, 50, 40, 70, 60, 100, 90, 140, 200];
const STARSHARDS = [0, 0, 0, 0, 0, 0, 0, 2, 4, 8];
const ORES = ["copper_ore", "iron_ore", "mithril_ore", "adamant_ore"] as const;

/**
 * What upgrading a tool to `level` costs: gold, and ore for the Pickaxe, Hammer and Skillet, logs for the Hatchet,
 * Knife and Fishing Rod, logs and crystal for the Focus. Null outside 1 to 10.
 */
export function toolUpgradeCost(tool: ToolId, level: number): { gold: number; materials: Materials } | null {
  if (!Number.isInteger(level) || level < 1 || level > TOOL_MAX_LEVEL) return null;
  const index = level - 1, band = BAND[index], amount = AMOUNTS[index];
  const materials: Record<string, number> = {};
  if (tool === "pickaxe" || tool === "hammer" || tool === "skillet") materials[ORES[band]] = amount;
  if (tool === "hatchet" || tool === "knife" || tool === "rod") materials[WOOD_IDS[band]] = amount;
  if (tool === "focus") { materials[WOOD_IDS[band]] = Math.round(amount / 2); materials[ARCANE_CRYSTAL] = Math.max(1, Math.round(amount / 10)); }
  if (STARSHARDS[index]) materials.starshard = STARSHARDS[index];
  return { gold: GOLD[index], materials };
}

/** "40 Iron Ore". */
export const materialText = (id: string, count: number) => `${count.toLocaleString("en-US")} ${MATERIAL_NAMES[id] ?? id}`;

/** A gathering tool's speed: 10% faster a level, 2x at 10, on top of the skill and cards. */
export const toolSpeed = (level: number) => 1 + .1 * normalizeToolLevel(level);
/** A fishing rod's speed: 5% faster a level, 1.5x at 10, on top of Fishing level and treasures. */
export const rodSpeed = (level: number) => 1 + .05 * normalizeToolLevel(level);
/** A cooking skillet's gold and XP multiplier: 5% more a level, 1.5x at 10. */
export const skilletBonus = (level: number) => 1 + .05 * normalizeToolLevel(level);
/** A gathering tool's chance of one more ore, log or fish a break (or a skillet's chance to save a fish): 2.5% a level, 25% at 10. */
export const toolBonusChance = (level: number) => .025 * normalizeToolLevel(level);
/** One more ore or log when `roll` (0 to 1) falls under the chance. */
export const toolBonusYield = (level: number, roll: number) => (roll < toolBonusChance(level) ? 1 : 0);
/** A craft tool's share of each material saved: 2.5% a level, 25% at 10. Per mille, so the sums stay whole. */
const SAVE_PER_MILLE = 25;
export const toolSaveShare = (level: number) => SAVE_PER_MILLE * normalizeToolLevel(level) / 1_000;
/** A craft tool's craft experience: 3% more a level, 30% at 10. */
export const toolExperience = (level: number) => 1 + .03 * normalizeToolLevel(level);

/** What a recipe needs in the bag with this tool: each material less the whole part the tool always saves. */
export function toolCraftCost(materials: Materials, level: number): Materials {
  const perMille = SAVE_PER_MILLE * normalizeToolLevel(level);
  return Object.fromEntries(Object.entries(materials).map(([id, count]) => [id, count - Math.floor(count * perMille / 1_000)])) as Materials;
}

/**
 * What a craft tool saves of a recipe: its share of each material, rounded down, and the rest of that share as a
 * chance of one more. A Starshard needed once is saved one time in four at 10. `random` is asked only for a remainder.
 */
export function toolSavedMaterials(materials: Materials, level: number, random: () => number): Record<string, number> {
  const saved: Record<string, number> = {}, perMille = SAVE_PER_MILLE * normalizeToolLevel(level);
  if (!perMille) return saved;
  for (const [id, count] of Object.entries(materials)) {
    const share = count * perMille, whole = Math.floor(share / 1_000), rest = share % 1_000;
    const total = whole + (rest > 0 && random() < rest / 1_000 ? 1 : 0);
    if (total > 0) saved[id] = Math.min(count, total);
  }
  return saved;
}

const percent = (value: number) => `${Number((value * 100).toFixed(1))}%`;
/** What a tool does at a level: "+30% Speed · 7.5% Extra Ore", "+15% Speed · 7.5% Extra Fish", "Saves 7.5% Materials · +9% Experience". */
export function toolEffectText(tool: ToolId, level: number) {
  const value = normalizeToolLevel(level);
  if (!value) return "No Bonus";
  if (tool === "rod") return `+${percent(rodSpeed(value) - 1)} Speed · ${percent(toolBonusChance(value))} Extra Fish`;
  if (tool === "skillet") return `+${percent(skilletBonus(value) - 1)} Gold & XP · ${percent(toolBonusChance(value))} Save Fish`;
  if (TOOLS[tool].gathers) return `+${percent(toolSpeed(value) - 1)} Speed · ${percent(toolBonusChance(value))} Extra ${tool === "pickaxe" ? "Ore" : "Log"}`;
  return `Saves ${percent(toolSaveShare(value))} Materials · +${percent(toolExperience(value) - 1)} Experience`;
}
