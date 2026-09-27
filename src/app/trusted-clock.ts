/**
 * The browser's own clocks, captured when the bundle first runs.
 *
 * A speed hack is usually one line in the console: replace performance.now,
 * Date.now or requestAnimationFrame with a faster copy, or tell the game the
 * tab is hidden so the background loop runs without drawing. Every one of
 * those looks the global up again on each call, so gameplay here reads the
 * functions captured below instead. performance.now is taken from
 * Performance.prototype and bound to the real performance object, so a later
 * own-property override on `performance` never reaches it, and `hidden` is the
 * getter on document's prototype chain, so a spoofed own property or a
 * synthetic visibilitychange event cannot start the background loop.
 *
 * This stops console one-liners and generic speed-hack extensions that patch
 * globals after the page loads, including on the sign-in screen before the
 * game bundle arrives (see sharedNativeClocks). It cannot stop someone who edits the bundle or
 * hooks the prototypes before it runs; the server's own clocks stay the real
 * limit on rewards. Nothing here tells the player anything: a tampered clock is
 * simply not believed, and honest play never notices.
 *
 * Tests run with live lookups instead, so vi.useFakeTimers and stubbed globals
 * still drive the code under test. The production build folds that branch away.
 */

export type NativeTimers = {
  setTimeout: (callback: () => void, delayMs?: number) => number;
  clearTimeout: (handle: number | undefined) => void;
  setInterval: (callback: () => void, delayMs?: number) => number;
  clearInterval: (handle: number | undefined) => void;
};

export type NativeClocks = {
  /** Milliseconds from the captured performance.now: monotonic, sub-millisecond. */
  monotonicNowMs: () => number;
  /** Milliseconds since the Unix epoch from the captured Date.now. */
  wallClockNowMs: () => number;
  /** document.timeline.currentTime, or null where it does not exist or is not running. */
  timelineNowMs: () => number | null;
  documentHidden: () => boolean;
  requestFrame: (callback: FrameRequestCallback) => number;
  timers: NativeTimers;
};

type ClockScope = {
  performance?: Performance;
  Date: DateConstructor;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  setTimeout: (...args: any[]) => any;
  clearTimeout: (...args: any[]) => void;
  setInterval: (...args: any[]) => any;
  clearInterval: (...args: any[]) => void;
  document?: Document;
};

/**
 * The property as the platform defines it: looked up from the object's
 * prototype, never from the object itself, so an own property a page script
 * put there (`performance.now = ...`, `Object.defineProperty(document,
 * "hidden", ...)`) is skipped.
 */
function inherited(target: object | null | undefined, property: string): PropertyDescriptor | undefined {
  for (let prototype = target ? Object.getPrototypeOf(target) : null; prototype; prototype = Object.getPrototypeOf(prototype)) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
    if (descriptor) return descriptor;
  }
  return undefined;
}

function inheritedGetter<T>(target: object | null | undefined, property: string): (() => T) | null {
  const get = inherited(target, property)?.get;
  return target && typeof get === "function" ? get.bind(target) as () => T : null;
}

/**
 * Captures every clock from `scope` now. Bound functions call their target
 * directly, so later changes to Function.prototype.call or apply do not reach
 * them either. A missing API (a worker, an old browser, a test) falls back to
 * the nearest honest equivalent rather than throwing at boot.
 */
export function captureNativeClocks(scope: ClockScope): NativeClocks {
  const performanceObject = scope.performance;
  const performanceNow = inherited(performanceObject, "now")?.value ?? performanceObject?.now;
  const wallClockNowMs: () => number = scope.Date.now.bind(scope.Date);
  const monotonicNowMs: () => number = performanceObject && typeof performanceNow === "function"
    ? performanceNow.bind(performanceObject)
    : wallClockNowMs;
  const doc = scope.document;
  const readHidden = inheritedGetter<boolean>(doc, "hidden");
  // `timeline` is a getter too; the timeline object itself is read once, now.
  const timeline = inheritedGetter<AnimationTimeline | null>(doc, "timeline")?.() ?? null;
  const readTimeline = inheritedGetter<CSSNumberish | null>(timeline, "currentTime");
  const timers: NativeTimers = {
    setTimeout: scope.setTimeout.bind(scope),
    clearTimeout: scope.clearTimeout.bind(scope),
    setInterval: scope.setInterval.bind(scope),
    clearInterval: scope.clearInterval.bind(scope),
  };
  const requestAnimationFrame = scope.requestAnimationFrame;
  const requestFrame: (callback: FrameRequestCallback) => number = typeof requestAnimationFrame === "function"
    ? requestAnimationFrame.bind(scope)
    : callback => Number(timers.setTimeout(() => callback(monotonicNowMs()), 16));
  return {
    monotonicNowMs,
    wallClockNowMs,
    timelineNowMs() {
      const value = readTimeline?.();
      // CSSNumberish: a plain number in every browser that ships it.
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    },
    // Without the platform getter (never seen in a browser) the live property
    // is still better than assuming the tab is always visible.
    documentHidden: readHidden ? () => Boolean(readHidden()) : () => Boolean(doc?.hidden),
    requestFrame,
    timers,
  };
}

/** Test mode: look every global up on each call, exactly as the code did before. */
function liveClocks(): NativeClocks {
  const scope = globalThis as unknown as ClockScope & { window?: ClockScope };
  const timerScope = () => scope.window ?? scope;
  return {
    monotonicNowMs: () => performance.now(),
    wallClockNowMs: () => Date.now(),
    timelineNowMs: () => null,
    documentHidden: () => Boolean(scope.document?.hidden),
    requestFrame: callback => requestAnimationFrame(callback),
    timers: {
      setTimeout: (callback, delayMs) => timerScope().setTimeout(callback, delayMs),
      clearTimeout: handle => timerScope().clearTimeout(handle),
      setInterval: (callback, delayMs) => timerScope().setInterval(callback, delayMs),
      clearInterval: handle => timerScope().clearInterval(handle),
    },
  };
}

/** Where the first bundle to load leaves its capture for the others. */
export const SHARED_CLOCKS_PROPERTY = "__wildstatNativeClocks";

/**
 * The clocks as the first WildStat bundle on the page captured them.
 * coop-client.js runs as the page loads; game.js is only inserted after
 * sign-in, and capturing again there would take whatever a console line typed
 * on the sign-in screen had put in place. So the first capture is pinned to
 * the page as a property nothing can reassign or redefine, and every later
 * bundle reads that one.
 */
export function sharedNativeClocks(scope: ClockScope): NativeClocks {
  const pinned = Object.getOwnPropertyDescriptor(scope, SHARED_CLOCKS_PROPERTY);
  if (pinned && !pinned.writable && !pinned.configurable && pinned.value && typeof pinned.value.monotonicNowMs === "function") return pinned.value;
  const captured = captureNativeClocks(scope);
  const frozen: NativeClocks = Object.freeze({ ...captured, timers: Object.freeze({ ...captured.timers }) });
  try { Object.defineProperty(scope, SHARED_CLOCKS_PROPERTY, { value: frozen, writable: false, configurable: false, enumerable: false }); } catch {}
  return frozen;
}

const clocks = import.meta.env?.MODE === "test" ? liveClocks() : sharedNativeClocks(globalThis as unknown as ClockScope);

export const monotonicNowMs = clocks.monotonicNowMs;
export const wallClockNowMs = clocks.wallClockNowMs;
export const documentHidden = clocks.documentHidden;
export const requestFrame = clocks.requestFrame;
export const nativeTimers: Readonly<NativeTimers> = Object.freeze({ ...clocks.timers });

/** One clock reading, or null while that clock is unavailable (the timeline in a hidden tab). */
export type ClockSource = () => number | null;

/**
 * How far granted time may run ahead of the slowest clock. Clocks read a few
 * microseconds apart, the rAF timestamp is the frame's start rather than the
 * moment it runs, and Date only counts whole milliseconds; this absorbs that
 * without ever slowing honest play. It is a single allowance for the clock's
 * whole life, not per frame or per reanchor, so nothing can harvest it twice.
 */
export const GAME_CLOCK_TOLERANCE_MS = 25;
/** The most any one reading may add, as the background loop's old per-wake cap did. */
export const GAME_CLOCK_MAX_SAMPLE_MS = 1_000;
/**
 * How long a clock may stand still while every other one runs before it is
 * taken for broken rather than slow. A timeline that some webview stops
 * advancing would otherwise be the slowest clock for good and freeze the
 * game. Leaving it out costs nothing against a speed hack: every other source
 * was captured when the bundle loaded, before any page script could hook it.
 */
export const GAME_CLOCK_STALL_MS = 1_000;

export type GameClock = {
  /**
   * Milliseconds of game time to run now. Pass the rAF timestamp from the
   * foreground loop; the background loop passes nothing.
   */
  sample(frameTimestampMs?: number): number;
  /** Forgets any backlog without granting it, e.g. after a pause or a tab switch. */
  reanchor(): void;
};

function clampSample(deltaMs: number) {
  return Number.isFinite(deltaMs) ? Math.min(GAME_CLOCK_MAX_SAMPLE_MS, Math.max(0, deltaMs)) : 0;
}

/**
 * Grants game time no faster than the slowest of several independent clocks.
 *
 * Each source's elapsed time is added up from its own readings, each reading
 * clamped to [0, 1 s], and the game may never have been granted more than the
 * smallest of those totals plus GAME_CLOCK_TOLERANCE_MS. A speed hack that
 * hooks some of the clocks gains nothing until it hooks all of them the same
 * way. Comparing running totals rather than each frame's deltas is what keeps
 * honest play at full speed: jitter between clocks evens out over a few frames
 * instead of being lost on every one.
 *
 * A clock that jumps backwards (Date after an NTP correction) adds nothing for
 * that one reading and then keeps counting, so the game loses at most a frame;
 * one that jumps forwards is capped at one second and is never the slowest.
 * A source that stops reporting (the timeline while hidden) is left out until
 * it returns, and rejoins at the time already granted; so is one that reports
 * the same reading for GAME_CLOCK_STALL_MS while the others run on.
 */
export function createGameClock(sources: readonly ClockSource[] = [
  monotonicNowMs,
  wallClockNowMs,
  () => documentHidden() ? null : clocks.timelineNowMs(),
]): GameClock {
  const tracks = sources.map(() => ({ last: null as number | null, elapsed: 0, stalledMs: 0 }));
  let granted = 0;
  let lastFrameAt: number | null = null;

  function read(index: number) {
    let value: number | null = null;
    try { value = sources[index](); } catch {}
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  /** Advances every source and returns the smallest running total, or null when none can be read. */
  function advance() {
    const values = tracks.map((_, index) => read(index));
    const deltas = tracks.map((track, index) => values[index] === null || track.last === null ? null : clampSample(values[index]! - track.last));
    let slowest: number | null = null;
    tracks.forEach((track, index) => {
      const value = values[index], delta = deltas[index];
      if (value === null) { track.last = null; track.stalledMs = 0; return; }
      if (delta === null) track.elapsed = Math.max(track.elapsed, granted);
      else if (delta > 0) {
        // A stalled clock that moves again rejoins at the time already
        // granted, as one returning from unavailable does.
        if (track.stalledMs > GAME_CLOCK_STALL_MS) track.elapsed = Math.max(track.elapsed, granted);
        track.elapsed += delta;
        track.stalledMs = 0;
      } else {
        const others = deltas.filter((other, otherIndex) => otherIndex !== index && other !== null) as number[];
        track.stalledMs += others.length ? Math.min(...others) : 0;
      }
      track.last = value;
      if (track.stalledMs > GAME_CLOCK_STALL_MS) return;
      slowest = slowest === null ? track.elapsed : Math.min(slowest, track.elapsed);
    });
    return slowest as number | null;
  }

  // The last frame timestamp survives a reanchor on purpose. The game's loop
  // samples every presented frame, running or not, so every frame that can
  // simulate has a frame delta to cap it, including the first after a pause.
  function reanchor() {
    const slowest = advance();
    if (slowest !== null) granted = Math.max(granted, slowest);
  }

  function sample(frameTimestampMs?: number) {
    let frameDelta = Number.POSITIVE_INFINITY;
    if (frameTimestampMs !== undefined && Number.isFinite(frameTimestampMs)) {
      if (lastFrameAt !== null) frameDelta = clampSample(frameTimestampMs - lastFrameAt);
      lastFrameAt = frameTimestampMs;
    }
    const slowest = advance();
    // With no clock at all there is nothing to trust; run nothing.
    if (slowest === null) return 0;
    // The tolerance only absorbs frame-timestamp jitter; a reading with no
    // frame delta to compare (the background loop, the very first frame) is
    // simply granted what the slowest clock allows.
    const tolerance = Number.isFinite(frameDelta) ? GAME_CLOCK_TOLERANCE_MS : 0;
    const grant = Math.max(0, Math.min(frameDelta, slowest + tolerance - granted));
    granted += grant;
    return grant;
  }

  reanchor();
  return { sample, reanchor };
}
