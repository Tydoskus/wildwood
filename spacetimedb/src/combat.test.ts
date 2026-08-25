import { describe, expect, it } from "vitest";
import { armorDamageReduction, damageAfterArmor, damageBlockedByArmor } from "./combat";

describe("server armor combat", () => {
  it("credits blocked damage to the defender whose armor reduced the hit", () => {
    const attackerDamage = 100;
    const defenderArmor = 1_000;

    expect(damageAfterArmor(attackerDamage, defenderArmor)).toBe(50);
    expect(damageBlockedByArmor(attackerDamage, defenderArmor)).toBe(50);
  });

  it("halves remaining damage at every 1,000x armor tier", () => {
    expect(armorDamageReduction(1_000)).toBeCloseTo(.5);
    expect(armorDamageReduction(1_000_000)).toBeCloseTo(.75);
    expect(armorDamageReduction(1_000_000_000)).toBeCloseTo(.875);
    expect(armorDamageReduction(1_000_000_000_000)).toBeCloseTo(.9375);
  });
});
