import { describe, expect, it } from "vitest";
import { damageAfterArmor, damageBlockedByArmor } from "./combat";

describe("server armor combat", () => {
  it("credits blocked damage to the defender whose armor reduced the hit", () => {
    const attackerDamage = 100;
    const defenderArmor = 1_000;

    expect(damageAfterArmor(attackerDamage, defenderArmor)).toBe(91);
    expect(damageBlockedByArmor(attackerDamage, defenderArmor)).toBe(9);
  });
});
