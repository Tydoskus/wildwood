import { describe, expect, it } from "vitest";
import { FROST_ARMOR, STARTER_BOW, STARTER_STONE } from "../game/inventory";
import { inventoryMoveActions } from "./hud";
import { nextInventorySelection } from "./inventory-controller";

describe("inventory selection", () => {
  it("unselects an item when tapped twice", () => {
    expect(nextInventorySelection("starter_stone", "starter_stone")).toBe("");
  });

  it("selects a different item", () => {
    expect(nextInventorySelection("starter_stone", "starter_bow")).toBe("starter_bow");
  });
});

describe("inventory direct actions", () => {
  const inventory = () => ({
    itemIds: [STARTER_STONE, STARTER_BOW, FROST_ARMOR],
    equippedHead: "",
    equippedChest: "",
    equippedFeet: "",
    equippedRightHand: STARTER_STONE,
    equippedLeftHand: "",
    cosmeticHead: "",
    cosmeticChest: "",
    cosmeticFeet: "",
    cosmeticRightHand: "",
    cosmeticLeftHand: "",
    selectedItemId: "",
    selectedItemLocation: "" as const,
  });

  it("offers both hands for a bag weapon", () => {
    expect(inventoryMoveActions(inventory(), STARTER_BOW, "BAG")).toEqual([
      { label: "EQUIP RIGHT", destination: "RIGHT_HAND", disabled: false },
      { label: "EQUIP LEFT", destination: "LEFT_HAND", disabled: false },
    ]);
  });

  it("marks an already-equipped copy without hiding the other hand", () => {
    const state = inventory();
    state.equippedRightHand = STARTER_BOW;
    expect(inventoryMoveActions(state, STARTER_BOW, "BAG")).toEqual([
      { label: "RIGHT HAND EQUIPPED", destination: "RIGHT_HAND", disabled: true },
      { label: "EQUIP LEFT", destination: "LEFT_HAND", disabled: false },
    ]);
  });

  it("offers unequip and hand switching for an equipped weapon", () => {
    expect(inventoryMoveActions(inventory(), STARTER_STONE, "RIGHT_HAND")).toEqual([
      { label: "UNEQUIP", destination: "BAG" },
      { label: "MOVE TO LEFT", destination: "LEFT_HAND" },
    ]);
  });

  it("offers the matching armor slot", () => {
    expect(inventoryMoveActions(inventory(), FROST_ARMOR, "BAG")).toEqual([
      { label: "EQUIP", destination: "CHEST", disabled: false },
    ]);
  });

  it("offers visual-only cosmetic actions without treating regular equipment as active cosmetics", () => {
    expect(inventoryMoveActions(inventory(), FROST_ARMOR, "BAG", "COSMETICS")).toEqual([
      { label: "USE COSMETIC", destination: "CHEST", disabled: false },
    ]);
    const state = inventory();
    state.cosmeticRightHand = STARTER_BOW;
    expect(inventoryMoveActions(state, STARTER_BOW, "RIGHT_HAND", "COSMETICS")).toEqual([
      { label: "REMOVE COSMETIC", destination: "BAG" },
      { label: "MOVE TO LEFT", destination: "LEFT_HAND" },
    ]);
  });
});
