import { describe, expect, it } from "vitest";
import { BASIC_PAPER_HAT, inventoryFromSave, LEGENDARY_WHITE_GOLD_ARMOR, moveInventoryItem, normaliseInventory, serialiseInventory, STARTER_STONE, SUPERIOR_GOLDEN_HELMET, TRAILBLAZER_BOOTS } from "./inventory";

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
      itemIds: [BASIC_PAPER_HAT, SUPERIOR_GOLDEN_HELMET, STARTER_STONE, LEGENDARY_WHITE_GOLD_ARMOR],
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
});
