import { describe, expect, it } from "vitest";
import { armorDamageReduction, damageAfterArmor, damageBlockedByArmor, duelDamageAfterArmor } from "./combat";

describe("server armor combat", () => {
  it("takes armor flat off an enemy's hit and credits the defender what it blocked", () => {
    expect(damageAfterArmor(100, 30)).toBe(70);
    expect(damageBlockedByArmor(100, 30)).toBe(30);
    // A hit no bigger than the armor still lands for 1.
    expect(damageAfterArmor(100, 1_000)).toBe(1);
    expect(damageBlockedByArmor(100, 1_000)).toBe(99);
    expect(armorDamageReduction(30, 100)).toBeCloseTo(.3);
  });

  it("keeps the percentage curve for duels", () => {
    expect(duelDamageAfterArmor(100, 10)).toBe(88);
    expect(duelDamageAfterArmor(100, 1_000)).toBe(50);
  });
});
