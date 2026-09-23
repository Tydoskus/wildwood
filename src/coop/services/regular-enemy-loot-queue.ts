import { combatMap, type EnemyDefeat } from "../../../shared/enemy-defeats";
import { withRequestDeadline } from "./request-deadline";
import { REGULAR_ENEMY_LOOT_BATCH_MAX } from "../../../shared/regular-map-loot";

// A healthy socket can still have a slow reducer acknowledgement. Keep this
// below the map transition's 30-second deadline, with room for loadout sync.
export const ENEMY_DEFEAT_ACK_TIMEOUT_MS = 15_000;
export const ENEMY_DEFEAT_BATCH_TIMEOUT_MS = 25_000;

type Batch = { sequence: number; mapId: string; count: number; sealed: boolean; enemies: EnemyDefeat[]; autoFarm?: boolean };
type State = { streamId: string; nextSequence: number; batches: Batch[]; retryAtMs?: number; touchedAtMs?: number };
/**
 * A queue is keyed by tab so two open tabs cannot claim one stream twice, but
 * a closed tab's queue stayed behind with its kills forever. A sibling queue
 * for the same identity that nothing has touched for this long has no live
 * tab behind it, and this tab adopts it: sent as its own stream, so a report
 * whose acknowledgement was lost is still deduplicated by the server cursor.
 */
export const ORPHAN_QUEUE_AFTER_MS = 120_000;
const QUEUE_KEY_PREFIX = "wildstat-enemy-defeats-v2:";
export type EnemyLootRequest = { streamId: string; sequence: bigint; mapId: string; count: number; enemies: EnemyDefeat[]; autoFarm: boolean };

/** Persist before sending and retry the same sequence after an interrupted reply. */
export function createRegularEnemyLootQueue(options: {
  identity: () => string;
  tabId: () => string;
  storage: Storage;
  send: (request: EnemyLootRequest) => Promise<boolean | "discard" | "throttled">;
}) {
  let owner = "", key = "", epoch = 0;
  let state: State | null = null;
  let adopted: { key: string; state: State }[] = [];
  let inFlight: Promise<boolean> | null = null;
  let bossRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let bossRetryDelay = 2_000;
  function cancelBossRetry() {
    if (bossRetryTimer !== null) clearTimeout(bossRetryTimer);
    bossRetryTimer = null;
  }
  function scheduleBossRetry() {
    cancelBossRetry();
    if (!owner || !state?.batches.some(batch => batch.enemies.some(entry => entry.enemy === "boss"))) {
      bossRetryDelay = 2_000;
      return;
    }
    const retryEpoch = epoch;
    const throttleDelay = Math.min(30_000, Math.max(0, (state.retryAtMs ?? 0) - Date.now()));
    bossRetryTimer = setTimeout(() => {
      bossRetryTimer = null;
      if (retryEpoch !== epoch) return;
      bossRetryDelay = Math.min(60_000, bossRetryDelay * 2);
      void flush(true);
    }, Math.max(bossRetryDelay, throttleDelay));
  }
  const empty = (): State => ({ streamId: crypto.randomUUID(), nextSequence: 1, batches: [] });
  function write(storageKey: string, value: State) {
    value.touchedAtMs = Date.now();
    try { options.storage.setItem(storageKey, JSON.stringify(value)); } catch {}
  }
  function persist() {
    if (key && state) write(key, state);
  }
  function readState(storageKey: string): State | null {
    try {
      const saved = JSON.parse(options.storage.getItem(storageKey) ?? "null") as State | null;
      if (saved && typeof saved.streamId === "string" && Number.isSafeInteger(saved.nextSequence) &&
          saved.nextSequence > 0 && Array.isArray(saved.batches) && saved.batches.every(batch =>
            Number.isSafeInteger(batch.sequence) && batch.sequence > 0 && combatMap(batch.mapId) &&
            Number.isInteger(batch.count) && batch.count > 0 && batch.count <= REGULAR_ENEMY_LOOT_BATCH_MAX &&
            (Array.isArray(batch.enemies) && batch.enemies.every(entry => typeof entry.enemy === "string" && Number.isInteger(entry.count) && entry.count > 0) && batch.enemies.reduce((sum, entry) => sum + entry.count, 0) === batch.count))) return saved;
    } catch {}
    return null;
  }
  function adoptOrphans() {
    adopted = [];
    const prefix = `${QUEUE_KEY_PREFIX}${owner}:`, now = Date.now();
    const siblings: string[] = [];
    try { for (let index = 0; index < options.storage.length; index++) { const candidate = options.storage.key(index); if (candidate && candidate.startsWith(prefix) && candidate !== key) siblings.push(candidate); } } catch {}
    for (const sibling of siblings) {
      const orphan = readState(sibling);
      if (!orphan) continue;
      if (!orphan.batches.length) { try { options.storage.removeItem(sibling); } catch {} continue; }
      if (now - (orphan.touchedAtMs ?? 0) < ORPHAN_QUEUE_AFTER_MS) continue;
      // Stamp it now so a second tab opening in the same moment leaves it to us.
      write(sibling, orphan);
      adopted.push({ key: sibling, state: orphan });
    }
  }
  function begin() {
    cancelBossRetry(); bossRetryDelay = 2_000;
    epoch++;
    inFlight = null;
    owner = options.identity();
    key = owner ? `${QUEUE_KEY_PREFIX}${owner}:${options.tabId()}` : "";
    state = null; adopted = [];
    if (!owner) return;
    state = readState(key) ?? empty();
    adoptOrphans();
    scheduleBossRetry();
  }
  function flush(drain = false): Promise<boolean> {
    if (owner !== options.identity()) begin();
    if (inFlight) {
      const runEpoch = epoch;
      return drain ? inFlight.then(ok => ok && epoch === runEpoch ? flush(true) : false) : inFlight;
    }
    if (!owner || !state || (!state.batches.length && !adopted.length)) { cancelBossRetry(); return Promise.resolve(true); }
    // Even forced portal/save drains respect a known server throttle. Persist it
    // so rapid refreshes cannot turn the same rejected report into a request loop.
    if (Number.isFinite(state.retryAtMs) && state.retryAtMs! > Date.now() && state.retryAtMs! <= Date.now() + 30_000) { scheduleBossRetry(); return Promise.resolve(false); }
    const current = state, runEpoch = epoch, runOwner = owner;
    const batchLimit = current.batches.length;
    // One stream at a time, oldest first: adopted queues before this tab's own.
    const sendStream = async (stream: State, storageKey: string, limit: number) => {
      let sent = 0;
      while (stream.batches.length && (drain || sent < limit)) {
        const batch = stream.batches[0];
        if (!batch.sealed) {
          batch.sealed = true;
        }
        write(storageKey, stream);
        let accepted: boolean | "discard" | "throttled" = false;
        try { accepted = await withRequestDeadline(options.send({ streamId: stream.streamId, sequence: BigInt(batch.sequence), mapId: batch.mapId, count: batch.count, enemies: batch.enemies, autoFarm: Boolean(batch.autoFarm) }), ENEMY_DEFEAT_BATCH_TIMEOUT_MS); } catch {}
        if (epoch !== runEpoch || options.identity() !== runOwner) return false;
        if (accepted === "throttled") { stream.retryAtMs = Date.now() + 30_000; write(storageKey, stream); return false; }
        if (!accepted) return false;
        stream.retryAtMs = 0;
        stream.batches.shift();
        if (accepted === "discard") {
          // A forced map change can invalidate unaccepted reports. Start a fresh
          // ordered stream so that rejection cannot block future valid rewards.
          stream.streamId = crypto.randomUUID();
          stream.batches.forEach((remaining, index) => { remaining.sequence = index + 1; });
          stream.nextSequence = stream.batches.length + 1;
        }
        sent++;
        write(storageKey, stream);
      }
      return true;
    };
    const run = async () => {
      while (adopted.length) {
        const orphan = adopted[0];
        if (!await sendStream(orphan.state, orphan.key, orphan.state.batches.length)) return false;
        try { options.storage.removeItem(orphan.key); } catch {}
        adopted.shift();
      }
      return sendStream(current, key, batchLimit);
    };
    cancelBossRetry();
    inFlight = run().finally(() => {
      if (epoch !== runEpoch) return;
      inFlight = null;
      // A lost acknowledgement/hydration gap must not leave a boss reward
      // waiting for the five-minute save timer or the player's next boss kill.
      // Retry the same persisted receipt, with backoff, only while a boss waits.
      scheduleBossRetry();
    });
    return inFlight;
  }
  return {
    begin, flush,
    hasPending: () => Boolean(state?.batches.length || adopted.length),
    record(mapId: string, enemy: string, autoFarm = false) {
      if (owner !== options.identity()) begin();
      if (!owner || !state || !combatMap(mapId) || !enemy) return;
      const tail = state.batches.at(-1);
      if (tail && !tail.sealed && tail.mapId === mapId && Boolean(tail.autoFarm) === autoFarm && tail.count < REGULAR_ENEMY_LOOT_BATCH_MAX) {
        tail.count++;
        const entry = tail.enemies.find(entry => entry.enemy === enemy);
        if (entry) entry.count++; else tail.enemies.push({ enemy, count: 1 });
      }
      else state.batches.push({ sequence: state.nextSequence++, mapId, count: 1, enemies: [{ enemy, count: 1 }], sealed: false, autoFarm });
      persist();
    },
    reset() { cancelBossRetry(); bossRetryDelay = 2_000; epoch++; inFlight = null; if (owner) { state = empty(); persist(); } },
    clear() { cancelBossRetry(); bossRetryDelay = 2_000; epoch++; owner = ""; state = null; adopted = []; key = ""; inFlight = null; },
  };
}
