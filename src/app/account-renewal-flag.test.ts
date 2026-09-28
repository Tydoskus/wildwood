import { describe, expect, it, vi } from "vitest";
import { ACCOUNT_RENEWAL_FLAG, accountRenewalStartedAt, afterAccountRenewal, markAccountRenewal, whenAccountRenewalSettled } from "./account-renewal-flag";

function memory() {
  const values = new Map<string, string>();
  return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => void values.set(k, v), removeItem: (k: string) => void values.delete(k) };
}

describe("account renewal flag", () => {
  it("reads a renewal as running until it is cleared, and a two-minute-old flag as a leftover", () => {
    const storage = memory();
    expect(accountRenewalStartedAt(storage, 1_000)).toBeNull();
    markAccountRenewal(true, storage, 1_000);
    expect(accountRenewalStartedAt(storage, 60_000)).toBe(1_000);
    expect(accountRenewalStartedAt(storage, 121_000)).toBeNull();
    markAccountRenewal(false, storage);
    expect(storage.getItem(ACCOUNT_RENEWAL_FLAG)).toBeNull();
  });

  it("navigates at once with nothing running, and only after a running renewal settles", async () => {
    vi.useFakeTimers({ now: 10_000 });
    try {
      const storage = memory(), navigate = vi.fn();
      afterAccountRenewal(navigate, storage);
      expect(navigate).toHaveBeenCalledOnce();
      markAccountRenewal(true, storage, 10_000);
      afterAccountRenewal(navigate, storage);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(navigate).toHaveBeenCalledOnce();
      markAccountRenewal(false, storage);
      await vi.advanceTimersByTimeAsync(100);
      expect(navigate).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });

  it("stops waiting after the cap, so a hung request never holds an update", async () => {
    vi.useFakeTimers({ now: 10_000 });
    try {
      const storage = memory();
      markAccountRenewal(true, storage, 10_000);
      let settled = false;
      void whenAccountRenewalSettled(20_000, storage).then(() => { settled = true; });
      await vi.advanceTimersByTimeAsync(19_900);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(200);
      expect(settled).toBe(true);
    } finally { vi.useRealTimers(); }
  });
});
