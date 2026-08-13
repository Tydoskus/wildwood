import { describe, expect, it } from "vitest";
import { inventoryFromSave, normaliseInventory, serialiseInventory, TRAILBLAZER_BOOTS } from "./inventory";

describe("inventory rules", () => {
  it("rejects malformed inventory and restores a valid saved item", () => {
    expect(inventoryFromSave("not json", TRAILBLAZER_BOOTS, false)).toEqual({ itemIds: [], equippedFeet: "" });
    expect(normaliseInventory([TRAILBLAZER_BOOTS], TRAILBLAZER_BOOTS, false)).toEqual({ itemIds: [TRAILBLAZER_BOOTS], equippedFeet: TRAILBLAZER_BOOTS });
  });

  it("restores and serialises an earned boots item", () => {
    const inventory = inventoryFromSave("[]", TRAILBLAZER_BOOTS, true);
    expect(inventory).toEqual({ itemIds: [TRAILBLAZER_BOOTS], equippedFeet: TRAILBLAZER_BOOTS });
    expect(serialiseInventory(inventory)).toBe(JSON.stringify([TRAILBLAZER_BOOTS]));
  });
});
