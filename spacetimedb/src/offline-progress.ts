import { table, t } from "spacetimedb/server";
import {
  OFFLINE_MINIMUM_SECONDS,
  OFFLINE_WINDOW_SECONDS,
  offlineFarmableMaps,
  resolveOfflineFarming,
  type OfflineFarmOutcome,
} from "../../shared/offline-progress";
import { applyEnemyRewards } from "../../shared/enemy-defeats";
import type { PlayerPowerStats } from "../../shared/player-power";
import type { MapBalanceSnapshot } from "../../shared/map-balance-types";

export const offlineProgressTables = {
  /**
   * One row per account, holding both halves of offline progress: when the
   * unattended window opened, and the grant that is waiting to be shown.
   *
   * They share a row on purpose. Stamping the anchor and clearing a claimed
   * report are the same two moments — a session ending and a session
   * starting — so keeping them together means neither can drift from the
   * other, and a login costs one lookup instead of two.
   */
  offlineProgress: table(
    { public: false },
    {
      identity: t.identity().primaryKey(),
      /** When the account's last session ended. Zero means it never has. */
      awaySinceMicros: t.u64(),
      /** The map that was farmed, or the one that turned the player back. */
      mapId: t.string(),
      /** Seconds credited: the time away, capped at the window. */
      seconds: t.u32(),
      kills: t.u32(),
      damage: t.f64(),
      health: t.f64(),
      armor: t.f64(),
      regen: t.f64(),
      attackSpeed: t.f64(),
      /** True when nothing was earned because no map was survivable. */
      blocked: t.bool(),
      grantedAtMicros: t.u64(),
      /** Cleared once the client has shown the summary. */
      pending: t.bool(),
    },
  ),
};

export type OfflineProgressRow = {
  // The host's Identity, which this module only ever passes straight back.
  identity: any;
  awaySinceMicros: bigint;
  mapId: string;
  seconds: number;
  kills: number;
  damage: number;
  health: number;
  armor: number;
  regen: number;
  attackSpeed: number;
  blocked: boolean;
  grantedAtMicros: bigint;
  pending: boolean;
};

const MICROS_PER_SECOND = 1_000_000n;

export function emptyOfflineProgressRow(identity: any, awaySinceMicros = 0n): OfflineProgressRow {
  return {
    identity, awaySinceMicros, mapId: "", seconds: 0, kills: 0,
    damage: 0, health: 0, armor: 0, regen: 0, attackSpeed: 0,
    blocked: false, grantedAtMicros: 0n, pending: false,
  };
}

function writeRow(ctx: any, row: OfflineProgressRow) {
  if (ctx.db.offlineProgress.identity.find(row.identity)) ctx.db.offlineProgress.identity.update(row);
  else ctx.db.offlineProgress.insert(row);
}

/**
 * Opens the unattended window. Called when an account's last session ends, so
 * a second tab closing while the first still plays does not start the clock.
 */
export function beginOfflineWindow(ctx: any, identity: any) {
  const existing: OfflineProgressRow | undefined = ctx.db.offlineProgress.identity.find(identity);
  writeRow(ctx, { ...(existing ?? emptyOfflineProgressRow(identity)), identity, awaySinceMicros: ctx.timestamp.microsSinceUnixEpoch });
}

/** Seconds of farming an account has earned, capped at the window. */
export function offlineSecondsEarned(nowMicros: bigint, awaySinceMicros: bigint) {
  if (awaySinceMicros <= 0n || nowMicros <= awaySinceMicros) return 0;
  const seconds = Number((nowMicros - awaySinceMicros) / MICROS_PER_SECOND);
  if (seconds < OFFLINE_MINIMUM_SECONDS) return 0;
  return Math.min(OFFLINE_WINDOW_SECONDS, seconds);
}

export type OfflineGrantDependencies = {
  stats: PlayerPowerStats;
  progress: Record<string, unknown>;
  endless: { completed: number; unlocked: boolean };
  balanceFor?: (mapId: string) => MapBalanceSnapshot | undefined;
};

export type OfflineGrant = {
  seconds: number;
  outcome: OfflineFarmOutcome;
};

/**
 * Resolves what the account earned while away, without writing anything.
 *
 * Nothing here trusts the client: the elapsed time comes from the server's own
 * disconnect stamp, the stats from the account's stored progress, and the maps
 * from its stored unlocks. There is no reducer argument to forge.
 */
export function resolveOfflineGrant(
  nowMicros: bigint,
  awaySinceMicros: bigint,
  dependencies: OfflineGrantDependencies,
): OfflineGrant | null {
  const seconds = offlineSecondsEarned(nowMicros, awaySinceMicros);
  if (!seconds) return null;
  const maps = offlineFarmableMaps(dependencies.progress as any, dependencies.endless);
  if (!maps.length) return null;
  const outcome = resolveOfflineFarming(maps, dependencies.stats, seconds, { balanceFor: dependencies.balanceFor });
  return outcome ? { seconds, outcome } : null;
}

/**
 * Records a resolved grant for the client to show, and reopens the window at
 * `now` so the same absence can never be claimed twice.
 */
export function storeOfflineGrant(
  ctx: any,
  identity: any,
  grant: OfflineGrant | null,
  gains: { damage: number; health: number; armor: number; regen: number; attackSpeed: number },
) {
  const existing: OfflineProgressRow | undefined = ctx.db.offlineProgress.identity.find(identity);
  const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
  if (!grant) {
    // Keep an unread summary from an earlier login rather than blanking it for
    // someone who refreshed before the dialog opened.
    writeRow(ctx, { ...(existing ?? emptyOfflineProgressRow(identity)), identity, awaySinceMicros: 0n });
    return;
  }
  writeRow(ctx, {
    identity,
    awaySinceMicros: 0n,
    mapId: grant.outcome.mapId,
    seconds: grant.seconds,
    kills: grant.outcome.kills,
    ...gains,
    blocked: !grant.outcome.survivable,
    grantedAtMicros: nowMicros,
    pending: true,
  });
}

/** Marks the waiting summary as seen. The window stays where it is. */
export function acknowledgeOfflineProgress(ctx: any, identity: any) {
  const existing: OfflineProgressRow | undefined = ctx.db.offlineProgress.identity.find(identity);
  if (!existing?.pending) return;
  ctx.db.offlineProgress.identity.update({ ...existing, pending: false });
}

export type OfflineGrantPorts = {
  effectiveStats: (ctx: any, progress: any) => PlayerPowerStats;
  pinnedBalance: (ctx: any, identity: any, mapId: string) => MapBalanceSnapshot | null | undefined;
  statMultiplier: (ctx: any, identity: any) => number;
  writeProgress: (ctx: any, progress: any) => void;
  endlessClaimBit: number;
};

/**
 * Pays out the farming an account missed while it was away.
 *
 * Everything the payout depends on is already on the server: the disconnect
 * stamp, the stored stats, the stored unlocks. The client contributes nothing
 * and cannot ask for this — it runs once, on the way into the world, and
 * closes the window behind it so the same absence is never paid twice.
 *
 * Only regular-enemy stat rewards are granted. Loot rolls, kill gems and boss
 * clears stay where they are: things an absent player did not do.
 */
export function grantOfflineProgress(ctx: any, progress: any, ports: OfflineGrantPorts) {
  const row: OfflineProgressRow | undefined = ctx.db.offlineProgress.identity.find(ctx.sender);
  if (!row) return progress;
  const grant = resolveOfflineGrant(ctx.timestamp.microsSinceUnixEpoch, row.awaySinceMicros, {
    stats: ports.effectiveStats(ctx, progress),
    progress,
    endless: {
      completed: ctx.db.proceduralProgress.identity.find(ctx.sender)?.completed ?? 0,
      unlocked: Boolean(progress?.bossRewardClaims & ports.endlessClaimBit),
    },
    balanceFor: (mapId: string) => ports.pinnedBalance(ctx, ctx.sender, mapId) ?? undefined,
  });
  if (!grant || !grant.outcome.rewards.length) {
    storeOfflineGrant(ctx, ctx.sender, grant, { damage: 0, health: 0, armor: 0, regen: 0, attackSpeed: 0 });
    return progress;
  }
  const next = applyEnemyRewards(progress, grant.outcome.rewards, ports.statMultiplier(ctx, ctx.sender));
  storeOfflineGrant(ctx, ctx.sender, grant, {
    damage: next.damage - progress.damage,
    health: next.maxHp - progress.maxHp,
    armor: next.armor - progress.armor,
    regen: next.regen - progress.regen,
    // Attack speed is stored as an interval, so the gain is the time removed.
    attackSpeed: progress.attackRate - next.attackRate,
  });
  ports.writeProgress(ctx, next);
  const lifetime = ctx.db.playerLifetime.identity.find(ctx.sender);
  if (lifetime) {
    ctx.db.playerLifetime.identity.update({ ...lifetime, enemyKills: lifetime.enemyKills + BigInt(grant.outcome.kills) });
  }
  return next;
}

/**
 * Developer-only: backdate the window and pay it out on the spot.
 *
 * It settles rather than waiting for the next world entry because there is no
 * way to reach one without disconnecting first, and disconnecting reopens the
 * window at now — which would erase the very backdate being tested.
 */
export function setSimulatedTimeAway(ctx: any, seconds: number, ports: OfflineGrantPorts) {
  const bounded = Math.min(OFFLINE_WINDOW_SECONDS, Math.max(0, seconds));
  // Zero is the "never disconnected" sentinel, so a clock too close to the
  // epoch to subtract from must still land on a real instant.
  const backdated = ctx.timestamp.microsSinceUnixEpoch - BigInt(bounded) * MICROS_PER_SECOND;
  const awaySinceMicros = backdated > 0n ? backdated : 1n;
  const row: OfflineProgressRow | undefined = ctx.db.offlineProgress.identity.find(ctx.sender);
  writeRow(ctx, { ...(row ?? emptyOfflineProgressRow(ctx.sender)), awaySinceMicros, pending: false });
  const progress = ctx.db.playerProgress.identity.find(ctx.sender);
  if (progress) grantOfflineProgress(ctx, progress, ports);
}
