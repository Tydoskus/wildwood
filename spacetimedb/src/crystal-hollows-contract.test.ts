import { describe, expect, it, vi } from "vitest";
import { ConnectionId, Timestamp } from "spacetimedb";
import { BOSS_REWARD_CLAIM_BITS, PRISMSHELL_MAX_HP, PRISMSHELL_REWARD_DAMAGE, PRISMSHELL_REWARD_HEALTH } from "../../shared/rules";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { reducerParameters } from "../../tests/helpers/spacetime-module";

vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

describe("Crystal Hollows reducer behavior (in-memory, not native host integration)", () => {
  it("appends a default-false unlock and excludes it from the save wire arguments", () => {
    const columns = server.default.schemaType.tables.playerProgress.columns;
    expect(columns.crystalHollowsUnlocked.columnMetadata.defaultValue).toBe(false);
    expect(columns.bossRewardClaims.columnMetadata.defaultValue).toBe(0);
    const names = Object.keys(columns);
    expect(names.indexOf("crystalHollowsUnlocked")).toBeGreaterThan(names.indexOf("moonfenUnlocked"));
    expect(names.indexOf("bossRewardClaims")).toBeGreaterThan(names.indexOf("crystalHollowsUnlocked"));
    expect(reducerParameters.get(server.savePlayerProgress)).not.toHaveProperty("crystalHollowsUnlocked");
    expect(Object.keys(reducerParameters.get(server.damagePrismshellFromPosition)!).sort()).toEqual(["hits", "x", "y"]);
  });

  it("cannot grant or revoke the unlock through a player save", () => {
    const f = crystalFixture();
    const save = (forged: boolean) => f.run(server.savePlayerProgress, {
      ...f.db.playerProgress.identity.find(f.ctx.sender), enemyKills: 0, crystalHollowsUnlocked: forged,
    });
    save(true);
    expect(f.db.playerProgress.identity.find(f.ctx.sender).crystalHollowsUnlocked).toBe(false);
    f.patch("playerProgress", { bossRewardClaims: BOSS_REWARD_CLAIM_BITS.prismshell });
    save(false);
    expect(f.db.playerProgress.identity.find(f.ctx.sender).bossRewardClaims).toBe(BOSS_REWARD_CLAIM_BITS.prismshell);
    f.patch("playerProgress", { crystalHollowsUnlocked: true });
    save(false);
    expect(f.db.playerProgress.identity.find(f.ctx.sender).crystalHollowsUnlocked).toBe(true);
  });

  it("rejects locked travel without moving the player, then accepts an earned unlock", () => {
    const f = crystalFixture();
    f.patch("player", { mapId: "moonfen" });
    const travel = () => f.run(server.changeMap, { mapId: "crystal_hollows", x: 580, y: 617 });
    expect(travel).toThrow("Defeat Miremaw");
    expect(f.db.player.identity.find(f.ctx.sender).mapId).toBe("moonfen");
    f.patch("playerProgress", { crystalHollowsUnlocked: true });
    travel();
    expect(f.db.player.identity.find(f.ctx.sender).mapId).toBe("crystal_hollows");
  });

  it("requires the current protocol and controlling connection", () => {
    const f = crystalFixture();
    f.patch("playerController", { connectionId: new ConnectionId(2n) });
    expect(() => f.attack()).toThrow("another tab");
    f.patch("playerController", { connectionId: f.ctx.connectionId });
    const session = f.db.playerSession.connectionId.find(f.ctx.connectionId);
    f.db.playerSession.connectionId.update({ ...session, protocolVersion: 0 });
    expect(() => f.attack()).toThrow();
    expect(f.db.prismshellBoss.id.find(1).hp).toBe(10_000);
    expect(f.db.prismshellContribution.count()).toBe(0n);
  });

  it("ignores attacks from other maps, during duels, out of range, or against a dead boss", () => {
    const f = crystalFixture();
    f.patch("player", { mapId: "moonfen" });
    f.attack();
    f.patch("player", { mapId: "crystal_hollows" });
    const duel = f.seed("duel", { challenger: f.ctx.sender, opponent: identity("2"), status: "active" });
    f.attack();
    f.db.duel.id.delete(duel.id);
    f.attack(1, { x: 20, y: 20 });
    const boss = f.db.prismshellBoss.id.find(1);
    f.db.prismshellBoss.id.update({ ...boss, alive: false, hp: 0 });
    f.attack();
    expect(f.db.prismshellContribution.count()).toBe(0n);
    expect(f.db.prismshellAttackWindow.count()).toBe(0n);
  });

  it("rejects nonfinite action coordinates without writing combat state", () => {
    const f = crystalFixture();
    expect(() => f.attack(1, { x: NaN, y: 4050 })).toThrow("finite");
    expect(f.db.prismshellAttackWindow.count()).toBe(0n);
  });

  it("uses the action position and server stats, limiting projectiles per attack interval", () => {
    const f = crystalFixture();
    f.patch("player", { x: 360, y: 360 });
    f.attack(20);
    expect(f.db.prismshellBoss.id.find(1).hp).toBe(8_000);
    f.attack(20);
    expect(f.db.prismshellBoss.id.find(1).hp).toBe(8_000);
    f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + 1_000_000n);
    f.attack();
    expect(f.db.prismshellBoss.id.find(1).hp).toBe(7_000);
    expect(f.db.prismshellContribution.identity.find(f.ctx.sender).damage).toBe(3_000);
  });

  it("does not carry an old encounter's contribution or hit budget into a new fight", () => {
    const f = crystalFixture();
    f.seed("prismshellContribution", { identity: f.ctx.sender, encounter: 6n, damage: 999, displayName: "Old" });
    f.seed("prismshellAttackWindow", { identity: f.ctx.sender, encounter: 6n, hits: 20, startedAtMicros: f.ctx.timestamp.microsSinceUnixEpoch });
    f.attack();
    expect(f.db.prismshellContribution.identity.find(f.ctx.sender)).toMatchObject({ encounter: 7n, damage: 1_000, displayName: "Test Player" });
  });

  it("rewards only positive current contributors once, caps credited damage, and schedules respawn", () => {
    const f = crystalFixture();
    for (const [who, encounter, damage] of [[identity("2"), 7n, 500], [identity("3"), 7n, 0], [identity("4"), 6n, 500]] as const) {
      f.progress(who);
      f.seed("prismshellContribution", { identity: who, encounter, damage, displayName: "Peer" });
    }
    f.db.prismshellBoss.id.update({ ...f.db.prismshellBoss.id.find(1), hp: 150 });
    f.attack();
    const earned = f.db.playerProgress.identity.find(f.ctx.sender);
    expect(earned.damage).toBe(1_000 + PRISMSHELL_REWARD_DAMAGE);
    expect(earned.maxHp).toBe(100 + PRISMSHELL_REWARD_HEALTH);
    expect(f.db.playerProgress.identity.find(identity("2")).damage).toBe(earned.damage);
    expect(f.db.playerProgress.identity.find(identity("3")).damage).toBe(1_000);
    expect(f.db.playerProgress.identity.find(identity("4")).damage).toBe(1_000);
    expect(f.db.prismshellContribution.identity.find(f.ctx.sender).damage).toBe(150);
    expect(f.db.prismshellResult.id.find(1).totalDamage).toBe(650);
    expect(f.db.prismshellBoss.id.find(1)).toMatchObject({ alive: false, hp: 0 });
    f.attack();
    expect(f.db.playerProgress.identity.find(f.ctx.sender)).toEqual(earned);
    const schedule = [...f.db.prismshellRespawnSchedule.iter()][0];
    f.ctx.timestamp = new Timestamp(f.db.prismshellBoss.id.find(1).respawnAtMicros);
    f.run(server.respawnPrismshell, { schedule });
    f.db.prismshellBoss.id.update({ ...f.db.prismshellBoss.id.find(1), hp: 150, alive: true });
    f.attack();
    const repeated = f.db.playerProgress.identity.find(f.ctx.sender);
    expect(repeated).toEqual(earned);
    expect(repeated.bossRewardClaims & BOSS_REWARD_CLAIM_BITS.prismshell).toBe(BOSS_REWARD_CLAIM_BITS.prismshell);
    expect(f.db.prismshellRespawnSchedule.count()).toBe(2n);
  });

  it("respawns only when due for the same encounter, clearing prior combat rows", () => {
    const f = crystalFixture();
    f.db.prismshellBoss.id.update({ ...f.db.prismshellBoss.id.find(1), hp: 1 });
    f.attack();
    const schedule = [...f.db.prismshellRespawnSchedule.iter()][0];
    f.run(server.respawnPrismshell, { schedule });
    expect(f.db.prismshellBoss.id.find(1).alive).toBe(false);
    f.ctx.timestamp = new Timestamp(f.db.prismshellBoss.id.find(1).respawnAtMicros);
    f.run(server.respawnPrismshell, { schedule: { ...schedule, encounter: 6n } });
    expect(f.db.prismshellBoss.id.find(1).alive).toBe(false);
    f.run(server.respawnPrismshell, { schedule });
    expect(f.db.prismshellBoss.id.find(1)).toMatchObject({ alive: true, hp: PRISMSHELL_MAX_HP, encounter: 8n });
    expect(f.db.prismshellContribution.count()).toBe(0n);
    expect(f.db.prismshellAttackWindow.count()).toBe(0n);
    f.run(server.respawnPrismshell, { schedule });
    expect(f.db.prismshellBoss.id.find(1).encounter).toBe(8n);
  });
});
