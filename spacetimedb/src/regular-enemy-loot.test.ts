import { STARTER_BOW } from "../../shared/items";
import { Timestamp } from "spacetimedb";
import { expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { enemyDefeatDefinition, defeatBudget } from "../../shared/enemy-defeats";
import { ENEMY_TYPES } from "../../shared/enemy-definitions";
import { rollRegularEnemyLoot } from "./regular-enemy-loot";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));
const enemy = Object.keys(ENEMY_TYPES).find(kind => enemyDefeatDefinition("water_reach", kind)?.reward.type === "damage")!;
const batch = { streamId: "test-stream-123456", sequence: 1n, mapId: "water_reach", enemies: [{ enemy, count: 20 }] };
it("awards Magma Armor for all seven winning outcomes, but not the next outcome", () => {
  const f = crystalFixture();
  for (let roll = 1; roll <= 8; roll++) {
    f.ctx.random.integerInRange = () => roll;
    const drops = rollRegularEnemyLoot(f.ctx as unknown as Parameters<typeof rollRegularEnemyLoot>[0], "advanced_lava_wastes", 1);
    expect(drops.get("magma_armor") ?? 0).toBe(roll <= 7 ? 1 : 0);
  }
});
function fixture() { const f = crystalFixture(); f.patch("player", { mapId: batch.mapId }); f.patch("playerProgress", { equippedRightHand: STARTER_BOW, inventoryJson: '["starter_bow"]', damage: 1e15 }); return f; }
it("calculates stats and independent loot rolls once in one transaction", () => {
  const f = fixture(), base = f.db.playerProgress.identity.find(f.ctx.sender);
  f.ctx.random.integerInRange = vi.fn(() => 1);
  const update = vi.spyOn(f.db.playerProgress.identity, "update");
  f.run(server.recordEnemyDefeats, { ...batch, progress: { damage: 1e30 } });
  expect(update).toHaveBeenCalledTimes(1);
  expect(f.db.playerProgress.identity.find(f.ctx.sender).damage).toBeCloseTo(base.damage + enemyDefeatDefinition(batch.mapId, enemy)!.reward.amount * 20);
  expect(f.db.playerLifetime.identity.find(f.ctx.sender).enemyKills).toBe(20n);
  expect(f.ctx.random.integerInRange).toHaveBeenCalledTimes(60);
  f.patch("player", { mapId: "home_exterior" });
  f.run(server.recordEnemyDefeats, batch);
  expect(update).toHaveBeenCalledTimes(1);
  expect(f.ctx.random.integerInRange).toHaveBeenCalledTimes(60);
});
it.each([
  { enemies: [{ enemy, count: 0 }] }, { sequence: 2n },
  { enemies: [{ enemy: "Spitter", count: 1 }] }, { enemies: [{ enemy, count: 1 }, { enemy, count: 1 }] },
  { mapId: "cloudspire" },
])("rejects invalid identities/counts without consuming a receipt %s", change => {
  const f = fixture();
  expect(() => f.run(server.recordEnemyDefeats, { ...batch, ...change })).toThrow();
  expect([...f.db.regularEnemyLootCursor.iter()]).toHaveLength(0);
  expect([...f.db.enemyDefeatBudget.iter()]).toHaveLength(0);
});
it("rejects an unaccepted old-map report even when the map is unlocked", () => {
  const f = fixture(); f.patch("player", { mapId: "home_exterior" }); f.patch("playerProgress", { waterUnlocked: true });
  expect(() => f.run(server.recordEnemyDefeats, batch)).toThrow("another map");
});
it("rolls back reward, budget, receipt and loot if a write fails", () => {
  const f = fixture(), base = f.db.playerProgress.identity.find(f.ctx.sender);
  f.ctx.random.integerInRange = () => 1;
  const insert = vi.spyOn(f.db.playerItemDrop, "insert").mockImplementationOnce(() => { throw new Error("write failure"); });
  expect(() => f.run(server.recordEnemyDefeats, batch)).toThrow("write failure");
  expect([...f.db.regularEnemyLootCursor.iter()]).toHaveLength(0);
  expect([...f.db.enemyDefeatBudget.iter()]).toHaveLength(0);
  expect(f.db.playerProgress.identity.find(f.ctx.sender)).toEqual(base);
  insert.mockRestore(); f.run(server.recordEnemyDefeats, batch);
  expect([...f.db.playerItemDrop.iter()]).toHaveLength(3);
});
it("allows grouped kills and acknowledges excess without granting rewards across new streams", () => {
  const f = fixture(); f.ctx.random.integerInRange = (_min: number, max: number) => max;
  const definition = enemyDefeatDefinition(batch.mapId, enemy)!;
  // Mirror the server's float tolerance: 6 + 1.8 * 60 is 113.99999999999999.
  const capacity = Math.floor(defeatBudget(definition.population).capacity + 1e-6);
  let remaining = capacity, sequence = 1n;
  while (remaining) { const count = Math.min(100, remaining); f.run(server.recordEnemyDefeats, { ...batch, sequence: sequence++, enemies: [{ enemy, count }] }); remaining -= count; }
  const next = { ...batch, streamId: "another-stream-12345", enemies: [{ enemy, count: definition.population }] };
  const before = f.db.playerProgress.identity.find(f.ctx.sender).damage;
  expect(() => f.run(server.recordEnemyDefeats, next)).not.toThrow();
  expect(f.db.playerProgress.identity.find(f.ctx.sender).damage).toBe(before);
  // A retry of the consumed report cannot later turn excess claims into rewards.

  f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + 4_000_000n);
  expect(() => f.run(server.recordEnemyDefeats, next)).toThrow("DEFEAT_SESSION_COOLDOWN");
  expect(f.db.playerProgress.identity.find(f.ctx.sender).damage).toBe(before);
  expect(f.db.playerController.identity.find(f.ctx.sender)).toBeNull();
});
it.each(["recordCombatCheckpoint", "recordRegularEnemyDefeats", "recordForestEnemyDefeat", "recordDesertEnemyDefeat", "recordSnowEnemyDefeat", "recordLavaEnemyDefeat"])("closes obsolete reward endpoint %s", reducer => {
  const f = fixture();
  expect(() => f.run((server as any)[reducer], { ...batch, count: 1, progress: { damage: 1e25 } })).toThrow("updated");
});

it("consumes a 100-kill Endless report exceeding the one-site capacity and blocks the session with its receipt committed", () => {
  const f = fixture();
  f.patch("player", { mapId: "endless_1" });
  const definition = enemyDefeatDefinition("endless_1", "site:0")!;
  const capacity = Math.floor(defeatBudget(definition.population).capacity);
  // One Endless spawn site banks nineteen kills a minute: the enemy present plus a minute of respawns.
  expect(capacity).toBe(91);
  const report = { ...batch, mapId: "endless_1", enemies: [{ enemy: "site:0", count: 100 }] };
  f.run(server.recordEnemyDefeats, report);
  expect(f.db.playerLifetime.identity.find(f.ctx.sender).enemyKills).toBe(BigInt(capacity));
  expect(() => f.run(server.recordEnemyDefeats, report)).toThrow("DEFEAT_SESSION_COOLDOWN");
  expect(f.db.playerLifetime.identity.find(f.ctx.sender).enemyKills).toBe(BigInt(capacity));
  expect(f.db.regularEnemyLootCursor.key.find(`${f.ctx.sender.toHexString()}:${report.streamId}`).sequence).toBe(1n);
});

it('rolls pinned server drop chances instead of the current compiled table', () => {
  const random = { integerInRange: vi.fn(() => 500_000) };
  const drop = { itemId: 'starter_bow' as const, outcomes: 1_000_000, wins: 500_000 };
  expect(rollRegularEnemyLoot({ random } as any, 'tutorial_forest', 2, [drop]).get('starter_bow')).toBe(2);
  expect(rollRegularEnemyLoot({ random } as any, 'tutorial_forest', 2, [{ ...drop, wins: 0 }]).size).toBe(0);
});
