import { describe, expect, it } from "vitest";
import { BOOT_MOVE_SPEED_PERCENT, BOOT_SKILL_CHANCE_PERCENT, GEAR_GRADES, GRADE_BONUS_PERCENT, GRADE_GOLD_PRICE, GRADE_MASTERY_LEVEL } from "./gear-grades";
import { gradeItemId } from "./grade-equipment";
import { bootArmorFactor, bootMoveSpeedFactor, bootSkillChanceFactor, hasBootStat, itemStats } from "./items";
import { effectivePlayerPowerStats, effectivePlayerPower } from "./player-power";
import { bootsScore, isEquipUpgrade } from "./equip-best";
import { gradeLineRefusal, gradeShopNeed, gradeShopOffer, gradeShopPrice } from "./grade-shop";

const boots = (style: "ranger" | "warrior" | "mystic", grade: typeof GEAR_GRADES[number] = "rare") => gradeItemId("boots", grade, style);
const loadout = (feet: string, weapon = "common_bow") => ({ equippedHead: "", equippedChest: "", equippedFeet: feet, equippedRightHand: weapon, equippedLeftHand: "" });

describe("graded boots' stats", () => {
  it("gives each style its own stat and nothing else, at the pair's refine", () => {
    expect(bootMoveSpeedFactor(boots("ranger"))).toBeCloseTo(1 + BOOT_MOVE_SPEED_PERCENT.rare / 100);
    expect(bootArmorFactor(boots("warrior"))).toBeCloseTo(1 + GRADE_BONUS_PERCENT.rare / 100);
    expect(bootSkillChanceFactor(boots("mystic"))).toBeCloseTo(1 + BOOT_SKILL_CHANCE_PERCENT.rare / 100);
    for (const factor of [bootMoveSpeedFactor, bootArmorFactor, bootSkillChanceFactor]) {
      expect(factor("")).toBe(1);
      expect(factor("black_boots")).toBe(1);
      expect(factor("rare_light_armor")).toBe(1);
    }
    expect([bootMoveSpeedFactor(boots("warrior")), bootArmorFactor(boots("mystic")), bootSkillChanceFactor(boots("ranger"))]).toEqual([1, 1, 1]);
    // ★20 is +150%; feet have no slot tier, so a tier passed in counts for nothing.
    expect(bootMoveSpeedFactor(boots("ranger", "eternal"), { tier: 50, refine: 20 })).toBeCloseTo(1 + 20 * 2.5 / 100);
    expect(itemStats(boots("warrior", "eternal"), { refine: 10 })).toEqual([`ARMOR ×${Number((1 + GRADE_BONUS_PERCENT.eternal * 1.5 / 100).toFixed(2))}`]);
    expect(itemStats(boots("mystic", "crude"))).toEqual(["SKILL CHANCE +2%"]);
    expect([hasBootStat(boots("ranger")), hasBootStat("black_boots"), hasBootStat("rare_bow")]).toEqual([true, false, false]);
  });

  it("multiplies armor by Warrior Boots in the power stats, before research and cards", () => {
    const stats = (feet: string, level = 0) => effectivePlayerPowerStats({ maxHp: 100, damage: 10, attackRate: 1, armor: 50, regen: 1,
      equippedFeet: feet }, { precision: 10 }, () => ({ tier: 0, refine: level }));
    expect(stats("").armor).toBeCloseTo(50 * 1.2);
    expect(stats(boots("warrior")).armor).toBeCloseTo(50 * (1 + GRADE_BONUS_PERCENT.rare / 100) * 1.2);
    expect(stats(boots("warrior"), 10).armor).toBeCloseTo(50 * (1 + GRADE_BONUS_PERCENT.rare * 1.5 / 100) * 1.2);
    expect(stats(boots("ranger")).armor).toBeCloseTo(50 * 1.2);
    expect(stats(boots("warrior")).damage).toBe(stats("").damage);
    const power = (feet: string) => effectivePlayerPower({ maxHp: 100, damage: 10, attackRate: 1, armor: 50, regen: 1, equippedFeet: feet });
    expect(power(boots("warrior"))).toBeGreaterThan(power(""));
  });
});

describe("graded boots in Equip best", () => {
  it("puts on graded boots over Black Boots, the weapon's style first, then the higher grade", () => {
    expect(bootsScore(loadout(boots("ranger", "crude")))).toBeGreaterThan(bootsScore(loadout("black_boots")));
    expect(bootsScore(loadout(boots("ranger", "crude")))).toBeGreaterThan(bootsScore(loadout(boots("warrior", "eternal"))));
    expect(bootsScore(loadout(boots("warrior", "crude"), "common_sword"))).toBeGreaterThan(bootsScore(loadout(boots("ranger", "eternal"), "common_sword")));
    expect(bootsScore(loadout(boots("mystic", "epic"), "common_staff"))).toBeGreaterThan(bootsScore(loadout(boots("mystic", "rare"), "common_staff")));
    const power = () => 0;
    expect(isEquipUpgrade(loadout("black_boots"), boots("warrior", "crude"), power)).toBe(true);
    expect(isEquipUpgrade(loadout(boots("ranger", "crude")), boots("warrior", "eternal"), power)).toBe(false);
  });
});

describe("graded boots at the Smith", () => {
  it("sells each style for its school's Mastery at the grade's price", () => {
    expect(gradeShopPrice(boots("mystic", "epic"))).toBe(GRADE_GOLD_PRICE.epic);
    expect(gradeShopNeed(boots("ranger", "epic"))).toBe(`Lv ${GRADE_MASTERY_LEVEL.epic} Archery`);
    expect(gradeShopNeed(boots("warrior", "epic"))).toBe(`Lv ${GRADE_MASTERY_LEVEL.epic} Swordplay`);
    expect(gradeShopNeed(boots("mystic", "epic"))).toBe(`Lv ${GRADE_MASTERY_LEVEL.epic} Sorcery`);
    expect(gradeShopOffer({ kind: "boots", bootStyle: "warrior" }, new Set(), { swordplay: 5, archery: 20 }).itemId).toBe("rare_warrior_boots");
    expect(gradeLineRefusal(boots("ranger", "rare"), new Set(), { swordplay: 20 })).toBe("You need Lv 5 Archery.");
    expect(gradeLineRefusal(boots("ranger", "fine"), new Set([boots("ranger", "rare")]), { archery: 20 })).toBe("You already have a better one.");
    // Each line is its own: Ranger Boots held do not count against Warrior Boots.
    expect(gradeLineRefusal(boots("warrior", "fine"), new Set([boots("ranger", "rare")]), { swordplay: 20 })).toBeNull();
  });
});
