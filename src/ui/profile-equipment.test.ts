import { describe, expect, it } from "vitest";
import { HIDDEN_COSMETIC_ITEM_ID } from "../game/inventory";
import {
  BASIC_PAPER_HAT,
  FROST_ARMOR,
  STARTER_BOW,
  STARTER_STONE,
  WOODEN_ARMOR,
} from "../../shared/items";
import { PROFILE_EQUIPMENT_SLOTS, profileEquipmentPresentation, type ProfileEquipmentProgress } from "./profile-equipment";

function equipment(overrides: Partial<ProfileEquipmentProgress> = {}): ProfileEquipmentProgress {
  return {
    equippedHead: BASIC_PAPER_HAT,
    equippedChest: WOODEN_ARMOR,
    equippedFeet: "",
    equippedRightHand: STARTER_STONE,
    equippedLeftHand: "",
    cosmeticHead: "",
    cosmeticChest: "",
    cosmeticFeet: "",
    cosmeticRightHand: "",
    cosmeticLeftHand: "",
    ...overrides,
  };
}

describe("profile equipment presentation", () => {
  it("shows stat equipment when no cosmetic overrides it", () => {
    expect(profileEquipmentPresentation(equipment(), "CHEST")).toMatchObject({
      kind: "EQUIPMENT",
      displayItemId: WOODEN_ARMOR,
      inspectionItemId: WOODEN_ARMOR,
    });
  });

  it("shows and inspects an active cosmetic instead of the stat item", () => {
    expect(profileEquipmentPresentation(equipment({ cosmeticChest: FROST_ARMOR }), "CHEST")).toMatchObject({
      kind: "COSMETIC",
      displayItemId: FROST_ARMOR,
      inspectionItemId: FROST_ARMOR,
    });
  });

  it("keeps explicitly hidden stat equipment available for inspection", () => {
    expect(profileEquipmentPresentation(equipment({ cosmeticHead: HIDDEN_COSMETIC_ITEM_ID }), "HEAD")).toMatchObject({
      kind: "HIDDEN",
      displayItemId: BASIC_PAPER_HAT,
      inspectionItemId: BASIC_PAPER_HAT,
    });
  });

  it("shows the one active hand cosmetic in the single weapon slot", () => {
    const progress = equipment({ cosmeticLeftHand: STARTER_BOW });
    expect(profileEquipmentPresentation(progress, "WEAPON")).toMatchObject({
      kind: "COSMETIC",
      displayItemId: STARTER_BOW,
      inspectionItemId: STARTER_BOW,
    });
  });

  it("keeps the actual weapon inspectable when either hand hides it cosmetically", () => {
    for (const cosmetic of ["cosmeticRightHand", "cosmeticLeftHand"] as const) {
      expect(profileEquipmentPresentation(equipment({ [cosmetic]: HIDDEN_COSMETIC_ITEM_ID }), "WEAPON")).toMatchObject({
        kind: "HIDDEN",
        displayItemId: STARTER_STONE,
        inspectionItemId: STARTER_STONE,
      });
    }
  });

  it("offers exactly four slots and falls back to legacy left-hand equipment without modifying the save", () => {
    expect(PROFILE_EQUIPMENT_SLOTS).toEqual(["HEAD", "CHEST", "WEAPON", "FEET"]);
    const progress = equipment({ equippedRightHand: "", equippedLeftHand: STARTER_BOW });
    const original = { ...progress };
    expect(profileEquipmentPresentation(progress, "WEAPON")).toMatchObject({
      slot: "WEAPON", label: "WEAPON", kind: "EQUIPMENT", displayItemId: STARTER_BOW, inspectionItemId: STARTER_BOW,
    });
    expect(progress).toEqual(original);
    expect(profileEquipmentPresentation(equipment({ equippedLeftHand: STARTER_BOW }), "WEAPON").displayItemId).toBe(STARTER_STONE);
    expect(profileEquipmentPresentation(null, "WEAPON").kind).toBe("EMPTY");
  });

  it("keeps right-hand cosmetic precedence identical to the character renderer", () => {
    expect(profileEquipmentPresentation(equipment({ cosmeticRightHand: STARTER_STONE, cosmeticLeftHand: STARTER_BOW }), "WEAPON")).toMatchObject({
      kind: "COSMETIC", displayItemId: STARTER_STONE,
    });
  });
});
