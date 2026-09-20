import { expect, it } from "vitest";
import { PRESTIGE_PERK_MAX_RANK, prestigeCriticalDamageBonus, prestigePerkValue, prestigeSwingMultiplier } from "../../shared/prestige-perks";

/**
 * Perks are only a strategy choice if they are worth comparable amounts. These
 * pin the expected damage each one is worth at its highest rank, so a future
 * tuning pass has to face what it is changing rather than drift silently.
 */
const MAX = PRESTIGE_PERK_MAX_RANK;
const keenEdgeGain = (researchCriticalDamageRank: number) => {
  const ranks = { keenEdge: MAX };
  const multiplier = 1.05 + researchCriticalDamageRank * .05 + prestigeCriticalDamageBonus(ranks);
  return prestigePerkValue(ranks, "keenEdge") * (multiplier - 1);
};

it("makes Keen Edge worth carrying without any critical research behind it", () => {
  // Chance alone paid under one percent, because an unresearched critical is
  // only 1.05x. With its own critical damage it lands near Double Strike.
  expect(keenEdgeGain(0)).toBeGreaterThan(.1);
  expect(keenEdgeGain(0)).toBeLessThan(prestigeSwingMultiplier({ doubleStrike: MAX }) - 1 + .02);
});

it("still pays a crit build far more, so the research stays worth doing", () => {
  expect(keenEdgeGain(20)).toBeGreaterThan(keenEdgeGain(0) * 2);
});

it("keeps Double Strike the flat, unconditional option", () => {
  expect(prestigeSwingMultiplier({ doubleStrike: MAX })).toBeCloseTo(1.2);
  expect(prestigeSwingMultiplier({ keenEdge: MAX })).toBe(1);
});
