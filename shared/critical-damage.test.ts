import { describe, expect, it } from "vitest";
import {
  CRIT_CAP_CEILING, criticalDamage, criticalDamageMultiplier, critCapForRank, soulCritDamageCeiling, trimSoulCritDamage,
} from "./critical-damage";
import { RESEARCH_DEFINITIONS } from "./research";

describe("critical damage", () => {
  it("adds research, Keen Edge and the soul onto 1.05×, as before", () => {
    expect(criticalDamageMultiplier({})).toBeCloseTo(1.05);
    expect(criticalDamageMultiplier({ researchRank: 3, perks: { keenEdge: 5 }, soul: .1 })).toBeCloseTo(1.05 + .15 + .6 + .1);
  });

  it("caps at 50×, 10× more a Crit Cap rank, up to 100× at the fifth", () => {
    expect([0, 1, 2, 3, 4, 5].map(critCapForRank)).toEqual([50, 60, 70, 80, 90, 100]);
    expect(critCapForRank(9)).toBe(100);
    expect(critCapForRank(-1)).toBe(50);
    expect(critCapForRank(Number.NaN)).toBe(50);
    expect(CRIT_CAP_CEILING).toBe(100);
    expect(criticalDamageMultiplier({ soul: 200 })).toBe(50);
    expect(criticalDamageMultiplier({ soul: 200, capRank: 2 })).toBe(70);
    expect(criticalDamageMultiplier({ soul: 200, capRank: 5 })).toBe(100);
    expect(criticalDamage({ soul: 60, capRank: 1 })).toMatchObject({ multiplier: 60, uncapped: 61.05, cap: 60, capped: true });
    expect(criticalDamage({ soul: 10 })).toMatchObject({ capped: false });
  });

  it("never lets research and Keen Edge alone near the cap", () => {
    const most = criticalDamage({ researchRank: RESEARCH_DEFINITIONS.criticalDamage.maxRank, perks: { keenEdge: 5 } });
    expect(most.uncapped).toBeCloseTo(2.65);
    expect(criticalDamage({ researchRank: 1e6 }).research).toBeCloseTo(1);
  });

  it("trims stored soul critical damage to what brings the total to exactly 100×, and keeps anything under it", () => {
    const parts = { researchRank: 20, perks: { keenEdge: 5 } };
    expect(soulCritDamageCeiling(parts)).toBeCloseTo(100 - 2.65);
    expect(trimSoulCritDamage(500, parts)).toBeCloseTo(97.35);
    expect(1.05 + 1 + .6 + trimSoulCritDamage(500, parts)).toBeCloseTo(100);
    expect(trimSoulCritDamage(60, parts)).toBe(60);
    expect(trimSoulCritDamage(97, {})).toBe(97);
    expect(trimSoulCritDamage(99, {})).toBeCloseTo(98.95);
    expect(trimSoulCritDamage(-1, {})).toBe(0);
  });
});
