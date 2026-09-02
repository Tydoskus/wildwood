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

  it("backs off automatic retries, caps them, and resets after recovery", () => {
    const delays: number[] = [];
    let callback = () => {};
    const scheduler = createReconnectScheduler({
      canAttempt: () => true,
      onlineHint: () => true,
      connect: vi.fn(),
      baseDelayMs: 1_000,
      maxDelayMs: 4_000,
      jitterRatio: 0,
      scheduleTimer: (scheduled, delayMs) => {
        callback = scheduled;
        delays.push(delayMs);
        return delays.length;
      },
      cancelTimer: vi.fn(),
    });

    scheduler.schedule();
    callback();
    scheduler.schedule();
    callback();
    scheduler.schedule();
    callback();
    scheduler.schedule();
    callback();

    expect(delays).toEqual([1_000, 2_000, 4_000, 4_000]);
    expect(scheduler.attemptCount()).toBe(4);
    scheduler.reset();
    scheduler.schedule();
    expect(delays.at(-1)).toBe(1_000);
  });

  it("applies bounded jitter only to automatic retries", () => {
    const delays: number[] = [];
    const scheduler = createReconnectScheduler({
      canAttempt: () => true,
      onlineHint: () => true,
      connect: vi.fn(),
      baseDelayMs: 1_000,
      jitterRatio: .2,
      random: () => 0,
      scheduleTimer: (_scheduled, delayMs) => { delays.push(delayMs); return delays.length; },
      cancelTimer: vi.fn(),
    });

    scheduler.schedule();
    expect(delays[0]).toBe(800);
    scheduler.clear();
    scheduler.schedule(75);
    expect(delays[1]).toBe(75);
  });
});
