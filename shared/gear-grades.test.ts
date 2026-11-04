import { describe, expect, it } from "vitest";
import { equipmentStatDefinition } from "./equipment-budget";
import { GEAR_GRADES, GRADE_BONUS_PERCENT, GRADE_STEP, GRADE_GOLD_PRICE, GRADE_MASTERY_LEVEL, armorBonusPercent, armorClassMasteryLevel, gradeForOldBonus, gradeSalePrice, highestGradeFor, oldTierSalePrice } from "./gear-grades";
import { gradeShopSalePrice } from "./grade-shop";

const oldBonus = (tier: number) => (equipmentStatDefinition(tier, "HEAD").modifiers!.regenerationMultiplierBonus as number) * 100;

describe("gear grades", () => {
  it("has fifteen grades, each 1.3x the grade below, rising in bonus, gate and price", () => {
    expect(GEAR_GRADES).toHaveLength(15);
    GEAR_GRADES.forEach((grade, index) => {
      expect(1 + GRADE_BONUS_PERCENT[grade] / 100).toBeCloseTo(GRADE_STEP ** (index + 1), 2);
      if (index) {
        const previous = GEAR_GRADES[index - 1];
        expect(GRADE_BONUS_PERCENT[grade]).toBeGreaterThan(GRADE_BONUS_PERCENT[previous]);
        expect(GRADE_MASTERY_LEVEL[grade]).toBeGreaterThan(GRADE_MASTERY_LEVEL[previous]);
        expect(GRADE_GOLD_PRICE[grade]).toBeGreaterThan(GRADE_GOLD_PRICE[previous]);
      }
    });
  });

  it("converts an old piece to the grade nearest its own bonus", () => {
    const gap = (grade: string, bonus: number) => Math.abs(GRADE_BONUS_PERCENT[grade as keyof typeof GRADE_BONUS_PERCENT] - bonus);
    expect(gradeForOldBonus(oldBonus(1))).toBe("crude");
    for (let tier = 1; tier <= 15; tier++) {
      const bonus = oldBonus(tier), grade = gradeForOldBonus(bonus);
      expect(GEAR_GRADES.every(other => gap(grade, bonus) <= gap(other, bonus) + 1e-9)).toBe(true);
    }
  });

  it("opens grades by Mastery level, Heavy by the best school", () => {
    expect(highestGradeFor(0)).toBe("crude");
    expect(highestGradeFor(8)).toBe("heroic");
    expect(highestGradeFor(50)).toBe("eternal");
    expect(armorClassMasteryLevel("light", { archery: 12, swordplay: 30 })).toBe(12);
    expect(armorClassMasteryLevel("heavy", { archery: 12, swordplay: 30 })).toBe(30);
    expect(armorClassMasteryLevel("heavy", {})).toBe(0);
  });

  it("trades bonus for each class's perk", () => {
    expect(armorBonusPercent("epic", "medium")).toBe(GRADE_BONUS_PERCENT.epic);
    expect(armorBonusPercent("epic", "heavy")).toBeCloseTo(GRADE_BONUS_PERCENT.epic * 1.3);
    expect(armorBonusPercent("epic", "light")).toBeCloseTo(GRADE_BONUS_PERCENT.epic * .8);
  });

  it("buys back an old piece for a quarter of its grade's price", () => {
    expect(oldTierSalePrice(1)).toBe(3);
    expect(oldTierSalePrice(15)).toBe(31);
  });

  it("sells a graded piece back to the Smith for a tenth of its price, rounded down", () => {
    expect([gradeSalePrice("crude"), gradeSalePrice("epic"), gradeSalePrice("eternal")]).toEqual([12, 1_500, 200_000]);
    for (const grade of GEAR_GRADES) expect(gradeSalePrice(grade)).toBe(Math.floor(GRADE_GOLD_PRICE[grade] / 10));
    expect([gradeShopSalePrice("rare_bow"), gradeShopSalePrice("eternal_heavy_armor"), gradeShopSalePrice("samurai_hat")]).toEqual([400, 200_000, undefined]);
  });
});
