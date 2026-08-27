import { describe, expect, it } from "vitest";
import { FROST_ARMOR, STARTER_BOW, WOOD_FULL_HELM, WOODEN_ARMOR } from "./items";
import { effectivePlayerPower, effectivePlayerPowerStats, legacyU32Power, playerPowerForStats } from "./player-power";
import { MIN_ATTACK_INTERVAL } from "./rules";

describe("player power", () => {
  it("uses the same research and equipped-item stats everywhere", () => {
    const progress = {
      maxHp: 100,
      damage: 100,
      attackRate: 1.56,
      armor: 10,
      regen: 2,
      equippedChest: WOODEN_ARMOR,
      equippedRightHand: STARTER_BOW,
      equippedLeftHand: "",
    };
    const research = { warcraft: 2, precision: 3, regeneration: 4 };
    const effective = effectivePlayerPowerStats(progress, research);

    expect(effective.maxHp).toBeCloseTo(105);
    expect(effective.damage).toBeCloseTo(109);
    expect(effective.attackRate).toBeCloseTo(1.56);
    expect(effective.armor).toBeCloseTo(10.6);
    expect(effective.regen).toBeCloseTo(2.16);
    expect(effectivePlayerPower(progress, research)).toBe(playerPowerForStats(effective));
  });

  it("continues above the legacy u32 ceiling", () => {
    const power = playerPowerForStats({
      maxHp: 5_000_000_000,
      damage: 2_000_000_000,
      attackRate: 1,
      armor: 1_000_000_000,
      regen: 100_000_000,
    });
    expect(power).toBeGreaterThan(0xffffffff);
    expect(legacyU32Power(power)).toBe(0xffffffff);
  });

  it("never reports a legacy saved attack rate above the current base-speed cap", () => {
    const effective = effectivePlayerPowerStats({
      maxHp: 100,
      damage: 10,
      attackRate: .32,
      armor: 0,
      regen: 0,
    });
    expect(effective.attackRate).toBeCloseTo(MIN_ATTACK_INTERVAL);
  });

  it("adds equipped head and chest health bonuses", () => {
    const effective = effectivePlayerPowerStats({
      maxHp: 100,
      damage: 10,
      attackRate: 1.56,
      armor: 0,
      regen: 0,
      equippedHead: WOOD_FULL_HELM,
      equippedChest: FROST_ARMOR,
    });
    expect(effective.maxHp).toBeCloseTo(225);
  });

  it("bounds malformed totals", () => {
    expect(playerPowerForStats({ maxHp: Number.NaN, damage: 0, attackRate: 1, armor: 0, regen: 0 })).toBe(0);
  });
});
