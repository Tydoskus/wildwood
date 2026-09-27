import { describe, expect, it } from "vitest";
import { captureNativeClocks, createGameClock, GAME_CLOCK_TOLERANCE_MS, type ClockSource } from "./trusted-clock";

const FRAME_MS = 1_000 / 60;
const EPOCH_MS = 1_790_000_000_000;

/** Small deterministic PRNG so jitter is the same on every run. */
function random(seed: number) {
  return () => {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
    return seed / 2 ** 32;
  };
}

type Clocks = { frame: number; performance: number; date: number; timeline: number };

/**
 * Drives a game clock the way the foreground loop does: one sample per rAF
 * callback. The frame timestamp is the vsync time; performance.now is read a
 * few jittery milliseconds into the callback; Date counts whole milliseconds;
 * the timeline reports the frame's time. `distort` lets a test tamper with any
 * reading. Returns the grants and the true time elapsed.
 */
function runFrames(options: {
  seconds: number;
  seed?: number;
  distort?: (clocks: Clocks, frame: number) => Clocks;
}) {
  const next = random(options.seed ?? 1);
  const distort = options.distort ?? (clocks => clocks);
  let current: Clocks = distort({ frame: 0, performance: 0, date: EPOCH_MS, timeline: 0 }, 0);
  const sources: ClockSource[] = [() => current.performance, () => current.date, () => current.timeline];
  const clock = createGameClock(sources);
  // As in the game: the loop presents frames before the session starts, and
  // start() reanchors, so every simulated frame has a frame delta.
  clock.sample(current.frame);
  clock.reanchor();
  const grants: number[] = [];
  let trueNow = 0;
  const frames = Math.round(options.seconds * 60);
  for (let frame = 1; frame <= frames; frame++) {
    // Frames land on vsync with a little scheduling noise; the callback runs up to 4 ms later.
    const vsync = frame * FRAME_MS + (next() - .5) * .5;
    const callbackDelay = next() * 4;
    trueNow = vsync + callbackDelay;
    current = distort({
      frame: vsync,
      performance: trueNow,
      date: Math.floor(EPOCH_MS + trueNow + (next() - .5) * .2),
      timeline: vsync,
    }, frame);
    grants.push(clock.sample(current.frame));
  }
  return { grants, total: grants.reduce((sum, grant) => sum + grant, 0), trueElapsed: trueNow };
}

describe("game clock", () => {
  it("grants honest, jittery clocks at least 99.5% of real time over a minute", () => {
    for (const seed of [1, 7, 42, 1_234]) {
      const { total, trueElapsed } = runFrames({ seconds: 60, seed });
      expect(total).toBeGreaterThanOrEqual(trueElapsed * .995);
      expect(total).toBeLessThanOrEqual(trueElapsed + GAME_CLOCK_TOLERANCE_MS);
    }
  });

  it("gains nothing when any clock but not every clock runs five times fast", () => {
    const names = ["frame", "performance", "date", "timeline"] as const;
    for (let mask = 1; mask < (1 << names.length) - 1; mask++) {
      const hooked = names.filter((_, index) => mask & (1 << index));
      const { total, trueElapsed } = runFrames({
        seconds: 20,
        distort: clocks => {
          const next = { ...clocks };
          for (const name of hooked) next[name] = name === "date" ? EPOCH_MS + (clocks.date - EPOCH_MS) * 5 : clocks[name] * 5;
          return next;
        },
      });
      expect(total, `hooked: ${hooked.join(", ")}`).toBeLessThanOrEqual(trueElapsed + GAME_CLOCK_TOLERANCE_MS);
    }
  });

  it("keeps running at full speed after Date jumps backwards", () => {
    const jumpFrame = 600;
    const { grants } = runFrames({
      seconds: 20,
      distort: (clocks, frame) => frame >= jumpFrame ? { ...clocks, date: clocks.date - 3_600_000 } : clocks,
    });
    // At most the one frame that saw the jump is short; every later frame runs.
    const short = grants.slice(jumpFrame).filter(grant => grant < FRAME_MS * .5);
    expect(short.length).toBeLessThanOrEqual(1);
    const after = grants.slice(jumpFrame + 1).reduce((sum, grant) => sum + grant, 0);
    expect(after).toBeGreaterThan((grants.length - jumpFrame - 1) * FRAME_MS - FRAME_MS - GAME_CLOCK_TOLERANCE_MS);
  });

  it("grants nothing extra when Date jumps forwards", () => {
    const { total, trueElapsed } = runFrames({
      seconds: 20,
      distort: (clocks, frame) => frame >= 600 ? { ...clocks, date: clocks.date + 3_600_000 } : clocks,
    });
    expect(total).toBeLessThanOrEqual(trueElapsed + GAME_CLOCK_TOLERANCE_MS);
  });

  it("drops a backlog on reanchor without granting it", () => {
    let now = 0;
    const clock = createGameClock([() => now, () => EPOCH_MS + now]);
    now = 100;
    expect(clock.sample()).toBeCloseTo(100);
    now = 5_000;
    clock.reanchor();
    now = 5_050;
    expect(clock.sample()).toBeCloseTo(50);
  });

  it("caps each reading at one second, as the old per-wake cap did", () => {
    let now = 0;
    const clock = createGameClock([() => now, () => EPOCH_MS + now]);
    now = 60_000;
    expect(clock.sample()).toBe(1_000);
  });

  it("leaves out a clock that stops reporting and rejoins it at the time already granted", () => {
    let now = 0, timeline: number | null = 0;
    const clock = createGameClock([() => now, () => timeline]);
    timeline = null; // hidden: the timeline freezes
    now = 400;
    expect(clock.sample()).toBeCloseTo(400);
    timeline = 123_456; // visible again, with an unrelated value
    now = 450;
    expect(clock.sample()).toBe(0);
    now = 500; timeline = 123_506;
    expect(clock.sample()).toBeCloseTo(50);
  });

  it("runs nothing when no clock can be read", () => {
    const clock = createGameClock([() => null]);
    expect(clock.sample(16)).toBe(0);
    expect(clock.sample(33)).toBe(0);
  });
});

describe("captured browser clocks", () => {
  function fakeBrowser() {
    let now = 1_000, hidden = false, timelineNow: number | null = 500;
    class FakePerformance { now() { return now; } }
    class FakeTimeline { get currentTime() { return timelineNow; } }
    const timeline = new FakeTimeline();
    class FakeDocument {
      get hidden() { return hidden; }
      get timeline() { return timeline; }
    }
    const scope = {
      Performance: FakePerformance,
      performance: new FakePerformance(),
      Date: { now: () => EPOCH_MS + now } as unknown as DateConstructor,
      Document: FakeDocument,
      document: new FakeDocument(),
      AnimationTimeline: FakeTimeline,
      requestAnimationFrame: (callback: FrameRequestCallback) => { callback(now); return 7; },
      setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 2, clearInterval: () => {},
    };
    return {
      scope,
      set: (next: { now?: number; hidden?: boolean; timeline?: number | null }) => {
        now = next.now ?? now; hidden = next.hidden ?? hidden;
        if (next.timeline !== undefined) timelineNow = next.timeline;
      },
    };
  }

  it("ignores clocks, visibility and frames replaced after capture", () => {
    const browser = fakeBrowser();
    const clocks = captureNativeClocks(browser.scope as never);
    // The usual console speed hacks, applied after the game has booted.
    Object.defineProperty(browser.scope.performance, "now", { value: () => 999_999 });
    browser.scope.Date.now = () => 0;
    Object.defineProperty(browser.scope.document, "hidden", { value: true });
    browser.scope.requestAnimationFrame = () => { throw new Error("hooked"); };
    browser.set({ now: 2_000 });
    expect(clocks.monotonicNowMs()).toBe(2_000);
    expect(clocks.wallClockNowMs()).toBe(EPOCH_MS + 2_000);
    expect(clocks.documentHidden()).toBe(false);
    expect(clocks.timelineNowMs()).toBe(500);
    let frameAt = 0;
    expect(clocks.requestFrame(at => { frameAt = at; })).toBe(7);
    expect(frameAt).toBe(2_000);
    browser.set({ hidden: true, timeline: null });
    expect(clocks.documentHidden()).toBe(true);
    expect(clocks.timelineNowMs()).toBeNull();
  });

  it("falls back to working clocks where an API is missing", () => {
    const clocks = captureNativeClocks({
      Date: { now: () => 42 } as unknown as DateConstructor,
      setTimeout: (callback: () => void) => { callback(); return 3; },
      clearTimeout: () => {}, setInterval: () => 4, clearInterval: () => {},
    });
    expect(clocks.monotonicNowMs()).toBe(42);
    expect(clocks.documentHidden()).toBe(false);
    expect(clocks.timelineNowMs()).toBeNull();
    let frameAt = -1;
    clocks.requestFrame(at => { frameAt = at; });
    expect(frameAt).toBe(42);
  });
});
