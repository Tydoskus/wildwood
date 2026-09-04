import { describe, expect, it, vi } from "vitest";
import { Identity } from "spacetimedb";
import { ATTACK_BALANCE_VERSION, MIREMAW_MAX_HP, TEMPEST_KIRIN_MAX_HP, SPACETIME_AUTH_ISSUER, SPACETIME_AUTH_CLIENT_ID } from "../../shared/rules";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";

vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

describe("Crystal Hollows unlock and identity lifecycle", () => {
  it("earns the unlock from Miremaw, not a high stat or the preceding Kirin", () => {
    const f = crystalFixture();
    f.patch("playerProgress", { damage: 1e15 });
    expect(f.db.playerProgress.identity.find(f.ctx.sender).crystalHollowsUnlocked).toBe(false);
    f.patch("player", { mapId: "cloudspire" });
    f.seed("tempestKirinBoss", { id: 1, encounter: 1n, maxHp: TEMPEST_KIRIN_MAX_HP, hp: 1, alive: true });
    f.run(server.damageTempestKirinFromPosition, { hits: 1, x: 4050, y: 4050 });
    expect(f.db.playerProgress.identity.find(f.ctx.sender)).toMatchObject({ moonfenUnlocked: true, crystalHollowsUnlocked: false });
    f.run(server.changeMap, { mapId: "moonfen", x: 580, y: 617 });
    f.seed("miremawBoss", { id: 1, encounter: 1n, maxHp: MIREMAW_MAX_HP, hp: 1, alive: true });
    f.run(server.damageMiremawFromPosition, { hits: 1, x: 4050, y: 4050 });
    expect(f.db.playerProgress.identity.find(f.ctx.sender).crystalHollowsUnlocked).toBe(true);
  });

  it("backfills recorded Miremaw contributors once without altering their stats", () => {
    const f = crystalFixture();
    const bystander = f.progress(identity("2"), { maxHp: 1e15, damage: 1e15 });
    const before = f.db.playerProgress.identity.find(f.ctx.sender);
    f.seed("moduleMigrationState", { id: 0, version: 20 });
    f.seed("miremawResult", { id: 1, encounter: 3n, totalDamage: 10,
      contributorsJson: JSON.stringify([{ identity: f.ctx.sender.toHexString(), damage: 10 }]), createdAt: f.ctx.timestamp });
    f.ctx.connectionId = null;
    f.run(server.onConnect);
    const migrated = f.db.playerProgress.identity.find(f.ctx.sender);
    expect(migrated).toEqual({ ...before, crystalHollowsUnlocked: true });
    expect(f.db.playerProgress.identity.find(identity("2"))).toEqual(bystander);
    f.run(server.onConnect);
    expect(f.db.playerProgress.identity.find(f.ctx.sender)).toEqual(migrated);
    expect(f.db.moduleMigrationState.id.find(0).version).toBeGreaterThanOrEqual(21);
  });

  it("transfers a guest unlock and current contribution without leaving a second save", () => {
    const f = crystalFixture();
    const guest = identity("2");
    f.db.playerProgress.identity.delete(f.ctx.sender); // Fresh authenticated account.
    f.progress(guest, { crystalHollowsUnlocked: true });
    f.seed("playerBalanceVersion", { identity: guest, version: ATTACK_BALANCE_VERSION });
    f.seed("accountLink", { code: "test-link", guest, createdAt: f.ctx.timestamp });
    for (const [who, damage] of [[guest, 30], [f.ctx.sender, 20]] as const) {
      f.seed("prismshellContribution", { identity: who, encounter: 7n, damage, displayName: "Before" });
      f.seed("prismshellAttackWindow", { identity: who, encounter: 7n, hits: 2, startedAtMicros: 10_000_000n });
    }
    f.ctx.senderAuth = { jwt: { issuer: SPACETIME_AUTH_ISSUER, audience: [SPACETIME_AUTH_CLIENT_ID] } };
    f.run(server.claimGuestAccount, { code: "test-link" });
    expect(f.db.playerProgress.identity.find(f.ctx.sender).crystalHollowsUnlocked).toBe(true);
    expect(f.db.playerProgress.identity.find(guest)).toBeNull();
    expect(f.db.prismshellContribution.identity.find(guest)).toBeNull();
    expect(f.db.prismshellContribution.identity.find(f.ctx.sender)).toMatchObject({ damage: 50, encounter: 7n });
    expect(f.db.prismshellAttackWindow.count()).toBe(0n);
    expect(f.db.accountLink.code.find("test-link")).toBeNull();
  });

  it("renames the contributor without changing credited damage", () => {
    const f = crystalFixture();
    f.attack();
    f.run(server.setDisplayName, { displayName: "New Name" });
    expect(f.db.prismshellContribution.identity.find(f.ctx.sender)).toMatchObject({ displayName: "New Name", damage: 1_000 });
  });

  it("removes virtual-player combat rows on last disconnect but preserves peers", () => {
    const f = crystalFixture();
    const peer = identity("2");
    f.seed("virtualPlayer", { identity: f.ctx.sender, owner: peer, mapId: "crystal_hollows", createdAt: f.ctx.timestamp });
    f.attack();
    f.seed("prismshellContribution", { identity: peer, encounter: 7n, damage: 22, displayName: "Peer" });
    f.run(server.onDisconnect);
    expect(f.db.prismshellContribution.identity.find(f.ctx.sender)).toBeNull();
    expect(f.db.prismshellAttackWindow.identity.find(f.ctx.sender)).toBeNull();
    expect(f.db.playerProgress.identity.find(f.ctx.sender)).toBeNull();
    expect(f.db.prismshellContribution.identity.find(peer).damage).toBe(22);
  });

  it("includes Crystal combat data in guarded complete legacy-player removal", () => {
    const f = crystalFixture();
    const target = identity("2");
    f.progress(target, { maxHp: 10, damage: 1 });
    f.seed("playerProfile", { identity: target, displayName: "Legacy" });
    f.seed("leaderboardEntry", { identity: target, displayName: "Legacy", powerLevel: 11, isGuest: false });
    f.seed("prismshellContribution", { identity: target, encounter: 7n, damage: 10, displayName: "Legacy" });
    f.seed("prismshellAttackWindow", { identity: target, encounter: 7n, hits: 1 });
    const remove = () => f.run(server.devDeleteLegacyPlayer, { identity: target, expectedDisplayName: "Legacy" });
    expect(remove).toThrow("Developer access required");
    // Public owner identifier in the module, used only with an in-memory DB.
    f.ctx.sender = new Identity("c200383520521c925f3cf6deafb20cd6a7d6168d1c31cb3c0ddb731c197a2d79");
    remove();
    expect(f.db.playerProgress.identity.find(target)).toBeNull();
    expect(f.db.prismshellContribution.identity.find(target)).toBeNull();
    expect(f.db.prismshellAttackWindow.identity.find(target)).toBeNull();
    expect(f.db.playerProgress.identity.find(identity("1"))).not.toBeNull();
  });
});
