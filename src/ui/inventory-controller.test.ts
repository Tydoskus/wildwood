import { describe, expect, it } from "vitest";
import { FROST_ARMOR, STARTER_BOW, STARTER_STONE } from "../game/inventory";
import { inventoryMoveActions } from "./hud";
import { clearInventorySelection, inventorySelectionAfterMove, nextInventorySelection } from "./inventory-controller";
import { itemInspectionButtonLabel } from "./item-inspection-controller";

describe("inventory selection", () => {
  it("presents inventory action labels in Camel Case", () => {
    expect(itemInspectionButtonLabel("EQUIP RIGHT")).toBe("Equip Right");
    expect(itemInspectionButtonLabel("REMOVE COSMETIC")).toBe("Remove Cosmetic");
    expect(itemInspectionButtonLabel("Back")).toBe("Back");
  });
  it("unselects an item when tapped twice", () => {
    expect(nextInventorySelection("starter_stone", "starter_stone")).toBe("");
  });

  it("selects a different item", () => {
    expect(nextInventorySelection("starter_stone", "starter_bow")).toBe("starter_bow");
  });

  it("starts a newly opened inventory without a selected item", () => {
    const selection = { selectedItemId: STARTER_BOW, selectedItemLocation: "BAG" as const };
    clearInventorySelection(selection);
    expect(selection).toEqual({ selectedItemId: "", selectedItemLocation: "" });
  });

  it("clears selection after an item is equipped", () => {
    expect(inventorySelectionAfterMove(STARTER_BOW, "RIGHT_HAND")).toEqual({ itemId: "", location: "" });
  });

  it("clears selection after an item is returned to the bag", () => {
    expect(inventorySelectionAfterMove(STARTER_BOW, "BAG")).toEqual({ itemId: "", location: "" });
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
