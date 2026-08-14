import { describe, expect, it } from "vitest";
import { BASIC_PAPER_HAT, inventoryFromSave, LEGENDARY_WHITE_GOLD_ARMOR, normaliseInventory, serialiseInventory, SUPERIOR_GOLDEN_HELMET, TRAILBLAZER_BOOTS } from "./inventory";

describe("inventory rules", () => {
  it("rejects malformed inventory and restores a valid saved item", () => {
    expect(inventoryFromSave("not json", TRAILBLAZER_BOOTS, undefined, undefined, false)).toEqual({ itemIds: [BASIC_PAPER_HAT], equippedHead: BASIC_PAPER_HAT, equippedChest: "", equippedFeet: "" });
    expect(normaliseInventory([TRAILBLAZER_BOOTS], TRAILBLAZER_BOOTS, BASIC_PAPER_HAT, undefined, false)).toEqual({ itemIds: [BASIC_PAPER_HAT, TRAILBLAZER_BOOTS], equippedHead: BASIC_PAPER_HAT, equippedChest: "", equippedFeet: TRAILBLAZER_BOOTS });
  });

  it("restores and serialises an earned boots item", () => {
    const inventory = inventoryFromSave("[]", TRAILBLAZER_BOOTS, BASIC_PAPER_HAT, "", true);
    expect(inventory).toEqual({ itemIds: [BASIC_PAPER_HAT, TRAILBLAZER_BOOTS], equippedHead: BASIC_PAPER_HAT, equippedChest: "", equippedFeet: TRAILBLAZER_BOOTS });
    expect(serialiseInventory(inventory)).toBe(JSON.stringify([BASIC_PAPER_HAT, TRAILBLAZER_BOOTS]));
  });

  it("keeps the developer-only golden helmet cosmetic available and equipable", () => {
    expect(inventoryFromSave("[]", "", SUPERIOR_GOLDEN_HELMET, LEGENDARY_WHITE_GOLD_ARMOR, false, true)).toEqual({
      itemIds: [BASIC_PAPER_HAT, SUPERIOR_GOLDEN_HELMET, LEGENDARY_WHITE_GOLD_ARMOR],
      equippedHead: SUPERIOR_GOLDEN_HELMET,
      equippedChest: LEGENDARY_WHITE_GOLD_ARMOR,
      equippedFeet: "",
    });
  });
});
