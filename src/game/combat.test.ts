import { describe, expect, it } from "vitest";
import { armorDamageReduction, damageAfterArmor, formatArmorReduction } from "./combat";

describe("armor combat rules", () => {
  it("keeps the documented armor anchors stable", () => {
    expect(armorDamageReduction(0)).toBe(0);
    expect(armorDamageReduction(1_000)).toBeCloseTo(.5);
    expect(armorDamageReduction(1_000_000)).toBeCloseTo(.75);
    expect(armorDamageReduction(1_000_000_000)).toBeCloseTo(.875);
    expect(armorDamageReduction(1_000_000_000_000)).toBeCloseTo(.9375);
    expect(armorDamageReduction(1e36)).toBeLessThan(1);
    expect(formatArmorReduction(1_000)).toBe("50%");
  });

  it("clamps invalid damage and preserves a minimum hit", () => {
    expect(damageAfterArmor(100, 0)).toBe(100);
    expect(damageAfterArmor(100, 1_000)).toBe(50);
    expect(damageAfterArmor(-50, 0)).toBe(1);
    expect(damageAfterArmor(1, 1_000_000_000)).toBe(1);
  });
});
