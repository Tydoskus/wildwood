import { countRewardKills, soulAttackCapFor } from "./soul-dimension";
import { table, t } from "spacetimedb/server";
import { cardStatFactors, respawnSecondsWithCards } from "../../shared/card-effects";
import { activeCardTotalsFor } from "./active-cards";
import type { StatRewardMultiplier } from "../../shared/enemy-defeats";
import { offlineProgressEnabled } from "./offline-preference";
import {
  OFFLINE_MINIMUM_SECONDS,
  OFFLINE_WINDOW_SECONDS,
  offlineFarmableMaps,
  resolveOfflineFarming,
  type OfflineFarmOutcome,
} from "../../shared/offline-progress";
import { applyEnemyRewards } from "../../shared/enemy-defeats";
import { enemyRespawnSecondsWithResearch, offlineWindowSecondsWithResearch } from "../../shared/utility-research";
import { REGULAR_ENEMY_RESPAWN_SECONDS } from "../../shared/rules";
import type { PlayerPowerStats } from "../../shared/player-power";
import type { MapBalanceSnapshot } from "../../shared/map-balance-types";
import { readCritRating, readPlayerProgress } from "./wide-stats";
import { researchInPlay } from "./bonus-toggles";
import { awardOfflineGold } from "./gold";
import { clearOfflineGatherChoice, collectOfflineGathering, storeOfflineGatherChoice } from "./offline-gathering";
import { guildHallBonusFor } from "./guild-hall-bonus";
import type { OfflineActivity } from "../../shared/offline-gathering";

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
export function offlineSecondsEarned(nowMicros: bigint, awaySinceMicros: bigint, windowSeconds = OFFLINE_WINDOW_SECONDS) {
  if (awaySinceMicros <= 0n || nowMicros <= awaySinceMicros) return 0;
  const seconds = Number((nowMicros - awaySinceMicros) / MICROS_PER_SECOND);
  if (seconds < OFFLINE_MINIMUM_SECONDS) return 0;
  return Math.min(windowSeconds, seconds);
}

export type OfflineGrantDependencies = {
  stats: PlayerPowerStats;
  progress: Record<string, unknown>;
  endless: { completed: number; unlocked: boolean };
  balanceFor?: (mapId: string) => MapBalanceSnapshot | undefined;
  offlineWindowRank?: number;
  /** The whole window in seconds, when more than the rank gives (the guild hall's Hearth). */
  offlineWindowSeconds?: number;
  enemyRespawnRank?: number;
  /** What Respawn cards add to how often enemies come back. */
  cardRespawn?: number;
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
  const seconds = offlineSecondsEarned(nowMicros, awaySinceMicros,
    dependencies.offlineWindowSeconds ?? offlineWindowSecondsWithResearch(dependencies.offlineWindowRank ?? 0));
  if (!seconds) return null;
  const maps = offlineFarmableMaps(dependencies.progress as any, dependencies.endless);
  if (!maps.length) return null;
  const outcome = resolveOfflineFarming(maps, dependencies.stats, seconds, {
    balanceFor: dependencies.balanceFor,
    respawnSecondsFor: mapId => respawnSecondsWithCards(enemyRespawnSecondsWithResearch(
      dependencies.balanceFor?.(mapId)?.regularRespawnSeconds ?? REGULAR_ENEMY_RESPAWN_SECONDS,
      dependencies.enemyRespawnRank ?? 0,
    ), dependencies.cardRespawn ?? 0),
  });
  return outcome ? { seconds, outcome } : null;
}

/**
 * Records what the player can collect for this absence, and reopens the window at `now` so the same absence can
 * never be claimed twice. `grant` is the fight, or null when there is none to offer; nothing is paid here.
 */
export function storeOfflineGrant(
  ctx: any,
  identity: any,
  grant: OfflineGrant | null,
  gains: { damage: number; health: number; armor: number; regen: number; attackSpeed: number },
  seconds = grant?.seconds ?? 0,
) {
  const existing: OfflineProgressRow | undefined = ctx.db.offlineProgress.identity.find(identity);
  const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
  if (!seconds) {
    // Keep an unread summary from an earlier login rather than blanking it for
    // someone who refreshed before the dialog opened.
    writeRow(ctx, { ...(existing ?? emptyOfflineProgressRow(identity)), identity, awaySinceMicros: 0n });
    return;
  }
  writeRow(ctx, {
    identity,
    awaySinceMicros: 0n,
    mapId: grant?.outcome.mapId ?? "",
    seconds,
    kills: grant?.outcome.kills ?? 0,
    ...gains,
    blocked: grant ? !grant.outcome.survivable : false,
    grantedAtMicros: nowMicros,
    pending: true,
  });
}

/** Marks the waiting summary as seen. The window stays where it is. */
function acknowledgeOfflineProgress(ctx: any, identity: any) {
  const existing: OfflineProgressRow | undefined = ctx.db.offlineProgress.identity.find(identity);
  if (!existing?.pending) return;
  ctx.db.offlineProgress.identity.update({ ...existing, pending: false });
}

export type OfflineGrantPorts = {
  effectiveStats: (ctx: any, progress: any) => PlayerPowerStats;
  /** The balance a kill on this map pays right now: the pinned visit, or what arriving would pin. */
  mapBalance: (ctx: any, identity: any, mapId: string) => MapBalanceSnapshot | null | undefined;
  statMultiplier: (ctx: any, identity: any) => StatRewardMultiplier;
  writeProgress: (ctx: any, progress: any) => void;
  endlessClaimBit: number;
  /** The bag's items from the saved progress, for room for new kinds of ore. */
  inventoryForProgress?: (progress: any) => string[];
};

const NO_GAINS = { damage: 0, health: 0, armor: 0, regen: 0, attackSpeed: 0 };

/** How long time away can run: the Offline Time research's window and the guild hall's Hearth on top. */
const offlineWindowFor = (ctx: any, identity: any) =>
  offlineWindowSecondsWithResearch(ctx.db.playerResearch.identity.find(identity)?.offlineWindow ?? 0) + guildHallBonusFor(ctx, identity, "hearth");

/**
 * The fight an absence from `awaySinceMicros` to `nowMicros` earns. Offline farming is weapon farming, so a Reflect
 * Only run earns none, and an Aggro run is about surviving its camps, which offline time skips.
 */
function resolveFight(ctx: any, progress: any, ports: OfflineGrantPorts, nowMicros: bigint, awaySinceMicros: bigint) {
  if (ctx.db.playerPrestigeChallenge?.identity.find(ctx.sender)?.active || ctx.db.playerAggroChallenge?.identity.find(ctx.sender)?.active) return null;
  return resolveOfflineGrant(nowMicros, awaySinceMicros, {
    offlineWindowSeconds: offlineWindowFor(ctx, ctx.sender),
    // Respawn research farms faster only while Research is in play (bonus-toggles.ts); the window is a timer and stays.
    enemyRespawnRank: researchInPlay(ctx, ctx.sender)?.enemyRespawn ?? 0,
    cardRespawn: cardStatFactors(activeCardTotalsFor(ctx, ctx.sender)).respawn,
    stats: ports.effectiveStats(ctx, progress),
    progress,
    endless: {
      completed: ctx.db.proceduralProgress.identity.find(ctx.sender)?.completed ?? 0,
      unlocked: Boolean(progress?.bossRewardClaims & ports.endlessClaimBit),
    },
    balanceFor: (mapId: string) => ports.mapBalance(ctx, ctx.sender, mapId) ?? undefined,
  });
}

function fightResult(ctx: any, progress: any, grant: OfflineGrant, ports: OfflineGrantPorts) {
  // Crit kills add to the run's rating, which a row read without it would otherwise write over.
  const rated = { ...progress, critRating: progress.critRating ?? readCritRating(ctx, ctx.sender) };
  const next = applyEnemyRewards(rated, grant.outcome.rewards, ports.statMultiplier(ctx, ctx.sender), soulAttackCapFor(ctx, ctx.sender));
  return {
    next,
    gains: {
      damage: next.damage - progress.damage,
      health: next.maxHp - progress.maxHp,
      armor: next.armor - progress.armor,
      regen: next.regen - progress.regen,
      // Attack speed is stored as an interval, so the gain is the time removed.
      attackSpeed: progress.attackRate - next.attackRate,
    },
  };
}

/** Seconds of an absence still waiting with its choice; a summary paid when granted (before choices) has none. */
function uncollectedSeconds(ctx: any, row: OfflineProgressRow) {
  if (!row.pending) return 0;
  return ctx.db.offlineGatherChoice.identity.find(ctx.sender)?.grantedAtMicros === row.grantedAtMicros ? row.seconds : 0;
}

/**
 * Works out what the account could collect for its time away: the fight, the mining and the chopping
 * (offline-gathering.ts). Nothing is paid until the player picks one (collectOfflineProgress).
 *
 * Everything it depends on is already on the server: the disconnect stamp, the stored stats, the stored unlocks.
 * It runs once, on the way into the world, and closes the window behind it so the same absence is never offered twice.
 */
export function grantOfflineProgress(ctx: any, progress: any, ports: OfflineGrantPorts) {
  const row: OfflineProgressRow | undefined = ctx.db.offlineProgress.identity.find(ctx.sender);
  if (!row) return progress;
  // Switched off in settings: close the window without paying it, so turning
  // the setting back on pays for the time since, not for the months before.
  const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
  const windowSeconds = offlineWindowFor(ctx, ctx.sender);
  const earned = offlineProgressEnabled(ctx, ctx.sender) ? offlineSecondsEarned(nowMicros, row.awaySinceMicros, windowSeconds) : 0;
  if (!earned) {
    storeOfflineGrant(ctx, ctx.sender, null, NO_GAINS);
    return progress;
  }
  // Time away offered and never collected adds to this absence, still capped at the window.
  const seconds = Math.min(windowSeconds, earned + uncollectedSeconds(ctx, row));
  const grant = resolveFight(ctx, progress, ports, nowMicros, nowMicros - BigInt(seconds) * MICROS_PER_SECOND);
  storeOfflineGrant(ctx, ctx.sender, grant, grant?.outcome.rewards.length ? fightResult(ctx, progress, grant, ports).gains : NO_GAINS, seconds);
  storeOfflineGatherChoice(ctx, ctx.sender, seconds, nowMicros);
  return progress;
}

/** Pays the fight as it was offered: resolved again over the same stretch, from the stats the player has now. */
function payFight(ctx: any, row: OfflineProgressRow, ports: OfflineGrantPorts) {
  const progress = readPlayerProgress(ctx, ctx.sender);
  if (!progress) return;
  const grant = resolveFight(ctx, progress, ports, row.grantedAtMicros, row.grantedAtMicros - BigInt(row.seconds) * MICROS_PER_SECOND);
  if (!grant?.outcome.rewards.length) return;
  ports.writeProgress(ctx, fightResult(ctx, progress, grant, ports).next);
  // Offline farming is campaign or Endless farming: its kills count towards the Soul Dimension's tiers.
  countRewardKills(ctx, ctx.sender, grant.outcome.rewards);
  // Gold at half the in-play rate; loot rolls, kill gems and boss clears stay where they are.
  awardOfflineGold(ctx, ctx.sender, grant.outcome.kills);
  const lifetime = ctx.db.playerLifetime.identity.find(ctx.sender);
  if (lifetime) {
    ctx.db.playerLifetime.identity.update({ ...lifetime, enemyKills: lifetime.enemyKills + BigInt(grant.outcome.kills) });
  }
}

/**
 * The player's pick for the waiting absence: fight, mine or chop. A summary from before choices existed was paid
 * when it was granted, so collecting it only marks it seen.
 */
export function collectOfflineProgress(ctx: any, activity: OfflineActivity, ports: OfflineGrantPorts) {
  const row: OfflineProgressRow | undefined = ctx.db.offlineProgress.identity.find(ctx.sender);
  if (!row?.pending) return;
  const choice = ctx.db.offlineGatherChoice.identity.find(ctx.sender);
  if (choice?.grantedAtMicros === row.grantedAtMicros) {
    if (activity === "fight") payFight(ctx, row, ports);
    else collectOfflineGathering(ctx, ctx.sender, choice, activity, ports.inventoryForProgress);
  }
  clearOfflineGatherChoice(ctx, ctx.sender);
  acknowledgeOfflineProgress(ctx, ctx.sender);
}

/**
 * Developer-only: backdate the window and pay it out on the spot.
 *
 * It settles rather than waiting for the next world entry because there is no
 * way to reach one without disconnecting first, and disconnecting reopens the
 * window at now — which would erase the very backdate being tested.
 */
export function setSimulatedTimeAway(ctx: any, seconds: number, ports: OfflineGrantPorts) {
  const bounded = Math.min(offlineWindowFor(ctx, ctx.sender), Math.max(0, seconds));
  // Zero is the "never disconnected" sentinel, so a clock too close to the
  // epoch to subtract from must still land on a real instant.
  const backdated = ctx.timestamp.microsSinceUnixEpoch - BigInt(bounded) * MICROS_PER_SECOND;
  const awaySinceMicros = backdated > 0n ? backdated : 1n;
  const row: OfflineProgressRow | undefined = ctx.db.offlineProgress.identity.find(ctx.sender);
  writeRow(ctx, { ...(row ?? emptyOfflineProgressRow(ctx.sender)), awaySinceMicros, pending: false });
  const progress = readPlayerProgress(ctx, ctx.sender);
  if (progress) grantOfflineProgress(ctx, progress, ports);
}
