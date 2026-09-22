import { expect, it } from "vitest";
import { itemTier } from "./item-tier";
import { isCosmeticOnlyItem } from "./items";
import { MAP_IDS } from "./rules";
import { regularMapLoot } from "./regular-map-loot";
it("uses each item's source map across all fifteen campaign maps", () => {
  MAP_IDS.forEach((mapId, index) => {
    // Cosmetics have no tier: the paper hat drops in the forest but scales
    // nothing, so itemTier deliberately says nothing about it.
    for (const drop of regularMapLoot(mapId)) {
      if (isCosmeticOnlyItem(drop.itemId)) continue;
      expect(itemTier(drop.itemId)).toBe(index + 1);
    }
  });
  expect(itemTier("frost_bow")).toBe(3);
  expect(itemTier("frost_armor")).toBe(3);
  expect(itemTier("lava_bow")).toBe(4);
  expect(itemTier("starter_stone")).toBe(1);
});
it("does not invent tiers for cosmetics, dev gear, or unknown items", () => {
  for (const id of ["superior_golden_helmet", "basic_paper_hat", "wooden_sword", "unknown"]) expect(itemTier(id)).toBeUndefined();
});
