import { expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

/** Rows as they looked before tiers moved to the slot: one per item. */
function seedItemUpgrades(f: ReturnType<typeof crystalFixture>, rows: [string, number][]) {
  f.seed("moduleMigrationState", { id: 0, version: 37 });
  f.ctx.connectionId = null;
  for (const [itemId, level] of rows) {
    f.seed("playerItemUpgrade", { key: `${f.ctx.sender.toHexString()}:${itemId}`, identity: f.ctx.sender, itemId, level });
  }
}

function tiers(f: ReturnType<typeof crystalFixture>) {
  return Object.fromEntries([...f.db.playerItemUpgrade.iter()].map((row: any) => [row.itemId, row.level]));
}

it("gives each slot the highest tier any item in it had reached", () => {
  const f = crystalFixture();
  seedItemUpgrades(f, [
    ["starter_bow", 4], ["iron_bow", 9],      // HAND: the better of the two
    ["wood_full_helm", 6],                     // HEAD
    ["wooden_armor", 2], ["magma_armor", 1],   // CHEST
  ]);
  f.run(server.onConnect);

  expect(tiers(f)).toEqual({ HAND: 9, HEAD: 6, CHEST: 2 });
});

it("drops rows for items no slot claims, and never writes a zero", () => {
  const f = crystalFixture();
  seedItemUpgrades(f, [["black_boots", 5], ["starter_bow", 0]]);
  f.run(server.onConnect);

  // Boots have no track, and a slot that never got past zero needs no row.
  expect(tiers(f)).toEqual({});
});
