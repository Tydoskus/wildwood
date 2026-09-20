import { reportEnemy } from "../../tests/helpers/enemy-defeat";
import { expect, it, vi } from "vitest";
import { BLACK_BOOTS, BLACK_BOOTS_DROP_DENOMINATOR } from "../../shared/items";
import { INFERNAL_DEPTHS_MAP_ID } from "../../shared/rules";
import { inventoryFromSave } from "../../src/game/inventory";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));
it("rolls black boots independently at 2% in Night Forest and keeps equipped feet on reload", () => {
  const f = crystalFixture(); f.patch("player", { mapId: INFERNAL_DEPTHS_MAP_ID });
  f.patch("playerProgress", { equippedRightHand: "starter_stone", damage: 1e15 });
  f.ctx.random.integerInRange = vi.fn((_min, max) => max === BLACK_BOOTS_DROP_DENOMINATOR ? 1 : max);
  reportEnemy(f);
  const progress = f.db.playerProgress.identity.find(f.ctx.sender);
  expect(JSON.parse(progress.inventoryJson)).toContain(BLACK_BOOTS);
  const inventory = inventoryFromSave(progress.inventoryJson, BLACK_BOOTS, "", "", false);
  expect(inventory.equippedFeet).toBe(BLACK_BOOTS);
  expect([...f.db.playerItemDrop.iter()]).toMatchObject([{ itemId: BLACK_BOOTS, alreadyOwned: false }]);
  reportEnemy(f);
  expect(JSON.parse(f.db.playerProgress.identity.find(f.ctx.sender).inventoryJson).filter((id: string) => id === BLACK_BOOTS)).toHaveLength(1);
});
it("rejects unowned or cosmetic-only speed boosts and accepts the exact equipped bonus", () => {
  const f = crystalFixture();
  f.patch("playerProgress", { equippedRightHand: "starter_stone", damage: 1e15 });
  expect(() => f.run(server.setSpeed, { speed: 205 })).toThrow("Unsupported player speed");
  f.patch("playerProgress", { inventoryJson: JSON.stringify([BLACK_BOOTS]), cosmeticFeet: BLACK_BOOTS });
  expect(() => f.run(server.setSpeed, { speed: 205 })).toThrow("Unsupported player speed");
  f.patch("playerProgress", { equippedFeet: BLACK_BOOTS });
  expect(() => f.run(server.setSpeed, { speed: 205 })).toThrow("Unsupported player speed");
  f.patch("playerProgress", { infernalUnlocked: true });
  f.run(server.setSpeed, { speed: 205 });
  expect(f.db.player.identity.find(f.ctx.sender).speed).toBe(205);
  expect(f.db.playerProgress.identity.find(f.ctx.sender).speed).toBe(180);
  expect(() => f.run(server.updateMovementState, {
    x: 4050, y: 4050, vx: 205, vy: 0, simulationTick: 1, motionEpoch: 1, sequence: 1,
  })).not.toThrow();
  f.run(server.setSpeed, { speed: 180 });
  expect(() => f.run(server.updateMovementState, {
    x: 4050, y: 4050, vx: 180, vy: 0, simulationTick: 2, motionEpoch: 1, sequence: 2,
  })).not.toThrow();
  expect(() => f.run(server.setSpeed, { speed: 206 })).toThrow("Unsupported player speed");
});

it("accepts the Black Boots bonus while a shard still has the base speed snapshot", () => {
  const f = crystalFixture();
  f.patch("playerProgress", { equippedRightHand: "starter_stone", damage: 1e15 });
  f.patch("playerProgress", { inventoryJson: JSON.stringify([BLACK_BOOTS]), equippedFeet: BLACK_BOOTS, infernalUnlocked: true });
  // This is the brief root-to-shard lag that previously produced false
  // movement-speed warnings for legitimate Black Boots runners.
  f.patch("player", { speed: 180 });
  expect(() => f.run(server.updateMovementState, {
    x: 4050, y: 4050, vx: 205, vy: 0, simulationTick: 1, motionEpoch: 1, sequence: 1,
  })).not.toThrow();
});

it("blocks a guest after an impossible movement speed packet", () => {
  const f = crystalFixture();
  f.patch("playerProgress", { equippedRightHand: "starter_stone", damage: 1e15 });
  expect(() => f.run(server.updateMovementState, {
    x: 4050, y: 4050, vx: 540, vy: 0, simulationTick: 1, motionEpoch: 1, sequence: 1,
  })).not.toThrow();
  const restriction = f.db.defeatSessionRestriction.identity.find(f.ctx.sender);
  expect(restriction?.requireSignIn).toBe(false);
  expect(restriction?.blockedUntilMicros).toBeGreaterThan(f.ctx.timestamp.microsSinceUnixEpoch);
  expect(f.db.playerController.identity.find(f.ctx.sender)).toBeNull();
  // Queued packets from the invalidated connection are silently discarded.
  expect(() => f.run(server.updateMovementState, {
    x: 4050, y: 4050, vx: 540, vy: 0, simulationTick: 2, motionEpoch: 1, sequence: 2,
  })).not.toThrow();
});
