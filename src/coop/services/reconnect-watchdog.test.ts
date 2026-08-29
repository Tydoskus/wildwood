import { describe, expect, it, vi } from "vitest";
import { createReconnectWatchdog } from "./reconnect-watchdog";

describe("reconnect watchdog", () => {
  it("retries a stalled visible reconnect until its gate clears", () => {
    let watching = true;
    let nextTimer = 0;
    const callbacks = new Map<number, () => void>();
    const onTimeout = vi.fn();
    const watchdog = createReconnectWatchdog({
      delayMs: 10_000,
      shouldWatch: () => watching,
      onTimeout,
      schedule: (callback) => {
        nextTimer += 1;
        callbacks.set(nextTimer, callback);
        return nextTimer;
      },
      cancel: (timer) => { callbacks.delete(timer); },
    });

    watchdog.refresh();
    expect(watchdog.isArmed()).toBe(true);
    callbacks.get(1)?.();
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(watchdog.isArmed()).toBe(true);

    watching = false;
    callbacks.get(2)?.();
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(watchdog.isArmed()).toBe(false);
  });

  it("does not arm while recovery is unnecessary", () => {
    const watchdog = createReconnectWatchdog({
      delayMs: 10_000,
      shouldWatch: () => false,
      onTimeout: vi.fn(),
      schedule: vi.fn(() => 1),
      cancel: vi.fn(),
    });

    watchdog.refresh();
    expect(watchdog.isArmed()).toBe(false);
  });

  it("keeps one absolute deadline through repeated reconnect attempts", () => {
    let nextTimer = 0;
    const callbacks = new Map<number, () => void>();
    const delays = new Map<number, number>();
    const onDeadline = vi.fn();
    const watchdog = createReconnectWatchdog({
      delayMs: 10_000,
      shouldWatch: () => true,
      onTimeout: vi.fn(),
      deadlineMs: 4_000,
      shouldUseDeadline: () => true,
      onDeadline,
      schedule: (callback, delayMs) => {
        nextTimer += 1;
        callbacks.set(nextTimer, callback);
        delays.set(nextTimer, delayMs);
        return nextTimer;
      },
      cancel: (timer) => { callbacks.delete(timer); },
    });

    watchdog.refresh();
    const deadlineTimer = [...delays].find(([, delay]) => delay === 4_000)?.[0];
    watchdog.refresh();
    watchdog.refresh();

    expect(deadlineTimer).toBeDefined();
    expect(callbacks.has(deadlineTimer!)).toBe(true);
    callbacks.get(deadlineTimer!)?.();
    expect(onDeadline).toHaveBeenCalledTimes(1);
  });
});
