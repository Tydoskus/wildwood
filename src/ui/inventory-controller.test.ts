import { describe, expect, it } from "vitest";
import { FROST_ARMOR, STARTER_BOW, STARTER_STONE } from "../game/inventory";
import { inventoryMoveActions, inventoryWeaponSlot } from "./hud";
import { clearInventorySelection } from "./inventory-controller";
import { itemInspectionButtonLabel } from "./item-inspection-controller";

describe("inventory selection", () => {
  it("presents inventory action labels in Camel Case", () => {
    expect(itemInspectionButtonLabel("EQUIP RIGHT")).toBe("Equip Right");
    expect(itemInspectionButtonLabel("REMOVE COSMETIC")).toBe("Remove Cosmetic");
    expect(itemInspectionButtonLabel("Back")).toBe("Back");
  });

  it("starts a newly opened inventory without a selected item", () => {
    const selection = { selectedItemId: STARTER_BOW, selectedItemLocation: "BAG" as const };
    clearInventorySelection(selection);
    expect(selection).toEqual({ selectedItemId: "", selectedItemLocation: "" });
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

  it("offers one equip action for a bag weapon", () => {
    expect(inventoryMoveActions(inventory(), STARTER_BOW, "BAG")).toEqual([
      { label: "EQUIP", destination: "RIGHT_HAND", disabled: false },
    ]);
  });

  it("marks the equipped weapon without offering another slot", () => {
    const state = inventory();
    state.equippedRightHand = STARTER_BOW;
    expect(inventoryMoveActions(state, STARTER_BOW, "BAG")).toEqual([
      { label: "EQUIPPED", destination: "RIGHT_HAND", disabled: true },
    ]);
  });

  it("offers only unequip for an equipped weapon", () => {
    expect(inventoryMoveActions(inventory(), STARTER_STONE, "RIGHT_HAND")).toEqual([
      { label: "UNEQUIP", destination: "BAG" },
    ]);
  });

  it("keeps a saved left-hand weapon accessible through the single weapon slot", () => {
    const state = inventory();
    state.equippedRightHand = "";
    state.equippedLeftHand = STARTER_BOW;
    expect(inventoryWeaponSlot(state, "EQUIPMENT")).toBe("LEFT_HAND");
    expect(inventoryMoveActions(state, STARTER_STONE, "BAG")).toEqual([
      { label: "EQUIP", destination: "LEFT_HAND", disabled: false },
    ]);
    state.cosmeticRightHand = STARTER_STONE;
    expect(inventoryWeaponSlot(state, "COSMETICS")).toBe("RIGHT_HAND");
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
    ]);
  });
});
