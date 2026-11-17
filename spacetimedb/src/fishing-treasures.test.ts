import { describe, expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { progressOf } from "../../tests/helpers/progress";
import { fishingSpotAt } from "../../shared/fishing";
import { fishingTimeFactor, rollFishingTreasure } from "../../shared/fishing-treasures";
import { TOWN_FEET_OFFSET } from "../../shared/town";
import { addOres, oreCount } from "./item-refine";
import { isOldMapGear } from "./old-gear-payout";
import { EQUIPMENT_DROP_ITEM_IDS, isCosmeticOnlyItem } from "../../shared/items";
import { BASE_INVENTORY_SLOT_CAPACITY } from "../../shared/gems";
import { COOK_FIRES } from "../../shared/cooking";
import { goldFor } from "./gold";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

describe("treasure on the line", () => {
  it("rolls gear alongside a real catch and awards it once, through the bag and drop reveal", () => {
    const f = crystalFixture(() => 0), spot = fishingSpotAt(0, 10_000);
    f.patch("player", { mapId: "town", x: spot.x, y: spot.y - TOWN_FEET_OFFSET });
    const catchFish = () => f.run(server.catchFish, { spot: spot.spot, site: spot.site });
    catchFish();
    expect(oreCount(f.ctx, f.ctx.sender, "minnow")).toBe(1);
    expect(JSON.parse(progressOf(f).inventoryJson)).toContain("reedward_cap");
    expect([...f.db.playerItemDrop.iter()][0]).toMatchObject({ itemId: "reedward_cap", sequence: 1n });
    expect(catchFish).toThrow(/Still fishing/);
    expect(f.db.playerFishing.identity.find(f.ctx.sender).fishCaught).toBe(1);
  });

  it("holds treasure as an offer when the bag fills and keeps the normal catch", () => {
    const f = crystalFixture(() => 0), spot = fishingSpotAt(0, 10_000);
    f.patch("player", { mapId: "town", x: spot.x, y: spot.y - TOWN_FEET_OFFSET });
    const stock = EQUIPMENT_DROP_ITEM_IDS.filter(id => !isCosmeticOnlyItem(id) && id !== "reedward_cap").slice(0, BASE_INVENTORY_SLOT_CAPACITY - 1);
    f.patch("playerProgress", { inventoryJson: JSON.stringify(stock) });
    f.transaction(() => addOres(f.ctx, f.ctx.sender, "minnow", 1));
    f.run(server.catchFish, { spot: spot.spot, site: spot.site });
    expect(oreCount(f.ctx, f.ctx.sender, "minnow")).toBe(2);
    expect(JSON.parse(progressOf(f).inventoryJson)).not.toContain("reedward_cap");
    expect([...f.db.pendingEquipmentOffer.iter()][0]?.itemId).toBe("reedward_cap");
    expect(isOldMapGear("reedward_cap")).toBe(false);
  });

  it("keeps the early odds as more treasures unlock and stacks bonuses only in their proper slots", () => {
    expect(rollFishingTreasure(14, 1 / 160)).toBeNull();
    expect(rollFishingTreasure(15, 1 / 160)?.rarity).toBe("Epic");
    expect(rollFishingTreasure(35, 1 / 160 + 1 / 600)?.rarity).toBe("Legendary");
    expect(rollFishingTreasure(99, .99)).toBeNull();
    expect(fishingTimeFactor("crown_of_the_wishing_deep", "drowned_court_mail")).toBeCloseTo(.84);
    expect(fishingTimeFactor("drowned_court_mail", "reedward_cap")).toBe(1);
  });
});

it("cooks actual fish for gold and saved Cooking XP, and charges nothing for a rejected recipe", () => {
  const f = crystalFixture(), who = f.ctx.sender;
  f.transaction(() => addOres(f.ctx, who, "minnow", 1));
  const cook = (recipeId: string) => f.run(server.cookFish, { fishId: "minnow", recipeId });
  expect(() => cook("skewer")).toThrow(/cooking fire/);
  f.patch("player", { mapId: "town", x: COOK_FIRES[0].x, y: COOK_FIRES[0].y - TOWN_FEET_OFFSET });
  expect(() => cook("chowder")).toThrow(/Cooking Lv 12/);
  cook("skewer");
  expect(() => cook("skewer")).toThrow(/need 1 Minnow/);
  expect(oreCount(f.ctx, who, "minnow")).toBe(0);
  expect(goldFor(f.ctx, who)).toBe(1n);
  expect([...f.db.playerCraftSkill.iter()][0]).toMatchObject({ skill: "cooking", experience: 2n });
  expect([...f.db.playerCraftLevel.iter()][0]).toMatchObject({ skill: "cooking", level: 3 });
});
