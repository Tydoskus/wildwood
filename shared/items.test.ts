import { describe, expect, it } from "vitest";
import {
  BASIC_PAPER_HAT,
  canonicalItemId,
  DEVELOPER_ITEM_IDS,
  FOREST_ITEM_DROP_DENOMINATOR,
  FOREST_DROP_ITEM_IDS,
  FROST_BOW,
  inventoryJsonItemQuantity,
  isWeaponItem,
  itemMaxHealthMultiplier,
  itemFitsEquipmentSlot,
  STARTER_BOW,
  STARTER_STONE,
  STARTER_ITEM_IDS,
  SNOW_BOSS_DROP_ITEM_IDS,
  SNOW_BOSS_ITEM_DROP_DENOMINATOR,
  weaponAttackSpeedMultiplier,
  weaponDamageMultiplier,
  WOODEN_ARMOR,
} from "./items";

describe("equipment catalog", () => {
  it("keeps regular and boss equipment in their own acquisition groups", () => {
    expect(STARTER_ITEM_IDS).toEqual([BASIC_PAPER_HAT, STARTER_STONE]);
    expect(DEVELOPER_ITEM_IDS).not.toContain(STARTER_BOW);
    expect(STARTER_ITEM_IDS).not.toContain(STARTER_BOW);
    expect(FOREST_DROP_ITEM_IDS).toEqual([STARTER_BOW, WOODEN_ARMOR]);
    expect(SNOW_BOSS_DROP_ITEM_IDS).toEqual([FROST_BOW]);
    expect(FOREST_ITEM_DROP_DENOMINATOR).toBe(25);
    expect(SNOW_BOSS_ITEM_DROP_DENOMINATOR).toBe(25);
  });

  it("declares both bows as two-hand-slot-compatible ranged weapons", () => {
    expect(isWeaponItem(STARTER_BOW)).toBe(true);
    expect(itemFitsEquipmentSlot(STARTER_BOW, "RIGHT_HAND")).toBe(true);
    expect(itemFitsEquipmentSlot(STARTER_BOW, "LEFT_HAND")).toBe(true);
    expect(itemFitsEquipmentSlot(STARTER_BOW, "HEAD")).toBe(false);
    expect(isWeaponItem(FROST_BOW)).toBe(true);
    expect(itemFitsEquipmentSlot(FROST_BOW, "RIGHT_HAND")).toBe(true);
    expect(itemFitsEquipmentSlot(FROST_BOW, "LEFT_HAND")).toBe(true);
  });

  it("keeps Rock, Bow, and Frost Bow as separate weapon IDs", () => {
    expect(canonicalItemId(STARTER_STONE)).toBe(STARTER_STONE);
    expect(canonicalItemId(STARTER_BOW)).toBe(STARTER_BOW);
    expect(canonicalItemId(FROST_BOW)).toBe(FROST_BOW);
    expect(isWeaponItem(STARTER_STONE)).toBe(true);
  });

  it("adds forest equipment bonuses to existing research multipliers", () => {
    expect(weaponDamageMultiplier(STARTER_BOW, 1.2)).toBeCloseTo(1.25);
    expect(weaponAttackSpeedMultiplier(STARTER_BOW, 1.1)).toBeCloseTo(1.15);
    expect(itemMaxHealthMultiplier(WOODEN_ARMOR, 1.2)).toBeCloseTo(1.25);
    expect(itemMaxHealthMultiplier("", 1.2)).toBeCloseTo(1.2);
  });

  it("adds Frost Bow's 3x damage and 1.2x speed to existing research multipliers", () => {
    expect(weaponDamageMultiplier(FROST_BOW)).toBeCloseTo(3);
    expect(weaponAttackSpeedMultiplier(FROST_BOW)).toBeCloseTo(1.2);
    expect(weaponDamageMultiplier(FROST_BOW, 1.2)).toBeCloseTo(3.2);
    expect(weaponAttackSpeedMultiplier(FROST_BOW, 1.1)).toBeCloseTo(1.3);
  });

  it("counts persisted Frost Bow stacks safely", () => {
    expect(inventoryJsonItemQuantity(JSON.stringify([FROST_BOW, STARTER_BOW, FROST_BOW]), FROST_BOW)).toBe(2);
    expect(inventoryJsonItemQuantity("not json", FROST_BOW)).toBe(0);
  });
});
