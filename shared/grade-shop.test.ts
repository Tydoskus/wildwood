import { describe, expect, it } from "vitest";
import {
  GRADE_SHOP_LINES, gradeLineRefusal, gradeShopLineOf, gradeShopNeed, gradeShopOffer, gradeShopOpen, gradeShopPrice, masteryLevels,
} from "./grade-shop";
import { GRADE_EQUIPMENT_IDS } from "./grade-equipment";
import { GRADE_GOLD_PRICE } from "./gear-grades";
import { masteryPointsForLevel } from "./weapon-mastery";

describe("the Smith's gear for gold", () => {
  it("has a line for every graded piece: four weapons, a helmet and armor per class, boots per style", () => {
    expect(GRADE_SHOP_LINES).toHaveLength(15);
    const offered = GRADE_SHOP_LINES.map(line => gradeShopOffer(line, new Set()).itemId);
    expect(offered.every(id => GRADE_EQUIPMENT_IDS.includes(id))).toBe(true);
    expect(new Set(offered).size).toBe(15);
    expect(offered.slice(-3)).toEqual(["crude_ranger_boots", "crude_warrior_boots", "crude_mystic_boots"]);
    for (const id of GRADE_EQUIPMENT_IDS) expect(GRADE_SHOP_LINES).toContainEqual(gradeShopLineOf(id));
  });

  it("offers the highest grade Mastery opens above the best one held, skipping those between", () => {
    const bow = GRADE_SHOP_LINES[0];
    expect(gradeShopOffer(bow, new Set())).toEqual({ itemId: "crude_bow", grade: "crude", owned: false, open: true, grades: ["crude"], next: "common_bow" });
    expect(gradeShopOffer(bow, new Set(), { archery: 5 })).toEqual({
      itemId: "rare_bow", grade: "rare", owned: false, open: true, grades: ["crude", "common", "sturdy", "fine", "superior", "rare"], next: "exquisite_bow",
    });
    // Held above what Mastery opens: the next grade, locked.
    expect(gradeShopOffer(bow, new Set(["crude_bow", "epic_bow"]), { archery: 5 })).toEqual({ itemId: "heroic_bow", grade: "heroic", owned: false, open: false, grades: [] });
    expect(gradeShopOffer(bow, new Set(["fine_bow"]), { archery: 8 })).toMatchObject({ itemId: "heroic_bow", open: true, next: "legendary_bow" });
    expect(gradeShopOffer(bow, new Set(["fine_bow"]), { archery: 8 }).grades).toEqual(["superior", "rare", "exquisite", "epic", "heroic"]);
    expect(gradeShopOffer(bow, new Set(["divine_bow"]), { archery: 50 })).toEqual({ itemId: "eternal_bow", grade: "eternal", owned: false, open: true, grades: ["eternal"] });
    expect(gradeShopOffer(bow, new Set(["eternal_bow"]))).toEqual({ itemId: "eternal_bow", grade: "eternal", owned: true, open: false, grades: [] });
  });

  it("with gold, offers the best open grade it covers, else the highest open; next stays past the highest open", () => {
    const bow = GRADE_SHOP_LINES[0], held = new Set(["crude_bow"]), levels = { archery: 8 };
    expect(gradeShopOffer(bow, held, levels, GRADE_GOLD_PRICE.epic)).toMatchObject({ itemId: "epic_bow", open: true, next: "legendary_bow" });
    expect(gradeShopOffer(bow, held, levels, GRADE_GOLD_PRICE.epic - 1)).toMatchObject({ itemId: "exquisite_bow", open: true });
    expect(gradeShopOffer(bow, held, levels, 1_000_000)).toMatchObject({ itemId: "heroic_bow" });
    expect(gradeShopOffer(bow, held, levels, 0)).toMatchObject({ itemId: "heroic_bow", open: true });
  });

  it("opens a grade by the piece's school, and Heavy by the best school", () => {
    const levels = masteryLevels({ archery: BigInt(masteryPointsForLevel(5)), sorcery: 0n });
    expect(levels).toEqual({ archery: 5, sorcery: 0 });
    expect(gradeShopOpen("rare_bow", levels)).toBe(true);
    expect(gradeShopOpen("exquisite_bow", levels)).toBe(false);
    expect(gradeShopOpen("common_staff", levels)).toBe(false);
    expect(gradeShopOpen("crude_staff", levels)).toBe(true);
    expect(gradeShopOpen("rare_light_armor", levels)).toBe(true);
    expect(gradeShopOpen("rare_heavy_helmet", levels)).toBe(true);
    expect(gradeShopOpen("common_medium_helmet", levels)).toBe(false);
    expect(gradeShopNeed("legendary_sword")).toBe("Lv 9 Swordplay");
    expect(gradeShopNeed("legendary_magic_helmet")).toBe("Lv 9 Sorcery");
    expect(gradeShopNeed("legendary_heavy_armor")).toBe("Lv 9 Any School");
  });

  it("refuses a piece held, one at or below the best held on its line, and a locked one", () => {
    const held = new Set(["fine_bow", "crude_sword"]), levels = { archery: 6 };
    expect(gradeLineRefusal("fine_bow", held, levels)).toBe("You already have that.");
    expect(gradeLineRefusal("common_bow", held, levels)).toBe("You already have a better one.");
    expect(gradeLineRefusal("superior_bow", held, levels)).toBeNull();
    expect(gradeLineRefusal("exquisite_bow", held, levels)).toBeNull();
    expect(gradeLineRefusal("epic_bow", held, levels)).toBe("You need Lv 7 Archery.");
    // Another line keeps its own best.
    expect(gradeLineRefusal("crude_light_armor", held, levels)).toBeNull();
    expect(gradeLineRefusal("common_sword", held, levels)).toBe("You need Lv 1 Swordplay.");
  });

  it("prices only graded gear", () => {
    expect(gradeShopPrice("eternal_staff")).toBe(GRADE_GOLD_PRICE.eternal);
    expect(gradeShopPrice("crude_bow")).toBe(120);
    expect(gradeShopPrice("iron_bow")).toBeUndefined();
    expect(gradeShopPrice(undefined)).toBeUndefined();
  });
});
