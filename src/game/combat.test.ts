import { describe, expect, it } from "vitest";
import { armorDamageReduction, damageAfterArmor, formatArmorReduction } from "./combat";

describe("armor combat rules", () => {
  it("keeps the documented armor anchors stable", () => {
    expect(armorDamageReduction(0)).toBe(0);
    expect(armorDamageReduction(10)).toBeCloseTo(.12);
    expect(armorDamageReduction(100)).toBeCloseTo(.25);
    expect(formatArmorReduction(10)).toBe("12%");
    expect(formatArmorReduction(100)).toBe("25%");
    expect(armorDamageReduction(1_000)).toBeCloseTo(.5);
    expect(armorDamageReduction(1_000_000)).toBeCloseTo(.75);
    expect(armorDamageReduction(1_000_000_000)).toBeCloseTo(.875);
    expect(armorDamageReduction(1_000_000_000_000)).toBeCloseTo(.9375);
    expect(armorDamageReduction(1e36)).toBeLessThan(1);
    expect(formatArmorReduction(1_000)).toBe("50%");
  });

  it("clamps invalid damage and preserves a minimum hit", () => {
    expect(damageAfterArmor(100, 0)).toBe(100);
    expect(damageAfterArmor(100, 10)).toBe(88);
    expect(damageAfterArmor(100, 100)).toBe(75);
    expect(damageAfterArmor(100, 1_000)).toBe(50);
    expect(damageAfterArmor(-50, 0)).toBe(1);
    expect(damageAfterArmor(1, 1_000_000_000)).toBe(1);
  });
});

it("joins each armor band continuously and keeps Block increasing", () => {
  for (const armor of [1, 10, 100, 1000]) {
    expect(armorDamageReduction(armor - .00001)).toBeCloseTo(armorDamageReduction(armor + .00001), 5);
  }
  let previous = 0;
  for (let armor = 1; armor < 10000; armor *= 1.05) {
    const reduction = armorDamageReduction(armor);
    expect(reduction).toBeGreaterThanOrEqual(previous);
    previous = reduction;
  }
  for (const armor of [-1, .5, NaN, Infinity]) expect(armorDamageReduction(armor)).toBe(0);
});
it("leaves the original formula exactly unchanged from 1,000 armor onward", () => {
  for (const armor of [1000, 1001, 2700, 10000, 1e6, 1e9, 1e36]) {
    const original = Math.min(1 - Number.EPSILON, Math.max(0, 1 - Math.pow(.5, Math.log(armor) / Math.log(1000))));
    expect(armorDamageReduction(armor)).toBe(original);
  }
});
