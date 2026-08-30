import type { Identity } from "spacetimedb";
import { tables, type DbConnection } from "../../module_bindings";
import { effectivePlayerPowerStats } from "../../../shared/player-power";
import { normalizeItemUpgradeLevel } from "../../../shared/items";
import type { RemoteCombatStats } from "../contracts";

const LOAD_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 30_000;
const FAILED_CACHE_TTL_MS = 5_000;
const MAX_CACHE_ENTRIES = 8;

type ProgressRow = {
  identity: Identity;
  maxHp: number;
  damage: number;
  attackRate: number;
  projectileSpeed: number;
  projectileCount: number;
  attackRange: number;
  armor: number;
  regen: number;
  equippedHead: string;
  equippedChest: string;
  equippedRightHand: string;
  equippedLeftHand: string;
};

type ResearchRow = {
  identity: Identity;
  warcraft: number;
  precision: number;
  regeneration: number;
  criticalChance: number;
  criticalDamage: number;
};

type UpgradeRow = {
  identity: Identity;
  itemId: string;
  level: number;
};

type CacheEntry = {
  stats: RemoteCombatStats | null;
  expiresAtMs: number;
  lastAccessedAtMs: number;
};

type PendingLoad = {
  cancel: () => void;
};

function finitePositive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizedRank(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/** Converts the same persisted rows used by profiles into local-combat values. */
export function remoteCombatStatsFromRows(
  progress: ProgressRow,
  research: ResearchRow | null | undefined,
  upgrades: readonly UpgradeRow[],
): RemoteCombatStats {
  const upgradeLevels = new Map(
    upgrades.map((upgrade) => [upgrade.itemId, normalizeItemUpgradeLevel(upgrade.level)]),
  );
  const effective = effectivePlayerPowerStats(
    progress,
    research,
    (itemId) => upgradeLevels.get(itemId) ?? 0,
  );
  const criticalChanceRank = normalizedRank(research?.criticalChance ?? 0);
  const criticalDamageRank = normalizedRank(research?.criticalDamage ?? 0);
  return {
    damage: finitePositive(effective.damage, 1),
    maxHp: finitePositive(effective.maxHp, 100),
    armor: Math.max(0, Number.isFinite(effective.armor) ? effective.armor : 0),
    regen: Math.max(0, Number.isFinite(effective.regen) ? effective.regen : 0),
    attackInterval: finitePositive(effective.attackRate, 1),
    projectileSpeed: finitePositive(progress.projectileSpeed, 390),
    projectileCount: Number.isInteger(progress.projectileCount)
      ? Math.max(1, Math.min(20, progress.projectileCount))
      : 1,
    attackRange: finitePositive(progress.attackRange, 155),
    criticalChance: Math.max(0, Math.min(1, criticalChanceRank * .01)),
    criticalDamageMultiplier: 1.05 + criticalDamageRank * .05,
  };
}

/**
 * Short-lived, observer-only profile snapshots. Queries only existing tables
 * and releases each subscription immediately after its first applied snapshot.
 */
export function createRemoteCombatStatsService(dependencies: {
  connection: () => DbConnection | null;
  identityFor: (identity: string) => Identity | undefined;
  nowMs?: () => number;
}) {
  const cache = new Map<string, CacheEntry>();
  const pending = new Map<string, PendingLoad>();
  const nowMs = dependencies.nowMs ?? Date.now;

  function evictExpiredAndExcess(now: number) {
    for (const [identity, entry] of cache) {
      if (entry.expiresAtMs <= now) cache.delete(identity);
    }
    while (cache.size >= MAX_CACHE_ENTRIES) {
      let oldestIdentity = "";
      let oldestAccess = Number.POSITIVE_INFINITY;
      for (const [identity, entry] of cache) {
        if (entry.lastAccessedAtMs < oldestAccess) {
          oldestIdentity = identity;
          oldestAccess = entry.lastAccessedAtMs;
        }
      }
      if (!oldestIdentity) break;
      cache.delete(oldestIdentity);
    }
  }

  function beginLoad(identity: string) {
    if (pending.has(identity)) return;
    const connection = dependencies.connection();
    const dbIdentity = dependencies.identityFor(identity);
    if (!connection || !dbIdentity) return;

    let settled = false;
    let subscription: { unsubscribe: () => void } | null = null;
    let unsubscribeAfterSubscribe = false;
    let timeoutId: number | null = null;
    const release = () => {
      if (subscription) {
        subscription.unsubscribe();
        subscription = null;
      } else {
        unsubscribeAfterSubscribe = true;
      }
    };
    const finish = (stats: RemoteCombatStats | null) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      pending.delete(identity);
      release();
      const now = nowMs();
      evictExpiredAndExcess(now);
      cache.set(identity, {
        stats,
        expiresAtMs: now + (stats ? CACHE_TTL_MS : FAILED_CACHE_TTL_MS),
        lastAccessedAtMs: now,
      });
    };
    const cancel = () => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      pending.delete(identity);
      release();
    };
    pending.set(identity, { cancel });

    try {
      subscription = connection
        .subscriptionBuilder()
        .onApplied(() => {
          if (dependencies.connection() !== connection) return finish(null);
          try {
            const progress = [...connection.db.playerProgress.iter()]
              .find((row) => row.identity.toHexString() === identity);
            if (!progress) return finish(null);
            const research = [...connection.db.playerResearch.iter()]
              .find((row) => row.identity.toHexString() === identity);
            const upgrades = [...connection.db.playerItemUpgrade.iter()]
              .filter((row) => row.identity.toHexString() === identity);
            finish(remoteCombatStatsFromRows(progress, research, upgrades));
          } catch {
            finish(null);
          }
        })
        .onError(() => finish(null))
        .subscribe([
          tables.playerProgress.where((row) => row.identity.eq(dbIdentity)),
          tables.playerResearch.where((row) => row.identity.eq(dbIdentity)),
          tables.playerItemUpgrade.where((row) => row.identity.eq(dbIdentity)),
        ]);
    } catch {
      finish(null);
      return;
    }
    if (unsubscribeAfterSubscribe) release();
    if (!settled) timeoutId = window.setTimeout(() => finish(null), LOAD_TIMEOUT_MS);
  }

  function statsFor(identity: string) {
    if (!identity) return null;
    const now = nowMs();
    const entry = cache.get(identity);
    if (entry && entry.expiresAtMs > now) {
      entry.lastAccessedAtMs = now;
      return entry.stats ? { ...entry.stats } : null;
    }
    if (entry) cache.delete(identity);
    beginLoad(identity);
    return null;
  }

  function clearSession() {
    for (const load of pending.values()) load.cancel();
    pending.clear();
    cache.clear();
  }

  return {
    api: { remoteCombatStats: statsFor },
    activeSubscriptionCount: () => pending.size,
    clearSession,
  };
}
