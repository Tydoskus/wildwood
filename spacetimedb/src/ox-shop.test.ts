import { expect, it, vi } from "vitest";
import { GALAXY_ARMOR, GALAXY_BOOTS, STARTER_BOW, STARTER_STONE } from "../../shared/items";
import { OX_SHOP_GEM_PRICE } from "../../shared/ox-shop";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

function shopper(gems: bigint) {
  const f = crystalFixture();
  f.patch("playerProgress", { inventoryJson: JSON.stringify([STARTER_STONE]) });
  f.seed("playerGemWallet", { identity: f.ctx.sender, balance: gems, revision: 0n, updatedAt: f.ctx.timestamp });
  return f;
}

it("sells one Galaxy piece for 750 Gems as an account-owned look the player can wear", () => {
  const f = shopper(1_000n);
  f.run(server.buyOxShopCosmetic, { itemId: GALAXY_ARMOR });
  const progress = f.db.playerProgress.identity.find(f.ctx.sender);
  expect(JSON.parse(progress.cosmeticItemsJson)).toEqual([GALAXY_ARMOR]);
  expect(f.db.playerGemWallet.identity.find(f.ctx.sender).balance).toBe(1_000n - OX_SHOP_GEM_PRICE);
  expect([...f.db.gemTransaction.iter()].map(row => [row.kind, row.delta])).toEqual([["ox_shop_cosmetic", -750n]]);
  f.run(server.savePlayerProgress, { ...progress, cosmeticChest: GALAXY_ARMOR, enemyKills: 0 });
  expect(f.db.playerProgress.identity.find(f.ctx.sender).cosmeticChest).toBe(GALAXY_ARMOR);
  // Each piece is its own purchase, and a piece is sold once.
  expect(() => f.run(server.buyOxShopCosmetic, { itemId: GALAXY_ARMOR })).toThrow("already own");
  expect(() => f.run(server.buyOxShopCosmetic, { itemId: GALAXY_BOOTS })).toThrow();
  expect(f.db.playerGemWallet.identity.find(f.ctx.sender).balance).toBe(250n);
});

it("takes nothing when the player is short of Gems or asks for something Ox does not sell", () => {
  const f = shopper(749n);
  expect(() => f.run(server.buyOxShopCosmetic, { itemId: GALAXY_BOOTS })).toThrow();
  expect(() => f.run(server.buyOxShopCosmetic, { itemId: STARTER_BOW })).toThrow("does not sell");
  expect(f.db.playerGemWallet.identity.find(f.ctx.sender).balance).toBe(749n);
  expect(JSON.parse(f.db.playerProgress.identity.find(f.ctx.sender).cosmeticItemsJson)).toEqual([]);
});

it("refuses a forged save that wears a piece the player never bought", () => {
  const f = shopper(0n);
  const progress = f.db.playerProgress.identity.find(f.ctx.sender);
  f.run(server.savePlayerProgress, { ...progress, cosmeticChest: GALAXY_ARMOR, enemyKills: 0 });
  expect(f.db.playerProgress.identity.find(f.ctx.sender).cosmeticChest).toBe("");
});

it("keeps a bought piece through a full progress reset", () => {
  const f = shopper(750n);
  f.run(server.buyOxShopCosmetic, { itemId: GALAXY_BOOTS });
  f.run(server.resetPlayerProgress, {});
  expect(JSON.parse(f.db.playerProgress.identity.find(f.ctx.sender).cosmeticItemsJson)).toEqual([GALAXY_BOOTS]);
});
