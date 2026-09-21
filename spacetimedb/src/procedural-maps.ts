import { table, t, SenderError } from "spacetimedb/server";
import {
  proceduralMapCore,
  generatedBossStats,
  isProceduralMap,
  proceduralMapNumber,
} from "../../shared/procedural-maps";
import type { GameViewContext, GameReducerContext } from "./index";

export const proceduralMapTables = {
  // A narrow, revocable testing permission; it grants no other developer tools.
  endlessTravelAccess: table(
    { public: false },
    { identity: t.identity().primaryKey() },
  ),
  // Keep deployed table layouts intact. Instance-scoped combat uses new tables;
  // permanent proceduralProgress rows are shared by both versions.
  proceduralBoss: table(
    { public: true },
    {
      mapId: t.string().primaryKey(),
      encounter: t.u64(),
      hp: t.f64(),
      maxHp: t.f64(),
      respawnAtMicros: t.u64(),
    },
  ),
  proceduralContribution: table(
    {
      public: false,
      indexes: [
        { accessor: "byMap", algorithm: "btree", columns: ["mapId"] },
        { accessor: "byIdentity", algorithm: "btree", columns: ["identity"] },
      ],
    },
    {
      key: t.string().primaryKey(),
      mapId: t.string(),
      identity: t.identity(),
      encounter: t.u64(),
      damage: t.f64(),
      windowAt: t.u64(),
      hits: t.u32(),
    },
  ),
  proceduralInstanceBoss: table(
    { public: false },
    {
      key: t.string().primaryKey(),
      mapId: t.string(),
      encounter: t.u64(),
      hp: t.f64(),
      maxHp: t.f64(),
      respawnAtMicros: t.u64(),
    },
  ),
  proceduralProgress: table(
    { public: true },
    { identity: t.identity().primaryKey(), completed: t.f64() },
  ),
  proceduralInstanceContribution: table(
    {
      public: false,
      indexes: [
        { accessor: "byBoss", algorithm: "btree", columns: ["bossKey"] },
        { accessor: "byIdentity", algorithm: "btree", columns: ["identity"] },
      ],
    },
    {
      key: t.string().primaryKey(),
      bossKey: t.string(),
      identity: t.identity(),
      encounter: t.u64(),
      damage: t.f64(),
      windowAt: t.u64(),
      hits: t.u32(),
    },
  ),
};
export function generatedMapUnlocked(
  mapId: string,
  completed: number,
  campaignComplete: boolean,
) {
  const number = proceduralMapNumber(mapId);
  return number !== null && campaignComplete && number <= completed + 1;
}
/**
 * Every player on a generated map shares its one boss. The `:root` suffix is
 * left over from per-instance bosses and is kept because live rows carry it.
 */
export function proceduralBossKey(
  _ctx: GameViewContext | GameReducerContext,
  mapId: string,
): string | null {
  return isProceduralMap(mapId) ? `${mapId}:root` : null;
}
export function ensureProceduralBoss(
  ctx: GameReducerContext,
  mapId: string,
  key: string,
) {
  if (!isProceduralMap(mapId)) throw new SenderError("Unknown generated map");
  let current = ctx.db.proceduralInstanceBoss.key.find(key);
  // Preserve a fight that was in progress in the older per-map table, once.
  if (!current && key === `${mapId}:root`) {
    const legacy = ctx.db.proceduralBoss.mapId.find(mapId);
    if (legacy) {
      current = ctx.db.proceduralInstanceBoss.insert({ key, ...legacy });
      for (const row of ctx.db.proceduralContribution.byMap.filter(mapId)) {
        if (row.encounter !== legacy.encounter) continue;
        const { mapId: _mapId, ...contribution } = row;
        ctx.db.proceduralInstanceContribution.insert({
          ...contribution,
          key: `${key}:${row.identity.toHexString()}`,
          bossKey: key,
        });
      }
    }
  }
  if (
    current &&
    (current.hp > 0 ||
      ctx.timestamp.microsSinceUnixEpoch < current.respawnAtMicros)
  )
    return current;
  const maxHp = generatedBossStats(proceduralMapCore(mapId)).hp;
  const next = {
    key,
    mapId,
    encounter: (current?.encounter ?? 0n) + 1n,
    hp: maxHp,
    maxHp,
    respawnAtMicros: 0n,
  };
  // Old encounters cannot accumulate indefinitely on the account database.
  for (const row of ctx.db.proceduralInstanceContribution.byBoss.filter(key))
    ctx.db.proceduralInstanceContribution.key.delete(row.key);
  if (current) ctx.db.proceduralInstanceBoss.key.update(next);
  else ctx.db.proceduralInstanceBoss.insert(next);
  return next;
}
/** A quarter-second token bucket accepts batches without banking long idle periods. */
export function acceptedGeneratedBatchHits(requested: number, projectiles: number, intervalMicros: bigint, now: bigint,
  previous: { windowAt: bigint; hits: number } | null) {
  const interval = intervalMicros > 0n ? intervalMicros : 1n;
  const volley = Math.max(1, Math.min(20, projectiles));
  const capacity = Math.min(100, Math.max(volley, Math.ceil(250_000 / Number(interval)) * volley));
  const elapsed = previous && now > previous.windowAt ? now - previous.windowAt : 0n;
  const cycles = elapsed / interval;
  const priorHits = previous ? Math.max(0, previous.hits - Math.min(100, Number(cycles)) * volley) : 0;
  return { windowAt: previous ? previous.windowAt + cycles * interval : now,
    hits: Math.max(0, Math.min(100, requested, capacity - priorHits)), priorHits };
}
export function damageProceduralBoss(
  ctx: GameReducerContext,
  options: {
    mapId: string;
    bossKey: string;
    encounter: bigint;
    hits: number;
    x: number;
    y: number;
    attackRange: number;
    attackInterval: number;
    projectiles: number;
    damage: (hits: number, hp: number) => number;
    reward: (identity: typeof ctx.sender, rewards: ReturnType<typeof generatedBossStats>["rewards"]) => void;
  },
) {
  const { mapId } = options;
  if (!isProceduralMap(mapId)) throw new SenderError("Unknown generated map");
  const map = proceduralMapCore(mapId),
    boss = ensureProceduralBoss(ctx, mapId, options.bossKey);
  if (boss.encounter !== options.encounter || boss.hp <= 0) return;
  if (![options.x, options.y].every(Number.isFinite))
    throw new SenderError("Attack position must be finite");
  if (
    Math.hypot(options.x - map.boss.x, options.y - map.boss.y) >
    options.attackRange + 170
  )
    return;
  const key = `${options.bossKey}:${ctx.sender.toHexString()}`;
  const previous = ctx.db.proceduralInstanceContribution.key.find(key);
  const continuing = previous?.encounter === boss.encounter ? previous : null;
  const accepted = acceptedGeneratedBatchHits(
    options.hits,
    options.projectiles,
    BigInt(Math.max(1, Math.round(options.attackInterval * 1e6))),
    ctx.timestamp.microsSinceUnixEpoch,
    continuing,
  );
  if (accepted.hits <= 0) return;
  const damage = Math.min(
    boss.hp,
    Math.max(0, options.damage(accepted.hits, boss.hp)),
  );
  const contribution = {
    key,
    bossKey: options.bossKey,
    identity: ctx.sender,
    encounter: boss.encounter,
    // Only participation matters for this reward; retain the deployed numeric field.
    damage: damage > 0 || (continuing?.damage ?? 0) > 0 ? 1 : 0,
    windowAt: accepted.windowAt,
    hits: accepted.priorHits + accepted.hits,
  };
  if (previous) ctx.db.proceduralInstanceContribution.key.update(contribution);
  else ctx.db.proceduralInstanceContribution.insert(contribution);
  const hp = Math.max(0, boss.hp - damage);
  ctx.db.proceduralInstanceBoss.key.update({
    ...boss,
    hp,
    respawnAtMicros:
      hp === 0 ? ctx.timestamp.microsSinceUnixEpoch + 60_000_000n : 0n,
  });
  if (hp > 0) return;
  const rewards = generatedBossStats(map).rewards;
  for (const row of ctx.db.proceduralInstanceContribution.byBoss.filter(
    options.bossKey,
  )) {
    if (row.encounter !== boss.encounter || row.damage <= 0) continue;
    const progress = ctx.db.proceduralProgress.identity.find(row.identity);
    // A first clear unlocks the next map once, even if the client retries its killing hit.
    if ((progress?.completed ?? 0) < map.number) {
      const next = { identity: row.identity, completed: map.number };
      if (progress) ctx.db.proceduralProgress.identity.update(next);
      else ctx.db.proceduralProgress.insert(next);
    }
    options.reward(row.identity, rewards);
  }
}

export function clearProceduralProgress(
  ctx: GameReducerContext,
  identity: typeof ctx.sender,
) {
  ctx.db.proceduralProgress.identity.delete(identity);
  for (const row of ctx.db.proceduralContribution.byIdentity.filter(identity))
    ctx.db.proceduralContribution.key.delete(row.key);
  for (const row of ctx.db.proceduralInstanceContribution.byIdentity.filter(
    identity,
  ))
    ctx.db.proceduralInstanceContribution.key.delete(row.key);
}
export function mergeProceduralProgress(
  ctx: GameReducerContext,
  guest: typeof ctx.sender,
) {
  const source = ctx.db.proceduralProgress.identity.find(guest);
  const target = ctx.db.proceduralProgress.identity.find(ctx.sender);
  if (source && source.completed > (target?.completed ?? 0)) {
    const next = { identity: ctx.sender, completed: source.completed };
    if (target) ctx.db.proceduralProgress.identity.update(next);
    else ctx.db.proceduralProgress.insert(next);
  }
  clearProceduralProgress(ctx, guest);
}
