import { describe, expect, it } from "vitest";
import { BASIC_PAPER_HAT, inventoryFromSave, normaliseInventory, serialiseInventory, TRAILBLAZER_BOOTS } from "./inventory";

describe("inventory rules", () => {
  it("rejects malformed inventory and restores a valid saved item", () => {
    expect(inventoryFromSave("not json", TRAILBLAZER_BOOTS, undefined, false)).toEqual({ itemIds: [BASIC_PAPER_HAT], equippedHead: BASIC_PAPER_HAT, equippedFeet: "" });
    expect(normaliseInventory([TRAILBLAZER_BOOTS], TRAILBLAZER_BOOTS, BASIC_PAPER_HAT, false)).toEqual({ itemIds: [BASIC_PAPER_HAT, TRAILBLAZER_BOOTS], equippedHead: BASIC_PAPER_HAT, equippedFeet: TRAILBLAZER_BOOTS });
  });

  it("restores and serialises an earned boots item", () => {
    const inventory = inventoryFromSave("[]", TRAILBLAZER_BOOTS, BASIC_PAPER_HAT, true);
    expect(inventory).toEqual({ itemIds: [BASIC_PAPER_HAT, TRAILBLAZER_BOOTS], equippedHead: BASIC_PAPER_HAT, equippedFeet: TRAILBLAZER_BOOTS });
    expect(serialiseInventory(inventory)).toBe(JSON.stringify([BASIC_PAPER_HAT, TRAILBLAZER_BOOTS]));
  });
});
