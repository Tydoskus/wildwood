/** Consecutive frames the SDK could not decode before this bundle counts as stale. */
export const STALE_BUNDLE_FAILURES = 2;

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

/**
 * A frame the SDK cannot decode means this bundle's generated bindings no
 * longer match the published schema: a column was added to a table it reads.
 * Such a tab used to retry every thirty seconds for hours, because nothing it
 * saw said it was out of date. After repeated failures with no successful
 * hydration in between it reloads onto the current bundle, at most once per
 * version per tab, so a fault that a reload cannot fix never becomes a loop.
 * Unsent kills are safe: the loot queue lives in localStorage.
 */
export function createStaleBundleGuard(options: {
  version: string;
  storage?: () => Storage | undefined;
  reload?: () => void;
}) {
  const storage = options.storage ?? (() => { try { return sessionStorage; } catch { return undefined; } });
  const reload = options.reload ?? (() => window.location.reload());
  const key = `wildstat-stale-bundle-reload:${options.version}`;
  let failures = 0;
  return {
    /** Returns true when it reloaded. */
    frameHandlerFailed() {
      failures += 1;
      if (failures < STALE_BUNDLE_FAILURES) return false;
      try {
        const store = storage();
        if (!store || store.getItem(key)) return false;
        store.setItem(key, String(Date.now()));
      } catch { return false; }
      reload();
      return true;
    },
    hydrated() { failures = 0; },
  };
}
