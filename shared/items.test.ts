import { describe, expect, it } from "vitest";
import {
  BASIC_PAPER_HAT,
  canonicalItemId,
  DARK_METAL_HELMET,
  DESERT_DROP_ITEM_IDS,
  DESERT_ITEM_DROP_DENOMINATOR,
  DEVELOPER_ITEM_IDS,
  equipmentDamageMultiplier,
  equipmentMaxHealthMultiplier,
  equipmentRegenerationMultiplier,
  FIRE_METAL_BOW,
  FIRE_METAL_HELMET,
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
  IRON_BOW,
  INFERNAL_DROP_ITEM_IDS,
  INFERNAL_ITEM_DROP_DENOMINATOR,
  NIGHT_FOREST_HELMET_ITEM_DROP_DENOMINATOR,
  MAX_ITEM_UPGRADE_LEVEL,
  LAVA_DROP_ITEM_IDS,
  LAVA_BOSS_DROP_ITEM_IDS,
  LAVA_BOSS_ITEM_DROP_DENOMINATOR,
  LAVA_ITEM_DROP_DENOMINATOR,
  LAVA_HELMET_ITEM_DROP_DENOMINATOR,
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
  WOOD_FULL_HELM,
  WOODEN_ARMOR,
} from "./items";

describe("equipment catalog", () => {
  it("keeps regular and boss equipment in their own acquisition groups", () => {
    expect(STARTER_ITEM_IDS).toEqual([BASIC_PAPER_HAT, STARTER_STONE]);
    expect(DEVELOPER_ITEM_IDS).not.toContain(STARTER_BOW);
    expect(STARTER_ITEM_IDS).not.toContain(STARTER_BOW);
    expect(FOREST_DROP_ITEM_IDS).toEqual([STARTER_BOW, WOODEN_ARMOR]);
    expect(DESERT_DROP_ITEM_IDS).toEqual([WOOD_FULL_HELM, IRON_BOW]);
    expect(SNOW_BOSS_DROP_ITEM_IDS).toEqual([FROST_BOW, FROST_ARMOR]);
    expect(LAVA_DROP_ITEM_IDS).toEqual([FIRE_METAL_HELMET, MAGMA_ARMOR]);
    expect(LAVA_BOSS_DROP_ITEM_IDS).toEqual([LAVA_BOW]);
    expect(INFERNAL_DROP_ITEM_IDS).toEqual([DARK_METAL_HELMET, FIRE_METAL_BOW]);
    expect(FOREST_ITEM_DROP_DENOMINATOR).toBe(25);
    expect(DESERT_ITEM_DROP_DENOMINATOR).toBe(50);
    expect(SNOW_BOSS_ITEM_DROP_DENOMINATOR).toBe(25);
    expect(SNOW_BOSS_ARMOR_DROP_DENOMINATOR).toBe(5);
    expect(LAVA_ITEM_DROP_DENOMINATOR).toBe(1_200);
    expect(LAVA_HELMET_ITEM_DROP_DENOMINATOR).toBe(2_000);
    expect(LAVA_BOSS_ITEM_DROP_DENOMINATOR).toBe(25);
    expect(INFERNAL_ITEM_DROP_DENOMINATOR).toBe(1_000);
    expect(NIGHT_FOREST_HELMET_ITEM_DROP_DENOMINATOR).toBe(1_300);
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

  it("adds forest equipment bonuses to existing research bonuses", () => {
    expect(weaponDamageMultiplier(STARTER_BOW, 1.2)).toBeCloseTo(1.25);
    expect(weaponAttackSpeedMultiplier(STARTER_BOW, 1.1)).toBeCloseTo(1.1);
    expect(itemMaxHealthMultiplier(WOODEN_ARMOR, 1.2)).toBeCloseTo(1.25);
    expect(itemMaxHealthMultiplier("", 1.2)).toBeCloseTo(1.2);
  });

  it("adds Frost Bow's damage bonus to research without changing attack speed", () => {
    expect(weaponDamageMultiplier(FROST_BOW)).toBeCloseTo(1.4);
    expect(weaponAttackSpeedMultiplier(FROST_BOW)).toBeCloseTo(1);
    expect(weaponDamageMultiplier(FROST_BOW, 1.2)).toBeCloseTo(1.6);
    expect(weaponAttackSpeedMultiplier(FROST_BOW, 1.1)).toBeCloseTo(1.1);
  });

  it("gives Frost Armor additive 40% health and regeneration bonuses", () => {
    expect(itemFitsEquipmentSlot(FROST_ARMOR, "CHEST")).toBe(true);
    expect(itemFitsEquipmentSlot(FROST_ARMOR, "HEAD")).toBe(false);
    expect(itemMaxHealthMultiplier(FROST_ARMOR)).toBeCloseTo(1.4);
    expect(itemRegenerationMultiplier(FROST_ARMOR)).toBeCloseTo(1.4);
    expect(itemRegenerationMultiplier(FROST_ARMOR, 1.2)).toBeCloseTo(1.6);
  });

  it("keeps Magma Armor defensive with 1.5x health and regeneration", () => {
    expect(itemFitsEquipmentSlot(MAGMA_ARMOR, "CHEST")).toBe(true);
    expect(itemDamageMultiplier(MAGMA_ARMOR)).toBeCloseTo(1);
    expect(itemMaxHealthMultiplier(MAGMA_ARMOR)).toBeCloseTo(1.5);
    expect(itemRegenerationMultiplier(MAGMA_ARMOR)).toBeCloseTo(1.5);
    expect(equipmentDamageMultiplier(FROST_BOW, "", MAGMA_ARMOR, 1.5)).toBeCloseTo(1.9);
    expect(itemStats(MAGMA_ARMOR)).toEqual([
      "MAX HEALTH +50%",
      "REGEN +50%",
    ]);
  });

  it("gives Lava Bow +50% damage without attack speed", () => {
    expect(isWeaponItem(LAVA_BOW)).toBe(true);
    expect(weaponDamageMultiplier(LAVA_BOW)).toBeCloseTo(1.5);
    expect(weaponAttackSpeedMultiplier(LAVA_BOW)).toBeCloseTo(1);
    expect(weaponDamageMultiplier(LAVA_BOW, 1.5)).toBeCloseTo(2);
  });

  it("steps Fire Metal Bow 10 percentage points above Lava Bow without attack speed", () => {
    expect(isWeaponItem(FIRE_METAL_BOW)).toBe(true);
    expect(weaponDamageMultiplier(FIRE_METAL_BOW)).toBeCloseTo(1.6);
    expect(weaponDamageMultiplier(FIRE_METAL_BOW)).toBeCloseTo(weaponDamageMultiplier(LAVA_BOW) + .1);
    expect(weaponAttackSpeedMultiplier(FIRE_METAL_BOW)).toBeCloseTo(1);
  });

  it("keeps Fire Metal Helmet defensive in the head slot", () => {
    expect(itemFitsEquipmentSlot(FIRE_METAL_HELMET, "HEAD")).toBe(true);
    expect(itemDamageMultiplier(FIRE_METAL_HELMET)).toBeCloseTo(1);
    expect(itemMaxHealthMultiplier(FIRE_METAL_HELMET)).toBeCloseTo(1.12);
    expect(itemRegenerationMultiplier(FIRE_METAL_HELMET)).toBeCloseTo(1.2);
    expect(equipmentDamageMultiplier(FROST_BOW, FIRE_METAL_HELMET, MAGMA_ARMOR)).toBeCloseTo(1.4);
    expect(equipmentRegenerationMultiplier(FIRE_METAL_HELMET, MAGMA_ARMOR)).toBeCloseTo(1.7);
  });

  it("keeps Dark Metal Helmet defensive at the Night Forest tier", () => {
    expect(itemFitsEquipmentSlot(DARK_METAL_HELMET, "HEAD")).toBe(true);
    expect(itemDamageMultiplier(DARK_METAL_HELMET)).toBeCloseTo(1);
    expect(itemMaxHealthMultiplier(DARK_METAL_HELMET)).toBeCloseTo(1.6);
    expect(itemRegenerationMultiplier(DARK_METAL_HELMET)).toBeCloseTo(1.8);
    expect(itemStats(DARK_METAL_HELMET)).toEqual([
      "MAX HEALTH +60%",
      "REGEN +80%",
    ]);
  });

  it("gives the independent desert drops their requested additive bonuses", () => {
    expect(itemFitsEquipmentSlot(WOOD_FULL_HELM, "HEAD")).toBe(true);
    expect(itemMaxHealthMultiplier(WOOD_FULL_HELM)).toBeCloseTo(1.12);
    expect(isWeaponItem(IRON_BOW)).toBe(true);
    expect(weaponDamageMultiplier(IRON_BOW)).toBeCloseTo(1.25);
    expect(weaponAttackSpeedMultiplier(IRON_BOW)).toBeCloseTo(1);
    expect(equipmentMaxHealthMultiplier(WOOD_FULL_HELM, FROST_ARMOR, 1.2)).toBeCloseTo(1.72);
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
    expect(isUpgradeableItem(WOOD_FULL_HELM)).toBe(true);
    expect(isUpgradeableItem(IRON_BOW)).toBe(true);
    expect(isUpgradeableItem(FIRE_METAL_HELMET)).toBe(true);
    expect(isUpgradeableItem(DARK_METAL_HELMET)).toBe(true);
    expect(isUpgradeableItem(FIRE_METAL_BOW)).toBe(true);
    expect(isUpgradeableItem(STARTER_STONE)).toBe(false);
    expect(isUpgradeableItem(BASIC_PAPER_HAT)).toBe(false);
  });

  it("scales every stat from only its additive equipment bonus", () => {
    expect(weaponDamageMultiplier(FROST_BOW, 1, 10)).toBeCloseTo(1.72);
    expect(weaponAttackSpeedMultiplier(FROST_BOW, 1, 10)).toBeCloseTo(1);
    expect(itemMaxHealthMultiplier(FROST_ARMOR, 1, 10)).toBeCloseTo(1.72);
    expect(itemRegenerationMultiplier(FROST_ARMOR, 1, 10)).toBeCloseTo(1.72);
    expect(weaponDamageMultiplier(STARTER_BOW, 1, 10)).toBeCloseTo(1.09);
    expect(weaponAttackSpeedMultiplier(STARTER_BOW, 1, 10)).toBeCloseTo(1);
    expect(itemMaxHealthMultiplier(WOODEN_ARMOR, 1, 10)).toBeCloseTo(1.09);
    expect(itemRegenerationMultiplier(WOODEN_ARMOR, 1, 10)).toBeCloseTo(1);
    expect(weaponDamageMultiplier(FROST_BOW, 1.2, 10)).toBeCloseTo(1.92);
    expect(itemDisplayName(FROST_BOW, 1)).toBe("FROST BOW +1");
    expect(itemStats(FROST_BOW, 1)).toEqual([
      "DAMAGE +43%",
    ]);
    expect(itemUpgradeStatChanges(FROST_BOW, 0)).toEqual([
      { label: "DAMAGE", current: "+40%", next: "+43%" },
    ]);
    expect(equipmentDamageMultiplier(FIRE_METAL_BOW, DARK_METAL_HELMET, MAGMA_ARMOR, 1.4, 10, 10, 10)).toBeCloseTo(2.48);
  });
});
