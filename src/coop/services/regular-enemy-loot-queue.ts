import { REGULAR_KILL_REPORT_SECONDS } from "../../../shared/rules";
import { combatMap, type EnemyDefeat } from "../../../shared/enemy-defeats";
import { withRequestDeadline } from "./request-deadline";
import { wallClockNowMs } from "../../app/trusted-clock";
import { REGULAR_ENEMY_LOOT_BATCH_MAX } from "../../../shared/regular-map-loot";

// A healthy socket can still have a slow reducer acknowledgement. Keep this
// below the map transition's 30-second deadline, with room for loadout sync.
export const ENEMY_DEFEAT_ACK_TIMEOUT_MS = 15_000;
export const ENEMY_DEFEAT_BATCH_TIMEOUT_MS = 25_000;

/**
 * simulatedMillis is the game time this tab simulated between sealing its
 * previous report and sealing this one. Until a batch is sealed it holds the
 * time so far, so a batch left behind by a closed page still says how much
 * play produced it. Batches saved before it existed read as 0, "unknown".
 */
type Batch = { sequence: number; mapId: string; count: number; sealed: boolean; enemies: EnemyDefeat[]; autoFarm?: boolean; simulatedMillis?: number };
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
export type EnemyLootRequest = { streamId: string; sequence: bigint; mapId: string; count: number; enemies: EnemyDefeat[]; autoFarm: boolean; simulatedMillis: number };
/** The reducer argument is a u32. */
export const MAX_SIMULATED_MILLIS = 4_294_967_295;
/** Batches begun after a drain started that it still sends. */
export const DRAIN_EXTRA_BATCHES = 2;
/** Game time with no kills that a report still carries before its first kill: one report's worth. */
export const IDLE_SIMULATION_ALLOWANCE_SECONDS = REGULAR_KILL_REPORT_SECONDS;

function simulatedMillisBetween(fromSeconds: number, toSeconds: number) {
  const millis = Math.round((toSeconds - fromSeconds) * 1_000);
  return Number.isFinite(millis) ? Math.min(MAX_SIMULATED_MILLIS, Math.max(0, millis)) : 0;
}

function validSimulatedMillis(value: unknown) {
  return value === undefined || (Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_SIMULATED_MILLIS);
}

/** Persist before sending and retry the same sequence after an interrupted reply. */
export function createRegularEnemyLootQueue(options: {
  identity: () => string;
  tabId: () => string;
  storage: Storage;
  send: (request: EnemyLootRequest) => Promise<boolean | "discard" | "throttled">;
  /** Seconds of game simulation run so far on this page; monotonic. */
  simulatedSeconds?: () => number;
}) {
  let owner = "", key = "", epoch = 0;
  // Where the last sealed report's simulated time ended. Set at the first
  // begin() for each character and deliberately not reset by a reconnect's
  // begin(): kills made before a reconnect are still in the unsealed batch,
  // and the game time that produced them belongs to it.
  let lastSealedSimulatedSeconds: number | null = null;
  let lastBegunOwner = "";
  // The game time of the first kill since that seal. A report is charged from
  // no earlier than IDLE_SIMULATION_ALLOWANCE_SECONDS before it: the game runs
  // in menus, at Home and while another device holds the session's reports,
  // and time with no kills in it says nothing about how fast they came.
  let firstPendingKillSimulatedSeconds: number | null = null;
  const begunOwners = new Set<string>();
  const simulatedSecondsNow = () => {
    let seconds = 0;
    try { seconds = options.simulatedSeconds?.() ?? 0; } catch {}
    return Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  };
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
    const throttleDelay = Math.min(30_000, Math.max(0, (state.retryAtMs ?? 0) - wallClockNowMs()));
    bossRetryTimer = setTimeout(() => {
      bossRetryTimer = null;
      if (retryEpoch !== epoch) return;
      bossRetryDelay = Math.min(60_000, bossRetryDelay * 2);
      void flush(true);
    }, Math.max(bossRetryDelay, throttleDelay));
  }
  const empty = (): State => ({ streamId: crypto.randomUUID(), nextSequence: 1, batches: [] });
  function write(storageKey: string, value: State) {
    value.touchedAtMs = wallClockNowMs();
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
            validSimulatedMillis(batch.simulatedMillis) &&
            (Array.isArray(batch.enemies) && batch.enemies.every(entry => typeof entry.enemy === "string" && Number.isInteger(entry.count) && entry.count > 0) && batch.enemies.reduce((sum, entry) => sum + entry.count, 0) === batch.count))) return saved;
    } catch {}
    return null;
  }
  function adoptOrphans() {
    adopted = [];
    const prefix = `${QUEUE_KEY_PREFIX}${owner}:`, now = wallClockNowMs();
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
    if (owner !== lastBegunOwner) {
      // Another character's play on this page is not this one's to report.
      lastBegunOwner = owner;
      lastSealedSimulatedSeconds = simulatedSecondsNow();
      firstPendingKillSimulatedSeconds = null;
    }
    if (!begunOwners.has(owner)) {
      // This character's first begin on this page. Whatever is still unsealed
      // was simulated by an earlier page, whose clock is gone: seal it with the
      // time it recorded, so this page's first report does not have to cover
      // those kills as well.
      begunOwners.add(owner);
      let sealed = false;
      for (const batch of state.batches) if (!batch.sealed) { batch.sealed = true; sealed = true; }
      if (sealed) persist();
    }
    adoptOrphans();
    scheduleBossRetry();
  }
  /**
   * Seals every unsealed batch of this page's stream at once and splits the
   * game time since the previous seal between them: each keeps the share it
   * recorded (from the end of the batch before it to its own last kill), and
   * the last takes the rest. Sealing one batch per send gave the first the
   * whole interval and every later one only the round trip it waited behind
   * it, so a flush of several full batches reported its kills against almost
   * no game time.
   */
  function sealPending(stream: State) {
    const now = simulatedSecondsNow();
    const total = simulatedMillisBetween(claimStart(now), now);
    const pending = stream.batches.filter(batch => !batch.sealed);
    let given = 0;
    pending.forEach((batch, index) => {
      const left = Math.max(0, total - given);
      batch.simulatedMillis = index === pending.length - 1 ? left : Math.min(left, Math.max(0, batch.simulatedMillis ?? 0));
      given += batch.simulatedMillis;
      batch.sealed = true;
    });
    lastSealedSimulatedSeconds = Math.max(lastSealedSimulatedSeconds ?? now, now);
    firstPendingKillSimulatedSeconds = null;
  }
  /** Where the next report's game time starts: the last seal, or shortly before the first kill after it. */
  function claimStart(now: number) {
    const sealedAt = lastSealedSimulatedSeconds ?? now;
    return firstPendingKillSimulatedSeconds === null ? sealedAt
      : Math.max(sealedAt, firstPendingKillSimulatedSeconds - IDLE_SIMULATION_ALLOWANCE_SECONDS);
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
    if (Number.isFinite(state.retryAtMs) && state.retryAtMs! > wallClockNowMs() && state.retryAtMs! <= wallClockNowMs() + 30_000) { scheduleBossRetry(); return Promise.resolve(false); }
    const current = state, runEpoch = epoch, runOwner = owner;
    const batchLimit = current.batches.length;
    // One stream at a time, oldest first: adopted queues before this tab's own.
    const sendStream = async (stream: State, storageKey: string, limit: number) => {
      let sent = 0;
      // A drain also takes batches begun while it runs, but only a couple: with
      // kills landing every round trip it would otherwise send a report per
      // round trip for as long as the fight went on.
      while (stream.batches.length && sent < (drain ? limit + DRAIN_EXTRA_BATCHES : limit)) {
        const batch = stream.batches[0];
        // An adopted orphan keeps whatever time its own page recorded.
        if (!batch.sealed) {
          if (stream === current) sealPending(stream);
          else batch.sealed = true;
        }
        write(storageKey, stream);
        let accepted: boolean | "discard" | "throttled" = false;
        try { accepted = await withRequestDeadline(options.send({ streamId: stream.streamId, sequence: BigInt(batch.sequence), mapId: batch.mapId, count: batch.count, enemies: batch.enemies, autoFarm: Boolean(batch.autoFarm), simulatedMillis: batch.simulatedMillis ?? 0 }), ENEMY_DEFEAT_BATCH_TIMEOUT_MS); } catch {}
        if (epoch !== runEpoch || options.identity() !== runOwner) return false;
        if (accepted === "throttled") { stream.retryAtMs = wallClockNowMs() + 30_000; write(storageKey, stream); return false; }
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
      let target = tail;
      if (tail && !tail.sealed && tail.mapId === mapId && Boolean(tail.autoFarm) === autoFarm && tail.count < REGULAR_ENEMY_LOOT_BATCH_MAX) {
        tail.count++;
        const entry = tail.enemies.find(entry => entry.enemy === enemy);
        if (entry) entry.count++; else tail.enemies.push({ enemy, count: 1 });
      }
      else state.batches.push(target = { sequence: state.nextSequence++, mapId, count: 1, enemies: [{ enemy, count: 1 }], sealed: false, autoFarm });
      // The time so far, kept only for a reload; sealing replaces it. Earlier
      // unsealed batches already hold their share, so this one takes the rest.
      const now = simulatedSecondsNow();
      firstPendingKillSimulatedSeconds ??= now;
      const sinceSeal = simulatedMillisBetween(claimStart(now), now);
      const earlier = state.batches.reduce((sum, batch) => batch === target || batch.sealed ? sum : sum + (batch.simulatedMillis ?? 0), 0);
      target!.simulatedMillis = Math.max(0, sinceSeal - earlier);
      persist();
    },
    reset() { cancelBossRetry(); bossRetryDelay = 2_000; epoch++; inFlight = null; if (owner) { state = empty(); persist(); } },
    clear() { cancelBossRetry(); bossRetryDelay = 2_000; epoch++; owner = ""; state = null; adopted = []; key = ""; inFlight = null; },
  };
}
