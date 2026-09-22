import { reportEnemy } from "../../tests/helpers/enemy-defeat";
import { describe, expect, it, vi } from "vitest";
import { SAMURAI_HAT, SAMURAI_HAT_ITEM_DROP_DENOMINATOR, itemMaxHealthMultiplierBonus, itemRegenerationMultiplierBonus } from "../../shared/items";
import { SAMURAI_GARDEN_MAP_ID } from "../../shared/rules";
import { inventoryFromSave, inventoryItemQuantity, serialiseInventory } from "../../src/game/inventory";
import { crystalFixture } from "../../tests/helpers/crystal-hollows-fixture";

vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

function samuraiFixture() {
  const f = crystalFixture();
  f.patch("playerProgress", { equippedRightHand: "starter_stone", damage: 1e15 });
  f.patch("player", { mapId: SAMURAI_GARDEN_MAP_ID });
  f.ctx.random.integerInRange = vi.fn((_min, max) => max === SAMURAI_HAT_ITEM_DROP_DENOMINATOR ? 1 : max);
  return f;
}

describe("Samurai Gardens helmet drop", () => {
  it("awards a helmet that survives inventory reload and can occupy the head slot", () => {
    const f = samuraiFixture();
    reportEnemy(f);
    expect(f.ctx.random.integerInRange).toHaveBeenCalledWith(1, SAMURAI_HAT_ITEM_DROP_DENOMINATOR);
    const progress = f.db.playerProgress.identity.find(f.ctx.sender);
    const inventory = inventoryFromSave(progress.inventoryJson, "", SAMURAI_HAT, "", false);
    expect(inventory.equippedHead).toBe(SAMURAI_HAT);
    const reloaded = inventoryFromSave(serialiseInventory(inventory), "", SAMURAI_HAT, "", false);
    expect(inventoryItemQuantity(reloaded, SAMURAI_HAT)).toBe(1);
    expect([...f.db.playerItemDrop.iter()]).toMatchObject([{ itemId: SAMURAI_HAT, alreadyOwned: false, sequence: 1n }]);
    expect(itemMaxHealthMultiplierBonus(SAMURAI_HAT)).toBe(0);
    expect(itemRegenerationMultiplierBonus(SAMURAI_HAT)).toBeCloseTo(.2857, 4);
  });

  it("reports a repeat drop without duplicating the item", () => {
    const f = samuraiFixture();
    reportEnemy(f);
    reportEnemy(f);
    const saved = JSON.parse(f.db.playerProgress.identity.find(f.ctx.sender).inventoryJson);
    expect(saved.filter((id: string) => id === SAMURAI_HAT)).toHaveLength(1);
    expect([...f.db.playerItemDrop.iter()]).toMatchObject([{ itemId: SAMURAI_HAT, alreadyOwned: true, sequence: 2n }]);
  });

  it("does not award a helmet on a missed roll", () => {
    const f = samuraiFixture();
    f.ctx.random.integerInRange = (_min, max) => max;
    reportEnemy(f);
    expect(f.db.playerProgress.identity.find(f.ctx.sender).inventoryJson).toBe("[]");
    expect([...f.db.playerItemDrop.iter()]).toHaveLength(0);
  });

  it("does not roll Samurai loot from another map", () => {
    const f = samuraiFixture();
    f.patch("player", { mapId: "crystal_hollows" });
    reportEnemy(f);
    expect([...f.db.playerItemDrop.iter()].some(drop => drop.itemId === SAMURAI_HAT)).toBe(false);
    expect([...f.db.playerItemDrop.iter()]).toMatchObject([{ itemId: "crystal_helmet" }]);
  });
});
