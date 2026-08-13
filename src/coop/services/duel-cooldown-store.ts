export function createDuelCooldownStore(storage: Storage, keyPrefix: string) {
  return {
    read(identity: string) {
      if (!identity) return 0;
      try {
        const value = Number(storage.getItem(`${keyPrefix}${identity}`));
        return Number.isFinite(value) ? Math.max(0, value) : 0;
      } catch {
        return 0;
      }
    },
    write(identity: string, until: number) {
      if (!identity) return;
      try { storage.setItem(`${keyPrefix}${identity}`, String(until)); } catch {}
    },
  };
}
