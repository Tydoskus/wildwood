import { Identity } from "spacetimedb";
import { tables, type DbConnection } from "../../module_bindings";
import type { ProfileSnapshotLook } from "../../../shared/profile-snapshot";
import { unsubscribeIfActive, type ActiveSubscription } from "./subscription-handoff";

/** A found snapshot is checked again after this long, so a retaken one reaches other players. */
export const PROFILE_SNAPSHOT_REFRESH_MS = 5 * 60_000;
/** A player with no snapshot row is asked about again after this long. */
export const PROFILE_SNAPSHOT_MISSING_RETRY_MS = 60_000;
/** A fetch that failed or timed out is tried again after this long. */
const FAILED_RETRY_MS = 10_000;
const BATCH = 50;
const CACHE_LIMIT = 2048;

type Entry = { look: ProfileSnapshotLook | undefined; retryAt: number };
type Row = { identity: Identity; skinTone: number; headItem: string; chestItem: string; feetItem: string; rightHandItem: string; leftHandItem: string };

const lookOf = (row: Row): ProfileSnapshotLook => ({
  skinTone: row.skinTone, headItem: row.headItem, chestItem: row.chestItem, feetItem: row.feetItem,
  rightHandItem: row.rightHandItem, leftHandItem: row.leftHandItem,
});
const sameLook = (left: ProfileSnapshotLook | undefined, right: ProfileSnapshotLook | undefined) =>
  left === right || Boolean(left && right && (Object.keys(left) as (keyof ProfileSnapshotLook)[]).every(key => left[key] === right[key]));

/**
 * Fetches the snapshot rows of the players whose pictures are on screen, the
 * way chat portraits fetch profile rows: in batches of up to fifty, one
 * subscription at a time, released as soon as it has applied. Nobody holds the
 * whole table, and a chat full of the same names asks once.
 *
 * `revision` moves whenever a fetched look differs from the one held, which is
 * what the portrait painter watches to redraw.
 */
export function createProfileSnapshots(options: {
  connection: () => DbConnection | null;
  changed: () => void;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const cache = new Map<string, Entry>();
  const queued = new Set<string>();
  const pending = new Set<string>();
  // Asked again while already being fetched: that answer may predate the change.
  const again = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | null = null;
  let revision = 0;

  function schedule(delay = 0) {
    if (cancel || timer !== undefined || !queued.size) return;
    timer = setTimeout(() => { timer = undefined; flush(); }, delay);
  }
  function flush() {
    const connection = options.connection();
    if (!connection?.isActive) { schedule(1_000); return; }
    const batch = [...queued].slice(0, BATCH);
    if (!batch.length) return;
    for (const key of batch) { queued.delete(key); pending.add(key); }
    let handle: ActiveSubscription | null = null;
    let settled = false;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const finish = (applied: boolean) => {
      if (settled) { unsubscribeIfActive(handle); return; }
      settled = true;
      clearTimeout(deadline);
      cancel = null;
      let moved = false;
      if (options.connection() === connection) {
        const found = new Map<string, ProfileSnapshotLook>();
        if (applied) for (const row of connection.db.playerProfileSnapshot.iter() as Iterable<Row>) {
          const key = row.identity.toHexString();
          if (pending.has(key)) found.set(key, lookOf(row));
        }
        for (const key of batch) {
          const previous = cache.get(key);
          // A failed fetch keeps what was known and tries again on the next ask after a short wait.
          const look = applied ? found.get(key) : previous?.look;
          if (!sameLook(previous?.look, look)) moved = true;
          cache.delete(key);
          const wait = !applied ? FAILED_RETRY_MS : look ? PROFILE_SNAPSHOT_REFRESH_MS : PROFILE_SNAPSHOT_MISSING_RETRY_MS;
          cache.set(key, { look, retryAt: now() + wait });
        }
        while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
      }
      for (const key of batch) {
        pending.delete(key);
        if (again.delete(key)) queued.add(key);
      }
      unsubscribeIfActive(handle);
      if (moved) { revision++; options.changed(); }
      schedule();
    };
    cancel = () => finish(false);
    try {
      handle = connection.subscriptionBuilder()
        .onApplied(() => finish(true))
        .onError(() => finish(false))
        .subscribe(batch.map(key => {
          const identity = Identity.fromString(key.replace(/^0x/i, ""));
          return tables.playerProfileSnapshot.where(row => row.identity.eq(identity));
        }));
      if (settled) unsubscribeIfActive(handle);
      else deadline = setTimeout(() => finish(false), 10_000);
    } catch { finish(false); }
  }
  const stale = (key: string) => (cache.get(key)?.retryAt ?? 0) <= now();
  function request(key: string) {
    if (pending.has(key) || queued.has(key)) return;
    queued.add(key);
    while (queued.size > CACHE_LIMIT) queued.delete(queued.values().next().value!);
    schedule();
  }
  return {
    /** The look last fetched for this player, asking the server again when it is missing or old. */
    look(identity: string) {
      if (!identity) return undefined;
      if (stale(identity)) request(identity);
      return cache.get(identity)?.look;
    },
    /** Ask now, whatever is held: the local player just retook theirs. */
    refresh(identity: string) {
      if (!identity) return;
      if (pending.has(identity)) again.add(identity);
      else request(identity);
    },
    revision: () => revision,
    clear() {
      again.clear(); queued.clear();
      cancel?.();
      queued.clear();
      clearTimeout(timer); timer = undefined;
      pending.clear();
      if (cache.size) { cache.clear(); revision++; }
    },
  };
}

export type ProfileSnapshots = ReturnType<typeof createProfileSnapshots>;
