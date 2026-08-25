import { describe, expect, it } from "vitest";
import { HIDDEN_COSMETIC_ITEM_ID, resolveEquipmentAppearance } from "./equipment-appearance";

const regular = {
  equippedHead: "paper_hat",
  equippedChest: "wooden_armor",
  equippedFeet: "trailblazer_boots",
  equippedRightHand: "stone",
  equippedLeftHand: "",
};

describe("equipment appearance", () => {
  it("falls back to regular equipment when cosmetic slots are empty", () => {
    expect(resolveEquipmentAppearance(regular)).toEqual({
      headItem: "paper_hat",
      chestItem: "wooden_armor",
      feetItem: "trailblazer_boots",
      rightHandItem: "stone",
      leftHandItem: "",
    });
  });

  it("overrides each outfit slot without mutating regular equipment", () => {
    expect(resolveEquipmentAppearance({
      ...regular,
      cosmeticHead: "gold_helmet",
      cosmeticChest: "frost_armor",
      cosmeticFeet: "frost_boots",
      cosmeticLeftHand: "frost_bow",
    })).toEqual({
      headItem: "gold_helmet",
      chestItem: "frost_armor",
      feetItem: "frost_boots",
      rightHandItem: "",
      leftHandItem: "frost_bow",
    });
    expect(regular.equippedRightHand).toBe("stone");
  });

  it("gives a valid right-hand cosmetic precedence over a stale left hand", () => {
    expect(resolveEquipmentAppearance({
      ...regular,
      cosmeticRightHand: "bow",
      cosmeticLeftHand: "stale_bow",
    })).toMatchObject({ rightHandItem: "bow", leftHandItem: "" });
  });

  it("hides stat equipment without unequipping it", () => {
    expect(resolveEquipmentAppearance({
      ...regular,
      cosmeticHead: HIDDEN_COSMETIC_ITEM_ID,
      cosmeticChest: HIDDEN_COSMETIC_ITEM_ID,
      cosmeticFeet: HIDDEN_COSMETIC_ITEM_ID,
      cosmeticRightHand: HIDDEN_COSMETIC_ITEM_ID,
    })).toEqual({
      headItem: "",
      chestItem: "",
      feetItem: "",
      rightHandItem: "",
      leftHandItem: "",
    });
    expect(regular).toMatchObject({ equippedChest: "wooden_armor", equippedRightHand: "stone" });
  });
});
