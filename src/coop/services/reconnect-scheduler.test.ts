import { describe, expect, it, vi } from "vitest";
import { createReconnectScheduler } from "./reconnect-scheduler";

describe("reconnect scheduler", () => {
  it("lets wake recovery bypass a stale offline browser hint", () => {
    let onlineHint = false;
    let nextTimer = 0;
    const callbacks = new Map<number, () => void>();
    const connect = vi.fn();
    const scheduler = createReconnectScheduler({
      canAttempt: () => true,
      onlineHint: () => onlineHint,
      connect,
      scheduleTimer: (callback) => {
        nextTimer += 1;
        callbacks.set(nextTimer, callback);
        return nextTimer;
      },
      cancelTimer: (timer) => { callbacks.delete(timer); },
    });

    expect(scheduler.schedule(100)).toBe(false);
    expect(scheduler.schedule(100, true)).toBe(true);
    callbacks.get(1)?.();
    expect(connect).toHaveBeenCalledTimes(1);

    onlineHint = true;
    expect(scheduler.schedule(100)).toBe(true);
  });

  it("rechecks ordinary online and connection state before firing", () => {
    let onlineHint = true;
    let canAttempt = true;
    let callback = () => {};
    const connect = vi.fn();
    const scheduler = createReconnectScheduler({
      canAttempt: () => canAttempt,
      onlineHint: () => onlineHint,
      connect,
      scheduleTimer: (scheduled) => { callback = scheduled; return 1; },
      cancelTimer: vi.fn(),
    });

    scheduler.schedule(100);
    onlineHint = false;
    callback();
    expect(connect).not.toHaveBeenCalled();

    onlineHint = true;
    scheduler.schedule(100);
    canAttempt = false;
    callback();
    expect(connect).not.toHaveBeenCalled();
  });
});
