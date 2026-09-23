import { CONNECTION_DIAGNOSTIC_BATCH_LIMIT, CONNECTION_DIAGNOSTIC_QUEUE_LIMIT, normalizeConnectionDiagnostic, type ConnectionDiagnostic, type ConnectionEventKind } from "../../../shared/connection-diagnostics";

type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;
/** An empty owner means "whoever connects next in this tab", for events that
 * happen before any identity exists, such as a trip to the sign-in page. */
type Queued = { owner: string; sample: ConnectionDiagnostic };
export function createConnectionDiagnostics(options: {
  snapshot: () => Partial<ConnectionDiagnostic> & { owner: string };
  submit: () => ((payload: string) => Promise<unknown>) | null;
  storage?: StoragePort; storageKey: string; now?: () => number;
}) {
  const now = options.now ?? Date.now;
  let storage = options.storage;
  if (!storage) { try { storage = sessionStorage; } catch {} }
  let queue: Queued[] = [];
  let flushing: Promise<void> | null = null;
  let inFlight = new Set<string>();
  let lastEvent = ""; let lastEventAt = 0;
  function persist() { try { storage?.setItem(options.storageKey, JSON.stringify(queue)); } catch {} }
  try {
    const saved = JSON.parse(storage?.getItem(options.storageKey) ?? "[]");
    if (Array.isArray(saved)) queue = saved.slice(-CONNECTION_DIAGNOSTIC_QUEUE_LIMIT).flatMap(row => {
      const sample = normalizeConnectionDiagnostic(row?.sample);
      return sample && typeof row.owner === "string" && /^(?:[0-9a-f]{64})?$/i.test(row.owner) && now() - sample.occurredAtMs < 7 * 864e5 ? [{ owner: row.owner, sample }] : [];
    });
  } catch {}
  function flush() {
    if (flushing) return flushing;
    const submit = options.submit(); const owner = options.snapshot().owner;
    if (!submit || !owner) return Promise.resolve();
    flushing = (async () => {
      // Bound work per flush. A busy connection must not create a send loop.
      const batch = queue.filter(row => row.owner === owner || !row.owner).slice(0, CONNECTION_DIAGNOSTIC_BATCH_LIMIT);
      if (!batch.length) return;
      inFlight = new Set(batch.map(row => row.sample.eventId));
      try {
        await submit(JSON.stringify(batch.map(row => row.sample)));
        queue = queue.filter(row => !inFlight.has(row.sample.eventId));
        persist();
      } catch { /* Preserve the queue for the next authenticated connection. */ }
      finally { inFlight.clear(); }
    })().finally(() => { flushing = null; });
    return flushing;
  }
  function record(kind: ConnectionEventKind, extra: Partial<ConnectionDiagnostic> = {}, carry = false) {
    try {
      const { owner: current, ...context } = options.snapshot();
      const owner = carry ? "" : current;
      if (!carry && (!owner || !/^[0-9a-f]{64}$/i.test(owner))) return;
      const eventKey = `${kind}:${extra.transport ?? context.transport}:${extra.detail ?? ""}`;
      if (eventKey === lastEvent && now() - lastEventAt < 1000) return;
      lastEvent = eventKey; lastEventAt = now();
      const sample = normalizeConnectionDiagnostic({ ...context, ...extra, kind, occurredAtMs: now(), eventId: crypto.randomUUID() });
      if (!sample) return;
      if (queue.length >= CONNECTION_DIAGNOSTIC_QUEUE_LIMIT) {
        const index = queue.findIndex(row => !inFlight.has(row.sample.eventId));
        if (index < 0) return;
        queue.splice(index, 1);
      }
      queue.push({ owner, sample }); persist();
    } catch { /* Diagnostics must never interrupt gameplay. */ }
  }
  return { record, flush, pending: () => queue.length };
}
