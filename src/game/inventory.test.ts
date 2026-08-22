import { describe, expect, it } from "vitest";
import { bagInventoryStacks, BASIC_PAPER_HAT, equipmentAppearance, FROST_ARMOR, FROST_BOW, inventoryFromSave, inventoryItemQuantity, LEGENDARY_WHITE_GOLD_ARMOR, moveCosmeticInventoryItem, moveInventoryItem, normaliseInventory, ownedInventoryStacks, serialiseInventory, setInventoryItemQuantity, STARTER_BOW, STARTER_STONE, SUPERIOR_GOLDEN_HELMET, TRAILBLAZER_BOOTS, WOODEN_ARMOR } from "./inventory";

const emptyCosmetics = {
  cosmeticHead: "",
  cosmeticChest: "",
  cosmeticFeet: "",
  cosmeticRightHand: "",
  cosmeticLeftHand: "",
};

describe("inventory rules", () => {
  it("rejects malformed inventory and restores a valid saved item", () => {
    expect(inventoryFromSave("not json", TRAILBLAZER_BOOTS, undefined, undefined, false)).toEqual({ itemIds: [BASIC_PAPER_HAT, STARTER_STONE], equippedHead: BASIC_PAPER_HAT, equippedChest: "", equippedFeet: "", equippedRightHand: STARTER_STONE, equippedLeftHand: "", ...emptyCosmetics });
    expect(normaliseInventory([TRAILBLAZER_BOOTS], TRAILBLAZER_BOOTS, BASIC_PAPER_HAT, undefined, false)).toEqual({ itemIds: [BASIC_PAPER_HAT, STARTER_STONE, TRAILBLAZER_BOOTS], equippedHead: BASIC_PAPER_HAT, equippedChest: "", equippedFeet: TRAILBLAZER_BOOTS, equippedRightHand: STARTER_STONE, equippedLeftHand: "", ...emptyCosmetics });
  });

  it("restores and serialises an earned boots item", () => {
    const inventory = inventoryFromSave("[]", TRAILBLAZER_BOOTS, BASIC_PAPER_HAT, "", true);
    expect(inventory).toEqual({ itemIds: [BASIC_PAPER_HAT, STARTER_STONE, TRAILBLAZER_BOOTS], equippedHead: BASIC_PAPER_HAT, equippedChest: "", equippedFeet: TRAILBLAZER_BOOTS, equippedRightHand: STARTER_STONE, equippedLeftHand: "", ...emptyCosmetics });
    expect(serialiseInventory(inventory)).toBe(JSON.stringify([BASIC_PAPER_HAT, STARTER_STONE, TRAILBLAZER_BOOTS]));
  });

  it("keeps the developer-only golden helmet cosmetic available and equipable", () => {
    expect(inventoryFromSave("[]", "", SUPERIOR_GOLDEN_HELMET, LEGENDARY_WHITE_GOLD_ARMOR, false, true)).toEqual({
      itemIds: [BASIC_PAPER_HAT, STARTER_STONE, SUPERIOR_GOLDEN_HELMET, LEGENDARY_WHITE_GOLD_ARMOR],
      equippedHead: SUPERIOR_GOLDEN_HELMET,
      equippedChest: LEGENDARY_WHITE_GOLD_ARMOR,
      equippedFeet: "",
      equippedRightHand: STARTER_STONE,
      equippedLeftHand: "",
      ...emptyCosmetics,
    });
  });

  it("preserves intentional empty head and hand slots", () => {
    expect(inventoryFromSave(
      JSON.stringify([BASIC_PAPER_HAT, STARTER_STONE]),
      "",
      "",
      "",
      false,
      false,
      "",
      "",
    )).toEqual({
      itemIds: [BASIC_PAPER_HAT, STARTER_STONE],
      equippedHead: "",
      equippedChest: "",
      equippedFeet: "",
      equippedRightHand: "",
      equippedLeftHand: "",
      ...emptyCosmetics,
    });
  });

  it("round-trips hat removal and a right-to-left weapon switch", () => {
    const inventory = normaliseInventory(
      [BASIC_PAPER_HAT, STARTER_STONE],
      "",
      BASIC_PAPER_HAT,
      "",
      false,
      false,
      STARTER_STONE,
      "",
    );

    expect(moveInventoryItem(inventory, BASIC_PAPER_HAT, "BAG")).toBe(true);
    expect(moveInventoryItem(inventory, STARTER_STONE, "LEFT_HAND")).toBe(true);
    expect(inventory.equippedHead).toBe("");
    expect(inventory.equippedRightHand).toBe("");
    expect(inventory.equippedLeftHand).toBe(STARTER_STONE);

    expect(inventoryFromSave(
      serialiseInventory(inventory),
      inventory.equippedFeet,
      inventory.equippedHead,
      inventory.equippedChest,
      false,
      false,
      inventory.equippedRightHand,
      inventory.equippedLeftHand,
    )).toEqual(inventory);
  });

  it("migrates duplicate Bows to one unique item without replacing Rock", () => {
    const inventory = inventoryFromSave(
      JSON.stringify([BASIC_PAPER_HAT, STARTER_STONE, STARTER_BOW, STARTER_BOW]),
      "",
      BASIC_PAPER_HAT,
      "",
      false,
      false,
      STARTER_STONE,
      "",
    );
    expect(inventory.itemIds).toContain(STARTER_STONE);
    expect(inventoryItemQuantity(inventory, STARTER_BOW)).toBe(1);
    expect(moveInventoryItem(inventory, STARTER_BOW, "LEFT_HAND")).toBe(true);
    expect(inventory.equippedRightHand).toBe("");
    expect(inventory.equippedLeftHand).toBe(STARTER_BOW);
    expect(bagInventoryStacks(inventory).map(({ itemId }) => itemId)).not.toContain(STARTER_BOW);
  });

  it("clamps legacy forest duplicates and keeps equipped items out of the bag", () => {
    const inventory = normaliseInventory(
      [STARTER_BOW, STARTER_BOW, STARTER_BOW, WOODEN_ARMOR, WOODEN_ARMOR],
      "",
      BASIC_PAPER_HAT,
      WOODEN_ARMOR,
      false,
      false,
      STARTER_BOW,
      "",
    );

    expect(bagInventoryStacks(inventory)).toEqual([{ itemId: STARTER_STONE, quantity: 1 }]);
    expect(setInventoryItemQuantity(inventory, STARTER_BOW, 4)).toBe(true);
    expect(inventoryItemQuantity(inventory, STARTER_BOW)).toBe(1);
    expect(JSON.parse(serialiseInventory(inventory)).filter((itemId: string) => itemId === STARTER_BOW)).toHaveLength(1);
  });

  it("migrates Frost Bow stacks into one unique equipable item", () => {
    const inventory = inventoryFromSave(
      JSON.stringify([FROST_BOW, FROST_BOW, FROST_BOW]),
      "",
      BASIC_PAPER_HAT,
      "",
      false,
      false,
      FROST_BOW,
      "",
    );

    expect(inventoryItemQuantity(inventory, FROST_BOW)).toBe(1);
    expect(inventory.equippedRightHand).toBe(FROST_BOW);
    expect(bagInventoryStacks(inventory).map(({ itemId }) => itemId)).not.toContain(FROST_BOW);
    expect(moveInventoryItem(inventory, FROST_BOW, "LEFT_HAND")).toBe(true);
    expect(inventory.equippedLeftHand).toBe(FROST_BOW);
    expect(setInventoryItemQuantity(inventory, FROST_BOW, 4)).toBe(true);
    expect(inventoryItemQuantity(inventory, FROST_BOW)).toBe(1);
    expect(inventoryFromSave(
      serialiseInventory(inventory),
      "",
      BASIC_PAPER_HAT,
      "",
      false,
      false,
      "",
      FROST_BOW,
    ).equippedLeftHand).toBe(FROST_BOW);
  });

  it("migrates Frost Armor stacks into one unique equipped item", () => {
    const inventory = inventoryFromSave(
      JSON.stringify([FROST_ARMOR, FROST_ARMOR, FROST_ARMOR]),
      "",
      BASIC_PAPER_HAT,
      FROST_ARMOR,
      false,
    );
    expect(inventoryItemQuantity(inventory, FROST_ARMOR)).toBe(1);
    expect(inventory.equippedChest).toBe(FROST_ARMOR);
    expect(bagInventoryStacks(inventory).map(({ itemId }) => itemId)).not.toContain(FROST_ARMOR);
    expect(setInventoryItemQuantity(inventory, FROST_ARMOR, 4)).toBe(true);
    expect(inventoryItemQuantity(inventory, FROST_ARMOR)).toBe(1);
  });

  it("uses free owned copies as cosmetic overrides without changing stat equipment", () => {
    const inventory = inventoryFromSave(
      JSON.stringify([STARTER_BOW, WOODEN_ARMOR, FROST_ARMOR]),
      "",
      BASIC_PAPER_HAT,
      WOODEN_ARMOR,
      false,
      false,
      STARTER_STONE,
      "",
    );

    expect(moveCosmeticInventoryItem(inventory, STARTER_BOW, "LEFT_HAND")).toBe(true);
    expect(moveCosmeticInventoryItem(inventory, FROST_ARMOR, "CHEST")).toBe(true);
    expect(inventory.equippedRightHand).toBe(STARTER_STONE);
    expect(inventory.equippedChest).toBe(WOODEN_ARMOR);
    expect(ownedInventoryStacks(inventory)).toContainEqual({ itemId: STARTER_BOW, quantity: 1 });
    expect(bagInventoryStacks(inventory).map(({ itemId }) => itemId)).not.toContain(STARTER_BOW);
    expect(bagInventoryStacks(inventory).map(({ itemId }) => itemId)).not.toContain(FROST_ARMOR);
    expect(equipmentAppearance(inventory)).toEqual({
      headItem: BASIC_PAPER_HAT,
      chestItem: FROST_ARMOR,
      feetItem: "",
      rightHandItem: "",
      leftHandItem: STARTER_BOW,
    });
  });

  it("moves one unique item between stat and cosmetic loadouts", () => {
    const inventory = inventoryFromSave(
      JSON.stringify([FROST_ARMOR]),
      "",
      BASIC_PAPER_HAT,
      FROST_ARMOR,
      false,
      false,
      "",
      "",
      "",
      FROST_ARMOR,
    );

    expect(inventory.cosmeticChest).toBe("");
    expect(moveCosmeticInventoryItem(inventory, FROST_ARMOR, "CHEST")).toBe(false);
    expect(bagInventoryStacks(inventory).map(({ itemId }) => itemId)).not.toContain(FROST_ARMOR);

    expect(setInventoryItemQuantity(inventory, FROST_ARMOR, 2)).toBe(true);
    expect(inventoryItemQuantity(inventory, FROST_ARMOR)).toBe(1);
    expect(moveCosmeticInventoryItem(inventory, FROST_ARMOR, "CHEST")).toBe(false);

    expect(moveInventoryItem(inventory, FROST_ARMOR, "BAG")).toBe(true);
    expect(moveCosmeticInventoryItem(inventory, FROST_ARMOR, "CHEST")).toBe(true);
    expect(bagInventoryStacks(inventory).map(({ itemId }) => itemId)).not.toContain(FROST_ARMOR);
    expect(moveCosmeticInventoryItem(inventory, FROST_ARMOR, "BAG")).toBe(true);
    expect(bagInventoryStacks(inventory)).toContainEqual({ itemId: FROST_ARMOR, quantity: 1 });
  });

  it("round-trips cosmetic slots and rejects unowned or incompatible overrides", () => {
    const inventory = inventoryFromSave(
      JSON.stringify([STARTER_BOW, FROST_ARMOR]),
      "",
      BASIC_PAPER_HAT,
      "",
      false,
      false,
      STARTER_STONE,
      "",
      FROST_ARMOR,
      FROST_ARMOR,
      STARTER_BOW,
      "",
      STARTER_BOW,
    );

    expect(inventory.cosmeticHead).toBe("");
    expect(inventory.cosmeticChest).toBe(FROST_ARMOR);
    expect(inventory.cosmeticFeet).toBe("");
    expect(inventory.cosmeticLeftHand).toBe(STARTER_BOW);
    expect(inventoryFromSave(
      serialiseInventory(inventory),
      inventory.equippedFeet,
      inventory.equippedHead,
      inventory.equippedChest,
      false,
      false,
      inventory.equippedRightHand,
      inventory.equippedLeftHand,
      inventory.cosmeticHead,
      inventory.cosmeticChest,
      inventory.cosmeticFeet,
      inventory.cosmeticRightHand,
      inventory.cosmeticLeftHand,
    )).toEqual(inventory);
  });
});
