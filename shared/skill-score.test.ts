import { describe, expect, it } from "vitest";
import {
  ARROW_STORM_SCORE_WEIGHT, PIERCING_SHOT_SCORE_WEIGHT, RICOCHET_SCORE_WEIGHT,
  bowSkillScore, bowSkillScoreLine, formatBowSkillScore,
} from "./bow-skills";
import { equipComparisonPower, isEquipUpgrade, withItemEquipped, type EquipLoadout } from "./equip-best";
import { effectivePlayerPower } from "./player-power";
import { BLACK_BOOTS, IRON_BOW, SNOW_BOW, STARTER_STONE } from "./items";

describe("bow skill score", () => {
  it("weighs each skill by the damage one trigger adds", () => {
    expect(ARROW_STORM_SCORE_WEIGHT).toBe(2.5); // five arrows at half damage
    expect(PIERCING_SHOT_SCORE_WEIGHT).toBe(2); // two enemies behind the first
    expect(RICOCHET_SCORE_WEIGHT).toBeCloseTo(1.2); // two bounces at 60%
    expect(bowSkillScore({ arrowStorm: 3, ricochet: 0, piercingShot: 0 })).toBe(7.5);
    expect(bowSkillScore({ arrowStorm: 0, ricochet: 0, piercingShot: 4 })).toBe(8);
    expect(bowSkillScore({ arrowStorm: 0, ricochet: 5, piercingShot: 0 })).toBe(6);
    expect(bowSkillScore({ arrowStorm: 2, ricochet: 1, piercingShot: 2.5 })).toBe(11.2);
  });

  it("scores no roll, an empty one or a malformed one as 0", () => {
    expect(bowSkillScore(null)).toBe(0);
    expect(bowSkillScore(undefined)).toBe(0);
    expect(bowSkillScore({ arrowStorm: 0, ricochet: 0, piercingShot: 0 })).toBe(0);
    expect(bowSkillScore({ arrowStorm: Number.NaN })).toBe(0);
  });

  it("never lets two rolls worth the same differ by floating-point noise", () => {
    expect(bowSkillScore({ arrowStorm: 2, ricochet: 0, piercingShot: 0 }))
      .toBe(bowSkillScore({ arrowStorm: 0, ricochet: 0, piercingShot: 2.5 }));
  });

  it("is written with its sign and one decimal", () => {
    expect(formatBowSkillScore(7.5)).toBe("+7.5%");
    expect(formatBowSkillScore(4.75)).toBe("+4.8%");
    expect(formatBowSkillScore(0)).toBe("+0.0%");
    expect(formatBowSkillScore(Number.NaN)).toBe("+0.0%");
    expect(bowSkillScoreLine({ arrowStorm: 3, ricochet: 0, piercingShot: 0 })).toBe("Skills: +7.5% dmg");
    expect(bowSkillScoreLine(null)).toBe("Skills: +0.0% dmg");
  });
});

describe("equip comparison", () => {
  const stats = { maxHp: 1000, damage: 100, attackRate: .38, armor: 50, regen: 10 };
  const loadout = (extra: Partial<EquipLoadout> = {}) => ({
    ...stats, equippedHead: "", equippedChest: "", equippedFeet: "", equippedRightHand: IRON_BOW, equippedLeftHand: "", ...extra,
  });

  it("is the displayed power before rounding when no bow skills are given", () => {
    expect(Math.round(equipComparisonPower(loadout()))).toBe(effectivePlayerPower(loadout()));
  });

  it("multiplies the weapon's skill score into its damage", () => {
    const plain = equipComparisonPower(loadout());
    const skilled = equipComparisonPower(loadout(), null, undefined, () => ({ arrowStorm: 4, ricochet: 0, piercingShot: 0 }));
    const damage = equipComparisonPower({ ...loadout(), maxHp: 0, armor: 0, regen: 0 });
    expect(skilled - plain).toBeCloseTo(damage * .1);
  });

  it("puts on only what beats the slot, and a weapon into the right hand", () => {
    const power = (candidate: ReturnType<typeof loadout>) => equipComparisonPower(candidate);
    expect(isEquipUpgrade(loadout({ equippedRightHand: STARTER_STONE }), SNOW_BOW, power)).toBe(true);
    expect(isEquipUpgrade(loadout({ equippedRightHand: SNOW_BOW }), STARTER_STONE, power)).toBe(false);
    expect(isEquipUpgrade(loadout({ equippedRightHand: SNOW_BOW }), SNOW_BOW, power)).toBe(false);
    // Boots add no power; Black Boots' speed is what counts, and an empty slot is filled.
    expect(isEquipUpgrade(loadout(), BLACK_BOOTS, power)).toBe(true);
    expect(withItemEquipped(loadout({ equippedRightHand: "", equippedLeftHand: IRON_BOW }), SNOW_BOW))
      .toMatchObject({ equippedRightHand: SNOW_BOW, equippedLeftHand: "" });
  });
});
