import { describe, expect, it, vi } from "vitest";
import { createOfflineProgressPreference } from "./offline-progress-watch";

function fakeConnection(rows: Array<{ enabled: boolean }>, isActive = true) {
  let applied: (() => void) | null = null;
  const setOfflineProgressEnabled = vi.fn(async (_args: { enabled: boolean }) => undefined);
  const connection = {
    isActive,
    db: { myOfflinePreference: { iter: () => rows[Symbol.iterator](), onInsert: vi.fn(), onUpdate: vi.fn(), onDelete: vi.fn() } },
    subscriptionBuilder: () => ({ onApplied(callback: () => void) { applied = callback; return this; }, subscribe: vi.fn() }),
    reducers: { setOfflineProgressEnabled },
  };
  return { connection: connection as never, setOfflineProgressEnabled, settle: () => applied?.() };
}

describe("offline progress preference", () => {
  it("defaults on, mirrors the account row, and ignores a replaced connection", () => {
    const notify = vi.fn();
    const preference = createOfflineProgressPreference(() => null, notify);
    expect(preference.api.offlineProgressEnabled()).toBe(true);
    const conn = fakeConnection([{ enabled: false }]);
    preference.watch(conn.connection, () => true);
    conn.settle();
    expect(preference.api.offlineProgressEnabled()).toBe(false);
    expect(notify).toHaveBeenCalled();

    const stale = fakeConnection([{ enabled: true }]);
    preference.watch(stale.connection, () => false);
    stale.settle();
    expect(preference.api.offlineProgressEnabled()).toBe(false);
  });

  it("shows a change at once and sends it only while connected", async () => {
    const conn = fakeConnection([]);
    let current: ReturnType<typeof fakeConnection>["connection"] | null = null;
    const preference = createOfflineProgressPreference(() => current, vi.fn());
    await expect(preference.api.setOfflineProgressEnabled(false)).resolves.toBe(false);
    expect(preference.api.offlineProgressEnabled()).toBe(true);
    current = conn.connection;
    await expect(preference.api.setOfflineProgressEnabled(false)).resolves.toBe(true);
    expect(preference.api.offlineProgressEnabled()).toBe(false);
    expect(conn.setOfflineProgressEnabled).toHaveBeenCalledWith({ enabled: false });
  });
});
