import { describe, expect, it } from "vitest";
import {
  BASIC_PAPER_HAT,
  canonicalItemId,
  DEVELOPER_ITEM_IDS,
  equipmentDamageMultiplier,
  FOREST_ITEM_DROP_DENOMINATOR,
  FOREST_DROP_ITEM_IDS,
  FROST_ARMOR,
  FROST_BOW,
  inventoryJsonItemQuantity,
  isUpgradeableItem,
  isWeaponItem,
  itemDisplayName,
  itemDamageMultiplier,
  itemMaxHealthMultiplier,
  itemRegenerationMultiplier,
  itemStats,
  itemUpgradeDurationMs,
  itemUpgradeStatChanges,
  itemFitsEquipmentSlot,
  MAX_ITEM_UPGRADE_LEVEL,
  LAVA_DROP_ITEM_IDS,
  LAVA_BOSS_DROP_ITEM_IDS,
  LAVA_BOSS_ITEM_DROP_DENOMINATOR,
  LAVA_ITEM_DROP_DENOMINATOR,
  LAVA_BOW,
  MAGMA_ARMOR,
  STARTER_BOW,
  STARTER_STONE,
  STARTER_ITEM_IDS,
  SNOW_BOSS_DROP_ITEM_IDS,
  SNOW_BOSS_ARMOR_DROP_DENOMINATOR,
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
    expect(SNOW_BOSS_DROP_ITEM_IDS).toEqual([FROST_BOW, FROST_ARMOR]);
    expect(LAVA_DROP_ITEM_IDS).toEqual([MAGMA_ARMOR]);
    expect(LAVA_BOSS_DROP_ITEM_IDS).toEqual([LAVA_BOW]);
    expect(FOREST_ITEM_DROP_DENOMINATOR).toBe(25);
    expect(SNOW_BOSS_ITEM_DROP_DENOMINATOR).toBe(25);
    expect(SNOW_BOSS_ARMOR_DROP_DENOMINATOR).toBe(5);
    expect(LAVA_ITEM_DROP_DENOMINATOR).toBe(30);
    expect(LAVA_BOSS_ITEM_DROP_DENOMINATOR).toBe(25);
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

  it("multiplies forest equipment bonuses with existing research multipliers", () => {
    expect(weaponDamageMultiplier(STARTER_BOW, 1.2)).toBeCloseTo(1.26);
    expect(weaponAttackSpeedMultiplier(STARTER_BOW, 1.1)).toBeCloseTo(1.155);
    expect(itemMaxHealthMultiplier(WOODEN_ARMOR, 1.2)).toBeCloseTo(1.26);
    expect(itemMaxHealthMultiplier("", 1.2)).toBeCloseTo(1.2);
  });

  it("multiplies Frost Bow's 3x damage and 1.2x speed with research", () => {
    expect(weaponDamageMultiplier(FROST_BOW)).toBeCloseTo(3);
    expect(weaponAttackSpeedMultiplier(FROST_BOW)).toBeCloseTo(1.2);
    expect(weaponDamageMultiplier(FROST_BOW, 1.2)).toBeCloseTo(3.6);
    expect(weaponAttackSpeedMultiplier(FROST_BOW, 1.1)).toBeCloseTo(1.32);
  });

  it("gives Frost Armor multiplicative 2x health and regeneration", () => {
    expect(itemFitsEquipmentSlot(FROST_ARMOR, "CHEST")).toBe(true);
    expect(itemFitsEquipmentSlot(FROST_ARMOR, "HEAD")).toBe(false);
    expect(itemMaxHealthMultiplier(FROST_ARMOR)).toBeCloseTo(2);
    expect(itemRegenerationMultiplier(FROST_ARMOR)).toBeCloseTo(2);
    expect(itemRegenerationMultiplier(FROST_ARMOR, 1.2)).toBeCloseTo(2.4);
  });

  it("gives Magma Armor 2x damage and 2.25x health and regeneration", () => {
    expect(itemFitsEquipmentSlot(MAGMA_ARMOR, "CHEST")).toBe(true);
    expect(itemDamageMultiplier(MAGMA_ARMOR)).toBeCloseTo(2);
    expect(itemMaxHealthMultiplier(MAGMA_ARMOR)).toBeCloseTo(2.25);
    expect(itemRegenerationMultiplier(MAGMA_ARMOR)).toBeCloseTo(2.25);
    expect(equipmentDamageMultiplier(FROST_BOW, MAGMA_ARMOR, 1.5)).toBeCloseTo(9);
    expect(itemStats(MAGMA_ARMOR)).toEqual([
      "DAMAGE MULTIPLIER 2.00×",
      "MAX HEALTH MULTIPLIER 2.25×",
      "REGEN MULTIPLIER 2.25×",
    ]);
  });

  it("gives Lava Bow 5x damage and 1.3x attack speed", () => {
    expect(isWeaponItem(LAVA_BOW)).toBe(true);
    expect(weaponDamageMultiplier(LAVA_BOW)).toBeCloseTo(5);
    expect(weaponAttackSpeedMultiplier(LAVA_BOW)).toBeCloseTo(1.3);
    expect(weaponDamageMultiplier(LAVA_BOW, 1.5)).toBeCloseTo(7.5);
  });

  it("clamps legacy duplicate items to unique ownership", () => {
    expect(inventoryJsonItemQuantity(JSON.stringify([FROST_BOW, STARTER_BOW, FROST_BOW]), FROST_BOW)).toBe(1);
    expect(inventoryJsonItemQuantity("not json", FROST_BOW)).toBe(0);
  });

  it("uses a three-minute upgrade timer that grows forty percent per level", () => {
    expect(itemUpgradeDurationMs(0)).toBe(180_000);
    expect(itemUpgradeDurationMs(1)).toBe(252_000);
    expect(itemUpgradeDurationMs(MAX_ITEM_UPGRADE_LEVEL + 99)).toBe(itemUpgradeDurationMs(MAX_ITEM_UPGRADE_LEVEL));
  });

  it("only upgrades stat-bearing weapons and armor", () => {
    expect(isUpgradeableItem(STARTER_BOW)).toBe(true);
    expect(isUpgradeableItem(FROST_BOW)).toBe(true);
    expect(isUpgradeableItem(WOODEN_ARMOR)).toBe(true);
    expect(isUpgradeableItem(FROST_ARMOR)).toBe(true);
    expect(isUpgradeableItem(MAGMA_ARMOR)).toBe(true);
    expect(isUpgradeableItem(LAVA_BOW)).toBe(true);
    expect(isUpgradeableItem(STARTER_STONE)).toBe(false);
    expect(isUpgradeableItem(BASIC_PAPER_HAT)).toBe(false);
  });

  it("scales every stat from only its additive equipment bonus", () => {
    expect(weaponDamageMultiplier(FROST_BOW, 1, 10)).toBeCloseTo(7);
    expect(weaponAttackSpeedMultiplier(FROST_BOW, 1, 10)).toBeCloseTo(1.6);
    expect(itemMaxHealthMultiplier(FROST_ARMOR, 1, 10)).toBeCloseTo(4);
    expect(itemRegenerationMultiplier(FROST_ARMOR, 1, 10)).toBeCloseTo(4);
    expect(weaponDamageMultiplier(STARTER_BOW, 1, 10)).toBeCloseTo(1.15);
    expect(weaponAttackSpeedMultiplier(STARTER_BOW, 1, 10)).toBeCloseTo(1.15);
    expect(itemMaxHealthMultiplier(WOODEN_ARMOR, 1, 10)).toBeCloseTo(1.15);
    expect(itemRegenerationMultiplier(WOODEN_ARMOR, 1, 10)).toBeCloseTo(1);
    expect(weaponDamageMultiplier(FROST_BOW, 1.2, 10)).toBeCloseTo(8.4);
    expect(itemDisplayName(FROST_BOW, 1)).toBe("FROST BOW +1");
    expect(itemStats(FROST_BOW, 1)).toEqual([
      "DAMAGE MULTIPLIER 3.40×",
      "ATTACK SPEED MULTIPLIER 1.24×",
    ]);
    expect(itemUpgradeStatChanges(FROST_BOW, 0)).toEqual([
      { label: "DAMAGE MULTIPLIER", current: "3.00×", next: "3.40×" },
      { label: "ATTACK SPEED MULTIPLIER", current: "1.20×", next: "1.24×" },
    ]);
  });
});
