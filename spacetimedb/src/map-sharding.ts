import { HOME_EXTERIOR_MAP_ID } from "../../shared/home";
import { table, t, SenderError } from "spacetimedb/server";
import { MAP_IDS } from "../../shared/rules";
import { MAP_SHARD_CAPACITY, selectMapShard, shouldWarmMapShard } from "../../shared/map-sharding";
import { ScheduleAt } from "spacetimedb";

export const mapShardingTables = {
  shardProgramPart: table({ public: false }, { part: t.u32().primaryKey(), total: t.u32(), source: t.string() }),
  shardCoordinatorConnection: table({ public: false }, { id: t.u32().primaryKey(), host: t.string(), token: t.string() }),
  shardCoordinatorConfig: table({ public: false }, {
    id: t.u32().primaryKey(), host: t.string(), token: t.string(), program: t.string(),
  }),
  shardSyncState: table({ public: false }, {
    shardId: t.u64().primaryKey(), sequence: t.u64(), lockedUntil: t.u64(), nextRunAt: t.u64(),
    checkpointAt: t.u64().default(0n),
  }),
  shardSnapshotState: table({ public: false }, {
    identity: t.identity().primaryKey(), shardId: t.u64(), generation: t.u64(),
    revision: t.u64(), sentRevision: t.u64(),
  }),
  shardReplicaState: table({ public: false }, { id: t.u32().primaryKey(), sequence: t.u64(), checkpointAt: t.u64().default(0n) }),
  shardSentSnapshot: table({ public: false }, {
    identity: t.identity().primaryKey(), shardId: t.u64(), generation: t.u64(), snapshot: t.string(),
  }),
  shardTransferBarrier: table({ public: false, indexes: [{ accessor: "byShard", algorithm: "btree", columns: ["shardId"] }] }, {
    identity: t.identity().primaryKey(), shardId: t.u64(), generation: t.u64(), expiresAt: t.u64(),
  }),
  shardRuntime: table({ public: false }, { id: t.u32().primaryKey(), role: t.string(), enabled: t.bool(), mapId: t.string(), shardId: t.u64(), leaseExpiresAtMicros: t.u64().default(0n) }),
  mapShard: table({ public: true, indexes: [{ accessor: "byMap", algorithm: "btree", columns: ["mapId"] }] }, {
    id: t.u64().primaryKey().autoInc(), mapId: t.string(), databaseName: t.string(), state: t.string(), occupants: t.u32(),
  }),
  mapShardMember: table({ public: false, indexes: [{ accessor: "byMap", algorithm: "btree", columns: ["mapId"] }, { accessor: "byShard", algorithm: "btree", columns: ["shardId"] }] }, {
    identity: t.identity().primaryKey(), mapId: t.string(), shardId: t.u64(), generation: t.u64(), ready: t.bool(),
  }),
  shardAdmission: table({ public: false }, {
    identity: t.identity().primaryKey(), generation: t.u64(), tabId: t.string(), inDuel: t.bool(),
  }),
  shardAdmissionFence: table({ public: false }, { identity: t.identity().primaryKey(), generation: t.u64() }),
  shardCheckpoint: table({ public: false }, {
    identity: t.identity().primaryKey(), generation: t.u64(), mapId: t.string(), x: t.f64(), y: t.f64(),
  }),
  shardRewardOutbox: table({ public: false }, {
    key: t.string().primaryKey(), identity: t.identity(), boss: t.string(), encounter: t.u64(),
  }),
  shardRewardReceipt: table({ public: false }, { key: t.string().primaryKey(), receivedAt: t.timestamp() }),
};
export const mapShardRouteType = t.row("MapShardRouteRow", {
  identity: t.identity().primaryKey(), databaseName: t.string(), mapId: t.string(), generation: t.u64(), ready: t.bool(),
});
export function rootShardingEnabled(ctx: any) {
  const runtime = ctx.db.shardRuntime.id.find(0);
  return runtime?.role === "root" && runtime.enabled;
}
export function isMapShard(ctx: any) { return ctx.db.shardRuntime.id.find(0)?.role === "map"; }
function wakeShard(ctx: any, shardId: bigint) {
  if (shardId && ctx.db.shardCoordinatorConnection.id.find(0) && !ctx.db.shardCoordinatorSchedule.scheduledId.find(shardId)) {
    ctx.db.shardCoordinatorSchedule.insert({ scheduledId: shardId, scheduledAt: ScheduleAt.interval(1_000_000n) });
  }
  const state = ctx.db.shardSyncState.shardId.find(shardId);
  if (state?.nextRunAt) ctx.db.shardSyncState.shardId.update({ ...state, nextRunAt: 0n });
}
function candidates(ctx: any, mapId: string) {
  return [...ctx.db.mapShard.byMap.filter(mapId)].map((row: any) => ({ ...row, id: String(row.id) }));
}
export function warmMapShard(ctx: any, mapId: string) {
  if (!shouldWarmMapShard(candidates(ctx, mapId), mapId)) return;
  const row = ctx.db.mapShard.insert({ id: 0n, mapId, databaseName: "", state: "starting", occupants: 0 });
  const root = ctx.databaseIdentity ?? ctx.identity;
  ctx.db.mapShard.id.update({ ...row, databaseName: `wildstat-${root.toHexString().slice(-12)}-map-${row.id}` });
  if (ctx.db.shardCoordinatorConnection.id.find(0)) {
    ctx.db.shardCoordinatorSchedule.insert({ scheduledId: row.id, scheduledAt: ScheduleAt.interval(1_000_000n) });
  }
}
export function releaseMapShard(ctx: any, identity: any) {
  const member = ctx.db.mapShardMember.identity.find(identity);
  if (!member) return;
  const shard = ctx.db.mapShard.id.find(member.shardId);
  if (shard) ctx.db.mapShard.id.update({ ...shard, occupants: Math.max(0, shard.occupants - 1) });
  wakeShard(ctx, member.shardId);
  if (member.shardId !== 0n && ctx.db.shardCoordinatorConnection.id.find(0)) {
    const barrier = { identity, shardId: member.shardId, generation: member.generation,
      // Longer than the regional lease plus the bounded HTTP request lifetime.
      expiresAt: ctx.timestamp.microsSinceUnixEpoch + 65_000_000n };
    const previous = ctx.db.shardTransferBarrier.identity.find(identity);
    if (!previous) ctx.db.shardTransferBarrier.insert(barrier);
    // Keep the old authority until it acknowledges revocation, including rapid
    // portal changes made while a previous handoff is still pending.
  }
  ctx.db.shardSentSnapshot.identity.delete(identity);
  ctx.db.shardSnapshotState.identity.delete(identity);
  ctx.db.mapShardMember.identity.delete(identity);
}
export function assignMapShard(ctx: any, player: any) {
  if (!rootShardingEnabled(ctx) || !player) return;
  if (player.mapId === HOME_EXTERIOR_MAP_ID) { releaseMapShard(ctx, player.identity); return; }
  const current = ctx.db.mapShardMember.identity.find(player.identity);
  if (current?.mapId === player.mapId && current.shardId !== 0n) return;
  if (current && current.mapId !== player.mapId) releaseMapShard(ctx, player.identity);
  const chosen = selectMapShard(candidates(ctx, player.mapId), player.mapId);
  const member = {
    identity: player.identity, mapId: player.mapId, shardId: chosen ? BigInt(chosen.id) : 0n,
    generation: current?.mapId === player.mapId ? current.generation : ctx.timestamp.microsSinceUnixEpoch,
    ready: false,
  };
  if (chosen) {
    const row = ctx.db.mapShard.id.find(BigInt(chosen.id));
    if (row.occupants >= MAP_SHARD_CAPACITY) throw new SenderError("Map shard is full");
    ctx.db.mapShard.id.update({ ...row, occupants: row.occupants + 1 });
    wakeShard(ctx, row.id);
  }
  if (ctx.db.mapShardMember.identity.find(player.identity)) ctx.db.mapShardMember.identity.update(member);
  else ctx.db.mapShardMember.insert(member);
  warmMapShard(ctx, player.mapId);
}
export function validateShardMap(mapId: string) {
  if (!MAP_IDS.includes(mapId)) throw new SenderError("Unknown shard map");
}
export function queueShardReward(ctx: any, identity: any, boss: string) {
  if (!isMapShard(ctx)) return false;
  const encounter = ctx.db[`${boss}Boss`].id.find(1)?.encounter;
  if (encounter === undefined) throw new SenderError("Missing shard encounter");
  const key = `${boss}:${encounter}:${identity.toHexString()}`;
  if (!ctx.db.shardRewardOutbox.key.find(key)) ctx.db.shardRewardOutbox.insert({ key, identity, boss, encounter });
  return true;
}
