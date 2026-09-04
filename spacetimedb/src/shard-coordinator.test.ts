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
