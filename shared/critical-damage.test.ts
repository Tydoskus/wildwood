import { describe, expect, it } from "vitest";
import { CRIT_CAP_CEILING, criticalDamage, criticalDamageMultiplier, critCapForRank } from "./critical-damage";
import { RESEARCH_DEFINITIONS } from "./research";
import { RATING_MAX, critDamageForLevels, ratingForLevels } from "./stat-rating";

describe("critical damage", () => {
  it("is research and Keen Edge's old bonus from nothing, and a rating's level on the curve", () => {
    expect(criticalDamageMultiplier({})).toBeCloseTo(1.05);
    expect(criticalDamageMultiplier({ researchRank: 3, perks: { keenEdge: 5 } })).toBeCloseTo(1.05 + .15 + .6);
    // One level (100 rating): 3% of the way to 100x.
    expect(criticalDamageMultiplier({ rating: 100 })).toBeCloseTo(critDamageForLevels(1));
    // The soul's rating adds to the run's.
    expect(criticalDamageMultiplier({ rating: 50, soul: 50 })).toBeCloseTo(criticalDamageMultiplier({ rating: 100 }));
  });

  it("caps at 50×, 10× more a Crit Cap rank, up to 100× at the fifth", () => {
    expect([0, 1, 2, 3, 4, 5].map(critCapForRank)).toEqual([50, 60, 70, 80, 90, 100]);
    expect(critCapForRank(9)).toBe(100);
    expect(critCapForRank(-1)).toBe(50);
    expect(critCapForRank(Number.NaN)).toBe(50);
    expect(CRIT_CAP_CEILING).toBe(100);
    expect(criticalDamageMultiplier({ soul: RATING_MAX })).toBe(50);
    expect(criticalDamageMultiplier({ soul: RATING_MAX, capRank: 2 })).toBe(70);
    expect(criticalDamageMultiplier({ soul: RATING_MAX, capRank: 5 })).toBeLessThanOrEqual(100);
    expect(criticalDamage({ rating: ratingForLevels(60), capRank: 1 })).toMatchObject({ multiplier: 60, cap: 60, capped: true });
    expect(criticalDamage({ rating: ratingForLevels(10) })).toMatchObject({ capped: false });
  });

  it("never lets research and Keen Edge alone near the cap", () => {
    const most = criticalDamage({ researchRank: RESEARCH_DEFINITIONS.criticalDamage.maxRank, perks: { keenEdge: 5 } });
    expect(most.uncapped).toBeCloseTo(2.65);
    expect(criticalDamage({ researchRank: 1e6 }).research).toBeCloseTo(1);
  });

  it("splits the multiplier into the rating's, the soul's and research's shares", () => {
    const crit = criticalDamage({ rating: ratingForLevels(5), soul: ratingForLevels(6) - ratingForLevels(5), researchRank: 20 });
    expect(crit.fromRating).toBeCloseTo(critDamageForLevels(5) - 1.05);
    expect(crit.fromRating + crit.fromSoul).toBeCloseTo(critDamageForLevels(6) - 1.05);
    expect(1.05 + crit.fromRating + crit.fromSoul + crit.fromBonuses).toBeCloseTo(crit.uncapped);
  });
});
