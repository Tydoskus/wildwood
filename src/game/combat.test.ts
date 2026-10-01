import { describe, expect, it } from "vitest";
import { formatCompactNumber } from "../ui/number-format";
import { damageAfterArmor, formatArmorReduction } from "./combat";
import { armorDamageReduction, duelDamageAfterArmor, hitLandingAfterArmor, percentArmorReduction } from "../../shared/combat";

describe("armor against enemies is flat", () => {
  it("takes the armor's own value off every hit, down to 1", () => {
    expect(damageAfterArmor(100, 0)).toBe(100);
    expect(damageAfterArmor(100, 30)).toBe(70);
    expect(damageAfterArmor(100, 99)).toBe(1);
    expect(damageAfterArmor(100, 1_000)).toBe(1);
    expect(damageAfterArmor(-50, 0)).toBe(1);
    expect(damageAfterArmor(1e15, 2e14)).toBe(8e14);
    expect(damageAfterArmor(100, NaN)).toBe(100);
  });

  it("stops a share of a hit that depends on the hit's size", () => {
    expect(armorDamageReduction(30, 100)).toBeCloseTo(.3);
    expect(armorDamageReduction(30, 1_000)).toBeCloseTo(.03);
    expect(armorDamageReduction(1_000, 100)).toBeCloseTo(.99);
    expect(armorDamageReduction(30, 0)).toBe(0);
    // Authoring's inverse: the raw hit that lands a target.
    expect(damageAfterArmor(hitLandingAfterArmor(75, 25), 25)).toBe(75);
  });

  it("names on the profile how much it takes off a hit", () => {
    expect(formatArmorReduction(25)).toBe("blocks 25 a hit");
    expect(formatArmorReduction(1_250_000)).toBe(`blocks ${formatCompactNumber(1_250_000)} a hit`);
  });
});

describe("duels keep the percentage curve", () => {
  it("keeps the documented anchors", () => {
    expect(percentArmorReduction(0)).toBe(0);
    expect(percentArmorReduction(10)).toBeCloseTo(.12);
    expect(percentArmorReduction(100)).toBeCloseTo(.25);
    expect(percentArmorReduction(1_000)).toBeCloseTo(.5);
    expect(percentArmorReduction(1_000_000)).toBeCloseTo(.75);
    expect(percentArmorReduction(1e36)).toBeLessThan(1);
    expect(duelDamageAfterArmor(100, 10)).toBe(88);
    expect(duelDamageAfterArmor(100, 1_000)).toBe(50);
    expect(duelDamageAfterArmor(1, 1_000_000_000)).toBe(1);
  });

  it("joins each band continuously and only ever blocks more", () => {
    for (const armor of [1, 10, 100, 1000]) expect(percentArmorReduction(armor - .00001)).toBeCloseTo(percentArmorReduction(armor + .00001), 5);
    let previous = 0;
    for (let armor = 1; armor < 10000; armor *= 1.05) { expect(percentArmorReduction(armor)).toBeGreaterThanOrEqual(previous); previous = percentArmorReduction(armor); }
    for (const armor of [-1, .5, NaN, Infinity]) expect(percentArmorReduction(armor)).toBe(0);
    for (const armor of [1000, 2700, 1e9, 1e36]) {
      expect(percentArmorReduction(armor)).toBe(Math.min(1 - Number.EPSILON, Math.max(0, 1 - Math.pow(.5, Math.log(armor) / Math.log(1000)))));
    }
  });
});
