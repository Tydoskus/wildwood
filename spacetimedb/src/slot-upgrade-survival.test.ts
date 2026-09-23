import { expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { HOME_BENCH_POSITION } from "../../shared/home";
import { itemUpgradeDurationMs } from "../../shared/items";
import { slotUpgradeDurationWithResearch } from "../../shared/utility-research";
import { UPGRADE_BENCH_THIRD_SLOT_GEM_COST } from "../../shared/gems";
import { Timestamp } from "spacetimedb";
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
  // It used to check the row against isUpgradeableItem, which answers false
  // for "HAND", so every sweep, sign-in and completion cancelled the upgrade
  // and a slot never moved past the tier it started the day with.
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
  const progress = f.db.playerProgress.identity.find(f.ctx.sender);
  expect(JSON.parse(progress?.inventoryJson ?? "[]")).not.toContain("CHEST");
});

it("starts new slot upgrades at the researched speed", () => {
  const f = crystalFixture();
  f.patch("player", { mapId: "home_exterior", x: HOME_BENCH_POSITION.x, y: HOME_BENCH_POSITION.y });
  f.seed("playerResearch", { identity: f.ctx.sender, slotUpgradeSpeed: 5 });
  f.run(server.startItemUpgrade, { slot: 1, itemId: "HAND" });
  const active = f.db.activeItemUpgrade.identity.find(f.ctx.sender);
  expect(active.completesAt.microsSinceUnixEpoch - active.startedAt.microsSinceUnixEpoch)
    .toBe(BigInt(slotUpgradeDurationWithResearch(itemUpgradeDurationMs(0), 5)) * 1_000n);
});

it("requires slot two, charges 200 Gems once, and completes slot three beside two running jobs", () => {
  const f = crystalFixture();
  f.patch("player", { mapId: "home_exterior", x: HOME_BENCH_POSITION.x, y: HOME_BENCH_POSITION.y });
  f.seed("playerGemWallet", { identity: f.ctx.sender, balance: UPGRADE_BENCH_THIRD_SLOT_GEM_COST });
  expect(() => f.run(server.unlockThirdUpgradeSlot)).toThrow("second upgrade slot first");
  f.seed("playerUpgradeBench", { identity: f.ctx.sender, secondSlotUnlocked: true });
  expect(() => f.run(server.startItemUpgrade, { slot: 3, itemId: "CHEST" })).toThrow("third upgrade slot first");
  f.patch("playerGemWallet", { balance: UPGRADE_BENCH_THIRD_SLOT_GEM_COST - 1n });
  expect(() => f.run(server.unlockThirdUpgradeSlot)).toThrow("Not enough Gems");
  expect(f.db.playerUpgradeBenchThirdSlot.identity.find(f.ctx.sender)).toBeNull();
  f.patch("playerGemWallet", { balance: UPGRADE_BENCH_THIRD_SLOT_GEM_COST });
  f.run(server.unlockThirdUpgradeSlot);
  expect(f.db.playerGemWallet.identity.find(f.ctx.sender)?.balance).toBe(0n);
  expect(f.db.playerUpgradeBenchThirdSlot.identity.find(f.ctx.sender)).not.toBeNull();
  f.run(server.unlockThirdUpgradeSlot);
  expect(f.db.playerGemWallet.identity.find(f.ctx.sender)?.balance).toBe(0n);

  f.run(server.startItemUpgrade, { slot: 1, itemId: "HAND" });
  f.run(server.startItemUpgrade, { slot: 2, itemId: "HEAD" });
  f.run(server.startItemUpgrade, { slot: 3, itemId: "CHEST" });
  expect(f.db.activeItemUpgrade.identity.find(f.ctx.sender)?.itemId).toBe("HAND");
  expect(f.db.activeItemUpgradeSlotTwo.identity.find(f.ctx.sender)?.itemId).toBe("HEAD");
  const third = f.db.activeItemUpgradeSlotThree.identity.find(f.ctx.sender);
  expect(third?.itemId).toBe("CHEST");
  const schedule = [...f.db.itemUpgradeCompletionSchedule.iter()].find((row: any) => row.slot === 3);
  expect(schedule).toBeDefined();
  f.ctx.timestamp = new Timestamp(third.completesAt.microsSinceUnixEpoch);
  f.run(server.completeItemUpgrade, { schedule });
  expect(f.db.activeItemUpgradeSlotThree.identity.find(f.ctx.sender)).toBeNull();
  expect(f.db.playerItemUpgrade.key.find(`${f.ctx.sender.toHexString()}:CHEST`)?.level).toBe(1);
  expect(f.db.activeItemUpgrade.identity.find(f.ctx.sender)?.itemId).toBe("HAND");
  expect(f.db.activeItemUpgradeSlotTwo.identity.find(f.ctx.sender)?.itemId).toBe("HEAD");
});
