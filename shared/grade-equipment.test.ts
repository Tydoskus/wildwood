import { describe, expect, it } from "vitest";
import { SWORD_DAMAGE_FACTOR, SWORD_REACH } from "./campaign-equipment";
import {
  ARMOR_CLASSES, BOOT_MOVE_SPEED_PERCENT, BOOT_SKILL_CHANCE_PERCENT, BOOT_STYLES, GEAR_GRADES, GRADE_BONUS_PERCENT, GRADE_ITEM_TIER, GRADE_ROLL_RANGE, armorBonusPercent,
} from "./gear-grades";
import {
  GRADE_ARMOR_KINDS, GRADE_EQUIPMENT_IDS, GRADE_WEAPON_KINDS, armorClassOf, bootStyleOf, gradeEquipmentKindOf, gradeItemId, gradeOf,
} from "./grade-equipment";
import { EQUIPMENT_DROP_ITEM_IDS, canonicalItemId, itemDefinition } from "./items";
import { itemTier } from "./item-tier";
import { MAP_IDS } from "./rules";
import { regularMapLoot } from "./regular-map-loot";


describe("graded gear", () => {
  it("has a bow, sword, staff and dagger per grade, a helmet and armor per class and grade, and boots per style and grade", () => {
    expect(GRADE_EQUIPMENT_IDS).toHaveLength(15 * 4 + 15 * 4 * 2 + 15 * 3);
    expect(gradeItemId("boots", "rare", "ranger")).toBe("rare_ranger_boots");
    expect(new Set(GRADE_EQUIPMENT_IDS).size).toBe(GRADE_EQUIPMENT_IDS.length);
    expect(gradeItemId("bow", "rare")).toBe("rare_bow");
    expect(gradeItemId("helmet", "epic", "light")).toBe("epic_light_helmet");
  });

  it.each(GRADE_EQUIPMENT_IDS)("resolves %s in the catalog, kept in the bag like a drop", id => {
    expect(itemDefinition(id)?.id).toBe(id);
    expect(canonicalItemId(id)).toBe(id);
    expect(EQUIPMENT_DROP_ITEM_IDS).toContain(id);
  });

  it("round-trips grade, class and kind from every id", () => {
    for (const grade of GEAR_GRADES) {
      for (const kind of GRADE_WEAPON_KINDS) {
        const id = gradeItemId(kind, grade);
        expect([gradeOf(id), armorClassOf(id), gradeEquipmentKindOf(id)]).toEqual([grade, undefined, kind]);
      }
      for (const armorClass of ARMOR_CLASSES) for (const kind of GRADE_ARMOR_KINDS) {
        const id = gradeItemId(kind, grade, armorClass);
        expect([gradeOf(id), armorClassOf(id), gradeEquipmentKindOf(id)]).toEqual([grade, armorClass, kind]);
      }
    }
    for (const grade of GEAR_GRADES) for (const style of BOOT_STYLES) {
      const id = gradeItemId("boots", grade, style);
      expect([gradeOf(id), armorClassOf(id), bootStyleOf(id), gradeEquipmentKindOf(id)]).toEqual([grade, undefined, style, "boots"]);
    }
    expect([gradeOf("ion_bow"), armorClassOf("ion_helmet"), gradeOf(undefined), bootStyleOf("black_boots"), bootStyleOf("rare_light_armor")])
      .toEqual([undefined, undefined, undefined, undefined, undefined]);
  });

  it("gives Ranger Boots move speed, Warrior Boots armor and Mystic Boots skill chance, rising with the grade", () => {
    for (const grade of GEAR_GRADES) {
      const ranger = itemDefinition(gradeItemId("boots", grade, "ranger"))!, warrior = itemDefinition(gradeItemId("boots", grade, "warrior"))!;
      const mystic = itemDefinition(gradeItemId("boots", grade, "mystic"))!;
      for (const boots of [ranger, warrior, mystic]) expect([boots.slot, boots.acquisition]).toEqual(["FEET", "TOWN_DROP"]);
      expect(ranger.modifiers).toEqual({ moveSpeedMultiplierBonus: BOOT_MOVE_SPEED_PERCENT[grade] / 100 });
      expect(warrior.modifiers).toEqual({ armorMultiplierBonus: GRADE_BONUS_PERCENT[grade] / 100 });
      expect(mystic.modifiers).toEqual({ skillChanceMultiplierBonus: BOOT_SKILL_CHANCE_PERCENT[grade] / 100 });
    }
    GEAR_GRADES.slice(1).forEach((grade, index) => {
      expect(BOOT_MOVE_SPEED_PERCENT[grade]).toBeGreaterThan(BOOT_MOVE_SPEED_PERCENT[GEAR_GRADES[index]]);
      expect(BOOT_SKILL_CHANCE_PERCENT[grade]).toBeGreaterThan(BOOT_SKILL_CHANCE_PERCENT[GEAR_GRADES[index]]);
    });
  });

  it("gives weapons the grade's damage bonus, swords half as much again, the grade's roll range and stand-in tier", () => {
    for (const grade of GEAR_GRADES) {
      const bow = itemDefinition(gradeItemId("bow", grade))!, sword = itemDefinition(gradeItemId("sword", grade))!;
      const staff = itemDefinition(gradeItemId("staff", grade))!;
      const rollRange = GRADE_ROLL_RANGE[grade];
      expect(bow.weapon).toEqual({ mode: "RANGED", projectile: "ARROW", damageMultiplierBonus: GRADE_BONUS_PERCENT[grade] / 100, rollRange, tier: GRADE_ITEM_TIER[grade] });
      expect(staff.weapon).toEqual({ mode: "RANGED", projectile: "BOLT", damageMultiplierBonus: GRADE_BONUS_PERCENT[grade] / 100, rollRange, tier: GRADE_ITEM_TIER[grade] });
      expect(sword.weapon?.rollRange).toEqual(rollRange);
      expect(sword.weapon?.mode).toBe("MELEE");
      expect(sword.weapon?.range).toBe(SWORD_REACH);
      expect(sword.weapon?.tier).toBe(GRADE_ITEM_TIER[grade]);
      expect(sword.weapon?.damageMultiplierBonus).toBeCloseTo(GRADE_BONUS_PERCENT[grade] * SWORD_DAMAGE_FACTOR / 100, 8);
    }
  });

  it("gives helmets regen and armor max health by the class's share of the grade", () => {
    for (const grade of GEAR_GRADES) for (const armorClass of ARMOR_CLASSES) {
      const percent = armorBonusPercent(grade, armorClass);
      const helmet = itemDefinition(gradeItemId("helmet", grade, armorClass))!;
      const armor = itemDefinition(gradeItemId("armor", grade, armorClass))!;
      expect(helmet.slot).toBe("HEAD");
      expect(helmet.modifiers?.regenerationMultiplierBonus).toBeCloseTo(percent / 100, 8);
      expect(armor.slot).toBe("CHEST");
      expect(armor.modifiers?.maxHealthMultiplierBonus).toBeCloseTo(percent / 100, 8);
    }
  });

  it("is in no map's loot", () => {
    for (const mapId of MAP_IDS) for (const { itemId } of regularMapLoot(mapId)) expect(GRADE_EQUIPMENT_IDS).not.toContain(itemId);
    for (const id of GRADE_EQUIPMENT_IDS) expect(itemTier(id)).toBeUndefined();
  });
});
