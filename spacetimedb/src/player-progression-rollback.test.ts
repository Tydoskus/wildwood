import { expect, it, vi } from "vitest";
import { Identity } from "spacetimedb";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { CAMPAIGN_UNLOCK_FIELDS } from "../../shared/equipment-access";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));
const owner = new Identity("c200383520521c925f3cf6deafb20cd6a7d6168d1c31cb3c0ddb731c197a2d79");

function setup() {
  const f = crystalFixture(), target = f.ctx.sender;
  f.patch("playerProgress", { damage: 10000, maxHp: 20000, regen: 100, armor: 100,
    ...Object.fromEntries(CAMPAIGN_UNLOCK_FIELDS.map(field => [field, true])), bossRewardClaims: 32767,
    inventoryJson: '["starter_bow","ion_bow","ion_armor"]', equippedRightHand: "ion_bow", equippedChest: "ion_armor" });
  const current = f.db.playerProgress.identity.find(target);
  const baseline = { ...current, identity: target.toHexString(), damage: 1000, maxHp: 2000, regen: 10, armor: 10,
    ...Object.fromEntries(CAMPAIGN_UNLOCK_FIELDS.map((field, i) => [field, i < 8])), bossRewardClaims: 255,
    equippedRightHand: "starter_bow", equippedChest: "" };
  const args = { identity: target, expectedDisplayName: "Test Player", operationId: "test-rollback", baselineJson: JSON.stringify(baseline), reason: "Owner-requested rollback to the saved baseline." };
  f.ctx.sender = owner;
  return { ...f, target, args, current };
}

it("restores only progression, locks retained gear, moves to the Town and records an atomic before/after", () => {
  const f = setup();
  f.seed("playerGemWallet", { identity: f.target, balance: 999n });
  f.seed("regularEnemyLootCursor", { key: "accepted", identity: f.target, sequence: 20n });
  f.seed("enemyDefeatBudget", { key: "old-credit", identity: f.target, tokens: 300, updatedAtMicros: 1n });
  f.seed("playerCutsceneHistory", { identity: f.target, seenMask: 32767, generation: 1 });
  f.seed("prismshellContribution", { identity: f.target, encounter: 7n, displayName: "Test Player", damage: 999 });
  f.run(server.devRollbackPlayerProgression, f.args);
  const next = f.db.playerProgress.identity.find(f.target);
  expect(next).toMatchObject({ damage: 1000, maxHp: 2000, regen: 10, armor: 10, moonfenUnlocked: true,
    crystalHollowsUnlocked: false, ionCitadelUnlocked: false, bossRewardClaims: 255,
    equippedRightHand: "starter_bow", equippedChest: "", inventoryJson: f.current.inventoryJson });
  expect(f.db.player.identity.find(f.target)).toMatchObject({ mapId: "town", maxHp: 2000, hp: 2000 });
  expect(f.db.homeReturnLocation.identity.find(f.target).mapId).toBe("moonfen");
  expect(f.db.playerLastLocation.identity.find(f.target).mapId).toBe("town");
  expect(f.db.playerGemWallet.identity.find(f.target).balance).toBe(999n);
  expect(f.db.regularEnemyLootCursor.key.find("accepted").sequence).toBe(20n);
  expect(f.db.enemyDefeatBudget.key.find("old-credit")).toBeNull();
  expect(f.db.prismshellContribution.identity.find(f.target)).toBeNull();
  expect(f.db.playerCutsceneHistory.identity.find(f.target).generation).toBe(2);
  const audit = [...f.db.moderationAction.iter()][0];
  expect(JSON.parse(audit.before).progress.damage).toBe(10000);
  expect(JSON.parse(audit.after).progress.damage).toBe(1000);
  f.patch("playerProgress", { damage: 1234 }, f.target);
  f.run(server.devRollbackPlayerProgression, f.args);
  expect(f.db.playerProgress.identity.find(f.target).damage).toBe(1234);
  expect(f.db.moderationAction.count()).toBe(1n);
});

it("rejects unauthorized, stale and malformed requests without touching a save", () => {
  const f = setup();
  f.ctx.sender = f.target;
  expect(() => f.run(server.devRollbackPlayerProgression, f.args)).toThrow(/owner/);
  f.ctx.sender = owner;
  expect(() => f.run(server.devRollbackPlayerProgression, { ...f.args, expectedDisplayName: "wrong" })).toThrow(/target/);
  expect(() => f.run(server.devRollbackPlayerProgression, { ...f.args, baselineJson: "{}" })).toThrow(/identity/);
  expect(f.db.playerProgress.identity.find(f.target)).toEqual(f.current);
  expect(f.db.moderationAction.count()).toBe(0n);
});
