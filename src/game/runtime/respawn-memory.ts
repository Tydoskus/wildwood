import { wallClockNowMs } from "../../app/trusted-clock";
type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Local defeat deadlines survive refresh; combat HP and rewards stay elsewhere. */
// The wall clock captured at boot: a Date.now override must not bring bosses back early.
export function createRespawnMemory(storage: StoragePort, identity: () => string, now = wallClockNowMs) {
  let owner = '', deadlines: Record<string, number> = Object.create(null);
  const storageKey = () => `wildstat-respawns-v1:${owner}`;
  function load() {
    const next = identity();
    if (next === owner) return;
    owner = next; deadlines = Object.create(null);
    if (!owner) return;
    try {
      const saved = JSON.parse(storage.getItem(storageKey()) ?? '{}');
      for (const [key, value] of Object.entries(saved)) {
        if (typeof value === 'number' && Number.isFinite(value) && value > now() && value <= now() + 120_000)
          deadlines[key] = value;
      }
    } catch {}
  }
  return {
    remaining(key: string) { load(); return Math.max(0, (deadlines[key] ?? 0) - now()); },
    remember(key: string, delayMs: number) {
      load(); if (!owner || !Number.isFinite(delayMs) || delayMs <= 0) return;
      const at = now();
      for (const key of Object.keys(deadlines)) if (deadlines[key] <= at) delete deadlines[key];
      deadlines[key] = at + Math.min(delayMs, 120_000);
      // Write at defeat time, before reward submission; pagehide isn't reliable.
      try { storage.setItem(storageKey(), JSON.stringify(deadlines)); } catch {}
    },
    clear() { load(); deadlines = Object.create(null); if (owner) { try { storage.removeItem(storageKey()); } catch {} } },
  };
}
export type RespawnMemory = ReturnType<typeof createRespawnMemory>;
