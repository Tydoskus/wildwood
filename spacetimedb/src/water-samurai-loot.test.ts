import { reportEnemy } from "../../tests/helpers/enemy-defeat";
import { expect, it, vi } from "vitest";
import { CLOUDSPIRE_ARMOR, CLOUDSPIRE_BOW, CLOUDSPIRE_HELMET, MOONFEN_ARMOR, WATER_ARMOR, SKY_BOW, SAMURAI_BOW, SAMURAI_HAT, itemDamageMultiplierBonus, itemMaxHealthMultiplierBonus, itemRegenerationMultiplierBonus } from "../../shared/items";
import { inventoryFromSave, inventoryItemQuantity, serialiseInventory } from "../../src/game/inventory";
import { crystalFixture } from "../../tests/helpers/crystal-hollows-fixture";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

it.each([
  ["water_reach", 1, 7, [WATER_ARMOR, SKY_BOW]],
  ["water_reach", 2, 7, [SKY_BOW]],
  ["water_reach", 1, 8, [WATER_ARMOR]],
  ["water_reach", 2, 8, []],
  ["samurai_garden", 1, 13, [SAMURAI_HAT, SAMURAI_BOW]],
  ["samurai_garden", 2, 13, [SAMURAI_BOW]],
  ["samurai_garden", 1, 14, [SAMURAI_HAT]],
  ["samurai_garden", 2, 14, []],
] as const)("rolls independent loot in %s at boundaries %s / %s", (mapId, armorRoll, bowRoll, expected) => {
  const f = crystalFixture();
  f.patch("playerProgress", { equippedRightHand: "starter_stone", damage: 1e15 });
  f.patch("player", { mapId });
  const armorMax = mapId === "water_reach" ? 100 : 125;
  const bowMax = mapId === "water_reach" ? 1000 : 2000;
  f.ctx.random.integerInRange = vi.fn((_min, max) => max === armorMax ? armorRoll : bowRoll);
  reportEnemy(f);
  expect(f.ctx.random.integerInRange).toHaveBeenCalledWith(1, armorMax);
  expect(f.ctx.random.integerInRange).toHaveBeenCalledWith(1, bowMax);
  expect([...f.db.playerItemDrop.iter()].map((row: any) => row.itemId)).toEqual(expected);
  for (const itemId of expected) {
    const progress = f.db.playerProgress.identity.find(f.ctx.sender);
    const saved = inventoryFromSave(progress.inventoryJson, "", "", "", false);
    expect(inventoryItemQuantity(saved, itemId)).toBe(1);
  }
});

it("keeps Water Reach equipment through reloads and repeat drops without duplicates", () => {
  const f = crystalFixture();
  f.patch("playerProgress", { equippedRightHand: "starter_stone", damage: 1e15 });
  f.patch("player", { mapId: "water_reach" });
  f.ctx.random.integerInRange = () => 1;
  reportEnemy(f);
  reportEnemy(f);
  const progress = f.db.playerProgress.identity.find(f.ctx.sender);
  const inventory = inventoryFromSave(progress.inventoryJson, "", "", WATER_ARMOR, false, false, SKY_BOW);
  const reloaded = inventoryFromSave(serialiseInventory(inventory), "", "", WATER_ARMOR, false, false, SKY_BOW);
  expect(reloaded.equippedChest).toBe(WATER_ARMOR);
  expect(reloaded.equippedRightHand).toBe(SKY_BOW);
  expect(inventoryItemQuantity(reloaded, WATER_ARMOR)).toBe(1);
  expect(inventoryItemQuantity(reloaded, SKY_BOW)).toBe(1);
  expect([...f.db.playerItemDrop.iter()].every((row: any) => row.alreadyOwned)).toBe(true);
  expect(itemMaxHealthMultiplierBonus(WATER_ARMOR)).toBeCloseTo(.2375, 4);
  expect(itemRegenerationMultiplierBonus(WATER_ARMOR)).toBe(0);
  expect(itemDamageMultiplierBonus(SKY_BOW)).toBeCloseTo(.2375, 4);
  expect(itemDamageMultiplierBonus(SAMURAI_BOW)).toBeCloseTo(.2857, 4);
});

it.each(["home_exterior", "crystal_hollows", "endless_1"])("does not roll these drops in %s", mapId => {
  const f = crystalFixture(); f.patch("player", { mapId });
  f.patch("playerProgress", { equippedRightHand: "starter_stone", damage: 1e15 });
  f.ctx.random.integerInRange = vi.fn(() => 1);
  if (mapId === "home_exterior") expect(() => reportEnemy(f)).toThrow(); else reportEnemy(f);
  if (mapId === "crystal_hollows") {
    expect([...f.db.playerItemDrop.iter()].map(drop => drop.itemId)).toEqual(["crystal_bow", "crystal_armor", "crystal_helmet"]);
  } else expect(f.ctx.random.integerInRange).not.toHaveBeenCalled();
});

it.each([
  ["cloudspire", CLOUDSPIRE_HELMET, 125, 1, "HEAD"],
  ["cloudspire", CLOUDSPIRE_BOW, 200, 1, "HAND"],
  ["cloudspire", CLOUDSPIRE_ARMOR, 1000, 7, "CHEST"],
  ["moonfen", MOONFEN_ARMOR, 1000, 7, "CHEST"],
] as const)("awards and persists %s's %s at its exact drop boundary", (mapId, itemId, outcomes, wins, slot) => {
  const f = crystalFixture();
  f.patch("playerProgress", { equippedRightHand: "starter_stone", damage: 1e15 });
  f.patch("player", { mapId });
  let roll = wins + 1;
  f.ctx.random.integerInRange = vi.fn((_min, max) => max === outcomes ? roll : max);
  reportEnemy(f);
  expect([...f.db.playerItemDrop.iter()]).toEqual([]);
  roll = wins;
  reportEnemy(f);
  expect(f.ctx.random.integerInRange).toHaveBeenCalledWith(1, outcomes);
  expect([...f.db.playerItemDrop.iter()]).toMatchObject([{ itemId, alreadyOwned: false }]);
  const progress = f.db.playerProgress.identity.find(f.ctx.sender);
  const inventory = inventoryFromSave(progress.inventoryJson, "", slot === "HEAD" ? itemId : "", slot === "CHEST" ? itemId : "", false, false, slot === "HAND" ? itemId : "");
  expect(inventoryItemQuantity(inventory, itemId)).toBe(1);
  expect(slot === "HEAD" ? inventory.equippedHead : slot === "HAND" ? inventory.equippedRightHand : inventory.equippedChest).toBe(itemId);
  reportEnemy(f);
  expect(JSON.parse(f.db.playerProgress.identity.find(f.ctx.sender).inventoryJson).filter((id: string) => id === itemId)).toHaveLength(1);
});

it("can grant all three Cloudspire items from independent successful rolls", () => {
  const f = crystalFixture(); f.patch("player", { mapId: "cloudspire" });
  f.patch("playerProgress", { equippedRightHand: "starter_stone", damage: 1e15 });
  f.ctx.random.integerInRange = () => 1;
  reportEnemy(f);
  const saved = inventoryFromSave(f.db.playerProgress.identity.find(f.ctx.sender).inventoryJson, "", "", "", false);
  for (const id of [CLOUDSPIRE_HELMET, CLOUDSPIRE_BOW, CLOUDSPIRE_ARMOR]) expect(inventoryItemQuantity(saved, id)).toBe(1);
  expect(itemDamageMultiplierBonus(CLOUDSPIRE_BOW)).toBeCloseTo(.3375, 4);
  expect(itemMaxHealthMultiplierBonus(CLOUDSPIRE_HELMET)).toBe(0);
  expect(itemRegenerationMultiplierBonus(CLOUDSPIRE_HELMET)).toBeCloseTo(.3375, 4);
  expect(itemMaxHealthMultiplierBonus(CLOUDSPIRE_ARMOR)).toBeCloseTo(.3375, 4);
  expect(itemRegenerationMultiplierBonus(CLOUDSPIRE_ARMOR)).toBe(0);
  expect(itemMaxHealthMultiplierBonus(MOONFEN_ARMOR)).toBeCloseTo(.3929, 4);
  expect(itemRegenerationMultiplierBonus(MOONFEN_ARMOR)).toBe(0);
});
