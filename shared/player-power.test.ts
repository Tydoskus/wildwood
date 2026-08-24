import { describe, expect, it } from "vitest";
import { STARTER_BOW, WOODEN_ARMOR } from "./items";
import { effectivePlayerPower, effectivePlayerPowerStats, legacyU32Power, playerPowerForStats } from "./player-power";

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
    expect(effective.attackRate).toBeCloseTo(1.56 / 1.05);
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

  it("bounds malformed totals", () => {
    expect(playerPowerForStats({ maxHp: Number.NaN, damage: 0, attackRate: 1, armor: 0, regen: 0 })).toBe(0);
  });
});
