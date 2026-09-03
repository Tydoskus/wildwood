import { PORTAL_CUTSCENES, portalCutsceneBit } from "../../../shared/portal-cutscenes";

/** Server-owned history plus an identity-scoped retry queue for interrupted saves. */
export function createCutsceneHistory(options: {
  identity: () => string;
  storage: Storage;
  send: (cutscene: string, generation: number) => Promise<boolean>;
}) {
  let owner = "";
  let seenMask: number | null = null;
  let pendingMask = 0;
  let generation = 0;
  let epoch = 0;
  let inFlight: Promise<boolean> | null = null;
  const storageKey = (identity: string) => `wildstat-cutscene-pending-v1:${identity}`;
  function persist() {
    if (!owner) return;
    try {
      if (pendingMask) options.storage.setItem(storageKey(owner), JSON.stringify({ mask: pendingMask, generation }));
      else options.storage.removeItem(storageKey(owner));
    } catch {}
  }
  function begin() {
    epoch += 1;
    owner = options.identity();
    seenMask = null;
    inFlight = null;
    generation = 0;
    try {
      const saved = JSON.parse(options.storage.getItem(storageKey(owner)) ?? "null");
      pendingMask = (Number(saved?.mask) || 0) & 63;
      generation = Number.isSafeInteger(saved?.generation) && saved.generation >= 0 ? saved.generation : 0;
    } catch { pendingMask = 0; }
  }
  function flush(): Promise<boolean> {
    if (inFlight) return inFlight;
    if (!owner || owner !== options.identity() || seenMask === null) return Promise.resolve(!pendingMask);
    const runEpoch = epoch;
    const runOwner = owner;
    const operation = async () => {
      for (const scene of PORTAL_CUTSCENES) {
        const bit = portalCutsceneBit(scene.id);
        if (!(pendingMask & bit)) continue;
        let saved = false;
        try { saved = await options.send(scene.id, generation); } catch {}
        if (epoch !== runEpoch || options.identity() !== runOwner) return false;
        if (!saved) return false;
        seenMask = (seenMask ?? 0) | bit;
        pendingMask &= ~bit;
        persist();
      }
      return pendingMask === 0;
    };
    inFlight = operation().finally(() => { if (epoch === runEpoch) inFlight = null; });
    return inFlight;
  }
  return {
    begin,
    flush,
    upsert(identity: string, mask: number, serverGeneration = 0) {
      if (identity !== options.identity()) return;
      if (owner !== identity) begin();
      if (generation !== serverGeneration) {
        epoch += 1;
        inFlight = null;
        pendingMask = 0;
        generation = serverGeneration;
      }
      seenMask = mask & 63;
      pendingMask &= ~seenMask;
      persist();
    },
    hasSeen(cutscene: string) {
      const bit = portalCutsceneBit(cutscene);
      // Do not replay old result rows while character history is hydrating.
      return bit !== 0 && (owner !== options.identity() || seenMask === null || Boolean((seenMask | pendingMask) & bit));
    },
    mark(cutscene: string) {
      if (owner !== options.identity()) begin();
      const bit = portalCutsceneBit(cutscene);
      if (!owner || !bit || ((seenMask ?? 0) & bit)) return;
      pendingMask |= bit;
      persist();
      void flush();
    },
    reset() {
      epoch += 1;
      inFlight = null;
      pendingMask = 0;
      seenMask = 0;
      persist();
    },
    clear() {
      epoch += 1;
      owner = "";
      seenMask = null;
      pendingMask = 0;
      inFlight = null;
    },
  };
}
