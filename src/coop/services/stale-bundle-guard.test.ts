import { describe, expect, it, vi } from "vitest";
import { createStaleBundleGuard, STALE_BUNDLE_FAILURES } from "./stale-bundle-guard";

function memory() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe("stale bundle guard", () => {
  it("reloads after repeated undecodable frames, once per version per tab", () => {
    const storage = memory(), reload = vi.fn();
    const guard = createStaleBundleGuard({ version: "0.799", storage: () => storage, reload });
    for (let n = 1; n < STALE_BUNDLE_FAILURES; n++) expect(guard.frameHandlerFailed()).toBe(false);
    expect(guard.frameHandlerFailed()).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
    // The same bundle after the reload: a fault a reload cannot fix never loops.
    const again = createStaleBundleGuard({ version: "0.799", storage: () => storage, reload });
    for (let n = 0; n < STALE_BUNDLE_FAILURES * 3; n++) again.frameHandlerFailed();
    expect(reload).toHaveBeenCalledOnce();
    // A newer bundle may reload for its own mismatch.
    const newer = createStaleBundleGuard({ version: "0.800", storage: () => storage, reload });
    for (let n = 0; n < STALE_BUNDLE_FAILURES; n++) newer.frameHandlerFailed();
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("forgets isolated failures once a connection hydrates", () => {
    const reload = vi.fn();
    const guard = createStaleBundleGuard({ version: "0.799", storage: () => memory(), reload });
    for (let n = 0; n < 5; n++) { guard.frameHandlerFailed(); guard.hydrated(); }
    expect(reload).not.toHaveBeenCalled();
  });
});

it('retries the handoff instead of consuming its only reload when session preservation fails', () => {
  const storage = memory(), reload = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
  const guard = createStaleBundleGuard({ version: '0.811', storage: () => storage, reload });
  guard.frameHandlerFailed();
  expect(guard.frameHandlerFailed()).toBe(false);
  expect(guard.frameHandlerFailed()).toBe(true);
});
