import { MODULE_MIGRATION_VERSION } from "./module-migrations";
import { expect, it, vi } from "vitest";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { rebaseProgressByEffort } from "../../shared/progression-rebase";
import { CAMPAIGN_UNLOCK_FIELDS } from "../../shared/equipment-access";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

it("acknowledges a cached pre-conversion loadout without re-equipping locked gear", () => {
  const f = crystalFixture();
  f.patch("playerProgress", { ionCitadelUnlocked: false, inventoryJson: '["ion_bow","starter_bow"]', equippedRightHand: "starter_bow" });
  const current = f.db.playerProgress.identity.find(f.ctx.sender);
  f.seed("playerEndlessRebaseBackup", { identity: f.ctx.sender,
    progressJson: JSON.stringify({ equippedRightHand: "ion_bow" }) });
  expect(() => f.run(server.savePlayerProgress, { ...current, equippedRightHand: "ion_bow", damage: 1e25 })).not.toThrow();
  expect(f.db.playerProgress.identity.find(f.ctx.sender)).toMatchObject({ equippedRightHand: "starter_bow", damage: current.damage });
  expect(() => f.run(server.savePlayerProgress, { ...current, equippedHead: "ion_helmet" })).toThrow("Ion Citadel");
});

it("converts online and offline accounts once, backs up stats, gates gear and retains loot receipts", () => {
  const f = crystalFixture();
  f.seed("moduleMigrationState", { id: 0, version: 31 });
  f.ctx.connectionId = null;
  f.patch("playerProgress", { damage: 1e20, maxHp: 2e20, armor: 1e19, regen: 1e18 });
  const original = f.progress(identity("2"), { damage: 1e22, maxHp: 2e22, armor: 1e21, regen: 1e20,
    ...Object.fromEntries(CAMPAIGN_UNLOCK_FIELDS.map(field => [field, true])), bossRewardClaims: 32767, inventoryJson: '["starter_stone","starter_bow","basic_paper_hat"]', equippedRightHand: "starter_bow" });
  f.seed("regularEnemyLootCursor", { key: "receipt", identity: identity("2"), sequence: 12n });
  f.run(server.onConnect);
  const next = f.db.playerProgress.identity.find(identity("2"));
  const expected = rebaseProgressByEffort(original, null, () => 0);
  expect(next).toMatchObject(expected.progress);
  expect(next.ionCitadelUnlocked).toBe(false);
  expect(next.inventoryJson).toContain("starter_bow");
  expect(f.db.playerEndlessRebaseBackup.identity.find(identity("2"))).toMatchObject({ damage: original.damage, maxHp: original.maxHp });
  expect(f.db.regularEnemyLootCursor.key.find("receipt")).toBeTruthy();
  expect(f.db.playerBalanceVersion.identity.find(identity("2")).version).toBe(9);
  expect(f.db.moduleMigrationState.id.find(0).version).toBe(MODULE_MIGRATION_VERSION);
  f.patch("playerProgress", { damage: next.damage + 1000 }, identity("2"));
  f.run(server.onConnect);
  expect(f.db.playerProgress.identity.find(identity("2")).damage).toBe(next.damage + 1000);
  expect(f.db.playerEndlessRebaseBackup.identity.find(identity("2")).damage).toBe(original.damage);
});

it("does not restore rolled-back map access from historical shared-boss results on reconnect", async () => {
  const { TERMS_VERSION, AGE_BAND_ADULT } = await import("../../shared/legal");
  const f = crystalFixture();
  f.patch("playerProgress", { desertUnlocked: true, crystalHollowsUnlocked: true,
    ionCitadelUnlocked: false, bossRewardClaims: 511,
    inventoryJson: '["ion_bow","starter_bow"]', equippedRightHand: "starter_bow" });
  f.patch("player", { mapId: "home_exterior" });
  f.seed("aegisPrimeResult", { id: 1, encounter: 3n, totalDamage: 10,
    contributorsJson: JSON.stringify([{ identity: f.ctx.sender.toHexString(), damage: 10 }]), createdAt: f.ctx.timestamp });
  f.run(server.acceptTerms, { termsVersion: TERMS_VERSION, ageBand: AGE_BAND_ADULT });
  f.run(server.enterWorldWithTutorial, { forceTakeover: true, tabId: "rebase-reconnect-test" });
  const progress = f.db.playerProgress.identity.find(f.ctx.sender);
  expect(progress.ionCitadelUnlocked).toBe(false);
  expect(progress.bossRewardClaims).toBe(511);
  expect(() => f.run(server.savePlayerProgress, { ...progress, equippedRightHand: "ion_bow" })).toThrow("Ion Citadel");
  expect(() => f.run(server.changeMap, { mapId: "ion_citadel", x: 600, y: 442 })).toThrow("Gravebloom");
});
