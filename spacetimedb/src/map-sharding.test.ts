import { describe, expect, it, vi } from "vitest";
import { Identity, Timestamp } from "spacetimedb";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { assignMapShard, releaseMapShard } from "./map-sharding";
import { decodeShardSnapshot, encodeShardSnapshot } from "../../shared/shard-wire";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));
const owner = new Identity("c200383520521c925f3cf6deafb20cd6a7d6168d1c31cb3c0ddb731c197a2d79");
function rootFixture() {
  const f = crystalFixture();
  (f.ctx as any).databaseIdentity = identity("4");
  f.ctx.sender = owner;
  f.seed("moduleMigrationState", { id: 0, version: 24 });
  return f;
}
function regionFixture() {
  const f = rootFixture();
  f.db.player.identity.delete(identity("1"));
  f.run(server.configureSharding, { role: "map", enabled: true, mapId: "crystal_hollows", shardId: 1n });
  f.run(server.renewShardLease);
  return f;
}
function snapshot(f: ReturnType<typeof rootFixture>, who = identity("1")) {
  const player = f.db.player.identity.find(who);
  return encodeShardSnapshot({ player: { ...player, controllerTabId: "test-tab-1" },
    playerProgress: f.db.playerProgress.identity.find(who), playerProfile: f.db.playerProfile.identity.find(who),
    playerResearch: null, playerAccountStatus: null, playerItemUpgrade: [], inDuel: false });
}
describe("separate map database control plane", () => {
  it("reserves ten seats atomically, warms at nine, and gives the eleventh player the next ready database", () => {
    const f = rootFixture();
    for (let n = 2; n <= 11; n++) f.seed("player", { ...f.db.player.identity.find(identity("1")), identity: identity(n.toString(16)) });
    f.run(server.configureSharding, { role: "root", enabled: true, mapId: "", shardId: 0n });
    expect(f.db.mapShard.count()).toBe(1n);
    f.run(server.shardReady, { shardId: 1n });
    expect(f.db.mapShard.id.find(1n).occupants).toBe(10);
    expect(f.db.mapShard.id.find(2n)).toMatchObject({ state: "starting", occupants: 0 });
    expect([...f.db.mapShardMember.iter()].filter(row => row.shardId === 0n)).toHaveLength(1);
    f.run(server.shardReady, { shardId: 2n });
    expect(f.db.mapShard.id.find(2n).occupants).toBe(1);
    const first = f.db.mapShardMember.identity.find(identity("1"));
    assignMapShard(f.ctx, f.db.player.identity.find(identity("1")));
    expect(f.db.mapShardMember.identity.find(identity("1"))).toEqual(first);
    expect(f.db.mapShard.id.find(1n).occupants).toBe(10);
    releaseMapShard(f.ctx, identity("1"));
    expect(f.db.mapShard.id.find(1n).occupants).toBe(9);
  });
  it("binds admission to identity/tab, preserves regional movement on snapshot refresh, and fences stale revocations", () => {
    const root = rootFixture(), region = regionFixture();
    const payload = snapshot(root);
    region.run(server.installShardPlayer, { identity: identity("1"), generation: 10n, snapshot: payload });
    region.patch("player", { x: 1200, y: 900 }, identity("1"));
    region.run(server.installShardPlayer, { identity: identity("1"), generation: 10n, snapshot: payload });
    expect(region.db.player.identity.find(identity("1")).x).toBe(1200);
    region.run(server.revokeShardPlayer, { identity: identity("1"), generation: 9n });
    expect(region.db.shardAdmission.count()).toBe(1n);
    region.ctx.sender = identity("1");
    expect(() => region.run(server.enterRegionalWorld, { tabId: "another-tab" })).toThrow("admission");
    region.run(server.enterRegionalWorld, { tabId: "test-tab-1" });
    const session = region.db.playerSession.connectionId.find(region.ctx.connectionId);
    region.db.playerSession.connectionId.update({ ...session, tabId: "stale-tab" });
    expect(() => region.attack()).toThrow("another tab");
    region.ctx.timestamp = new Timestamp(100_000_000n);
    expect(() => region.run(server.enterRegionalWorld, { tabId: "test-tab-1" })).toThrow("reconnecting");
  });
  it("delivers a regional boss reward once even if the operator retries after a crash", () => {
    const f = rootFixture();
    f.run(server.configureSharding, { role: "root", enabled: true, mapId: "", shardId: 0n });
    const args = { shardId: 1n, identity: identity("1"), boss: "prismshell", encounter: 1n };
    const before = f.db.playerProgress.identity.find(identity("1"));
    f.run(server.deliverShardReward, args);
    const after = f.db.playerProgress.identity.find(identity("1"));
    expect(after.damage).toBeGreaterThan(before.damage);
    f.run(server.deliverShardReward, args);
    expect(f.db.playerProgress.identity.find(identity("1"))).toEqual(after);
    expect(f.db.shardRewardReceipt.count()).toBe(1n);
    f.ctx.sender = identity("1");
    expect(() => f.run(server.deliverShardReward, { ...args, encounter: 2n })).toThrow("operator");
  });
  it("applies complete admission batches, rejects delayed requests, and cannot revive a revoked generation", () => {
    const root = rootFixture(), region = regionFixture();
    const ctx = { ...region.ctx, withTx: (fn: any) => region.transaction(() => fn(region.ctx)) };
    const sync = (sequence: bigint, members: any[], expiresAt = 25_000_000n, enabled = true) =>
      decodeShardSnapshot((server.synchronizeMapShard as any)(ctx, { payload: encodeShardSnapshot({ sequence, members, expiresAt, enabled }) }));
    const member = { identity: identity("1"), generation: 10n, snapshot: snapshot(root) };
    expect(sync(1n, [member]).admitted).toHaveLength(1);
    region.patch("player", { x: 1500 }, identity("1"));
    expect(sync(2n, [{ ...member, snapshot: "" }]).admitted).toHaveLength(1);
    expect(region.db.player.identity.find(identity("1")).x).toBe(1500);
    sync(3n, []);
    expect(region.db.player.count()).toBe(0n);
    sync(2n, [member]);
    expect(region.db.shardAdmission.count()).toBe(0n);
    sync(4n, [member]);
    expect(region.db.shardAdmission.count()).toBe(0n);
    sync(5n, [{ ...member, generation: 11n }], 1n);
    expect(region.db.shardAdmission.count()).toBe(0n);
    sync(6n, [{ ...member, generation: 11n }]);
    expect(region.db.shardAdmission.count()).toBe(1n);
    sync(7n, [], 25_000_000n, false);
    expect(region.db.shardRuntime.id.find(0).enabled).toBe(false);
    expect(region.db.playerProgress.count()).toBe(0n);
  });
  it("rejects an eleventh direct admission and unauthorized coordinator execution", () => {
    const root = rootFixture(), region = regionFixture();
    for (let n = 1; n <= 10; n++) {
      const who = identity(n.toString(16));
      if (n > 1) {
        root.seed("player", { ...root.db.player.identity.find(identity("1")), identity: who });
        root.progress(who);
      }
      region.run(server.installShardPlayer, { identity: who, generation: 10n, snapshot: snapshot(root, who) });
    }
    root.seed("player", { ...root.db.player.identity.find(identity("1")), identity: identity("b") });
    root.progress(identity("b"));
    expect(() => region.run(server.installShardPlayer, { identity: identity("b"), generation: 10n, snapshot: snapshot(root, identity("b")) })).toThrow("full");
    expect(() => (server.coordinateMapShard as any)(root.ctx, { arg: { scheduledId: 1n } })).toThrow("Scheduler");
  });

  it("keeps a regional boss reward in its durable outbox without mutating the account copy", () => {
    const root = rootFixture(), region = regionFixture();
    region.run(server.installShardPlayer, { identity: identity("1"), generation: 10n, snapshot: snapshot(root) });
    region.ctx.sender = identity("1");
    region.run(server.enterRegionalWorld, { tabId: "test-tab-1" });
    region.db.prismshellBoss.id.update({ ...region.db.prismshellBoss.id.find(1), hp: 1 });
    const before = region.db.playerProgress.identity.find(identity("1"));
    region.attack();
    expect(region.db.prismshellBoss.id.find(1).hp).toBe(0);
    expect(region.db.shardRewardOutbox.count()).toBe(1n);
    expect(region.db.playerProgress.identity.find(identity("1"))).toEqual(before);
  });

  it("keeps global duels from moving or attacking inside a map database", () => {
    const root = rootFixture(), region = regionFixture();
    const payload = decodeShardSnapshot(snapshot(root)); payload.inDuel = true;
    region.run(server.installShardPlayer, { identity: identity("1"), generation: 10n, snapshot: encodeShardSnapshot(payload) });
    region.ctx.sender = identity("1");
    region.run(server.enterRegionalWorld, { tabId: "test-tab-1" });
    const motion = region.db.playerMotion.identity.find(identity("1"));
    const hp = region.db.prismshellBoss.id.find(1).hp;
    region.run(server.updateMovementState, { x: 6000, y: 6000, vx: 0, vy: 0, simulationTick: 2, motionEpoch: 2, sequence: 2 });
    region.attack();
    expect(region.db.playerMotion.identity.find(identity("1"))).toEqual(motion);
    expect(region.db.prismshellBoss.id.find(1).hp).toBe(hp);
  });

  it("counts online identities across maps, including hidden players, and removes them once on disconnect", () => {
    const f = rootFixture();
    f.seed("player", { ...f.db.player.identity.find(identity("1")), identity: identity("2"), mapId: "tutorial_forest", isVisible: false });
    f.run(server.configureSharding, { role: "root", enabled: true, mapId: "", shardId: 0n });
    expect(f.db.worldStatus.id.find(0).onlinePlayers).toBe(2);
    f.run(server.configureSharding, { role: "root", enabled: true, mapId: "", shardId: 0n });
    expect(f.db.worldStatus.id.find(0).onlinePlayers).toBe(2);
    f.ctx.sender = identity("1");
    f.run(server.onDisconnect);
    expect(f.db.worldStatus.id.find(0).onlinePlayers).toBe(1);
    f.seed("playerSession", { connectionId: f.ctx.connectionId, identity: identity("2"), enteredWorld: true, protocolVersion: f.db.player.identity.find(identity("2")).protocolVersion });
    f.seed("playerController", { identity: identity("2"), connectionId: f.ctx.connectionId });
    f.ctx.sender = identity("2");
    f.run(server.onDisconnect);
    expect(f.db.worldStatus.id.find(0).onlinePlayers).toBe(0);
    expect(f.db.mapShardMember.count()).toBe(0n);
  });

  it("releases virtual-player seats and repairs reservations left by earlier cleanup", () => {
    const f = rootFixture();
    f.run(server.configureSharding, { role: "root", enabled: true, mapId: "", shardId: 0n });
    f.run(server.shardReady, { shardId: 1n });
    f.seed("virtualPlayer", { identity: identity("1"), owner: identity("4"), mapId: "crystal_hollows", spawnX: 4050, spawnY: 4050, createdAt: f.ctx.timestamp });
    f.ctx.sender = identity("1");
    f.run(server.onDisconnect);
    expect(f.db.mapShardMember.count()).toBe(0n);
    expect(f.db.mapShard.id.find(1n).occupants).toBe(0);
    expect(f.db.worldStatus.id.find(0).onlinePlayers).toBe(0);
    f.seed("mapShardMember", { identity: identity("2"), mapId: "crystal_hollows", shardId: 1n, generation: 10n, ready: false });
    f.db.mapShard.id.update({ ...f.db.mapShard.id.find(1n), occupants: 1 });
    f.ctx.sender = owner;
    f.run(server.configureSharding, { role: "root", enabled: true, mapId: "", shardId: 0n });
    expect(f.db.mapShardMember.count()).toBe(0n);
    expect(f.db.mapShard.id.find(1n).occupants).toBe(0);
  });

});
