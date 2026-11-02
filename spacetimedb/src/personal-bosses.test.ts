import { expect, it, vi } from "vitest";
import { crystalFixture } from "../../tests/helpers/crystal-hollows-fixture";
import { reportEnemy, reportKills, readDefeatClock, seedDefeatClock } from "../../tests/helpers/enemy-defeat";
import { CAMPAIGN_MAPS } from "../../shared/campaign-registry";
import { CAMPAIGN_UNLOCK_FIELDS } from "../../shared/equipment-access";
import { progressOf } from "../../tests/helpers/progress";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const baseStats = (row: any) => Object.fromEntries(["damage", "maxHp", "armor", "regen", "attackRate", "inventoryJson"].map(key => [key, row[key]]));

it.each([...CAMPAIGN_MAPS.map(map => map.id), "endless_1", "endless_40"])("records only gate access for a client boss clear on %s", mapId => {
  const f = crystalFixture();
  f.patch("player", { mapId });
  // No weapon, no DPS, no simulated time: there is no server-side boss fight.
  f.patch("playerProgress", { damage: 0, equippedRightHand: "", equippedLeftHand: "" });
  const before = baseStats(progressOf(f, f.ctx.sender));
  const rolls = vi.spyOn(f.ctx.random, "integerInRange");
  reportEnemy(f, "boss");
  const after = progressOf(f, f.ctx.sender);
  expect(baseStats(after)).toEqual(before);
  if (mapId.startsWith("endless_")) {
    expect(f.db.proceduralProgress.identity.find(f.ctx.sender).completed).toBe(Number(mapId.slice(8)));
  } else {
    const index = CAMPAIGN_MAPS.findIndex(map => map.id === mapId);
    expect(after.bossRewardClaims & 2 ** CAMPAIGN_MAPS[index].claimIndex).not.toBe(0);
    const unlock = CAMPAIGN_MAPS[index + 1]?.unlockField;
    if ((CAMPAIGN_UNLOCK_FIELDS as readonly string[]).includes(unlock)) expect(after[unlock]).toBe(true);
  }
  expect(f.db.playerLifetime.identity.find(f.ctx.sender)?.enemyKills ?? 0n).toBe(0n);
  expect([...f.db.playerItemDrop.iter()]).toEqual([]);
  expect([...f.db.playerDailyQuest.iter()]).toEqual([]);
  expect(rolls).not.toHaveBeenCalled();
  expect([...f.db.enemyDefeatBank.iter()]).toEqual([]);
  expect(readDefeatClock(f, "combat")).toBeUndefined();
  expect([...f.db.proceduralInstanceContribution.iter()]).toEqual([]);
});

it.each(["tutorial_forest", "endless_40"])("retries and repeated %s clears never repay or rewrite the gate", mapId => {
  const f = crystalFixture(); f.patch("player", { mapId });
  reportEnemy(f, "boss", 100);
  const progressWrites = vi.spyOn(f.db.playerProgress.identity, "update");
  const endlessWrites = vi.spyOn(f.db.proceduralProgress.identity, "update");
  const batch = { mapId, streamId: "test-defeats-stream-0001", sequence: 1n, enemies: [{ enemy: "boss", count: 100 }] };
  reportKills(f, batch); // lost acknowledgement
  reportKills(f, { ...batch, sequence: 2n }); // another local clear
  expect(progressWrites).not.toHaveBeenCalled(); expect(endlessWrites).not.toHaveBeenCalled();
  expect(f.db.playerLifetime.identity.find(f.ctx.sender)?.enemyKills ?? 0n).toBe(0n);
  expect(f.db.regularEnemyStream.key.find(`${f.ctx.sender.toHexString()}:${batch.streamId}`).sequence).toBe(2n);
});

it("leaves both regular-enemy clocks alone on a gate-only report", () => {
  const f = crystalFixture();
  for (const clock of ["combat", "sim"] as const) seedDefeatClock(f, clock, 0);
  reportEnemy(f, "boss", 1, 60_000);
  for (const clock of ["combat", "sim"] as const) expect(readDefeatClock(f, clock)!.tokens).toBe(0);
  expect(progressOf(f, f.ctx.sender).clockworkRuinsUnlocked).toBe(true);
});

it("keeps regular rewards and kill counts identical when the same batch also opens a gate", () => {
  const regular = crystalFixture(), mixed = crystalFixture();
  for (const f of [regular, mixed]) f.patch("playerProgress", { damage: 1e15, inventoryJson: '["starter_bow"]', equippedRightHand: "starter_bow" });
  const batch = { mapId: "crystal_hollows", streamId: "mixed-gate-report-stream", sequence: 1n, simulatedMillis: 30_000,
    enemies: [{ enemy: "Shard Hopper", count: 3 }] };
  reportKills(regular, batch);
  reportKills(mixed, { ...batch, enemies: [...batch.enemies, { enemy: "boss", count: 7 }] });
  expect(baseStats(progressOf(mixed, mixed.ctx.sender))).toEqual(baseStats(progressOf(regular, regular.ctx.sender)));
  expect(mixed.db.playerLifetime.identity.find(mixed.ctx.sender).enemyKills).toBe(3n);
  expect([...mixed.db.playerItemDrop.iter()]).toEqual([...regular.db.playerItemDrop.iter()]);
  expect(progressOf(mixed, mixed.ctx.sender).clockworkRuinsUnlocked).toBe(true);
});

it("checks session, map and report identity before recording a gate", () => {
  const f = crystalFixture();
  const batch = { mapId: "endless_100", streamId: "wrong-map-gate-stream", sequence: 1n, enemies: [{ enemy: "boss", count: 1 }] };
  expect(() => reportKills(f, batch)).toThrow("another map");
  expect(f.db.proceduralProgress.identity.find(f.ctx.sender)).toBeNull();
  expect(() => reportKills(f, { ...batch, mapId: "crystal_hollows", enemies: [...batch.enemies, ...batch.enemies] })).toThrow("Invalid enemy");
  f.ctx.connectionId = null;
  expect(() => reportKills(f, { ...batch, mapId: "crystal_hollows" })).toThrow();
});
