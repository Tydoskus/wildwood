import { describe, expect, it } from "vitest";
import {
  CRAFT_TOOL, TOOLS, TOOL_IDS, TOOL_LEVEL_NAMES, TOOL_MAX_LEVEL, normalizeToolLevel, rodSpeed, skilletBonus, toolBonusChance, toolBonusYield,
  toolEffectText, toolExperience, toolLevelNeed, toolName, toolNeedText, toolSaveShare, toolSavedMaterials, toolSpeed, toolUpgradeCost,
} from "./tools";
import { CRAFT_SKILLS, MATERIAL_NAMES } from "./crafting";
import { MINING_NODES, miningBreakSeconds, miningYield } from "./mining";
import { WOOD_TREE_NODES, WOODCUTTING_LOGS, woodcuttingChopSeconds, woodcuttingYield } from "./woodcutting";

const levels = Array.from({ length: TOOL_MAX_LEVEL }, (_, index) => index + 1);

describe("tools", () => {
  it("are one per skill, each craft with its own", () => {
    expect(TOOL_IDS.map(tool => TOOLS[tool].skill)).toEqual(["mining", "woodcutting", "fishing", "cooking", "smithing", "fletching", "enchanting"]);
    for (const skill of CRAFT_SKILLS) expect(TOOLS[CRAFT_TOOL[skill]].skill).toBe(skill);
  });

  it("go from Worn to Starshard over ten levels, named the same for every tool", () => {
    expect(TOOL_LEVEL_NAMES).toHaveLength(TOOL_MAX_LEVEL + 1);
    expect(toolName("pickaxe", 0)).toBe("Worn Pickaxe");
    expect(toolName("focus", 10)).toBe("Starshard Focus");
    expect([normalizeToolLevel(-3), normalizeToolLevel(4.7), normalizeToolLevel(99), normalizeToolLevel("x")]).toEqual([0, 4, 10, 0]);
  });

  it("gate each level by a rising skill: the stat for gathering, the craft's level up to 90", () => {
    for (const tool of TOOL_IDS) {
      const gates = levels.map(level => toolLevelNeed(tool, level));
      expect(gates).toEqual([...gates].sort((a, b) => a - b));
      expect(new Set(gates).size).toBe(gates.length);
    }
    expect(toolLevelNeed("hammer", 10)).toBe(90);
    expect(toolLevelNeed("pickaxe", 10)).toBe(toolLevelNeed("hatchet", 10));
    expect(toolNeedText("hatchet", 10)).toBe("Lv 3,000 Woodcutting");
    expect(toolNeedText("knife", 1)).toBe("Lv 3 Fletching");
  });

  it("cost rising gold and their band's materials: ore, logs, or logs and crystal", () => {
    const golds = levels.map(level => toolUpgradeCost("pickaxe", level)!.gold);
    expect(golds).toEqual([...golds].sort((a, b) => a - b));
    expect(toolUpgradeCost("pickaxe", 1)).toEqual({ gold: 10, materials: { copper_ore: 15 } });
    expect(toolUpgradeCost("hammer", 4)!.materials).toEqual({ iron_ore: 40 });
    expect(toolUpgradeCost("hatchet", 6)!.materials).toEqual({ yew_log: 60 });
    expect(toolUpgradeCost("knife", 1)!.materials).toEqual({ pine_log: 15 });
    expect(toolUpgradeCost("focus", 2)!.materials).toEqual({ pine_log: 15, arcane_crystal: 3 });
    expect(toolUpgradeCost("pickaxe", 10)!.materials).toEqual({ adamant_ore: 200, starshard: 8 });
    for (const tool of TOOL_IDS) for (const level of levels) {
      for (const id of Object.keys(toolUpgradeCost(tool, level)!.materials)) expect(MATERIAL_NAMES[id]).toBeTruthy();
    }
    expect([toolUpgradeCost("pickaxe", 0), toolUpgradeCost("pickaxe", 11), toolUpgradeCost("pickaxe", 1.5)]).toEqual([null, null, null]);
  });

  it("speed gathering up to twice as fast, with up to a 25% chance of one more", () => {
    expect([toolSpeed(0), toolSpeed(5), toolSpeed(10)]).toEqual([1, 1.5, 2]);
    expect([toolBonusChance(0), toolBonusChance(10)]).toEqual([0, .25]);
    expect([toolBonusYield(0, 0), toolBonusYield(4, .09), toolBonusYield(4, .1)]).toEqual([0, 1, 0]);
    const rock = MINING_NODES[0], tree = WOOD_TREE_NODES[0];
    expect(miningBreakSeconds(rock, 0, 0, 10)).toBeCloseTo(miningBreakSeconds(rock, 0) / 2);
    expect(miningBreakSeconds(rock, 200, .1, 3)).toBeCloseTo(miningBreakSeconds(rock, 200, .1) / 1.3);
    expect(woodcuttingChopSeconds(tree, 0, 10)).toBeCloseTo(woodcuttingChopSeconds(tree, 0) / 2);
    expect(miningYield(rock, .99, {}, 1, 0, 1)[rock.ore]).toBe((miningYield(rock, .99)[rock.ore] ?? 0) + 1);
    expect(woodcuttingYield(tree, 1)[tree.log]).toBe(WOODCUTTING_LOGS + 1);
  });

  it("save a share of each material, rounded down, the rest a chance of one more", () => {
    expect(toolSaveShare(10)).toBe(.25);
    expect(toolExperience(10)).toBeCloseTo(1.3);
    const never = () => .999, always = () => 0;
    expect(toolSavedMaterials({ copper_ore: 100, starshard: 1 }, 0, always)).toEqual({});
    // 2.5% of 100 is 2.5: two saved, and half the time a third.
    expect(toolSavedMaterials({ copper_ore: 100, starshard: 1 }, 1, never)).toEqual({ copper_ore: 2 });
    expect(toolSavedMaterials({ copper_ore: 100, starshard: 1 }, 1, always)).toEqual({ copper_ore: 3, starshard: 1 });
    expect(toolSavedMaterials({ copper_ore: 40 }, 10, () => { throw new Error("no roll for a whole share"); })).toEqual({ copper_ore: 10 });
    // On average it saves the share exactly.
    let seed = 1;
    const random = () => (seed = (seed * 16_807) % 2_147_483_647) / 2_147_483_647;
    let saved = 0;
    for (let index = 0; index < 4_000; index++) saved += toolSavedMaterials({ starshard: 3 }, 6, random).starshard ?? 0;
    expect(saved / 4_000).toBeCloseTo(3 * .15, 1);
  });

  it("say what they do", () => {
    expect(toolEffectText("pickaxe", 0)).toBe("No Bonus");
    expect(toolEffectText("pickaxe", 3)).toBe("+30% Speed · 7.5% Extra Ore");
    expect(toolEffectText("hatchet", 10)).toBe("+100% Speed · 25% Extra Log");
    expect(toolEffectText("rod", 4)).toBe("+20% Speed · 10% Extra Fish");
    expect(toolEffectText("skillet", 6)).toBe("+30% Gold & XP · 15% Save Fish");
    expect(toolEffectText("focus", 3)).toBe("Saves 7.5% Materials · +9% Experience");
    expect([rodSpeed(0), rodSpeed(10)]).toEqual([1, 1.5]);
    expect([skilletBonus(0), skilletBonus(10)]).toEqual([1, 1.5]);
  });
});
