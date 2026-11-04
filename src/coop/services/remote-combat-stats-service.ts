import type { Identity } from "spacetimedb";
import { weaponHitFactor } from "../../../shared/staff-skills";
import { tables, type DbConnection } from "../../module_bindings";
import { itemDefinition } from "../../../shared/items";
import { itemLevelFor } from "../../../shared/item-level";
import { computePlayerStats } from "../../../shared/player-stats";
import { bonusesInPlay, masteryInPlayAtLevels, type PublicStatRows } from "../../../shared/bonuses-in-play";
import { cardStatFactors } from "../../../shared/card-effects";
import { activeCardsOfRow } from "../../../shared/active-cards";
import { parseBonusOff } from "../../../shared/bonus-toggles";
import { cleanSoulStats, withSoulStats } from "../../../shared/soul-dimension";
import { isWeaponSchool, masteryAttackRange, type WeaponSchool } from "../../../shared/weapon-mastery";
import type { RemoteCombatStats } from "../contracts";
import { withWideProgress } from "./wide-progress";

const LOAD_TIMEOUT_MS = 5_000;
/**
 * Each load is a subscription and its unsubscribe, so a player's stats are
 * kept a good while: they only shape how their fights with enemies are drawn.
 */
const CACHE_TTL_MS = 5 * 60_000;
const FAILED_CACHE_TTL_MS = 30_000;
/**
 * Room for everyone on a map. Everyone on it is drawn, and the enemy
 * simulation asks for each of them every frame: a cache smaller than the
 * crowd would evict one player to load the next, frame after frame, and
 * every load is a subscription.
 */
const MAX_CACHE_ENTRIES = 256;
/** Arriving on a busy map loads its players a few at a time, not all at once. */
const MAX_PENDING_LOADS = 3;

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
  equippedFeet?: string;
  equippedRightHand: string;
  equippedLeftHand: string;
  critRating?: number;
};

type ResearchRow = {
  identity: Identity;
  warcraft: number;
  precision: number;
  regeneration: number;
  criticalChance: number;
  criticalDamage: number;
  critCap?: number;
};

type UpgradeRow = {
  identity: Identity;
  /** The upgrade slot, "HAND", "HEAD" or "CHEST", despite the name (migration 38). */
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

/**
 * The rest of a player's public rows, as profiles read them: refines, active cards, perks, soul, Mastery levels,
 * switched-off bonuses and challenges. Not public, so left out: Tailwind's live share and the Mastery techniques.
 */
export type RemoteStatRows = Omit<PublicStatRows<ResearchRow>, "research"> & {
  refines?: readonly { itemId: string; level: number }[];
  /** player_weapon_stat: each weapon's rolled speed and crit; first copies are the ones with no copy or offer id. */
  weaponStats?: readonly { itemId: string; copyId: bigint; offerId: bigint; attackSpeed: number; critDamage: number }[];
};

/** Converts the same persisted rows used by profiles into local-combat values, through shared/player-stats.ts as local combat does. */
export function remoteCombatStatsFromRows(
  progress: ProgressRow,
  research: ResearchRow | null | undefined,
  upgrades: readonly UpgradeRow[],
  rows: RemoteStatRows = {},
): RemoteCombatStats {
  // A tier belongs to the slot and whatever is worn there inherits it. Looking
  // one up by item id missed every time, so other players fought here untiered.
  const slotTiers = Object.fromEntries(upgrades.map((upgrade) => [upgrade.itemId, upgrade.level]));
  const refines = Object.fromEntries((rows.refines ?? []).map((row) => [row.itemId, row.level]));
  const weaponStats = new Map((rows.weaponStats ?? []).filter((row) => !row.copyId && !row.offerId)
    .map((row) => [row.itemId, { attackSpeed: row.attackSpeed, critDamage: row.critDamage }]));
  const inPlay = bonusesInPlay({ ...rows, research });
  const rightHand = progress.equippedRightHand, weaponItem = rightHand || progress.equippedLeftHand;
  // Long Shot cards and Archery on top of the saved range, as progress-controller.ts addedRange adds them.
  const addedRange = cardStatFactors(inPlay.cards).range + masteryAttackRange(masteryInPlayAtLevels(inPlay.mastery, rightHand, weaponItem));
  const run = withSoulStats(progress, inPlay.soul, inPlay.attackCap);
  const stats = computePlayerStats({
    base: { maxHp: run.maxHp, damage: run.damage, armor: run.armor, regen: run.regen, attackInterval: run.attackRate,
      attackRange: finitePositive(progress.attackRange, 200) + addedRange, moveSpeed: 0, critRating: progress.critRating },
    loadout: { head: progress.equippedHead, chest: progress.equippedChest, feet: progress.equippedFeet ?? "", rightHand, leftHand: progress.equippedLeftHand },
    itemLevel: (itemId) => ({ ...itemLevelFor(slotTiers, refines, itemId), ...weaponStats.get(itemId) }),
    research: inPlay.research, perks: inPlay.perks, cards: inPlay.cards, soul: inPlay.soul, attackCap: inPlay.attackCap,
  });
  const melee = itemDefinition(weaponItem)?.weapon?.mode === "MELEE";
  return {
    melee,
    weaponItem,
    // A staff's bolts hit a little harder and come slower (shared/staff-skills.ts).
    damage: finitePositive(stats.damage * weaponHitFactor(weaponItem), 1),
    maxHp: finitePositive(stats.maxHp, 100),
    armor: Math.max(0, Number.isFinite(stats.armor) ? stats.armor : 0),
    regen: Math.max(0, Number.isFinite(stats.regenPerSecond) ? stats.regenPerSecond : 0),
    attackInterval: finitePositive(stats.weaponInterval, 1),
    projectileSpeed: finitePositive(progress.projectileSpeed, 390),
    projectileCount: melee ? 1 : Number.isInteger(progress.projectileCount)
      ? Math.max(1, Math.min(20, progress.projectileCount))
      : 1,
    attackRange: stats.range,
    criticalChance: Math.max(0, Math.min(1, stats.critChance)),
    criticalDamageMultiplier: stats.critMultiplier,
  };
}

/** The public rows a remote load subscribes to beside progress, research and slot tiers. */
function publicStatRows(connection: DbConnection, identity: string): RemoteStatRows {
  // A table missing from the cache (an older binding) reads as no rows.
  const db = connection.db, mine = <T extends { identity: { toHexString(): string } }>(table: { iter(): Iterable<T> } | undefined) =>
    [...table?.iter() ?? []].filter((row) => row.identity.toHexString() === identity);
  const [perk] = mine(db.playerPrestigePerk), [expansion] = mine(db.playerPrestigeExpansionPerk);
  const [cardPerk] = mine(db.playerPrestigeCardPerk), [soul] = mine(db.profileSoulStats);
  const [toggle] = mine(db.playerBonusToggle), [reflect] = mine(db.playerPrestigeChallenge);
  const [aggro] = mine(db.playerAggroChallenge);
  const mastery: Partial<Record<WeaponSchool, number>> = {};
  for (const row of mine(db.playerMasteryLevel)) if (isWeaponSchool(row.school)) mastery[row.school] = row.level;
  return {
    refines: mine(db.playerItemRefine),
    weaponStats: mine(db.playerWeaponStat),
    activeCards: activeCardsOfRow(mine(db.playerActiveCard)[0]),
    perks: { ...perk, ...expansion, ...cardPerk },
    soul: soul ? cleanSoulStats(soul) : null,
    bonusOff: parseBonusOff(toggle?.off), prestigeChallenge: reflect ?? null, aggroChallenge: aggro ?? null, mastery,
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
    if (pending.has(identity) || pending.size >= MAX_PENDING_LOADS) return;
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
            const stored = [...connection.db.playerProgress.iter()]
              .find((row) => row.identity.toHexString() === identity);
            if (!stored) return finish(null);
            const progress = withWideProgress(connection, stored);
            const research = [...connection.db.playerResearch.iter()]
              .find((row) => row.identity.toHexString() === identity);
            const upgrades = [...connection.db.playerItemUpgrade.iter()]
              .filter((row) => row.identity.toHexString() === identity);
            finish(remoteCombatStatsFromRows(progress, research, upgrades, publicStatRows(connection, identity)));
          } catch {
            finish(null);
          }
        })
        .onError(() => finish(null))
        .subscribe([
          tables.playerProgress.where((row) => row.identity.eq(dbIdentity)),
          tables.playerInventory.where((row) => row.identity.eq(dbIdentity)),
          tables.playerResearch.where((row) => row.identity.eq(dbIdentity)),
          tables.playerItemUpgrade.where((row) => row.identity.eq(dbIdentity)),
          tables.playerItemRefine.where((row) => row.identity.eq(dbIdentity)),
          tables.playerWeaponStat.where((row) => row.identity.eq(dbIdentity)),
          tables.playerActiveCard.where((row) => row.identity.eq(dbIdentity)),
          tables.playerPrestigePerk.where((row) => row.identity.eq(dbIdentity)),
          tables.playerPrestigeExpansionPerk.where((row) => row.identity.eq(dbIdentity)),
          tables.playerPrestigeCardPerk.where((row) => row.identity.eq(dbIdentity)),
          tables.playerPrestigeChallenge.where((row) => row.identity.eq(dbIdentity)),
          tables.playerAggroChallenge.where((row) => row.identity.eq(dbIdentity)),
          tables.profileSoulStats.where((row) => row.identity.eq(dbIdentity)),
          tables.playerMasteryLevel.where((row) => row.identity.eq(dbIdentity)),
          tables.playerBonusToggle.where((row) => row.identity.eq(dbIdentity)),
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
