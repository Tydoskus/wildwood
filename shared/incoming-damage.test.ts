import { describe, expect, it } from "vitest";
import { armorDamageReduction, damageAfterArmor } from "./combat";
import { lateMapDamageProfile, lateMapMinimumHitDamage, lateMapReferenceBuild } from "./incoming-damage";

describe("health-and-armor damage ladder", () => {
  it("keeps an 8% minimum hit as health and armor grow, including future tiers", () => {
    // Direct formula checks, not a campaign or balance simulation.
    for (const tier of [0, 1, 2, 3, 4, 5]) {
      const build = lateMapReferenceBuild(tier);
      const raw = lateMapMinimumHitDamage(tier);
      expect(damageAfterArmor(raw, build.armor) / build.maxHp).toBeCloseTo(.08, 8);
      expect(raw).toBeGreaterThan(build.maxHp * .08);
      if (tier > 0) expect(raw / lateMapMinimumHitDamage(tier - 1)).toBeCloseTo(10.5361008127, 8);
    }
  });

  it("calibrates Crystal Hollows to 80b against 1t health and about 90% armor", () => {
    const build = lateMapReferenceBuild(3);
    expect(build.maxHp).toBe(1e12);
    expect(armorDamageReduction(build.armor)).toBeCloseTo(.9, 2);
    expect(damageAfterArmor(lateMapMinimumHitDamage(3), build.armor)).toBe(80e9);
  });

  it("normalizes authored hit ratios without mutating them", () => {
    const shape = { light: 10, heavy: 15 };
    const damage = lateMapDamageProfile("crystal_hollows", shape);
    expect(shape).toEqual({ light: 10, heavy: 15 });
    expect(damage.heavy / damage.light).toBeCloseTo(1.5);
    expect(damage.light).toBe(lateMapMinimumHitDamage(3));
  });

  it("leaves grinding and extra armor useful against a fixed enemy", () => {
    const build = lateMapReferenceBuild(3);
    const raw = lateMapMinimumHitDamage(3);
    const hit = damageAfterArmor(raw, build.armor);
    expect(damageAfterArmor(raw, build.armor * 1_000) / hit).toBeCloseTo(.5);
    expect(hit / (build.maxHp * 2)).toBeCloseTo(.04);
  });

  it("rejects invalid authoring inputs", () => {
    for (const tier of [-1, .5, NaN, Infinity]) expect(() => lateMapReferenceBuild(tier)).toThrow(RangeError);
    for (const damage of [0, -1, NaN, Infinity]) {
      expect(() => lateMapDamageProfile("moonfen", { hit: damage })).toThrow(RangeError);
    }
  });
});
