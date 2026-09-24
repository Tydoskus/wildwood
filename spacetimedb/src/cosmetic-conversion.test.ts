import { expect, it, vi } from "vitest";
import { STARTER_BOW, STARTER_STONE } from "../../shared/items";
import { BOSS_REWARD_CLAIM_BITS } from "../../shared/rules";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

function equippedFixture(gems: bigint) {
  const f = crystalFixture();
  f.patch("playerProgress", {
    inventoryJson: JSON.stringify([STARTER_STONE, STARTER_BOW]),
    equippedRightHand: STARTER_BOW,
  });
  f.seed("playerGemWallet", { identity: f.ctx.sender, balance: gems, revision: 0n, updatedAt: f.ctx.timestamp });
  return f;
}

it("unlocks an item appearance for 10 Gems without consuming or unequipping the item", () => {
  const f = equippedFixture(25n);
  f.run(server.convertItemToCosmetic, { itemId: STARTER_BOW });

  const progress = f.db.playerProgress.identity.find(f.ctx.sender);
  expect(JSON.parse(progress.cosmeticItemsJson)).toEqual([STARTER_BOW]);
  expect(JSON.parse(progress.inventoryJson)).toContain(STARTER_BOW);
  expect(progress.equippedRightHand).toBe(STARTER_BOW);
  expect(f.db.playerGemWallet.identity.find(f.ctx.sender).balance).toBe(15n);
  expect([...f.db.gemTransaction.iter()].map(row => [row.kind, row.delta])).toEqual([["cosmetic_conversion", -10n]]);

  f.run(server.savePlayerProgress, { ...progress, cosmeticRightHand: STARTER_BOW, enemyKills: 0 });
  expect(f.db.playerProgress.identity.find(f.ctx.sender).cosmeticRightHand).toBe(STARTER_BOW);
  expect(() => f.run(server.convertItemToCosmetic, { itemId: STARTER_BOW })).toThrow("already unlocked");
  expect(f.db.playerGemWallet.identity.find(f.ctx.sender).balance).toBe(15n);
});

it("leaves item and Gems alone when the player cannot afford conversion", () => {
  const f = equippedFixture(9n);
  expect(() => f.run(server.convertItemToCosmetic, { itemId: STARTER_BOW })).toThrow();
  expect(f.db.playerGemWallet.identity.find(f.ctx.sender).balance).toBe(9n);
  expect(JSON.parse(f.db.playerProgress.identity.find(f.ctx.sender).cosmeticItemsJson)).toEqual([]);
  expect(JSON.parse(f.db.playerProgress.identity.find(f.ctx.sender).inventoryJson)).toContain(STARTER_BOW);
});

it("keeps the unlocked look after the original item is destroyed", () => {
  const f = equippedFixture(10n);
  f.run(server.convertItemToCosmetic, { itemId: STARTER_BOW });
  f.run(server.destroyEquipment, { itemId: STARTER_BOW });
  const progress = f.db.playerProgress.identity.find(f.ctx.sender);
  expect(JSON.parse(progress.inventoryJson)).not.toContain(STARTER_BOW);
  expect(JSON.parse(progress.cosmeticItemsJson)).toContain(STARTER_BOW);
  f.run(server.savePlayerProgress, { ...progress, cosmeticRightHand: STARTER_BOW, enemyKills: 0 });
  expect(f.db.playerProgress.identity.find(f.ctx.sender).cosmeticRightHand).toBe(STARTER_BOW);
});

it("retains the permanent appearance through prestige, which keeps the item, and a reset, which takes it", () => {
  for (const [reducer, keepsItem] of [["prestigeAccount", true], ["resetPlayerProgress", false]] as const) {
    const f = equippedFixture(10n);
    f.run(server.convertItemToCosmetic, { itemId: STARTER_BOW });
    f.patch("playerProgress", { bossRewardClaims: BOSS_REWARD_CLAIM_BITS.aegisPrime });
    f.seed("proceduralProgress", { identity: f.ctx.sender, completed: 1 });
    f.run(server[reducer], {});
    const progress = f.db.playerProgress.identity.find(f.ctx.sender);
    expect(JSON.parse(progress.inventoryJson).includes(STARTER_BOW)).toBe(keepsItem);
    expect(JSON.parse(progress.cosmeticItemsJson)).toContain(STARTER_BOW);
  }
});
