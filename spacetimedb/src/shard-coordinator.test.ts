import { expect, it, vi } from "vitest";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { coordinateShard } from "./shard-coordinator";
import { decodeShardSnapshot, encodeShardSnapshot } from "../../shared/shard-wire";
import { Identity, Timestamp } from "spacetimedb";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));
it("replays an unacknowledged reward without duplicating it and sends unchanged accounts as deltas", () => {
  const f = crystalFixture();
  (f.ctx as any).databaseIdentity = identity("4");
  f.ctx.sender = new Identity("c200383520521c925f3cf6deafb20cd6a7d6168d1c31cb3c0ddb731c197a2d79");
  f.seed("shardCoordinatorConfig", { id: 0, host: "https://maincloud.spacetimedb.com", token: "test-only", program: "test" });
  f.seed("shardCoordinatorConnection", { id: 0, host: "https://maincloud.spacetimedb.com", token: "test-only" });
  f.run(server.configureSharding, { role: "root", enabled: true, mapId: "", shardId: 0n });
  f.run(server.shardReady, { shardId: 1n });
  let acknowledgments = 0;
  const payloads: any[] = [];
  f.ctx.sender = identity("4"); f.ctx.connectionId = null;
  const ctx = { ...f.ctx, withTx: (fn: any) => f.transaction(() => fn(f.ctx)), http: { fetch(url: string, args: any) {
    if (url.endsWith("/acknowledge_shard_rewards")) return { status: ++acknowledgments === 1 ? 503 : 200, text: () => "" };
    const batch = decodeShardSnapshot(JSON.parse(args.body)[0]); payloads.push(batch);
    const reply = { sequence: batch.sequence, admitted: batch.members, checkpoints: [], rewards: [
      { key: "prismshell:7:test", identity: identity("1"), boss: "prismshell", encounter: 7n },
    ] };
    return { status: 200, text: () => JSON.stringify(encodeShardSnapshot(reply)) };
  } } };
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const hooks = { reward: (tx: any, args: any) => (server.deliverShardReward as any)(tx, args), checkpoint: () => {} };
  coordinateShard(ctx, 1n, hooks);
  const progress = f.db.playerProgress.identity.find(identity("1"));
  expect(f.db.shardRewardReceipt.count()).toBe(1n);
  f.ctx.timestamp = new Timestamp(20_000_000n);
  coordinateShard(ctx, 1n, hooks);
  expect(f.db.playerProgress.identity.find(identity("1"))).toEqual(progress);
  expect(f.db.shardRewardReceipt.count()).toBe(1n);
  expect(acknowledgments).toBe(2);
  // The reward changes the account snapshot once; subsequent retries send only
  // the membership list and do not recopy the durable account.
  f.ctx.timestamp = new Timestamp(21_000_000n);
  coordinateShard(ctx, 1n, hooks);
  expect(payloads[2].members[0].snapshot).toBe("");
  warn.mockRestore();
});

function coordinatorFixture() {
  const f = crystalFixture();
  (f.ctx as any).databaseIdentity = identity("4");
  f.ctx.sender = new Identity("c200383520521c925f3cf6deafb20cd6a7d6168d1c31cb3c0ddb731c197a2d79");
  f.seed("shardCoordinatorConnection", { id: 0, host: "https://maincloud.spacetimedb.com", token: "test-only" });
  f.run(server.configureSharding, { role: "root", enabled: true, mapId: "", shardId: 0n });
  f.run(server.shardReady, { shardId: 1n });
  const payloads: any[] = [];
  let duringHttp = () => {};
  let admitted = true;
  const ctx = { ...f.ctx, withTx: (fn: any) => f.transaction(() => fn(f.ctx)), http: { fetch(_url: string, args: any) {
    const batch = decodeShardSnapshot(JSON.parse(args.body)[0]); payloads.push(batch);
    duringHttp();
    return { status: 200, text: () => JSON.stringify(encodeShardSnapshot({ sequence: batch.sequence,
      admitted: admitted ? batch.members : [], checkpoints: [], rewards: [] })) };
  } } };
  const tick = () => {
    f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + 1_000_000n);
    coordinateShard(ctx, 1n, { reward: () => {}, checkpoint: () => {} });
  };
  return { ...f, payloads, tick, duringHttp: (fn: () => void) => { duringHttp = fn; }, admit: (value: boolean) => { admitted = value; } };
}

it("does not read account rows, equipment, or the old snapshot cache on unchanged heartbeats", () => {
  const f = coordinatorFixture(); f.tick();
  const reads = ["player", "playerProgress", "playerProfile", "playerResearch", "playerAccountStatus", "shardSentSnapshot"]
    .map(name => vi.spyOn(f.db[name].identity, "find"));
  reads.push(vi.spyOn(f.db.playerItemUpgrade.byIdentity, "filter"));
  for (let i = 0; i < 60; i++) f.tick();
  for (const read of reads) { expect(read).not.toHaveBeenCalled(); read.mockRestore(); }
  expect(f.payloads.slice(1).every(batch => batch.members[0].snapshot === "")).toBe(true);
  expect(f.db.shardSentSnapshot.count()).toBe(0n);
});

it("replicates a profile edit during HTTP on the next pass instead of acknowledging it away", () => {
  const f = coordinatorFixture();
  f.duringHttp(() => {
    f.ctx.sender = identity("1");
    f.run(server.setProfileIcon, { profileIcon: 2 });
    f.duringHttp(() => {});
  });
  f.tick();
  const state = f.db.shardSnapshotState.identity.find(identity("1"));
  expect(state.revision).toBeGreaterThan(state.sentRevision);
  f.tick();
  expect(decodeShardSnapshot(f.payloads[1].members[0].snapshot).playerProfile.profileIcon).toBe(2);
  f.tick();
  expect(f.payloads[2].members[0].snapshot).toBe("");
});

it("resends a full snapshot when a region reports the admission missing", () => {
  const f = coordinatorFixture(); f.tick();
  f.admit(false); f.tick();
  expect(f.db.shardSnapshotState.identity.find(identity("1"))).toBeNull();
  f.admit(true); f.tick();
  expect(f.payloads[2].members[0].snapshot).not.toBe("");
});
