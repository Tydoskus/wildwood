import { expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { HOME_BENCH_POSITION } from "../../shared/home";
import { itemUpgradeDurationMs } from "../../shared/items";
import { slotUpgradeDurationWithResearch } from "../../shared/utility-research";
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
