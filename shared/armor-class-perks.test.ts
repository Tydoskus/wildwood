import { describe, expect, it } from "vitest";
import {
  armorClassPerkLine, armorClassSetLine, armorMoveSpeedAllowance, armorMoveSpeedFactor, armorSkillChanceFactor,
} from "./armor-class-perks";
import { ARMOR_CLASSES, type ArmorClass } from "./gear-grades";
import { gradeItemId } from "./grade-equipment";
import {
  ITEM_DEFINITIONS, classSetActive, classSetDamageMultiplier, equipmentDamage, equipmentDamageMultiplierBonus, itemDefinition,
} from "./items";
import { effectivePlayerPowerStats } from "./player-power";
import { duelSkillsWithProficiency, rollWithProficiency, weaponSchool } from "./weapon-mastery";

const helmet = (armorClass: ArmorClass) => gradeItemId("helmet", "epic", armorClass);
const armor = (armorClass: ArmorClass) => gradeItemId("armor", "epic", armorClass);

describe("armor class perks", () => {
  it("adds up move speed a piece: Light +3%, Heavy -4%, the others nothing", () => {
    expect(armorMoveSpeedFactor(helmet("light"), armor("light"))).toBeCloseTo(1.06);
    expect(armorMoveSpeedFactor("", armor("light"))).toBeCloseTo(1.03);
    expect(armorMoveSpeedFactor(helmet("heavy"), armor("heavy"))).toBeCloseTo(.92);
    expect(armorMoveSpeedFactor(helmet("light"), armor("heavy"))).toBeCloseTo(.99);
    expect(armorMoveSpeedFactor(helmet("medium"), armor("magic"))).toBe(1);
    expect(armorMoveSpeedFactor("wood_full_helm", "wooden_armor")).toBe(1);
  });

  it("lets the server allow Light's speed but never enforce Heavy's slowdown", () => {
    expect(armorMoveSpeedAllowance(helmet("light"), armor("light"))).toBeCloseTo(1.06);
    expect(armorMoveSpeedAllowance(helmet("heavy"), armor("heavy"))).toBe(1);
    expect(armorMoveSpeedAllowance(helmet("light"), armor("heavy"))).toBe(1);
  });

  it("raises skill chances 3% of themselves a Magic piece, on top of Skill Proficiency", () => {
    expect(armorSkillChanceFactor(helmet("magic"), armor("magic"))).toBeCloseTo(1.06);
    expect(armorSkillChanceFactor(helmet("magic"), armor("light"))).toBeCloseTo(1.03);
    expect(armorSkillChanceFactor(helmet("heavy"), "")).toBe(1);
    expect(rollWithProficiency({ meteor: 10 }, 10, 1.06).meteor).toBeCloseTo(10 * 1.1 * 1.06);
    const fields = duelSkillsWithProficiency({ challengerMeteor: 10, opponentMeteor: 10 }, 0, 0, 1.06, 1);
    expect(fields.challengerMeteor).toBeCloseTo(10.6);
    expect(fields.opponentMeteor).toBe(10);
  });
});

describe("class set", () => {
  it("is on with both pieces of the class whose school is the weapon's", () => {
    expect(classSetActive("common_bow", helmet("light"), armor("light"))).toBe(true);
    expect(classSetActive("common_sword", helmet("medium"), armor("medium"))).toBe(true);
    expect(classSetActive("common_staff", helmet("magic"), armor("magic"))).toBe(true);
    expect(classSetDamageMultiplier("common_bow", helmet("light"), armor("light"))).toBeCloseTo(1.05);
  });

  it("is off with a mismatched weapon or class, a missing piece, or Heavy", () => {
    expect(classSetActive("common_sword", helmet("light"), armor("light"))).toBe(false);
    expect(classSetActive("common_bow", helmet("light"), armor("medium"))).toBe(false);
    expect(classSetActive("common_bow", helmet("light"), "")).toBe(false);
    expect(classSetActive("common_bow", "", armor("light"))).toBe(false);
    for (const weapon of ["common_bow", "common_sword", "common_staff"]) {
      expect(classSetActive(weapon, helmet("heavy"), armor("heavy"))).toBe(false);
    }
    expect(classSetDamageMultiplier("common_sword", helmet("light"), armor("light"))).toBe(1);
  });

  it("reads every weapon's school as weapon-mastery.ts does", () => {
    const schools: Record<string, ArmorClass> = { archery: "light", swordplay: "medium", sorcery: "magic" };
    for (const itemId of ["", ...Object.keys(ITEM_DEFINITIONS)]) {
      if (itemId && !itemDefinition(itemId)?.weapon) continue;
      for (const armorClass of ARMOR_CLASSES) {
        expect(classSetActive(itemId, helmet(armorClass), armor(armorClass)), `${itemId} ${armorClass}`)
          .toBe(schools[weaponSchool(itemId || undefined)] === armorClass);
      }
    }
  });

  it("multiplies the gear's damage and the power stats", () => {
    const bonus = 1 + equipmentDamageMultiplierBonus("common_bow", helmet("light"), armor("light"));
    expect(equipmentDamage(10, "common_bow", helmet("light"), armor("light"), 1.2)).toBeCloseTo(10 * bonus * 1.05 * 1.2);
    expect(equipmentDamage(10, "common_bow", helmet("magic"), armor("magic"), 1.2)).toBeCloseTo(10 * bonus * 1.2);
    const power = (head: string, chest: string) => effectivePlayerPowerStats({ maxHp: 100, damage: 10, attackRate: 1, armor: 0, regen: 1,
      equippedRightHand: "common_bow", equippedLeftHand: "", equippedHead: head, equippedChest: chest } as never).damage;
    expect(power(helmet("light"), armor("light")) / power(helmet("magic"), armor("magic"))).toBeCloseTo(1.05);
  });
});

describe("class lines", () => {
  it("names each class's perk and its set, in Title Case", () => {
    expect(armorClassPerkLine(helmet("light"))).toBe("Light: +3% Move Speed");
    expect(armorClassPerkLine(armor("heavy"))).toBe("Heavy: -4% Move Speed");
    expect(armorClassPerkLine(armor("magic"))).toBe("Magic: +3% Skill Chance");
    expect(armorClassPerkLine(armor("medium"))).toBeNull();
    expect(armorClassPerkLine("common_bow")).toBeNull();
    expect(armorClassSetLine(helmet("light"))).toBe("Set: Light Helmet + Armor + Bow · ×1.05 Damage");
    expect(armorClassSetLine(armor("heavy"))).toBeNull();
    expect(armorClassSetLine(helmet("medium"), { weapon: "common_sword", head: helmet("medium"), chest: armor("medium") }))
      .toBe("Set: Medium Helmet + Armor + Sword · ×1.05 Damage · Active");
    expect(armorClassSetLine(helmet("magic"), { weapon: "common_staff", head: helmet("magic"), chest: "" }))
      .toBe("Set: Magic Helmet + Armor + Staff · ×1.05 Damage · Inactive");
  });
});
