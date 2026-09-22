import { BLACK_BOOTS } from "./items";
import { describe, expect, it } from "vitest";
import {
  BASIC_PAPER_HAT,
  ITEM_DEFINITIONS,
  type ItemDefinition,
  canonicalItemId,
  DARK_METAL_HELMET,
  DESERT_DROP_ITEM_IDS,
  DESERT_ITEM_DROP_DENOMINATOR,
  DEVELOPER_ITEM_IDS,
  equipmentDamage,
  equipmentMaxHealth,
  equipmentRegeneration,
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
  itemDamageMultiplierBonus,
  itemMaxHealthMultiplierBonus,
  itemRegenerationMultiplierBonus,
  itemStats,
  itemUpgradeDurationMs,
  itemUpgradeStatChanges,
  itemFitsEquipmentSlot,
  IRON_BOW,
  INFERNAL_DROP_ITEM_IDS,
  INFERNAL_ITEM_DROP_DENOMINATOR,
  NIGHT_FOREST_HELMET_ITEM_DROP_DENOMINATOR,
  NIGHT_FOREST_BOW_ITEM_DROP_DENOMINATOR,
  NIGHT_BOW,
  MAX_SLOT_UPGRADE_TIER,
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
  SNOW_BOW,
  SNOW_DROP_ITEM_IDS,
  SNOW_ITEM_DROP_DENOMINATOR,
  WOOD_FULL_HELM,
  WOODEN_ARMOR,
} from "./items";

describe("equipment catalog", () => {
  it("keeps every combat helmet regen-only and chest health-only, including upgrades", () => {
    for (const item of Object.values(ITEM_DEFINITIONS) as ItemDefinition[]) {
      if (item.cosmeticOnly || !["HEAD", "CHEST"].includes(item.slot)) continue;
      for (const level of [0, 10]) {
        if (item.slot === "HEAD") {
          expect(itemMaxHealthMultiplierBonus(item.id, level), item.id).toBe(0);
          expect(itemRegenerationMultiplierBonus(item.id, level), item.id).toBeGreaterThan(0);
        } else {
          expect(itemRegenerationMultiplierBonus(item.id, level), item.id).toBe(0);
          expect(itemMaxHealthMultiplierBonus(item.id, level), item.id).toBeGreaterThan(0);
        }
        expect(itemDamageMultiplierBonus(item.id, level), item.id).toBe(0);
      }
    }
  });

  it("keeps regular and boss equipment in their own acquisition groups", () => {
    expect(STARTER_ITEM_IDS).toEqual([BASIC_PAPER_HAT, STARTER_STONE]);
    expect(DEVELOPER_ITEM_IDS).not.toContain(STARTER_BOW);
    expect(STARTER_ITEM_IDS).not.toContain(STARTER_BOW);
    expect(FOREST_DROP_ITEM_IDS).toEqual([STARTER_BOW, WOODEN_ARMOR]);
    expect(DESERT_DROP_ITEM_IDS).toEqual([WOOD_FULL_HELM, IRON_BOW]);
    expect(SNOW_DROP_ITEM_IDS).toEqual([SNOW_BOW]);
    expect(SNOW_BOSS_DROP_ITEM_IDS).toEqual([FROST_BOW, FROST_ARMOR]);
    expect(LAVA_DROP_ITEM_IDS).toEqual([FIRE_METAL_HELMET, MAGMA_ARMOR]);
    expect(LAVA_BOSS_DROP_ITEM_IDS).toEqual([LAVA_BOW]);
    expect(INFERNAL_DROP_ITEM_IDS).toEqual([DARK_METAL_HELMET, BLACK_BOOTS, NIGHT_BOW, FIRE_METAL_BOW]);
    expect(FOREST_ITEM_DROP_DENOMINATOR).toBe(25);
    expect(DESERT_ITEM_DROP_DENOMINATOR).toBe(50);
    expect(SNOW_ITEM_DROP_DENOMINATOR).toBe(50);
    expect(SNOW_BOSS_ITEM_DROP_DENOMINATOR).toBe(25);
    expect(SNOW_BOSS_ARMOR_DROP_DENOMINATOR).toBe(5);
    expect(LAVA_ITEM_DROP_DENOMINATOR).toBe(1_000);
    expect(LAVA_HELMET_ITEM_DROP_DENOMINATOR).toBe(125);
    expect(LAVA_BOSS_ITEM_DROP_DENOMINATOR).toBe(25);
    expect(INFERNAL_ITEM_DROP_DENOMINATOR).toBe(200);
    expect(NIGHT_FOREST_BOW_ITEM_DROP_DENOMINATOR).toBe(100);
    expect(NIGHT_FOREST_HELMET_ITEM_DROP_DENOMINATOR).toBe(125);
  });

  it("declares both bows as two-hand-slot-compatible ranged weapons", () => {
    expect(isWeaponItem(STARTER_BOW)).toBe(true);
    expect(itemFitsEquipmentSlot(STARTER_BOW, "RIGHT_HAND")).toBe(true);
    expect(itemFitsEquipmentSlot(STARTER_BOW, "LEFT_HAND")).toBe(true);
    expect(itemFitsEquipmentSlot(STARTER_BOW, "HEAD")).toBe(false);
    expect(isWeaponItem(FROST_BOW)).toBe(true);
    expect(itemFitsEquipmentSlot(FROST_BOW, "RIGHT_HAND")).toBe(true);
    expect(itemFitsEquipmentSlot(FROST_BOW, "LEFT_HAND")).toBe(true);
    expect(isWeaponItem(SNOW_BOW)).toBe(true);
    expect(isWeaponItem(NIGHT_BOW)).toBe(true);
  });

  it("keeps Rock, Bow, and Frost Bow as separate weapon IDs", () => {
    expect(canonicalItemId(STARTER_STONE)).toBe(STARTER_STONE);
    expect(canonicalItemId(STARTER_BOW)).toBe(STARTER_BOW);
    expect(canonicalItemId(FROST_BOW)).toBe(FROST_BOW);
    expect(isWeaponItem(STARTER_STONE)).toBe(true);
  });

  it("multiplies research and equipment bonuses", () => {
    expect(equipmentDamage(100, STARTER_BOW, "", "", 1.2)).toBe(126);
    expect(equipmentMaxHealth(100, "", WOODEN_ARMOR, 1.2)).toBe(126);
    expect(equipmentMaxHealth(100, "", "", 1.2)).toBe(120);
  });

  it("scales damage, health and regeneration with earned stats and tech", () => {
    for (const base of [0, 10, 1000, 1_000_000]) {
      for (const research of [1, 1.2, 3]) {
        expect(equipmentDamage(base, STARTER_BOW, "", "", research) - base * research).toBeCloseTo(base * .05 * research);
        expect(equipmentMaxHealth(base, WOOD_FULL_HELM, WOODEN_ARMOR, research) - base * research).toBeCloseTo(base * .05 * research);
        expect(equipmentRegeneration(base, FIRE_METAL_HELMET, MAGMA_ARMOR, research) - base * research).toBeCloseTo(base * .1518 * research);
      }
    }
  });

  it("gives each map a larger percentage while preserving the stronger rare bows", () => {
    expect(itemDamageMultiplierBonus(STARTER_BOW)).toBe(.05);
    expect(itemDamageMultiplierBonus(IRON_BOW)).toBeCloseTo(.0804, 6);
    expect(itemDamageMultiplierBonus(SNOW_BOW)).toBe(.0971);
    expect(itemDamageMultiplierBonus(FROST_BOW)).toBe(.1143);
    expect(itemDamageMultiplierBonus(LAVA_BOW)).toBe(.1518);
    expect(itemDamageMultiplierBonus(NIGHT_BOW)).toBeCloseTo(.1639, 6);
    expect(itemDamageMultiplierBonus(FIRE_METAL_BOW)).toBeCloseTo(.1929, 6);
    expect(itemDamageMultiplierBonus(FIRE_METAL_HELMET)).toBe(0);
    expect(itemStats(MAGMA_ARMOR)).toEqual(["MAX HEALTH +15.18%"]);
    expect(itemStats(DARK_METAL_HELMET)).toEqual(["REGEN +19.29%"]);
  });

  it("requires earned regeneration for helmet percentage bonuses", () => {
    expect(equipmentRegeneration(0, WOOD_FULL_HELM, FROST_ARMOR)).toBe(0);
    expect(itemMaxHealthMultiplierBonus(FROST_ARMOR)).toBe(.1143);
    expect(itemRegenerationMultiplierBonus(FROST_ARMOR)).toBe(0);
    expect(itemFitsEquipmentSlot(FROST_ARMOR, "CHEST")).toBe(true);
    expect(itemFitsEquipmentSlot(FROST_ARMOR, "HEAD")).toBe(false);
  });

  it("clamps legacy duplicate items to unique ownership", () => {
    expect(inventoryJsonItemQuantity(JSON.stringify([FROST_BOW, STARTER_BOW, FROST_BOW]), FROST_BOW)).toBe(1);
    expect(inventoryJsonItemQuantity("not json", FROST_BOW)).toBe(0);
  });

  it("uses a three-minute first tier that grows toward three hundred hours a slot", () => {
    expect(itemUpgradeDurationMs(0)).toBe(180_000);
    expect(itemUpgradeDurationMs(1)).toBe(221_292);
    expect(itemUpgradeDurationMs(MAX_SLOT_UPGRADE_TIER + 99)).toBe(itemUpgradeDurationMs(MAX_SLOT_UPGRADE_TIER));
    let total = 0;
    for (let tier = 0; tier < MAX_SLOT_UPGRADE_TIER; tier += 1) total += itemUpgradeDurationMs(tier);
    expect(total / 3.6e6).toBeCloseTo(300, 0);
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
    expect(isUpgradeableItem(SNOW_BOW)).toBe(true);
    expect(isUpgradeableItem(NIGHT_BOW)).toBe(true);
    expect(isUpgradeableItem(STARTER_STONE)).toBe(false);
    expect(isUpgradeableItem(BASIC_PAPER_HAT)).toBe(false);
  });

  // A finished slot is +140% of whatever the item brings by itself.
  it("adds the slot's tiers on top of the item's own bonus", () => {
    expect(itemDamageMultiplierBonus(FROST_BOW, MAX_SLOT_UPGRADE_TIER)).toBe(.2743);
    expect(itemMaxHealthMultiplierBonus(FROST_ARMOR, MAX_SLOT_UPGRADE_TIER)).toBe(.2743);
    expect(itemRegenerationMultiplierBonus(WOOD_FULL_HELM, MAX_SLOT_UPGRADE_TIER)).toBe(.193);
    expect(itemDamageMultiplierBonus(STARTER_BOW, MAX_SLOT_UPGRADE_TIER)).toBe(.12);
    expect(itemMaxHealthMultiplierBonus(WOODEN_ARMOR, MAX_SLOT_UPGRADE_TIER)).toBe(.12);
    expect(itemRegenerationMultiplierBonus(WOODEN_ARMOR, 10)).toBe(0);
    expect(itemDisplayName(FROST_BOW, 1)).toBe("FROST BOW +1");
    expect(itemStats(STARTER_BOW, 1)).toEqual(["DAMAGE +5.2%"]);
    expect(itemUpgradeStatChanges(STARTER_BOW, 0)).toEqual([
      { label: "DAMAGE", current: "+5%", next: "+5.2%" },
    ]);
    expect(equipmentDamage(100, STARTER_BOW, "", "", 1.4, MAX_SLOT_UPGRADE_TIER)).toBeCloseTo(156.8);
  });
});


it("shows percentage health and regen upgrade previews with fractional precision", () => {
  expect(itemUpgradeStatChanges(WOODEN_ARMOR, 0)).toEqual([
    { label: "MAX HEALTH", current: "+5%", next: "+5.2%" },
  ]);
  expect(itemUpgradeStatChanges(WOOD_FULL_HELM, 0)).toEqual([
    { label: "REGEN", current: "+8.04%", next: "+8.36%" },
  ]);
  expect(itemRegenerationMultiplierBonus(WOOD_FULL_HELM, 1)).toBe(.0836);
});
