import { describe, expect, it, vi } from "vitest";
import { Timestamp } from "spacetimedb";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { BOSS_REWARD_CLAIM_BITS, IRONHORN_MAX_HP, DREADREAPER_MAX_HP, IRONHORN_REWARD_DAMAGE, DREADREAPER_REWARD_DAMAGE } from "../../shared/rules";
import { reducerParameters } from "../../tests/helpers/spacetime-module";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const regions = [
  { map: "clockwork_ruins", boss: "ironhorn", unlock: "clockworkRuinsUnlocked", next: "duskfallOrchardUnlocked", maxHp: IRONHORN_MAX_HP, reward: IRONHORN_REWARD_DAMAGE, attack: server.damageIronhornFromPosition, respawn: server.respawnIronhorn },
  { map: "duskfall_orchard", boss: "dreadreaper", unlock: "duskfallOrchardUnlocked", next: null, maxHp: DREADREAPER_MAX_HP, reward: DREADREAPER_REWARD_DAMAGE, attack: server.damageDreadreaperFromPosition, respawn: server.respawnDreadreaper },
] as const;

describe.each(regions)("$map authoritative boss", region => {
  function fixture() {
    const f = crystalFixture();
    f.patch("player", { mapId: region.map });
    f.seed(`${region.boss}Boss`, { id: 1, encounter: 3n, alive: true, hp: 2500, maxHp: region.maxHp });
    const attack = (hits = 1, x = 4050, y = 4050) => f.run(region.attack, { hits, x, y });
    return { ...f, attack };
  }
  it("appends a server-owned unlock after the existing ledger", () => {
    const columns = server.default.schemaType.tables.playerProgress.columns;
    expect(columns[region.unlock].columnMetadata.defaultValue).toBe(false);
    expect(Object.keys(columns).indexOf(region.unlock)).toBeGreaterThan(Object.keys(columns).indexOf("bossRewardClaims"));
    expect(reducerParameters.get(server.savePlayerProgress)).not.toHaveProperty(region.unlock);
  });
  it("rejects other maps and out-of-range attacks, and rate limits accepted hits", () => {
    const f = fixture();
    f.patch("player", { mapId: "crystal_hollows" }); f.attack();
    f.patch("player", { mapId: region.map }); f.attack(1, 30, 30);
    expect(f.db[`${region.boss}Contribution`].count()).toBe(0n);
    f.attack(20); f.attack(20);
    expect(f.db[`${region.boss}Boss`].id.find(1).hp).toBe(500);
  });
  it("rewards only positive current contributors and respawns without stale hit budgets", () => {
    const f = fixture();
    for (const [who, encounter, damage] of [[identity("2"), 3n, 100], [identity("3"), 3n, 0], [identity("4"), 2n, 100]] as const) {
      f.progress(who); f.seed(`${region.boss}Contribution`, { identity: who, encounter, damage, displayName: "Peer" });
    }
    f.attack(2);
    f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + 1_000_000n);
    f.attack();
    const earned = f.db.playerProgress.identity.find(f.ctx.sender);
    expect(earned.damage).toBe(1000 + region.reward);
    expect(earned.bossRewardClaims & BOSS_REWARD_CLAIM_BITS[region.boss]).toBe(BOSS_REWARD_CLAIM_BITS[region.boss]);
    expect(f.db.playerProgress.identity.find(identity("2")).damage).toBe(earned.damage);
    for (const who of [identity("3"), identity("4")]) expect(f.db.playerProgress.identity.find(who).damage).toBe(1000);
    if (region.next) {
      expect(earned[region.next]).toBe(true);
      expect(f.db.playerProgress.identity.find(identity("3"))[region.next]).toBe(false);
    }
    const schedule = [...f.db[`${region.boss}RespawnSchedule`].iter()][0];
    f.run(region.respawn, { schedule });
    expect(f.db[`${region.boss}Boss`].id.find(1).alive).toBe(false);
    f.ctx.timestamp = new Timestamp(f.db[`${region.boss}Boss`].id.find(1).respawnAtMicros);
    f.run(region.respawn, { schedule });
    expect(f.db[`${region.boss}Boss`].id.find(1)).toMatchObject({ alive: true, encounter: 4n, hp: region.maxHp });
    expect(f.db[`${region.boss}Contribution`].count()).toBe(0n);
    expect(f.db[`${region.boss}AttackWindow`].count()).toBe(0n);
  });
});

it("preserves an older Prismshell victory when installing the new gate", () => {
  const f = crystalFixture();
  f.seed("moduleMigrationState", { id: 0, version: 24 });
  f.patch("playerProgress", { bossRewardClaims: BOSS_REWARD_CLAIM_BITS.prismshell });
  // Maintenance runs additive module migrations before its ordinary work.
  f.run(server.runMaintenance, {});
  expect(f.db.playerProgress.identity.find(f.ctx.sender).clockworkRuinsUnlocked).toBe(true);
  expect(f.db.playerProgress.identity.find(f.ctx.sender).duskfallOrchardUnlocked).toBe(false);
});

it("enforces the complete portal chain and survives repeated forward/return trips", () => {
  const f = crystalFixture();
  const travel = (mapId: string, x: number) => f.run(server.changeMap, { mapId, x, y: 617 });
  expect(() => travel("clockwork_ruins", 580)).toThrow("Prismshell");
  f.patch("playerProgress", { crystalHollowsUnlocked: true, clockworkRuinsUnlocked: true });
  travel("clockwork_ruins", 580);
  expect(() => travel("duskfall_orchard", 580)).toThrow("Ironhorn");
  f.patch("playerProgress", { duskfallOrchardUnlocked: true });
  for (let repeat = 0; repeat < 3; repeat++) {
    for (const [mapId, x] of [["duskfall_orchard", 580], ["clockwork_ruins", 360], ["crystal_hollows", 360], ["clockwork_ruins", 580]] as const) {
      travel(mapId, x);
      expect(f.db.player.identity.find(f.ctx.sender)).toMatchObject({ mapId, x: 580, y: 770 });
      expect(f.db.playerMotion.identity.find(f.ctx.sender).mapId).toBe(mapId);
    }
  }
  f.run(server.onDisconnect);
  expect(f.db.playerLastLocation.identity.find(f.ctx.sender).mapId).toBe("clockwork_ruins");
});
