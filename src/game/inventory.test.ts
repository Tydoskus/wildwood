import { describe, expect, it } from "vitest";
import { bagInventoryStacks, BASIC_PAPER_HAT, FROST_ARMOR, FROST_BOW, inventoryFromSave, inventoryItemQuantity, LEGENDARY_WHITE_GOLD_ARMOR, moveInventoryItem, normaliseInventory, serialiseInventory, setInventoryItemQuantity, STARTER_BOW, STARTER_STONE, SUPERIOR_GOLDEN_HELMET, TRAILBLAZER_BOOTS, WOODEN_ARMOR } from "./inventory";

describe("inventory rules", () => {
  it("rejects malformed inventory and restores a valid saved item", () => {
    expect(inventoryFromSave("not json", TRAILBLAZER_BOOTS, undefined, undefined, false)).toEqual({ itemIds: [BASIC_PAPER_HAT, STARTER_STONE], equippedHead: BASIC_PAPER_HAT, equippedChest: "", equippedFeet: "", equippedRightHand: STARTER_STONE, equippedLeftHand: "" });
    expect(normaliseInventory([TRAILBLAZER_BOOTS], TRAILBLAZER_BOOTS, BASIC_PAPER_HAT, undefined, false)).toEqual({ itemIds: [BASIC_PAPER_HAT, STARTER_STONE, TRAILBLAZER_BOOTS], equippedHead: BASIC_PAPER_HAT, equippedChest: "", equippedFeet: TRAILBLAZER_BOOTS, equippedRightHand: STARTER_STONE, equippedLeftHand: "" });
  });

  it("restores and serialises an earned boots item", () => {
    const inventory = inventoryFromSave("[]", TRAILBLAZER_BOOTS, BASIC_PAPER_HAT, "", true);
    expect(inventory).toEqual({ itemIds: [BASIC_PAPER_HAT, STARTER_STONE, TRAILBLAZER_BOOTS], equippedHead: BASIC_PAPER_HAT, equippedChest: "", equippedFeet: TRAILBLAZER_BOOTS, equippedRightHand: STARTER_STONE, equippedLeftHand: "" });
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

  it("preserves earned Bow stacks without replacing Rock and equips one weapon at a time", () => {
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
    expect(inventoryItemQuantity(inventory, STARTER_BOW)).toBe(2);
    expect(moveInventoryItem(inventory, STARTER_BOW, "LEFT_HAND")).toBe(true);
    expect(inventory.equippedRightHand).toBe("");
    expect(inventory.equippedLeftHand).toBe(STARTER_BOW);
    expect(bagInventoryStacks(inventory)).toContainEqual({ itemId: STARTER_BOW, quantity: 1 });
  });

  it("groups duplicate forest equipment into bag stacks and subtracts equipped copies", () => {
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

    expect(bagInventoryStacks(inventory)).toEqual([
      { itemId: STARTER_STONE, quantity: 1 },
      { itemId: STARTER_BOW, quantity: 2 },
      { itemId: WOODEN_ARMOR, quantity: 1 },
    ]);
    expect(setInventoryItemQuantity(inventory, STARTER_BOW, 4)).toBe(true);
    expect(inventoryItemQuantity(inventory, STARTER_BOW)).toBe(4);
    expect(serialiseInventory(inventory)).toContain(`"${STARTER_BOW}","${STARTER_BOW}"`);
  });

  it("preserves, stacks, equips, and serialises Frost Bows like normal items", () => {
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

    expect(inventoryItemQuantity(inventory, FROST_BOW)).toBe(3);
    expect(inventory.equippedRightHand).toBe(FROST_BOW);
    expect(bagInventoryStacks(inventory)).toContainEqual({ itemId: FROST_BOW, quantity: 2 });
    expect(moveInventoryItem(inventory, FROST_BOW, "LEFT_HAND")).toBe(true);
    expect(inventory.equippedLeftHand).toBe(FROST_BOW);
    expect(setInventoryItemQuantity(inventory, FROST_BOW, 4)).toBe(true);
    expect(inventoryItemQuantity(inventory, FROST_BOW)).toBe(4);
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

  it("preserves and stacks Frost Armor while subtracting its equipped copy", () => {
    const inventory = inventoryFromSave(
      JSON.stringify([FROST_ARMOR, FROST_ARMOR, FROST_ARMOR]),
      "",
      BASIC_PAPER_HAT,
      FROST_ARMOR,
      false,
    );
    expect(inventoryItemQuantity(inventory, FROST_ARMOR)).toBe(3);
    expect(inventory.equippedChest).toBe(FROST_ARMOR);
    expect(bagInventoryStacks(inventory)).toContainEqual({ itemId: FROST_ARMOR, quantity: 2 });
    expect(setInventoryItemQuantity(inventory, FROST_ARMOR, 4)).toBe(true);
    expect(inventoryItemQuantity(inventory, FROST_ARMOR)).toBe(4);
  });
});
