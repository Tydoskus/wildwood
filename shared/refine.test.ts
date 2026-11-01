import { describe, expect, it } from "vitest";
import {
  ARMOR_SAFE_LIMIT, REFINE_MAX, STARSHARD_FROM_LEVEL, WEAPON_SAFE_LIMITS, expectedRefineTries, isRefinableItem,
  normalizeRefineLevel, refineCost, refineGrade, refineMultiplier, refineResultLevel, refineSafeLimit, refineSuccessChance, rollRefine,
} from "./refine";
import { ITEM_DEFINITIONS, isUpgradeableItem } from "./items";
import { itemTier } from "./item-tier";
import { bootStyleOf, isGradeItemId } from "./grade-equipment";

const bows = { grade1: "starter_bow", grade2: "sky_bow", grade3: "crystal_bow", grade4: "ion_bow" } as const;

describe("what can be refined", () => {
  it("is every bow, sword, helmet and armor with a stat, and graded boots, and nothing else", () => {
    for (const item of Object.values(ITEM_DEFINITIONS)) expect(isRefinableItem(item.id), item.id).toBe(isUpgradeableItem(item.id) || bootStyleOf(item.id) !== undefined);
    // Boots refine on armor's odds, at their grade's stand-in tier, with no slot tier track.
    expect([isUpgradeableItem("rare_ranger_boots"), refineGrade("rare_ranger_boots"), refineGrade("eternal_mystic_boots")]).toEqual([false, 2, 4]);
    expect(refineSafeLimit("rare_warrior_boots")).toBe(4);
    // Swords refine as the weapons they are, on a bow's odds.
    expect(["wooden_sword", "sky_sword", "ion_sword"].map(refineGrade)).toEqual([1, 2, 4]);
    expect(refineSafeLimit("ion_sword")).toBe(WEAPON_SAFE_LIMITS[4]);
    for (const id of ["starter_stone", "black_boots", "basic_paper_hat", "galaxy_bow", "not_an_item"]) {
      expect(isRefinableItem(id), id).toBe(false);
      expect(refineGrade(id), id).toBeNull();
      expect(refineCost(id, 1), id).toBeNull();
      expect(refineSuccessChance(id, 1), id).toBe(0);
    }
  });

  it("grades items by their Tier, four tiers a grade", () => {
    expect([bows.grade1, bows.grade2, bows.grade3, bows.grade4].map(refineGrade)).toEqual([1, 2, 3, 4]);
    for (const item of Object.values(ITEM_DEFINITIONS).filter(item => isRefinableItem(item.id) && !isGradeItemId(item.id))) {
      const tier = itemTier(item.id)!;
      expect(refineGrade(item.id), item.id).toBe(tier <= 4 ? 1 : tier <= 8 ? 2 : tier <= 12 ? 3 : 4);
    }
  });
});

describe("safe limits and odds", () => {
  it("are safe to +7, +6, +5 or +4 for weapons by grade, and +4 for helmets and armor", () => {
    expect([bows.grade1, bows.grade2, bows.grade3, bows.grade4].map(refineSafeLimit)).toEqual([7, 6, 5, 4]);
    expect(Object.values(WEAPON_SAFE_LIMITS)).toEqual([7, 6, 5, 4]);
    expect(refineSafeLimit("ion_armor")).toBe(ARMOR_SAFE_LIMIT);
    expect(refineSafeLimit("forest_cap")).toBe(ARMOR_SAFE_LIMIT);
  });

  it("never fail up to the safe limit, then can, and never get easier as the item climbs", () => {
    for (const item of Object.values(ITEM_DEFINITIONS).filter(item => isRefinableItem(item.id))) {
      const safe = refineSafeLimit(item.id);
      let previous = 1;
      for (let level = 1; level <= REFINE_MAX; level++) {
        const chance = refineSuccessChance(item.id, level);
        if (level <= safe) expect(chance, `${item.id} +${level}`).toBe(1);
        else {
          expect(chance, `${item.id} +${level}`).toBeGreaterThan(0);
          expect(chance, `${item.id} +${level}`).toBeLessThan(1);
        }
        expect(chance, `${item.id} +${level}`).toBeLessThanOrEqual(previous);
        previous = chance;
      }
      expect(refineSuccessChance(item.id, 0)).toBe(0);
      expect(refineSuccessChance(item.id, REFINE_MAX + 1)).toBe(0);
    }
  });

  it("take more tries the higher the grade and the level, +30 the longest climb", () => {
    // In tries, one ore each; a fail keeps the level.
    const tries = [bows.grade1, bows.grade2, bows.grade3, bows.grade4].map(expectedRefineTries);
    expect(tries[0][7]).toBe(7);
    expect(tries[3][4]).toBe(4);
    // Fails raise the next try's chance, so a level takes fewer than one over its chance.
    expect(tries[0][10]).toBeGreaterThan(7 + 3); expect(tries[0][10]).toBeLessThan(7 + 1 / .6 + 1 / .4 + 1 / .2);
    expect(tries[3][10]).toBeGreaterThan(20); expect(tries[3][10]).toBeLessThan(40);
    for (let grade = 1; grade < 4; grade++) expect(tries[grade][10], `grade ${grade + 1}`).toBeGreaterThan(tries[grade - 1][10]);
    expect(tries[3][20]).toBeGreaterThan(1_100); expect(tries[3][20]).toBeLessThan(1_500);
    // +30 is a long goal: about 15,000 tries.
    expect(tries[3][30]).toBeGreaterThan(13_000); expect(tries[3][30]).toBeLessThan(16_000);
    for (let level = 1; level <= REFINE_MAX; level++) expect(Number.isFinite(tries[3][level]), `+${level}`).toBe(true);
  });
});

describe("a try", () => {
  it("costs one grade ore, and a Starshard as well from +11", () => {
    expect(refineCost(bows.grade1, 1)).toEqual({ copper_ore: 1 });
    expect(refineCost(bows.grade2, 7)).toEqual({ iron_ore: 1 });
    expect(refineCost(bows.grade3, 10)).toEqual({ mithril_ore: 1 });
    expect(refineCost(bows.grade4, STARSHARD_FROM_LEVEL)).toEqual({ adamant_ore: 1, starshard: 1 });
    expect(refineCost("ion_helmet", REFINE_MAX)).toEqual({ adamant_ore: 1, starshard: 1 });
    expect(refineCost(bows.grade4, REFINE_MAX + 1)).toBeNull();
  });

  it("goes up a level when it works and keeps its level when it fails, never past +30", () => {
    expect(REFINE_MAX).toBe(30);
    expect(refineResultLevel(4, true)).toBe(5);
    expect(refineResultLevel(4, false)).toBe(4);
    expect(refineResultLevel(25, false)).toBe(25);
    expect(refineResultLevel(0, false)).toBe(0);
    expect(refineResultLevel(REFINE_MAX, true)).toBe(REFINE_MAX);
    expect(normalizeRefineLevel(-3)).toBe(0);
    expect(normalizeRefineLevel(7.9)).toBe(7);
    expect(normalizeRefineLevel("x")).toBe(0);
    expect(normalizeRefineLevel(99)).toBe(REFINE_MAX);
  });

  it("works when the roll lands under the chance", () => {
    // Ion Bow +4 to +5: 60%.
    expect(rollRefine(bows.grade4, 4, .599)).toEqual({ succeeded: true, level: 5 });
    expect(rollRefine(bows.grade4, 4, .6)).toEqual({ succeeded: false, level: 4 });
    // Within the safe limit any roll works.
    expect(rollRefine(bows.grade4, 3, .9999)).toEqual({ succeeded: true, level: 4 });
  });

  it("gets likelier with each fail in a row: half again after an average run, double after two", () => {
    // Ion Bow +10 to +11: 2%, an average run of 50 tries.
    expect(refineSuccessChance(bows.grade4, 11, 0, 0)).toBeCloseTo(.02, 12);
    expect(refineSuccessChance(bows.grade4, 11, 0, 1)).toBeCloseTo(.0202, 12);
    expect(refineSuccessChance(bows.grade4, 11, 0, 50)).toBeCloseTo(.03, 12);
    expect(refineSuccessChance(bows.grade4, 11, 0, 100)).toBeCloseTo(.04, 12);
    expect(refineSuccessChance(bows.grade4, 11, 0, 1e9)).toBe(1);
    expect(rollRefine(bows.grade4, 10, .035, 0, 100)).toEqual({ succeeded: true, level: 11 });
    // Safe tries and items that cannot be refined are not moved.
    expect(refineSuccessChance(bows.grade4, 3, 0, 40)).toBe(1);
    expect(refineSuccessChance("not_an_item", 11, 0, 40)).toBe(0);
  });
});

describe("what a level adds", () => {
  it("is 5% of the item's stat a level to +10 and 10% a level from there", () => {
    expect(refineMultiplier(0)).toBe(1);
    expect(refineMultiplier(1)).toBeCloseTo(1.05, 9);
    expect(refineMultiplier(10)).toBeCloseTo(1.5, 9);
    expect(refineMultiplier(11)).toBeCloseTo(1.6, 9);
    expect(refineMultiplier(20)).toBeCloseTo(2.5, 9);
    expect(refineMultiplier(30)).toBeCloseTo(3.5, 9);
    expect(refineMultiplier(35)).toBeCloseTo(3.5, 9);
  });
});
