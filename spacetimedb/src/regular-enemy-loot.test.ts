import { BASIC_PAPER_HAT, STARTER_BOW } from "../../shared/items";
import { Timestamp } from "spacetimedb";
import { describe, expect, it, vi } from "vitest";
import { crystalFixture } from "../../tests/helpers/crystal-hollows-fixture";
import { reportKills } from "../../tests/helpers/enemy-defeat";
import { enemyDefeatDefinition, defeatBudget } from "../../shared/enemy-defeats";
import { ENEMY_TYPES } from "../../shared/enemy-definitions";
import { dropLands, rollRegularEnemyLoot } from "./regular-enemy-loot";
import { transitionPlayerMap } from "./character-reset";
import { regularMapLoot } from "../../shared/regular-map-loot";
import { progressOf } from "../../tests/helpers/progress";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));
const enemy = Object.keys(ENEMY_TYPES).find(kind => enemyDefeatDefinition("water_reach", kind)?.reward.type === "damage")!;
const batch = { streamId: "test-stream-123456", sequence: 1n, mapId: "water_reach", enemies: [{ enemy, count: 15 }] };
/** The forest still drops its paper hat; every other map drops nothing, so it rolls nothing. */
const forestEnemy = Object.keys(ENEMY_TYPES).find(kind => enemyDefeatDefinition("tutorial_forest", kind)?.reward.type === "damage")!;
const forestBatch = { ...batch, mapId: "tutorial_forest", enemies: [{ enemy: forestEnemy, count: 15 }] };
it("awards the paper hat on its winning outcome only, and no gear anywhere, Magma Armor included", () => {
  const f = crystalFixture();
  for (const roll of [1, 2]) {
    f.ctx.random.integerInRange = () => roll;
    const drops = rollRegularEnemyLoot(f.ctx as unknown as Parameters<typeof rollRegularEnemyLoot>[0], "tutorial_forest", 1);
    expect([...drops]).toEqual(roll === 1 ? [[BASIC_PAPER_HAT, 1]] : []);
  }
  f.ctx.random.integerInRange = () => 1;
  expect(rollRegularEnemyLoot(f.ctx as any, "advanced_lava_wastes", 1).size).toBe(0);
});
function fixture() { const f = crystalFixture(); f.patch("player", { mapId: batch.mapId }); f.patch("playerProgress", { equippedRightHand: STARTER_BOW, inventoryJson: '["starter_bow"]', damage: 1e15 }); return f; }
it("calculates stats and independent loot rolls once in one transaction", () => {
  const f = fixture();
  f.patch("player", { mapId: "tutorial_forest" });
  const base = progressOf(f, f.ctx.sender);
  f.ctx.random.integerInRange = vi.fn(() => 1);
  const update = vi.spyOn(f.db.playerProgress.identity, "update");
  reportKills(f, { ...forestBatch, progress: { damage: 1e30 } });
  expect(update).toHaveBeenCalledTimes(1);
  expect(progressOf(f, f.ctx.sender).damage).toBeCloseTo(base.damage + enemyDefeatDefinition("tutorial_forest", forestEnemy)!.reward.amount * 15);
  expect(f.db.playerLifetime.identity.find(f.ctx.sender).enemyKills).toBe(15n);
  // One roll a kill for the paper hat, the forest's only drop.
  const rolls = 15 * regularMapLoot("tutorial_forest").length;
  expect(rolls).toBe(15);
  expect(f.ctx.random.integerInRange).toHaveBeenCalledTimes(rolls);
  f.patch("player", { mapId: "town" });
  reportKills(f, forestBatch);
  expect(update).toHaveBeenCalledTimes(1);
  expect(f.ctx.random.integerInRange).toHaveBeenCalledTimes(rolls);
  // A map that drops nothing rolls nothing.
  const water = fixture();
  water.ctx.random.integerInRange = vi.fn(() => 1);
  reportKills(water, batch);
  expect(water.ctx.random.integerInRange).not.toHaveBeenCalled();
});
it.each([
  { enemies: [{ enemy, count: 0 }] }, { sequence: 2n },
  { enemies: [{ enemy: "Spitter", count: 1 }] }, { enemies: [{ enemy, count: 1 }, { enemy, count: 1 }] },
  { mapId: "cloudspire" },
])("rejects invalid identities/counts without consuming a receipt %s", change => {
  const f = fixture();
  expect(() => reportKills(f, { ...batch, ...change })).toThrow();
  expect([...f.db.regularEnemyStream.iter()]).toHaveLength(0);
  expect([...f.db.enemyDefeatBank.iter()]).toHaveLength(0);
});
it("honours a report for the map the player left for the Town, paid by that map's budget", () => {
  const f = fixture(), base = progressOf(f, f.ctx.sender);
  f.patch("player", { mapId: "town" });
  f.db.homeReturnLocation.insert({ identity: f.ctx.sender, mapId: batch.mapId, x: 1, y: 1, facing: 0 });
  reportKills(f, batch);
  expect(progressOf(f, f.ctx.sender).damage).toBeCloseTo(base.damage + enemyDefeatDefinition(batch.mapId, enemy)!.reward.amount * 15);
  // Spawn budgets are the map's own; the account-wide clocks live in player_defeat_clock.
  expect([...f.db.enemyDefeatBank.iter()].map(row => row.key)).toEqual([`${f.ctx.sender.toHexString()}:${batch.mapId}`]);
});
it("still rejects a report for a map the player did not come to the Town from, even when unlocked", () => {
  const f = fixture(); f.patch("player", { mapId: "town" }); f.patch("playerProgress", { waterUnlocked: true });
  f.db.homeReturnLocation.insert({ identity: f.ctx.sender, mapId: "cloudspire", x: 1, y: 1, facing: 0 });
  expect(() => reportKills(f, batch)).toThrow("another map");
  expect([...f.db.regularEnemyStream.iter()]).toHaveLength(0);
});
it("pays a report for the map just left for two minutes, so a portal need not wait for it", () => {
  const f = fixture(), base = progressOf(f, f.ctx.sender);
  f.patch("playerProgress", { cloudspireUnlocked: true });
  transitionPlayerMap(f.ctx, f.db.player.identity.find(f.ctx.sender), "cloudspire", { x: 500, y: 500 });
  f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + 100_000_000n);
  reportKills(f, batch);
  expect(progressOf(f, f.ctx.sender).damage).toBeCloseTo(base.damage + enemyDefeatDefinition(batch.mapId, enemy)!.reward.amount * 15);
  // Past the two minutes, it is another map's again.
  f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + 21_000_000n);
  expect(() => reportKills(f, { ...batch, sequence: 2n })).toThrow("another map");
});
it("rolls back reward, budget, receipt and loot if a write fails", () => {
  const f = fixture();
  f.patch("player", { mapId: "tutorial_forest" });
  const base = progressOf(f, f.ctx.sender);
  f.ctx.random.integerInRange = () => 1;
  const insert = vi.spyOn(f.db.playerItemDrop, "insert").mockImplementationOnce(() => { throw new Error("write failure"); });
  expect(() => reportKills(f, forestBatch)).toThrow("write failure");
  expect([...f.db.regularEnemyStream.iter()]).toHaveLength(0);
  expect([...f.db.enemyDefeatBank.iter()]).toHaveLength(0);
  expect(progressOf(f, f.ctx.sender)).toEqual(base);
  insert.mockRestore(); reportKills(f, forestBatch);
  expect([...f.db.playerItemDrop.iter()]).toHaveLength(regularMapLoot("tutorial_forest").length);
});
it("allows grouped kills and acknowledges excess without granting rewards across new streams", () => {
  const f = fixture(); f.ctx.random.integerInRange = (_min: number, max: number) => max;
  const definition = enemyDefeatDefinition(batch.mapId, enemy)!;
  // Mirror the server's float tolerance: 6 + 1.8 * 60 is 113.99999999999999.
  const capacity = Math.floor(defeatBudget(definition.population).capacity + 1e-6);
  let remaining = capacity, sequence = 1n;
  while (remaining) { const count = Math.min(100, remaining); reportKills(f, { ...batch, sequence: sequence++, enemies: [{ enemy, count }] }); remaining -= count; }
  const next = { ...batch, streamId: "another-stream-12345", enemies: [{ enemy, count: definition.population }] };
  const before = progressOf(f, f.ctx.sender).damage;
  expect(() => reportKills(f, next)).not.toThrow();
  expect(progressOf(f, f.ctx.sender).damage).toBe(before);
  // A retry of the consumed report cannot later turn excess claims into rewards.

  f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + 4_000_000n);
  expect(() => reportKills(f, next)).not.toThrow();
  expect(progressOf(f, f.ctx.sender).damage).toBe(before);
  // Bounding the payout is the whole enforcement. Taking the session as well
  // kicked honest players whose map round-trip outran the refilling bucket.
  expect(f.db.defeatSessionRestriction.identity.find(f.ctx.sender)).toBeNull();
  expect(f.db.playerController.identity.find(f.ctx.sender)).not.toBeNull();
});

it("consumes a 100-kill Endless report exceeding the one-site capacity and keeps the session with its receipt committed", () => {
  const f = fixture();
  f.patch("player", { mapId: "endless_1" });
  const definition = enemyDefeatDefinition("endless_1", "site:0")!;
  const capacity = Math.floor(defeatBudget(definition.population).initial);
  // Arriving at an Endless site banks the enemy standing there plus one report
  // window (a minute) of respawns. A hundred kills of one site would take a quarter of an
  // hour, so a report claiming them is paid only what it earned.
  expect(capacity).toBe(7);
  const report = { ...batch, mapId: "endless_1", enemies: [{ enemy: "site:0", count: 100 }] };
  reportKills(f, report);
  expect(f.db.playerLifetime.identity.find(f.ctx.sender).enemyKills).toBe(BigInt(capacity));
  expect(() => reportKills(f, report)).not.toThrow();
  expect(f.db.playerLifetime.identity.find(f.ctx.sender).enemyKills).toBe(BigInt(capacity));
  expect(f.db.defeatSessionRestriction.identity.find(f.ctx.sender)).toBeNull();
  expect(f.db.regularEnemyStream.key.find(`${f.ctx.sender.toHexString()}:${report.streamId}`).sequence).toBe(1n);
});

it('rolls pinned server drop chances instead of the current compiled table, but never gear they still list', () => {
  const random = { integerInRange: vi.fn(() => 500_000) };
  const drop = { itemId: BASIC_PAPER_HAT as typeof BASIC_PAPER_HAT, outcomes: 1_000_000, wins: 500_000 };
  expect(rollRegularEnemyLoot({ random } as any, 'tutorial_forest', 2, [drop]).get(BASIC_PAPER_HAT)).toBe(2);
  expect(rollRegularEnemyLoot({ random } as any, 'tutorial_forest', 2, [{ ...drop, wins: 0 }]).size).toBe(0);
  // A balance pinned before gear stopped dropping still lists the forest's bow; it never drops.
  const pinned = [{ itemId: STARTER_BOW as typeof STARTER_BOW, outcomes: 1_000_000, wins: 1_000_000 }, drop];
  expect([...rollRegularEnemyLoot({ random } as any, 'tutorial_forest', 2, pinned)]).toEqual([[BASIC_PAPER_HAT, 2]]);
});

describe("raised drop chances", () => {
  /** The exact chance a drop lands: every whole roll, and a fine grid of the second draw. */
  const chance = (wins: number, outcomes: number, multiplier: number) => {
    const steps = 1_000;
    let landed = 0;
    for (let roll = 1; roll <= outcomes; roll++) for (let step = 0; step < steps; step++) {
      const random = Object.assign(() => (step + .5) / steps, { integerInRange: () => roll });
      if (dropLands({ random } as any, wins, outcomes, multiplier)) landed++;
    }
    return landed / (outcomes * steps);
  };
  it("pays the full raise on a 1 in 200 drop, the same as on 10 in 2000", () => {
    expect(chance(1, 200, 1.55)).toBeCloseTo(.00775, 6);
    expect(chance(10, 2000, 1.55)).toBeCloseTo(.00775, 6);
  });
  it("rolls an unraised drop exactly as before, with no second draw", () => {
    const second = vi.fn(() => 0);
    const random = Object.assign(second, { integerInRange: () => 1 });
    expect(dropLands({ random } as any, 1, 200, 1)).toBe(true);
    expect(dropLands({ random: Object.assign(second, { integerInRange: () => 2 }) } as any, 1, 200, 1)).toBe(false);
    expect(second).not.toHaveBeenCalled();
    expect(chance(1, 200, 1)).toBeCloseTo(.005, 6);
  });
  it("never goes past certain", () => {
    expect(chance(150, 200, 2)).toBe(1);
  });
});
