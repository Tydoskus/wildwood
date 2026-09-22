import { expect, it, vi } from "vitest";
import { SAMURAI_HAT, STARTER_BOW, STARTER_STONE, WOODEN_ARMOR } from "../../shared/items";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

it("destroys owned equipment, cosmetic references and upgrade levels together", () => {
  const f = crystalFixture();
  f.patch("playerProgress", { inventoryJson: JSON.stringify([SAMURAI_HAT, STARTER_BOW]), equippedHead: SAMURAI_HAT, cosmeticHead: SAMURAI_HAT });
  f.seed("playerItemUpgrade", { key: `${f.ctx.sender.toHexString()}:${SAMURAI_HAT}`, identity: f.ctx.sender, itemId: SAMURAI_HAT, level: 4 });
  f.run(server.destroyEquipment, { itemId: SAMURAI_HAT });
  const progress = f.db.playerProgress.identity.find(f.ctx.sender);
  expect(JSON.parse(progress.inventoryJson)).not.toContain(SAMURAI_HAT);
  expect(JSON.parse(progress.inventoryJson)).toContain(STARTER_BOW);
  expect(progress.equippedHead).toBe(""); expect(progress.cosmeticHead).toBe("");
  expect([...f.db.playerItemUpgrade.iter()]).toHaveLength(0);
  expect(() => f.run(server.destroyEquipment, { itemId: SAMURAI_HAT })).toThrow("not in your inventory");
});

it.each([[STARTER_BOW, "bowCount"], [WOODEN_ARMOR, "woodenArmorCount"]])("removes legacy inventory counters for %s", (itemId, counter) => {
  const f = crystalFixture();
  f.patch("playerProgress", { inventoryJson: JSON.stringify([itemId]), [counter]: 1 });
  f.run(server.destroyEquipment, { itemId });
  const progress = f.db.playerProgress.identity.find(f.ctx.sender);
  expect(progress[counter]).toBe(0);
  expect(JSON.parse(progress.inventoryJson)).not.toContain(itemId);
});

it.each([STARTER_STONE, "unknown"])("rejects destruction of permanent or invalid item %s", (itemId) => {
  const f = crystalFixture();
  expect(() => f.run(server.destroyEquipment, { itemId })).toThrow("cannot be destroyed");
});

it("rejects destruction from a connection that does not control the player", () => {
  const f = crystalFixture();
  f.db.playerController.identity.delete(f.ctx.sender);
  expect(() => f.run(server.destroyEquipment, { itemId: SAMURAI_HAT })).toThrow();
});
