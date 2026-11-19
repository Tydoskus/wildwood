import { describe, expect, it } from "vitest";
import { FISH } from "./fishing";
import {
  COOKED_FISH_PROFILES,
  COOKING_RECIPES,
  NO_FOOD_BUFF,
  canCookFish,
  cookedFishId,
  cookedFishSellPrice,
  cookingReward,
  cookingStopBurnLevel,
  cookingSuccessChance,
  fishCookingLevel,
  fishForCookedId,
  foodBuffFactors,
  formatFoodBuffClock,
  formatFoodBuffSummary,
} from "./cooking";
import { computePlayerStats } from "./player-stats";

describe("cooking progression, burns, and cooked fish buffs", () => {
  it("level-locks each fish to its tier and reduces burn chance smoothly with Cooking level and Skillet", () => {
    const minnow = FISH.find(f => f.id === "minnow")!;
    const shark = FISH.find(f => f.id === "shark")!;

    expect(fishCookingLevel(minnow)).toBe(1);
    expect(canCookFish(minnow, 1)).toBe(true);
    expect(canCookFish(shark, 73)).toBe(false);
    expect(canCookFish(shark, 74)).toBe(true);

    // Freshly unlocked fish carry a real burn risk; higher levels reach 100% safe.
    const lv1Chance = cookingSuccessChance(minnow, 1, 0);
    expect(lv1Chance).toBeGreaterThan(0.5);
    expect(lv1Chance).toBeLessThan(1);
    expect(cookingSuccessChance(minnow, cookingStopBurnLevel(minnow), 0)).toBe(1);

    // Skillet boosts effective cooking level and reduces burn chance.
    expect(cookingSuccessChance(shark, 74, 5)).toBeGreaterThan(cookingSuccessChance(shark, 74, 0));
    expect(cookingSuccessChance(shark, 73, 10)).toBe(0);
  });

  it("maps all 16 fish to cooked stacks with scaling duration (5m -> 30m) and sell prices", () => {
    expect(FISH).toHaveLength(16);
    for (let i = 0; i < FISH.length; i++) {
      const fish = FISH[i];
      const cookedId = cookedFishId(fish.id);
      expect(fishForCookedId(cookedId)?.id).toBe(fish.id);
      const profile = COOKED_FISH_PROFILES[fish.id];
      expect(profile.sellPrice).toBeGreaterThan(0);
      expect(profile.durationSeconds).toBeGreaterThanOrEqual(300);
      expect(profile.durationSeconds).toBeLessThanOrEqual(1800);
      if (i > 0) {
        const prev = COOKED_FISH_PROFILES[FISH[i - 1].id];
        expect(profile.sellPrice).toBeGreaterThan(prev.sellPrice);
        expect(profile.durationSeconds).toBeGreaterThan(prev.durationSeconds);
      }
    }
    expect(COOKED_FISH_PROFILES.minnow.durationSeconds).toBe(300);
    expect(COOKED_FISH_PROFILES.golden_koi.durationSeconds).toBe(1800);
    expect(cookedFishSellPrice("golden_koi")).toBe(100);
    expect(formatFoodBuffSummary("golden_koi")).toContain("+25% All Combat Stats");
    expect(formatFoodBuffClock(125_000)).toBe("2:05");
    expect(formatFoodBuffClock(900_000)).toBe("15m");
  });

  it("applies active cooked-fish combat buffs to player stats and expires cleanly", () => {
    const now = 1_000_000;
    const active = { fishId: "shark" as const, endsAtMs: now + 60_000 };
    const factors = foodBuffFactors(active, now);
    expect(factors.damage).toBeCloseTo(1.20);
    expect(factors.maxHp).toBeCloseTo(1.18);
    expect(factors.armor).toBe(1);
    expect(factors.regen).toBe(1);
    expect(foodBuffFactors(active, now + 60_000)).toEqual(NO_FOOD_BUFF);

    const base = { maxHp: 100, damage: 50, armor: 20, regen: 5, attackInterval: 1, attackRange: 100, moveSpeed: 200 };
    const loadout = { head: "", chest: "", feet: "", rightHand: "", leftHand: "" };
    const plain = computePlayerStats({ base, loadout });
    const buffed = computePlayerStats({ base, loadout, food: factors });
    expect(buffed.damage).toBeCloseTo(plain.damage * 1.20);
    expect(buffed.maxHp).toBeCloseTo(plain.maxHp * 1.18);
    expect(buffed.armor).toBeCloseTo(plain.armor);

    // Multi-fish recipes grant extra cooked portions.
    const roast = cookingReward(FISH[0], COOKING_RECIPES[0], 0);
    const cakes = cookingReward(FISH[0], COOKING_RECIPES[1], 0);
    expect(roast.portions).toBe(1);
    expect(cakes.portions).toBe(3);
  });
});
