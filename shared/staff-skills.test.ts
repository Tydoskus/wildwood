import { expect, it } from "vitest";
import { BOW_ATTACK_SPEED_BONUS } from "./bow-skills";
import { equipmentStatDefinition } from "./equipment-budget";
import { itemDefinition, STARTER_STAFF } from "./items";
import {
  STAFF_BOLT_DAMAGE_FACTOR, STAFF_CAST_INTERVAL_FACTOR, STAFF_DPS_FACTOR, STAFF_SINGLE_TARGET_SHARE, STAFF_SPLASH_MAX_TARGETS,
  isSkillStaff, isStaff, rollBoltSkillProcs, rollStaffSkills, staffSkillBossDamageMultiplier, staffSkillChance, staffSkillLines,
  staffSkillReachMultiplier, weaponAttackInterval, weaponHitFactor,
} from "./staff-skills";
import { mergeSkillRolls, rollWeaponSkills, weaponSkillColumns, weaponSkillLines, weaponSkillRollOf, weaponSkillScore } from "./weapon-skills";

it("rolls staff copies in their tier's range, like bows and swords, and gives the Starter Staff none", () => {
  expect(rollStaffSkills("forest_staff", () => 0)).toEqual({ meteor: 1, chain: 1, frostNova: 1 });
  let draw = 0;
  expect(rollStaffSkills("ion_staff", () => draw++ % 2 ? .999 : 0)).toEqual({ meteor: 15, chain: 15, frostNova: 15 });
  expect(rollStaffSkills("ion_staff", () => .999)).toEqual({ meteor: 0, chain: 0, frostNova: 0 });
  expect(rollWeaponSkills("ion_staff", () => 0)).toEqual({ meteor: 7, chain: 7, frostNova: 7 });
  expect(rollStaffSkills("ion_bow", () => 0)).toBeNull();
  expect(isStaff(STARTER_STAFF)).toBe(true);
  expect(isSkillStaff(STARTER_STAFF)).toBe(false);
  expect(isSkillStaff("ion_sword")).toBe(false);
});

it("shows, scores, merges and bounds staff rolls in percentages", () => {
  const roll = { meteor: 10, chain: 10, frostNova: 10 };
  expect(staffSkillLines(roll)).toEqual(["Meteor 10.0%", "Chain 10.0%", "Frost Nova 10.0%"]);
  expect(weaponSkillLines("ion_staff", roll)).toEqual(["Meteor 10.0%", "Chain 10.0%", "Frost Nova 10.0%"]);
  // A meteor finds two enemies at twice a bolt, a chain three jumps at .6, a nova counts as one bolt.
  expect(weaponSkillScore("ion_staff", roll)).toBeCloseTo(10 * (2 * 2 + 3 * .6 + 1));
  expect(weaponSkillScore("ion_bow", roll)).toBe(0);
  expect(staffSkillBossDamageMultiplier(roll)).toBeCloseTo(1.2);
  expect(staffSkillReachMultiplier({})).toBe(STAFF_SPLASH_MAX_TARGETS);
  expect(staffSkillReachMultiplier(roll)).toBeCloseTo(STAFF_SPLASH_MAX_TARGETS + .1 * 3 + .1 * 10 * 2);
  expect(staffSkillChance({ chain: NaN }, "chain")).toBe(0);
  expect(mergeSkillRolls("ion_staff", { meteor: 2, chain: 9, frostNova: 0 }, { meteor: 5, chain: 1, frostNova: 3 }))
    .toEqual({ meteor: 5, chain: 9, frostNova: 3 });
  expect(mergeSkillRolls("ion_staff", roll, { meteor: 1, chain: 1, frostNova: 1 })).toBeNull();
  // Staff rolls never become columns on the copy and offer rows.
  expect(weaponSkillColumns(roll)).toEqual({ arrowStorm: 0, ricochet: 0, piercingShot: 0, whirlwind: 0, deflect: 0, shockwave: 0 });
  expect(weaponSkillRollOf({ itemId: "ion_staff", ...roll })).toEqual(roll);
  const procs = rollBoltSkillProcs({ chain: 50, frostNova: 0 }, () => .3);
  expect(procs).toEqual({ chain: true, frostNova: false });
});

it("puts a staff's one-target damage a second at three quarters of its tier's bow", () => {
  expect(STAFF_BOLT_DAMAGE_FACTOR).toBeCloseTo(STAFF_SINGLE_TARGET_SHARE * STAFF_CAST_INTERVAL_FACTOR);
  expect(STAFF_DPS_FACTOR).toBeCloseTo(.75);
  expect(weaponAttackInterval("ion_staff", .5)).toBeCloseTo(.5 * 1.35);
  // A bow shoots faster than the player's own interval (bow-skills.ts); a staff's share is of the bow before that.
  expect(weaponAttackInterval("ion_bow", .5)).toBeCloseTo(.5 / (1 + BOW_ATTACK_SPEED_BONUS));
  expect(weaponHitFactor("ion_sword")).toBe(1);
  for (const [id, tier] of [["forest_staff", 1], ["lava_staff", 4], ["ion_staff", 15]] as const) {
    const bow = 1 + equipmentStatDefinition(tier, "HAND").weapon!.damageMultiplierBonus!;
    const staff = 1 + itemDefinition(id)!.weapon!.damageMultiplierBonus!;
    // Damage a second against one target, attack interval 1: the bow's hit each second, the bolt's each 1.35 s.
    expect(staff * weaponHitFactor(id) / weaponAttackInterval(id, 1) / bow).toBeCloseTo(.75, 6);
  }
});
