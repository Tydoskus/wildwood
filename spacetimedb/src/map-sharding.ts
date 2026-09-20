import { isProceduralMap } from "../../shared/procedural-maps";
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
  // Each player's map database, kept by the reducers that seat and release
  // them. Clients subscribe to their own row. This row changes only when the
  // route does; the per-user view it replaced read map_shard directly, so
  // every occupancy tick re-ran the view for everyone seated on that shard.
  mapShardRoute: table({ name: "map_shard_route", public: true }, {
    identity: t.identity().primaryKey(), databaseName: t.string(), mapId: t.string(), generation: t.u64(), ready: t.bool(),
  }),
};
export const mapShardRouteType = t.row("MapShardRouteRow", {
  identity: t.identity().primaryKey(), databaseName: t.string(), mapId: t.string(), generation: t.u64(), ready: t.bool(),
});
/** Write the player's route from their membership and shard; pass rows already in hand. */
export function syncMapShardRoute(ctx: any, identity: any, member = ctx.db.mapShardMember.identity.find(identity),
  shard = member?.shardId ? ctx.db.mapShard.id.find(member.shardId) : null) {
  if (!member) { ctx.db.mapShardRoute.identity.delete(identity); return; }
  const next = { identity, databaseName: shard?.databaseName ?? "", mapId: member.mapId,
    generation: member.generation, ready: Boolean(member.ready && shard?.state === "ready") };
  const current = ctx.db.mapShardRoute.identity.find(identity);
  if (!current) { ctx.db.mapShardRoute.insert(next); return; }
  if (current.databaseName !== next.databaseName || current.mapId !== next.mapId
    || current.generation !== next.generation || current.ready !== next.ready) ctx.db.mapShardRoute.identity.update(next);
}
/** A shard changed name or state: refresh every route that points at it. */
export function syncMapShardRoutesForShard(ctx: any, shard: any) {
  for (const member of ctx.db.mapShardMember.byShard.filter(shard.id)) syncMapShardRoute(ctx, member.identity, member, shard);
}
export function rootShardingEnabled(ctx: any) {
  const runtime = ctx.db.shardRuntime.id.find(0);
  return runtime?.role === "root" && runtime.enabled;
}
export function isMapShard(ctx: any) { return ctx.db.shardRuntime.id.find(0)?.role === "map"; }
// Callers that touch several shards in one transaction pass one memoised
// coordinator lookup, so the row is read once per reducer instead of per shard.
function wakeShard(ctx: any, shardId: bigint, coordinatorConnected?: () => boolean) {
  if (shardId && (coordinatorConnected ? coordinatorConnected() : ctx.db.shardCoordinatorConnection.id.find(0))
    && !ctx.db.shardCoordinatorSchedule.scheduledId.find(shardId)) {
    ctx.db.shardCoordinatorSchedule.insert({ scheduledId: shardId, scheduledAt: ScheduleAt.interval(1_000_000n) });
  }
  const state = ctx.db.shardSyncState.shardId.find(shardId);
  if (state?.nextRunAt) ctx.db.shardSyncState.shardId.update({ ...state, nextRunAt: 0n });
}
function candidates(ctx: any, mapId: string) {
  return [...ctx.db.mapShard.byMap.filter(mapId)].map((row: any) => ({ ...row, id: String(row.id) }));
}
export function warmMapShard(ctx: any, mapId: string, known?: ReturnType<typeof candidates>) {
  if (!shouldWarmMapShard(known ?? candidates(ctx, mapId), mapId)) return;
  const row = ctx.db.mapShard.insert({ id: 0n, mapId, databaseName: "", state: "starting", occupants: 0 });
  const root = ctx.databaseIdentity ?? ctx.identity;
  ctx.db.mapShard.id.update({ ...row, databaseName: `wildstat-${root.toHexString().slice(-12)}-map-${row.id}` });
  if (ctx.db.shardCoordinatorConnection.id.find(0)) {
    ctx.db.shardCoordinatorSchedule.insert({ scheduledId: row.id, scheduledAt: ScheduleAt.interval(1_000_000n) });
  }
}
export function releaseMapShard(ctx: any, identity: any, member = ctx.db.mapShardMember.identity.find(identity), coordinatorConnected?: () => boolean) {
  if (!member) return;
  const shard = ctx.db.mapShard.id.find(member.shardId);
  if (shard) ctx.db.mapShard.id.update({ ...shard, occupants: Math.max(0, shard.occupants - 1) });
  let coordinator: boolean | undefined;
  const connected = coordinatorConnected ?? (() => coordinator ??= Boolean(ctx.db.shardCoordinatorConnection.id.find(0)));
  wakeShard(ctx, member.shardId, connected);
  if (member.shardId !== 0n && connected()) {
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
  ctx.db.mapShardRoute.identity.delete(identity);
}
/**
 * `known` carries rows the caller already read in this transaction (the shard
 * runtime flag and the player's membership). Each key is optional and, when
 * present, is taken as the current value even if null; absent keys are read
 * here. Every host call is paid for, so a map change reads each row once.
 */
export function assignMapShard(ctx: any, player: any, preferredShardId?: bigint, known?: { sharded?: boolean; member?: any }) {
  if (!(known?.sharded ?? rootShardingEnabled(ctx)) || !player) return;
  const current = known && "member" in known ? known.member : ctx.db.mapShardMember.identity.find(player.identity);
  let coordinator: boolean | undefined;
  const connected = () => coordinator ??= Boolean(ctx.db.shardCoordinatorConnection.id.find(0));
  if (player.mapId === HOME_EXTERIOR_MAP_ID) { releaseMapShard(ctx, player.identity, current, connected); return; }
  if (current?.mapId === player.mapId && current.shardId !== 0n
    && (preferredShardId === undefined || current.shardId === preferredShardId)) return;
  const preferred = preferredShardId === undefined ? null : ctx.db.mapShard.id.find(preferredShardId);
  if (preferredShardId !== undefined && (!preferred || preferred.mapId !== player.mapId || preferred.state !== "ready"))
    throw new SenderError("Player's map is changing. Try again.");
  if (preferred && preferred.occupants >= MAP_SHARD_CAPACITY) throw new SenderError("Player's map instance is full.");
  const released = Boolean(current && (current.mapId !== player.mapId || preferredShardId !== undefined));
  if (released) releaseMapShard(ctx, player.identity, current, connected);
  const shards = candidates(ctx, player.mapId);
  const chosen = preferred ?? selectMapShard(shards, player.mapId);
  const member = {
    identity: player.identity, mapId: player.mapId, shardId: chosen ? BigInt(chosen.id) : 0n,
    generation: current?.mapId === player.mapId && preferredShardId === undefined ? current.generation : ctx.timestamp.microsSinceUnixEpoch,
    ready: false,
  };
  let seat: any = null;
  if (chosen) {
    const row = ctx.db.mapShard.id.find(BigInt(chosen.id));
    if (row.occupants >= MAP_SHARD_CAPACITY) throw new SenderError("Map shard is full");
    seat = { ...row, occupants: row.occupants + 1 };
    ctx.db.mapShard.id.update(seat);
    wakeShard(ctx, row.id, connected);
    // The warm check sees the seat just taken, as it did when it re-read the table.
    const i = shards.findIndex(shard => shard.id === String(row.id));
    if (i >= 0) shards[i] = { ...seat, id: String(seat.id) };
  }
  if (current && !released) ctx.db.mapShardMember.identity.update(member);
  else ctx.db.mapShardMember.insert(member);
  syncMapShardRoute(ctx, player.identity, member, seat);
  warmMapShard(ctx, player.mapId, shards);
}
export function validateShardMap(mapId: string) {
  if (!MAP_IDS.includes(mapId) && !isProceduralMap(mapId)) throw new SenderError("Unknown shard map");
}
export function queueShardReward(ctx: any, identity: any, boss: string) {
  if (!isMapShard(ctx)) return false;
  const encounter = ctx.db[`${boss}Boss`].id.find(1)?.encounter;
  if (encounter === undefined) throw new SenderError("Missing shard encounter");
  const key = `${boss}:${encounter}:${identity.toHexString()}`;
  if (!ctx.db.shardRewardOutbox.key.find(key)) ctx.db.shardRewardOutbox.insert({ key, identity, boss, encounter });
  return true;
}
