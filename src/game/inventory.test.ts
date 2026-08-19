import { describe, expect, it } from "vitest";
import { BASIC_PAPER_HAT, inventoryFromSave, LEGENDARY_WHITE_GOLD_ARMOR, LEGACY_STARTER_STONE, moveInventoryItem, normaliseInventory, serialiseInventory, STARTER_BOW, SUPERIOR_GOLDEN_HELMET, TRAILBLAZER_BOOTS } from "./inventory";

describe("inventory rules", () => {
  it("rejects malformed inventory and restores a valid saved item", () => {
    expect(inventoryFromSave("not json", TRAILBLAZER_BOOTS, undefined, undefined, false)).toEqual({ itemIds: [BASIC_PAPER_HAT, STARTER_BOW], equippedHead: BASIC_PAPER_HAT, equippedChest: "", equippedFeet: "", equippedRightHand: STARTER_BOW, equippedLeftHand: "" });
    expect(normaliseInventory([TRAILBLAZER_BOOTS], TRAILBLAZER_BOOTS, BASIC_PAPER_HAT, undefined, false)).toEqual({ itemIds: [BASIC_PAPER_HAT, STARTER_BOW, TRAILBLAZER_BOOTS], equippedHead: BASIC_PAPER_HAT, equippedChest: "", equippedFeet: TRAILBLAZER_BOOTS, equippedRightHand: STARTER_BOW, equippedLeftHand: "" });
  });

  it("restores and serialises an earned boots item", () => {
    const inventory = inventoryFromSave("[]", TRAILBLAZER_BOOTS, BASIC_PAPER_HAT, "", true);
    expect(inventory).toEqual({ itemIds: [BASIC_PAPER_HAT, STARTER_BOW, TRAILBLAZER_BOOTS], equippedHead: BASIC_PAPER_HAT, equippedChest: "", equippedFeet: TRAILBLAZER_BOOTS, equippedRightHand: STARTER_BOW, equippedLeftHand: "" });
    expect(serialiseInventory(inventory)).toBe(JSON.stringify([BASIC_PAPER_HAT, STARTER_BOW, TRAILBLAZER_BOOTS]));
  });

  it("keeps the developer-only golden helmet cosmetic available and equipable", () => {
    expect(inventoryFromSave("[]", "", SUPERIOR_GOLDEN_HELMET, LEGENDARY_WHITE_GOLD_ARMOR, false, true)).toEqual({
      itemIds: [BASIC_PAPER_HAT, STARTER_BOW, SUPERIOR_GOLDEN_HELMET, LEGENDARY_WHITE_GOLD_ARMOR],
      equippedHead: SUPERIOR_GOLDEN_HELMET,
      equippedChest: LEGENDARY_WHITE_GOLD_ARMOR,
      equippedFeet: "",
      equippedRightHand: STARTER_BOW,
      equippedLeftHand: "",
    });
  });

  it("preserves intentional empty head and hand slots", () => {
    expect(inventoryFromSave(
      JSON.stringify([BASIC_PAPER_HAT, STARTER_BOW]),
      "",
      "",
      "",
      false,
      false,
      "",
      "",
    )).toEqual({
      itemIds: [BASIC_PAPER_HAT, STARTER_BOW],
      equippedHead: "",
      equippedChest: "",
      equippedFeet: "",
      equippedRightHand: "",
      equippedLeftHand: "",
    });
  });

  it("round-trips hat removal and a right-to-left weapon switch", () => {
    const inventory = normaliseInventory(
      [BASIC_PAPER_HAT, STARTER_BOW],
      "",
      BASIC_PAPER_HAT,
      "",
      false,
      false,
      STARTER_BOW,
      "",
    );

    expect(moveInventoryItem(inventory, BASIC_PAPER_HAT, "BAG")).toBe(true);
    expect(moveInventoryItem(inventory, STARTER_BOW, "LEFT_HAND")).toBe(true);
    expect(inventory.equippedHead).toBe("");
    expect(inventory.equippedRightHand).toBe("");
    expect(inventory.equippedLeftHand).toBe(STARTER_BOW);

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

  it("migrates the retired Rock to the Bow without changing its hand", () => {
    expect(inventoryFromSave(
      JSON.stringify([BASIC_PAPER_HAT, LEGACY_STARTER_STONE]),
      "",
      BASIC_PAPER_HAT,
      "",
      false,
      false,
      "",
      LEGACY_STARTER_STONE,
    )).toMatchObject({
      itemIds: [BASIC_PAPER_HAT, STARTER_BOW],
      equippedRightHand: "",
      equippedLeftHand: STARTER_BOW,
    });
  });
});
