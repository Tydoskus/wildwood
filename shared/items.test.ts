import { describe, expect, it } from "vitest";
import {
  BASIC_PAPER_HAT,
  canonicalItemId,
  DEVELOPER_ITEM_IDS,
  isWeaponItem,
  itemFitsEquipmentSlot,
  LEGACY_STARTER_STONE,
  STARTER_BOW,
  STARTER_ITEM_IDS,
} from "./items";

describe("equipment catalog", () => {
  it("grants the Bow and basic hat through the starter catalog", () => {
    expect(STARTER_ITEM_IDS).toEqual([BASIC_PAPER_HAT, STARTER_BOW]);
    expect(DEVELOPER_ITEM_IDS).not.toContain(STARTER_BOW);
  });

  it("declares the Bow as a two-hand-slot-compatible ranged weapon", () => {
    expect(isWeaponItem(STARTER_BOW)).toBe(true);
    expect(itemFitsEquipmentSlot(STARTER_BOW, "RIGHT_HAND")).toBe(true);
    expect(itemFitsEquipmentSlot(STARTER_BOW, "LEFT_HAND")).toBe(true);
    expect(itemFitsEquipmentSlot(STARTER_BOW, "HEAD")).toBe(false);
  });

  it("canonicalizes retired Rock saves to the Bow", () => {
    expect(canonicalItemId(LEGACY_STARTER_STONE)).toBe(STARTER_BOW);
  });
});
