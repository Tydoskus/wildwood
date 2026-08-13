import { describe, expect, it } from "vitest";
import { armorDamageReduction, damageAfterArmor, formatArmorReduction } from "./combat";

describe("armor combat rules", () => {
  it("keeps the documented armor anchors stable", () => {
    expect(armorDamageReduction(0)).toBe(0);
    expect(armorDamageReduction(1_000)).toBeCloseTo(.09);
    expect(armorDamageReduction(1_000_000)).toBeCloseTo(.9);
    expect(formatArmorReduction(1_000)).toBe("9%");
  });

  it("clamps invalid damage and preserves a minimum hit", () => {
    expect(damageAfterArmor(100, 0)).toBe(100);
    expect(damageAfterArmor(100, 1_000)).toBe(91);
    expect(damageAfterArmor(-50, 0)).toBe(1);
    expect(damageAfterArmor(1, 1_000_000_000)).toBe(1);
  });
});
