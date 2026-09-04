import { TimeDuration } from "spacetimedb";
import { SenderError } from "spacetimedb/server";
import { decodeShardSnapshot, encodeShardSnapshot } from "../../shared/shard-wire";
import { assignMapShard, rootShardingEnabled } from "./map-sharding";

/** Each scheduled invocation handles one database. HTTP yields the database
 * executor; only short withTx callbacks hold account-state transactions. */
export function coordinateShard(ctx: any, shardId: bigint, hooks: {
  reward: (tx: any, args: any) => void;
  checkpoint: (tx: any, args: any) => void;
}) {
  const work = ctx.withTx((tx: any) => {
    if (tx.db.shardRuntime.id.find(0)?.role !== "root") return null;
    // The multi-megabyte program is cold data. Do not deserialize it during
    // every heartbeat for every occupied map database.
    const connection = tx.db.shardCoordinatorConnection.id.find(0);
    const config = connection && { ...connection, program: "" };
    const shard = tx.db.mapShard.id.find(shardId);
    if (!config || !shard || shard.state === "failed") return null;
    if (!rootShardingEnabled(tx) && shard.state === "starting") {
      tx.db.shardCoordinatorSchedule.scheduledId.delete(shardId);
      return null;
    }
    const now = tx.timestamp.microsSinceUnixEpoch;
    const state = tx.db.shardSyncState.shardId.find(shardId);
    if (state && (state.lockedUntil > now || state.nextRunAt > now)) return null;
    if (shard.state === "starting") config.program = tx.db.shardCoordinatorConfig.id.find(0)?.program ?? "";
    const next = { shardId, sequence: (state?.sequence ?? 0n) + 1n, lockedUntil: now + 60_000_000n, nextRunAt: 0n };
    if (state) tx.db.shardSyncState.shardId.update(next);
    else tx.db.shardSyncState.insert(next);
    return { config, shard, sequence: next.sequence };
  });
  if (!work) return;
  const { config, shard, sequence } = work;
  let succeeded = false;
  let canSleep = false;
  let phase = "provision";
  function request(path: string, method: string, body: string) {
    const response = ctx.http.fetch(`${config.host}/v1/database/${encodeURIComponent(shard.databaseName)}${path}`, {
      method, body, headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
      timeout: TimeDuration.fromMillis(15_000),
    });
    // Never log remote response bodies or authorization values.
    if (response.status < 200 || response.status >= 300) throw new Error(`Shard HTTP ${response.status}`);
    return response.text();
  }
  try {
    if (shard.state === "starting") {
      const published = JSON.parse(request(`?host_type=Js&clear=false&parent=${ctx.databaseIdentity.toHexString()}`, "PUT", config.program));
      const identity = published.Success?.database_identity;
      if (typeof identity !== "string" || !/^[0-9a-f]{64}$/.test(identity)) throw new Error("Invalid shard publish response");
      shard.databaseName = identity;
      request("/call/configure_sharding", "POST", JSON.stringify(["map", true, shard.mapId, Number(shard.id)]));
      ctx.withTx((tx: any) => {
        const current = tx.db.mapShard.id.find(shardId);
        if (!current || !rootShardingEnabled(tx)) return;
        tx.db.mapShard.id.update({ ...current, databaseName: shard.databaseName, state: "ready" });
        for (const member of tx.db.mapShardMember.byMap.filter(shard.mapId)) {
          if (member.shardId === 0n) assignMapShard(tx, tx.db.player.identity.find(member.identity));
        }
      });
    }
    const batch = ctx.withTx((tx: any) => {
      const enabled = rootShardingEnabled(tx);
      const members = [];
      for (const member of enabled ? tx.db.mapShardMember.byShard.filter(shardId) : []) {
        const barrier = tx.db.shardTransferBarrier.identity.find(member.identity);
        if (barrier && barrier.expiresAt > tx.timestamp.microsSinceUnixEpoch) continue;
        if (barrier) tx.db.shardTransferBarrier.identity.delete(member.identity);
        const player = tx.db.player.identity.find(member.identity);
        if (!player) continue;
        const snapshot = encodeShardSnapshot({ player,
          playerProgress: tx.db.playerProgress.identity.find(member.identity),
          playerProfile: tx.db.playerProfile.identity.find(member.identity),
          playerResearch: tx.db.playerResearch.identity.find(member.identity),
          playerAccountStatus: tx.db.playerAccountStatus.identity.find(member.identity),
          playerItemUpgrade: [...tx.db.playerItemUpgrade.byIdentity.filter(member.identity)],
          inDuel: [...tx.db.duel.byChallenger.filter(member.identity)].some((duel: any) => ["countdown", "active", "finishing"].includes(duel.status)),
        });
        const sent = tx.db.shardSentSnapshot.identity.find(member.identity);
        const changed = !sent || sent.shardId !== shardId || sent.generation !== member.generation || sent.snapshot !== snapshot;
        members.push({ identity: member.identity, generation: member.generation, snapshot: changed ? snapshot : "" });
      }
      return { sequence, members, enabled, expiresAt: tx.timestamp.microsSinceUnixEpoch + 15_000_000n };
    });
    if (!batch) return;
    phase = "exchange";
    const reply = decodeShardSnapshot(JSON.parse(request("/call/synchronize_map_shard", "POST", JSON.stringify([encodeShardSnapshot(batch)]))));
    if (reply.sequence !== sequence) throw new Error("Stale shard response");
    canSleep = batch.members.length === 0 && reply.admitted.length === 0 && reply.rewards.length === 0;
    phase = "commit";
    const acknowledgments = ctx.withTx((tx: any) => {
      const state = tx.db.shardSyncState.shardId.find(shardId);
      if (!state || state.sequence !== sequence) return [];
      for (const barrier of tx.db.shardTransferBarrier.byShard.filter(shardId)) {
        if (!reply.admitted.some((row: any) => row.identity.toHexString() === barrier.identity.toHexString() && row.generation === barrier.generation)) {
          tx.db.shardTransferBarrier.identity.delete(barrier.identity);
        }
      }
      for (const sent of batch.members) {
        const member = tx.db.mapShardMember.identity.find(sent.identity);
        if (!member || member.shardId !== shardId || member.generation !== sent.generation) continue;
        const admitted = reply.admitted.some((row: any) => row.identity.toHexString() === sent.identity.toHexString() && row.generation === sent.generation);
        if (!admitted) { tx.db.shardSentSnapshot.identity.delete(sent.identity); continue; }
        if (sent.snapshot) {
          const cached = { ...sent, shardId };
          if (tx.db.shardSentSnapshot.identity.find(sent.identity)) tx.db.shardSentSnapshot.identity.update(cached);
          else tx.db.shardSentSnapshot.insert(cached);
        }
        if (!member.ready) tx.db.mapShardMember.identity.update({ ...member, ready: true });
      }
      for (const position of reply.checkpoints) hooks.checkpoint(tx, { ...position, shardId });
      for (const reward of reply.rewards) hooks.reward(tx, { ...reward, shardId });
      return reply.rewards.map((reward: any) => reward.key);
    });
    if (acknowledgments.length) request("/call/acknowledge_shard_rewards", "POST", JSON.stringify([acknowledgments]));
    succeeded = true;
  } catch (error) {
    const detail = String(error instanceof Error ? error.message : "unknown failure").split(config.token).join("[redacted]").slice(0, 180);
    console.warn(`Map shard ${shardId} ${phase} failed (${detail}); durable work will retry.`);
  } finally {
    ctx.withTx((tx: any) => {
      const state = tx.db.shardSyncState.shardId.find(shardId);
      if (!state || state.sequence !== sequence) return;
      const current = tx.db.mapShard.id.find(shardId);
      if (succeeded && (!rootShardingEnabled(tx) || (!current?.occupants && canSleep))) {
        // An empty database stays provisioned but consumes no coordinator
        // heartbeat work. Reserving a seat recreates its schedule immediately.
        tx.db.shardCoordinatorSchedule.scheduledId.delete(shardId);
      }
      tx.db.shardSyncState.shardId.update({ ...state, lockedUntil: 0n,
        nextRunAt: tx.timestamp.microsSinceUnixEpoch + (succeeded ? (current?.occupants ? 0n : 10_000_000n) : 5_000_000n) });
    });
  }
}

export function validateCoordinatorConfig(host: string, token: string, program: string) {
  if (host !== "https://maincloud.spacetimedb.com") throw new SenderError("Unsupported coordinator host");
  if (!token || token.length > 16_384 || !program || program.length > 10_000_000) throw new SenderError("Invalid coordinator configuration");
}
