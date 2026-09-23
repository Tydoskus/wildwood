import { describe, expect, it, vi } from "vitest";
import { createFrameCoalescer, type FrameCoalescerScheduler } from "./frame-coalescer";

function manualScheduler(hidden = false) {
  let nextHandle = 1;
  const frames = new Map<number, () => void>();
  const timers = new Map<number, { callback: () => void; delayMs: number }>();
  const state = { hidden };
  const scheduler: FrameCoalescerScheduler = {
    requestFrame: (callback) => { const handle = nextHandle++; frames.set(handle, callback); return handle; },
    cancelFrame: (handle) => { frames.delete(handle); },
    setTimer: (callback, delayMs) => { const handle = nextHandle++; timers.set(handle, { callback, delayMs }); return handle; },
    clearTimer: (handle) => { timers.delete(handle); },
    hidden: () => state.hidden,
  };
  return {
    scheduler,
    state,
    frames,
    timers,
    runFrame() { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); },
    runTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach(entry => entry.callback()); },
  };
}

describe("frame coalescer", () => {
  it("runs a burst of requests once on the next frame", () => {
    const clock = manualScheduler();
    const run = vi.fn();
    const coalescer = createFrameCoalescer(run, clock.scheduler);
    for (let index = 0; index < 20; index += 1) coalescer.request();
    expect(run).not.toHaveBeenCalled();
    expect(clock.frames.size).toBe(1);
    clock.runFrame();
    expect(run).toHaveBeenCalledTimes(1);
    // The backstop timer was cancelled with the frame.
    expect(clock.timers.size).toBe(0);
  });

  it("uses a timer in a hidden tab, where animation frames never fire", () => {
    const clock = manualScheduler(true);
    const run = vi.fn();
    const coalescer = createFrameCoalescer(run, clock.scheduler);
    coalescer.request();
    coalescer.request();
    expect(clock.frames.size).toBe(0);
    expect([...clock.timers.values()][0]?.delayMs).toBe(0);
    clock.runTimers();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("still runs when the tab hides after the frame was requested", () => {
    const clock = manualScheduler();
    const run = vi.fn();
    const coalescer = createFrameCoalescer(run, clock.scheduler, 250);
    coalescer.request();
    clock.state.hidden = true;
    expect([...clock.timers.values()][0]?.delayMs).toBe(250);
    clock.runTimers();
    expect(run).toHaveBeenCalledTimes(1);
    clock.runFrame();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("flushes a pending request synchronously and not again later", () => {
    const clock = manualScheduler();
    const run = vi.fn();
    const coalescer = createFrameCoalescer(run, clock.scheduler);
    coalescer.flush();
    expect(run).not.toHaveBeenCalled();
    coalescer.request();
    coalescer.flush();
    expect(run).toHaveBeenCalledTimes(1);
    clock.runFrame();
    clock.runTimers();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("schedules a fresh pass for a request made while running", () => {
    const clock = manualScheduler();
    let coalescer!: ReturnType<typeof createFrameCoalescer>;
    let calls = 0;
    coalescer = createFrameCoalescer(() => { calls += 1; if (calls === 1) coalescer.request(); }, clock.scheduler);
    coalescer.request();
    clock.runFrame();
    expect(calls).toBe(1);
    expect(coalescer.pending()).toBe(true);
    clock.runFrame();
    expect(calls).toBe(2);
    expect(coalescer.pending()).toBe(false);
  });
});
