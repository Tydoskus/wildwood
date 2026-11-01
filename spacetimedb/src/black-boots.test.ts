import { reportEnemy } from "../../tests/helpers/enemy-defeat";
import { expect, it, vi } from "vitest";
import { BLACK_BOOTS } from "../../shared/items";
import { INFERNAL_DEPTHS_MAP_ID, PLAYER_SPEED } from "../../shared/rules";
import { inventoryFromSave } from "../../src/game/inventory";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { progressOf } from "../../tests/helpers/progress";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));
it("no longer drops black boots in Night Forest, and keeps owned ones on the feet on reload", () => {
  const f = crystalFixture(); f.patch("player", { mapId: INFERNAL_DEPTHS_MAP_ID });
  f.patch("playerProgress", { equippedRightHand: "starter_stone", damage: 1e15 });
  // Every roll at its luckiest: still nothing drops.
  f.ctx.random.integerInRange = vi.fn(() => 1);
  reportEnemy(f);
  expect(JSON.parse(progressOf(f, f.ctx.sender).inventoryJson)).not.toContain(BLACK_BOOTS);
  expect([...f.db.playerItemDrop.iter()]).toEqual([]);
  f.patch("playerProgress", { inventoryJson: JSON.stringify([BLACK_BOOTS]) });
  const inventory = inventoryFromSave(progressOf(f, f.ctx.sender).inventoryJson, BLACK_BOOTS, "", "", false);
  expect(inventory.equippedFeet).toBe(BLACK_BOOTS);
});
it("rejects unowned or cosmetic-only speed boosts and accepts the exact equipped bonus", () => {
  const f = crystalFixture();
  f.patch("playerProgress", { equippedRightHand: "starter_stone", damage: 1e15 });
  expect(() => f.run(server.setSpeed, { speed: PLAYER_SPEED + 5 })).toThrow("Unsupported player speed");
  f.patch("playerProgress", { inventoryJson: JSON.stringify([BLACK_BOOTS]), cosmeticFeet: BLACK_BOOTS });
  expect(() => f.run(server.setSpeed, { speed: PLAYER_SPEED + 5 })).toThrow("Unsupported player speed");
  // Worn, they count before Night Forest is reached: gear never locks behind a map.
  f.patch("playerProgress", { equippedFeet: BLACK_BOOTS });
  const shod = PLAYER_SPEED + 25;
  f.run(server.setSpeed, { speed: shod });
  expect(f.db.player.identity.find(f.ctx.sender).speed).toBe(shod);
  expect(progressOf(f, f.ctx.sender).speed).toBe(180);
  expect(() => f.run(server.updateMovementState, {
    x: 4050, y: 4050, vx: shod, vy: 0, simulationTick: 1, motionEpoch: 1, sequence: 1,
  })).not.toThrow();
  f.run(server.setSpeed, { speed: PLAYER_SPEED });
  expect(() => f.run(server.updateMovementState, {
    x: 4050, y: 4050, vx: PLAYER_SPEED, vy: 0, simulationTick: 2, motionEpoch: 1, sequence: 2,
  })).not.toThrow();
  expect(() => f.run(server.setSpeed, { speed: shod + 1 })).toThrow("Unsupported player speed");
});

it("accepts the Black Boots bonus while the player row still has the base speed", () => {
  const f = crystalFixture();
  f.patch("playerProgress", { equippedRightHand: "starter_stone", damage: 1e15 });
  f.patch("playerProgress", { inventoryJson: JSON.stringify([BLACK_BOOTS]), equippedFeet: BLACK_BOOTS, infernalUnlocked: true });
  // A presentation row that lags the progress row must not produce false
  // movement-speed warnings for legitimate Black Boots runners.
  f.patch("player", { speed: 180 });
  expect(() => f.run(server.updateMovementState, {
    x: 4050, y: 4050, vx: 205, vy: 0, simulationTick: 1, motionEpoch: 1, sequence: 1,
  })).not.toThrow();
});

it("clamps an impossible movement speed instead of taking the session", () => {
  // Movement is not where cheating pays, so an impossible packet is corrected.
  // Farming throughput is capped where it is earned, in the kill budget.
  const f = crystalFixture();
  f.patch("playerProgress", { equippedRightHand: "starter_stone", damage: 1e15 });
  expect(() => f.run(server.updateMovementState, {
    x: 4050, y: 4050, vx: 540, vy: 0, simulationTick: 1, motionEpoch: 1, sequence: 1,
  })).not.toThrow();
  expect(f.db.defeatSessionRestriction.identity.find(f.ctx.sender)).toBeNull();
  expect(f.db.playerController.identity.find(f.ctx.sender)).not.toBeNull();
  const motion = f.db.playerMotion.identity.find(f.ctx.sender)!;
  expect(motion.vx).toBeGreaterThan(0);
  expect(motion.vx).toBeLessThan(540);
  // The player keeps playing, and the next packet is taken the same way.
  expect(() => f.run(server.updateMovementState, {
    x: 4050, y: 4050, vx: 540, vy: 0, simulationTick: 2, motionEpoch: 1, sequence: 2,
  })).not.toThrow();
});

it("accepts the speed of the rank a player has just finished, which their client is still sending", () => {
  // Move Speed research completes, the
  // server's rank moves on, and the client's next packet still carries the
  // previous rank's speed. It is slower than allowed, so it is not an exploit.
  const f = crystalFixture();
  f.seed("playerResearch", { identity: f.ctx.sender, moveSpeed: 6 });
  const atRank = (rank: number) => PLAYER_SPEED * (1 + rank * 0.02);

  expect(() => f.run(server.setSpeed, { speed: atRank(6) })).not.toThrow();
  expect(() => f.run(server.setSpeed, { speed: atRank(5) })).not.toThrow();
  expect(f.db.player.identity.find(f.ctx.sender).speed).toBeCloseTo(atRank(5), 5);
  // Several ranks behind is still only slower, and so is a standstill.
  expect(() => f.run(server.setSpeed, { speed: atRank(0) })).not.toThrow();
  expect(() => f.run(server.setSpeed, { speed: 0 })).not.toThrow();
  // Faster than the rank allows remains refused, which is the whole point.
  expect(() => f.run(server.setSpeed, { speed: atRank(7) })).toThrow("Unsupported player speed");
  expect(() => f.run(server.setSpeed, { speed: -5 })).toThrow("Unsupported player speed");
});
