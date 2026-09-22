import { describe, expect, it } from "vitest";
import { MAX_SLOT_UPGRADE_TIER } from "./items";
import { itemSlotTier, normalizeSlotTier, upgradeSlotForItem, UPGRADE_SLOT_LABELS } from "./slot-upgrades";

describe("slot upgrade tracks", () => {
  it("puts every stat-bearing item on one of three tracks, and boots on none", () => {
    expect(upgradeSlotForItem("starter_bow")).toBe("HAND");
    expect(upgradeSlotForItem("wooden_armor")).toBe("CHEST");
    expect(upgradeSlotForItem("wood_full_helm")).toBe("HEAD");
    expect(upgradeSlotForItem("black_boots")).toBeNull();
    expect(upgradeSlotForItem("not_an_item")).toBeNull();
  });

  it("gives an item whatever tier its slot has reached, whichever hand holds it", () => {
    const tiers = { HAND: 12, HEAD: 3 } as const;
    // The tier follows the slot, so a better bow inherits the work already done.
    expect(itemSlotTier(tiers, "starter_bow")).toBe(12);
    expect(itemSlotTier(tiers, "iron_bow")).toBe(12);
    expect(itemSlotTier(tiers, "wood_full_helm")).toBe(3);
    expect(itemSlotTier(tiers, "wooden_armor")).toBe(0);
    expect(itemSlotTier(tiers, "black_boots")).toBe(0);
  });

  it("clamps a tier to the track's length and refuses nonsense", () => {
    expect(normalizeSlotTier(MAX_SLOT_UPGRADE_TIER + 10)).toBe(MAX_SLOT_UPGRADE_TIER);
    expect(normalizeSlotTier(-3)).toBe(0);
    expect(normalizeSlotTier("12")).toBe(0);
    expect(normalizeSlotTier(7.9)).toBe(7);
  });

  it("labels the tracks the way the bench does", () => {
    expect(UPGRADE_SLOT_LABELS).toEqual({ HAND: "WEAPON", HEAD: "HELMET", CHEST: "ARMOR" });
  });
});
