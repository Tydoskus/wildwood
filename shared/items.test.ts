import { describe, expect, it } from "vitest";
import {
  BASIC_PAPER_HAT,
  canonicalItemId,
  DEVELOPER_ITEM_IDS,
  FOREST_ITEM_DROP_DENOMINATOR,
  FOREST_DROP_ITEM_IDS,
  isWeaponItem,
  itemMaxHealthMultiplier,
  itemFitsEquipmentSlot,
  STARTER_BOW,
  STARTER_STONE,
  STARTER_ITEM_IDS,
  weaponAttackSpeedMultiplier,
  weaponDamageMultiplier,
  WOODEN_ARMOR,
} from "./items";

describe("equipment catalog", () => {
  it("keeps the Rock as starter gear and makes Bow and Wooden Armor forest drops", () => {
    expect(STARTER_ITEM_IDS).toEqual([BASIC_PAPER_HAT, STARTER_STONE]);
    expect(DEVELOPER_ITEM_IDS).not.toContain(STARTER_BOW);
    expect(STARTER_ITEM_IDS).not.toContain(STARTER_BOW);
    expect(FOREST_DROP_ITEM_IDS).toEqual([STARTER_BOW, WOODEN_ARMOR]);
    expect(FOREST_ITEM_DROP_DENOMINATOR).toBe(25);
  });

  it("declares the Bow as a two-hand-slot-compatible ranged weapon", () => {
    expect(isWeaponItem(STARTER_BOW)).toBe(true);
    expect(itemFitsEquipmentSlot(STARTER_BOW, "RIGHT_HAND")).toBe(true);
    expect(itemFitsEquipmentSlot(STARTER_BOW, "LEFT_HAND")).toBe(true);
    expect(itemFitsEquipmentSlot(STARTER_BOW, "HEAD")).toBe(false);
  });

  it("keeps Rock and Bow as separate weapon IDs", () => {
    expect(canonicalItemId(STARTER_STONE)).toBe(STARTER_STONE);
    expect(canonicalItemId(STARTER_BOW)).toBe(STARTER_BOW);
    expect(isWeaponItem(STARTER_STONE)).toBe(true);
  });

  it("adds forest equipment bonuses to existing research multipliers", () => {
    expect(weaponDamageMultiplier(STARTER_BOW, 1.2)).toBeCloseTo(1.25);
    expect(weaponAttackSpeedMultiplier(STARTER_BOW, 1.1)).toBeCloseTo(1.15);
    expect(itemMaxHealthMultiplier(WOODEN_ARMOR, 1.2)).toBeCloseTo(1.25);
    expect(itemMaxHealthMultiplier("", 1.2)).toBeCloseTo(1.2);
  });
});
