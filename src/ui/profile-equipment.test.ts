import { describe, expect, it } from "vitest";
import { HIDDEN_COSMETIC_ITEM_ID } from "../game/inventory";
import {
  BASIC_PAPER_HAT,
  FROST_ARMOR,
  STARTER_BOW,
  STARTER_STONE,
  WOODEN_ARMOR,
} from "../../shared/items";
import { profileEquipmentPresentation, type ProfileEquipmentProgress } from "./profile-equipment";

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

  it("marks the opposite stat hand hidden when a hand cosmetic replaces both hands", () => {
    const progress = equipment({ cosmeticLeftHand: STARTER_BOW });
    expect(profileEquipmentPresentation(progress, "LEFT_HAND")).toMatchObject({
      kind: "COSMETIC",
      displayItemId: STARTER_BOW,
    });
    expect(profileEquipmentPresentation(progress, "RIGHT_HAND")).toMatchObject({
      kind: "HIDDEN",
      displayItemId: STARTER_STONE,
      inspectionItemId: STARTER_STONE,
    });
  });
});
