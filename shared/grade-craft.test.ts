import { describe, expect, it } from "vitest";
import {
  CRAFT_LINES, craftLevels, craftMaterialsKey, craftMaterialsShort, craftProgress, gradeCraftLevel, gradeCraftMaterials, gradeCraftNeed,
  gradeCraftOffer, gradeCraftOpen, gradeCraftSkill, isCraftable,
} from "./grade-craft";
import { CRAFT_LEVEL, CRAFT_MAX_LEVEL, craftExperience, craftExperienceForLevel, craftLevel } from "./crafting";
import { GEAR_GRADES } from "./gear-grades";
import { GRADE_EQUIPMENT_IDS } from "./grade-equipment";
import { gradeShopOffer } from "./grade-shop";

describe("crafting graded gear", () => {
  it("gives each craft its lines, every graded piece made by exactly one", () => {
    const ids = (skill: keyof typeof CRAFT_LINES) => CRAFT_LINES[skill].map(line => gradeShopOffer(line, new Set()).itemId);
    expect(ids("smithing")).toEqual(["crude_sword", "crude_dagger", "crude_medium_helmet", "crude_medium_armor", "crude_heavy_helmet", "crude_heavy_armor", "crude_warrior_boots"]);
    expect(ids("fletching")).toEqual(["crude_bow", "crude_light_helmet", "crude_light_armor", "crude_ranger_boots"]);
    expect(ids("enchanting")).toEqual(["crude_staff", "crude_magic_helmet", "crude_magic_armor", "crude_mystic_boots"]);
    expect(GRADE_EQUIPMENT_IDS.every(isCraftable)).toBe(true);
    expect(isCraftable("iron_bow")).toBe(false);
  });

  it("names a piece's craft, recipe and level", () => {
    expect(gradeCraftSkill("rare_light_helmet")).toBe("fletching");
    expect(gradeCraftSkill("rare_heavy_helmet")).toBe("smithing");
    expect(gradeCraftSkill("iron_bow")).toBeUndefined();
    expect(gradeCraftMaterials("crude_staff")).toEqual({ pine_log: 5, arcane_crystal: 1 });
    expect(gradeCraftMaterials("crude_sword")).toEqual({ copper_ore: 10 });
    expect(gradeCraftMaterials("superior_bow")).toEqual({ oak_log: 28, iron_ore: 6 });
    expect(gradeCraftMaterials("heroic_medium_helmet")).toEqual({ mithril_ore: 40 });
    expect(gradeCraftMaterials("legendary_sword")).toEqual({ mithril_ore: 100, starshard: 1 });
    expect(gradeCraftMaterials("eternal_magic_armor")).toEqual({ elder_log: 190, arcane_crystal: 38, starshard: 12 });
    expect(gradeCraftMaterials("iron_bow")).toBeUndefined();
    // Boots: their school's armor recipe in shares of their own.
    expect([gradeCraftSkill("rare_ranger_boots"), gradeCraftSkill("rare_warrior_boots"), gradeCraftSkill("rare_mystic_boots")]).toEqual(["fletching", "smithing", "enchanting"]);
    expect(gradeCraftMaterials("crude_ranger_boots")).toEqual({ pine_log: 6, copper_ore: 3 });
    expect(gradeCraftMaterials("crude_warrior_boots")).toEqual({ copper_ore: 8 });
    expect(gradeCraftMaterials("crude_mystic_boots")).toEqual({ pine_log: 3, arcane_crystal: 1 });
    expect(gradeCraftMaterials("legendary_ranger_boots")).toEqual({ yew_log: 60, mithril_ore: 30, starshard: 1 });
    expect(gradeCraftMaterials("eternal_mystic_boots")).toEqual({ elder_log: 95, arcane_crystal: 38, starshard: 9 });
    expect(gradeCraftLevel("crude_bow")).toBe(1);
    expect(gradeCraftLevel("heroic_bow")).toBe(39);
    expect(gradeCraftNeed("rare_magic_armor")).toBe("Lv 20 Enchanting");
  });

  it("takes four grades to each ore and wood, more of it each grade", () => {
    const ores = GEAR_GRADES.map(grade => Object.keys(gradeCraftMaterials(`${grade}_sword`)!)[0]);
    expect(ores).toEqual([...Array(4).fill("copper_ore"), ...Array(4).fill("iron_ore"), ...Array(4).fill("mithril_ore"), ...Array(3).fill("adamant_ore")]);
    GEAR_GRADES.slice(1).forEach((grade, index) => {
      const previous = GEAR_GRADES[index];
      expect(Object.values(gradeCraftMaterials(`${grade}_sword`)!)[0]).toBeGreaterThan(Object.values(gradeCraftMaterials(`${previous}_sword`)!)[0]);
      expect(CRAFT_LEVEL[grade]).toBeGreaterThan(CRAFT_LEVEL[previous]);
    });
    expect(CRAFT_LEVEL.eternal).toBe(90);
  });

  it("levels each grade's crafter to the next grade's craft level in a few crafts, more toward the top", () => {
    const crafts = GEAR_GRADES.map((grade, index) => {
      const target = GEAR_GRADES[index + 1] ? CRAFT_LEVEL[GEAR_GRADES[index + 1]] : CRAFT_MAX_LEVEL;
      let experience = craftExperienceForLevel(CRAFT_LEVEL[grade]), count = 0;
      while (craftLevel(experience) < target) { experience += craftExperience(grade); count++; }
      return count;
    });
    expect(crafts).toEqual([1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 9]);
    GEAR_GRADES.slice(1).forEach((grade, index) => expect(craftExperience(grade)).toBeGreaterThan(craftExperience(GEAR_GRADES[index])));
  });

  it("offers every grade the craft's level opens, the best first, and names the next: Mastery plays no part", () => {
    const sword = CRAFT_LINES.smithing[0];
    expect(gradeCraftOffer(sword, 10)).toEqual({ itemId: "fine_sword", grade: "fine", grades: ["crude", "common", "sturdy", "fine"], next: "superior_sword" });
    expect(gradeCraftOffer(sword, 9)).toMatchObject({ itemId: "sturdy_sword", grades: ["crude", "common", "sturdy"], next: "fine_sword" });
    expect(gradeCraftOffer(sword, 1)).toEqual({ itemId: "crude_sword", grade: "crude", grades: ["crude"], next: "common_sword" });
    const top = gradeCraftOffer(sword, 99);
    expect([top.itemId, top.grades.length, top.next]).toEqual(["eternal_sword", 15, undefined]);
    expect([gradeCraftOpen("rare_bow", 20), gradeCraftOpen("rare_bow", 19)]).toEqual([true, false]);
  });

  it("compares recipes in one form whatever their order, and lists what is short", () => {
    expect(craftMaterialsKey({ pine_log: 20, copper_ore: 4 })).toBe(craftMaterialsKey({ copper_ore: 4, pine_log: 20 }));
    expect(craftMaterialsKey({ pine_log: 20 })).not.toBe(craftMaterialsKey({ pine_log: 21 }));
    expect(craftMaterialsShort({ pine_log: 20, copper_ore: 4 }, { pine_log: 20, copper_ore: 3 })).toEqual(["copper_ore"]);
    expect(craftMaterialsShort({ pine_log: 20 }, {})).toEqual(["pine_log"]);
  });

  it("starts every craft at level 1 and needs a craft for each early level", () => {
    expect(craftLevel(0)).toBe(1);
    expect(craftLevels({ smithing: 264n })).toEqual({ smithing: 10, fletching: 1, enchanting: 1 });
    for (let level = 2; level <= CRAFT_MAX_LEVEL; level++) expect(craftExperienceForLevel(level)).toBeGreaterThan(craftExperienceForLevel(level - 1));
    expect(craftProgress(0)).toEqual({ level: 1, into: 0, needed: 1 });
    expect(craftProgress(200)).toEqual({ level: 9, into: 23, needed: 87 });
    expect(craftProgress(craftExperienceForLevel(CRAFT_MAX_LEVEL) + 5)).toEqual({ level: CRAFT_MAX_LEVEL, into: 0, needed: 0 });
  });
});
