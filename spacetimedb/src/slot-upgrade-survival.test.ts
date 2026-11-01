import { expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { TOWN_BENCH_POSITION } from "../../shared/town";
import { itemUpgradeDurationMs } from "../../shared/items";
import { slotUpgradeDurationWithResearch } from "../../shared/utility-research";
import { createEmptyResearchRanks } from "../../shared/research";
import { progressOf } from "../../tests/helpers/progress";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

/** A slot upgrade part-way through, as startItemUpgrade writes it. */
function seedRunningSlotUpgrade(f: ReturnType<typeof crystalFixture>, slot: string, level: number) {
  f.seed("moduleMigrationState", { id: 0, version: 39 });
  f.seed("playerItemUpgrade", { key: `${f.ctx.sender.toHexString()}:${slot}`, identity: f.ctx.sender, itemId: slot, level });
  f.seed("activeItemUpgrade", {
    identity: f.ctx.sender,
    itemId: slot,
    currentLevel: level,
    targetLevel: level + 1,
    startedAt: f.ctx.timestamp,
    completesAt: { microsSinceUnixEpoch: f.ctx.timestamp.microsSinceUnixEpoch + 60_000_000n },
    paused: false,
    remainingMicros: 60_000_000n,
  });
}

it("leaves a running slot upgrade alone when the world sweeps", () => {
  // A slot row is not an item: isUpgradeableItem answers false for "HAND",
  // so checking the row against it would cancel the upgrade on every sweep.
  const f = crystalFixture();
  seedRunningSlotUpgrade(f, "HAND", 10);

  f.run(server.runMaintenanceSweep);

  const active = [...f.db.activeItemUpgrade.iter()];
  expect(active).toHaveLength(1);
  expect(active[0].itemId).toBe("HAND");
  expect(active[0].targetLevel).toBe(11);
});

it("does not put the slot's name in the bag if the upgrade is cancelled", () => {
  const f = crystalFixture();
  seedRunningSlotUpgrade(f, "CHEST", 3);
  // A row whose recorded level no longer matches the slot is stale, and goes.
  f.db.playerItemUpgrade.key.update({
    key: `${f.ctx.sender.toHexString()}:CHEST`, identity: f.ctx.sender, itemId: "CHEST", level: 7,
  });

  f.run(server.runMaintenanceSweep);

  expect([...f.db.activeItemUpgrade.iter()]).toHaveLength(0);
  const progress = progressOf(f, f.ctx.sender);
  expect(JSON.parse(progress?.inventoryJson ?? "[]")).not.toContain("CHEST");
});

it("starts new slot upgrades at the researched speed", () => {
  const f = crystalFixture();
  f.patch("player", { mapId: "town", x: TOWN_BENCH_POSITION.x, y: TOWN_BENCH_POSITION.y });
  f.seed("playerResearch", { identity: f.ctx.sender, slotUpgradeSpeed: 5 });
  f.run(server.startItemUpgrade, { slot: 1, itemId: "HAND" });
  const active = f.db.activeItemUpgrade.identity.find(f.ctx.sender);
  expect(active.completesAt.microsSinceUnixEpoch - active.startedAt.microsSinceUnixEpoch)
    .toBe(BigInt(slotUpgradeDurationWithResearch(itemUpgradeDurationMs(0), 5)) * 1_000n);
});

it("shortens every running slot timer when Slot Speed research completes", () => {
  const f = crystalFixture();
  f.patch("player", { mapId: "town", x: TOWN_BENCH_POSITION.x, y: TOWN_BENCH_POSITION.y });
  f.seed("playerResearch", { identity: f.ctx.sender, ...createEmptyResearchRanks(), researchSpeed: 1 });
  f.seed("playerUpgradeBench", { identity: f.ctx.sender, secondSlotUnlocked: true });
  f.run(server.startItemUpgrade, { slot: 1, itemId: "HAND" });
  f.run(server.startItemUpgrade, { slot: 2, itemId: "HEAD" });
  const before = f.db.activeItemUpgrade.identity.find(f.ctx.sender);
  f.standAtResearch();
  f.run(server.startResearch, { researchId: "slotUpgradeSpeed" });
  const research = f.db.activeResearch.identity.find(f.ctx.sender);
  const schedule = [...f.db.researchCompletionSchedule.iter()][0];
  f.ctx.timestamp = research.completesAt;
  f.run(server.completeResearch, { schedule });
  const duration = BigInt(slotUpgradeDurationWithResearch(itemUpgradeDurationMs(0), 1)) * 1_000n;
  const slotOne = f.db.activeItemUpgrade.identity.find(f.ctx.sender);
  const slotTwo = f.db.activeItemUpgradeSlotTwo.identity.find(f.ctx.sender);
  expect(f.db.playerResearch.identity.find(f.ctx.sender)?.slotUpgradeSpeed).toBe(1);
  expect(slotOne.completesAt.microsSinceUnixEpoch).toBe(before.startedAt.microsSinceUnixEpoch + duration);
  expect(slotTwo.completesAt.microsSinceUnixEpoch).toBe(before.startedAt.microsSinceUnixEpoch + duration);
  expect([...f.db.itemUpgradeCompletionSchedule.iter()].map((row: any) => row.completesAtMicros))
    .toEqual([slotOne.completesAt.microsSinceUnixEpoch, slotTwo.completesAt.microsSinceUnixEpoch]);
});

// Buying queues two and three and running them side by side is in tests/scenarios/gear.test.ts (GEAR-15).
it("keeps a correct completion schedule instead of rewriting it every sweep", () => {
  const f = crystalFixture();
  seedRunningSlotUpgrade(f, "HAND", 10);
  f.run(server.runMaintenanceSweep);
  const [first] = [...f.db.itemUpgradeCompletionSchedule.iter()];
  expect(first).toBeTruthy();
  f.run(server.runMaintenanceSweep);
  expect([...f.db.itemUpgradeCompletionSchedule.iter()].map(row => row.scheduledId)).toEqual([first.scheduledId]);
});
