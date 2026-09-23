import { describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { nextPresentationDeadline } from "./render-budget";
import { MIN_ATTACK_INTERVAL } from "../../../shared/rules";
import {
  advanceFixedSimulationClock,
  IDLE_PRESENTATION_DELAY_MS,
  idlePresentationThrottleActive,
  MAX_SIMULATION_CATCH_UP_SECONDS,
  MAX_SIMULATION_STEPS_PER_FRAME,
  SIMULATION_STEP_SECONDS,
  presentationFrameDue,
  presentationCombatActive,
  createGameSessionController,
} from "./game-session-controller";

function countScheduledFrames(callbackTimes: number[], lowPerformanceMode: boolean) {
  let nextFrameAt = 0;
  let frames = 0;

  for (const now of callbackTimes) {
    if (!presentationFrameDue(lowPerformanceMode, now, nextFrameAt)) continue;
    frames += 1;
    nextFrameAt = nextPresentationDeadline(now, nextFrameAt, lowPerformanceMode ? 30 : 60);
  }

  return frames;
}

function simulationStepsFor(renderFps: number, seconds: number) {
  let accumulatorSeconds = 0;
  let steps = 0;
  for (let frame = 0; frame < renderFps * seconds; frame += 1) {
    const result = advanceFixedSimulationClock(accumulatorSeconds, 1 / renderFps);
    accumulatorSeconds = result.accumulatorSeconds;
    steps += result.steps;
  }
  return steps;
}

function attacksFor(renderFps: number, seconds: number, attackInterval: number) {
  let accumulatorSeconds = 0;
  let attackClock = 0;
  let attacks = 0;
  for (let frame = 0; frame < renderFps * seconds; frame += 1) {
    const result = advanceFixedSimulationClock(accumulatorSeconds, 1 / renderFps);
    accumulatorSeconds = result.accumulatorSeconds;
    for (let step = 0; step < result.steps; step += 1) {
      attackClock -= SIMULATION_STEP_SECONDS;
      if (attackClock > 0) continue;
      attacks += 1;
      attackClock += attackInterval;
    }
  }
  return attacks;
}

function interpolatedMotionDeltas(refreshRate: number, frameCount: number) {
  let accumulatorSeconds = 0;
  let previous = 0;
  let current = 0;
  const positions: number[] = [];
  for (let frame = 0; frame < frameCount; frame += 1) {
    const result = advanceFixedSimulationClock(accumulatorSeconds, 1 / refreshRate);
    accumulatorSeconds = result.accumulatorSeconds;
    for (let step = 0; step < result.steps; step += 1) {
      previous = current;
      current += 1;
    }
    positions.push(previous + (current - previous) * result.interpolationAlpha);
  }
  return positions.slice(4).map((position, index) => position - positions[index + 3]);
}

describe("game session frame scheduling", () => {
  it.each([false, true])("freezes combat during a map handoff (starts this step: %s)", beginsDuringStep => {
    vi.stubGlobal("document", { addEventListener: vi.fn() });
    let ready = beginsDuringStep;
    const updatePlayer = vi.fn(), updateEnemies = vi.fn(), updateProjectiles = vi.fn(), updatePortal = vi.fn(() => { ready = false; });
    try {
      const session = createGameSessionController({
        getMapId: () => "test", cutsceneActive: () => false, worldCombatReady: () => ready,
        capturePresentationState: vi.fn(), updateVisuals: vi.fn(), updateMessage: vi.fn(), updateHud: vi.fn(),
        updatePlayer, updateEnemies, updateProjectiles, updatePortal, updateUpgradeBench: vi.fn(), isDueling: () => false,
      } as any);
      session.update(1 / 60);
      expect(updatePlayer).toHaveBeenCalledTimes(beginsDuringStep ? 1 : 0);
      expect(updatePortal).toHaveBeenCalledTimes(beginsDuringStep ? 1 : 0);
      expect(updateEnemies).not.toHaveBeenCalled();
      expect(updateProjectiles).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it("starts from the server's position even when the server's row arrives after the game has started", () => {
    vi.stubGlobal("document", { addEventListener: vi.fn() });
    try {
      let serverState: { x: number; y: number; facing: number } | undefined;
      const player = { x: 0, y: 0, facing: 0, moving: false }, camera = { x: 0, y: 0 };
      const syncStoppedPosition = vi.fn();
      const noop = vi.fn();
      const session = createGameSessionController({
        hideStart: noop, hideGameOver: noop, mapMusicSync: noop, beginAdventure: noop, ensureMusicPlaying: noop,
        resetPresentationState: noop, tutorialMapId: "t", desertMapId: "d", snowMapId: "s", lavaMapId: "l", infernalMapId: "i", waterMapId: "w",
        resolvePortalCollision: noop, capturePresentationState: noop, updateHud: noop, updateVisuals: noop, updateMessage: noop,
        resetPlayer: () => { player.x = 100; player.y = 100; },                    // the map's spawn
        serverMapId: () => serverState ? "test" : undefined, serverPlayerState: () => serverState,
        getMapId: () => "test", setMapId: noop, validMapIds: ["test"], viewport: () => ({ width: 800, height: 600 }),
        player, camera, connected: () => true, syncStoppedPosition,
        cutsceneActive: () => true, updateCutscene: noop, isDueling: () => false,
      } as any);
      session.start(false, true);
      expect(player).toMatchObject({ x: 100, y: 100 });
      expect(syncStoppedPosition).not.toHaveBeenCalled();     // never report the spawn as where the player is
      session.update(1 / 60);
      expect(syncStoppedPosition).not.toHaveBeenCalled();
      serverState = { x: 3_200, y: 1_450, facing: Math.PI };
      session.update(1 / 60);
      expect(player).toMatchObject({ x: 3_200, y: 1_450, facing: Math.PI });
      expect(syncStoppedPosition).toHaveBeenCalledOnce();
      session.update(1 / 60);
      expect(syncStoppedPosition).toHaveBeenCalledOnce();     // applied once, not every frame
    } finally { vi.unstubAllGlobals(); }
  });
  it("keeps another frame scheduled when drawing throws", () => {
    vi.stubGlobal("document", { hidden: false, addEventListener: vi.fn() });
    const schedule = vi.fn(); vi.stubGlobal("requestAnimationFrame", schedule);
    const render = vi.fn().mockImplementationOnce(() => { throw new Error("draw failed"); });
    try {
      const session = createGameSessionController({ render, lowPerformanceMode: () => false,
        isReplayActive: () => true, presentationInputActive: () => false,
        recordPerformance: vi.fn(), performancePanelVisible: () => false, fpsDisplayVisible: () => false,
      } as any);
      const start = performance.now() + 10_000;
      expect(() => session.loop(start)).toThrow("draw failed");
      expect(schedule).toHaveBeenCalledExactlyOnceWith(session.loop);
      expect(() => schedule.mock.calls[0][0](start + 20)).not.toThrow();
      expect(render).toHaveBeenCalledTimes(2);
    } finally { vi.unstubAllGlobals(); }
  });
  it("holds the slower fade at black until the username step finishes", async () => {
    vi.useFakeTimers();
    const { document } = parseHTML('<html><body><div id="fade" hidden></div></body></html>');
    vi.stubGlobal("document", document);
    vi.stubGlobal("window", { setTimeout });
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => setTimeout(callback, 0));
    const fadeElement = document.querySelector<HTMLElement>("#fade")!;
    let finishName!: () => void;
    const onBlack = vi.fn(() => new Promise<void>(resolve => { finishName = resolve; }));
    try {
      const session = createGameSessionController({ fadeElement, camera: { x: 0, y: 0, zoom: 1 },
        player: { x: 1800, y: 1370, attackRange: 155 }, viewport: () => ({ width: 1200, height: 800 }),
        resetPresentationState: vi.fn(),
      } as any);
      session.fadeToWorld(onBlack, 700);
      await vi.advanceTimersByTimeAsync(699);
      expect(onBlack).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(5000);
      expect(fadeElement.classList.contains("is-visible")).toBe(true);
      finishName();
      await vi.advanceTimersByTimeAsync(1);
      expect(fadeElement.classList.contains("is-visible")).toBe(false);
      await vi.advanceTimersByTimeAsync(700);
      expect(fadeElement.hidden).toBe(true);
      session.fadeToWorld(() => {});
      expect(fadeElement.style.transitionDuration).toBe("180ms");
      await vi.runAllTimersAsync();
    } finally { vi.useRealTimers(); vi.unstubAllGlobals(); }
  });
  it.each([[false, "replay"], [true, "replay"], [false, "chat"], [true, "chat"]] as const)("keeps active presentation smooth with Low Performance Mode=%s during %s", (lowPerformanceMode, activity) => {
    vi.stubGlobal("document", { hidden: false, addEventListener: vi.fn() });
    vi.stubGlobal("requestAnimationFrame", vi.fn());
    const render = vi.fn();
    let replayActive = true;
    try {
      const session = createGameSessionController({
        render, lowPerformanceMode: () => lowPerformanceMode, isReplayActive: () => activity === "replay" && replayActive,
        presentationUiActive: () => activity === "chat" && replayActive,
        presentationInputActive: () => false, recordPerformance: vi.fn(),
        performancePanelVisible: () => false, fpsDisplayVisible: () => false,
      } as any);
      // No running world or input: a replay remains viewable while dead/paused.
      const start = performance.now() + 10_000;
      session.loop(start);
      render.mockClear();
      for (let index = 1; index <= 120; index++) session.loop(start + index * 1000 / 120);
      expect(render).toHaveBeenCalledTimes(lowPerformanceMode ? 30 : 60);
      replayActive = false;
      session.loop(start + 2_000);
      render.mockClear();
      for (let index = 1; index <= 120; index++) session.loop(start + 2_000 + index * 1000 / 120);
      expect(render).toHaveBeenCalledTimes(30);
    } finally { vi.unstubAllGlobals(); }
  });
  it("does no update or render work while the document is hidden", () => {
    vi.stubGlobal("document", { hidden: true, addEventListener: vi.fn() });
    vi.stubGlobal("requestAnimationFrame", vi.fn());
    const render = vi.fn(), capturePresentationState = vi.fn();
    try {
      const session = createGameSessionController({ render, capturePresentationState } as any);
      for (let i = 0; i < 10; i++) session.loop(i * 1000);
      expect(render).not.toHaveBeenCalled();
      expect(capturePresentationState).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it("continues simulation without rendering while the tab is hidden", () => {
    let hidden = false;
    let now = 0;
    let visibilityChanged = () => {};
    let backgroundTick = () => {};
    const clearInterval = vi.fn();
    vi.stubGlobal("document", {
      get hidden() { return hidden; },
      addEventListener: (_name: string, callback: () => void) => { visibilityChanged = callback; },
    });
    vi.stubGlobal("window", { setInterval: (callback: () => void) => { backgroundTick = callback; return 1; }, clearInterval });
    vi.stubGlobal("performance", { now: () => now });
    vi.stubGlobal("requestAnimationFrame", vi.fn());
    const updateCutscene = vi.fn();
    const render = vi.fn();
    const noop = () => {};
    try {
      const session = createGameSessionController({
        player: { moving: false }, camera: {}, getMapId: () => "test", validMapIds: ["test"],
        hideStart: noop, hideGameOver: noop, mapMusicSync: noop, resetPlayer: noop,
        serverMapId: () => undefined, serverPlayerState: () => ({ x: 0, y: 0, facing: 0 }),
        resolvePortalCollision: noop, connected: () => false, beginAdventure: noop,
        ensureMusicPlaying: noop, resetPresentationState: noop, accountInConflict: () => false,
        capturePresentationState: noop, updateVisuals: noop, updateMessage: noop,
        cutsceneActive: () => true, updateCutscene, updateHud: noop, render,
      } as any);
      session.start(false);
      hidden = true;
      visibilityChanged();
      now = 250;
      backgroundTick();
      expect(updateCutscene).toHaveBeenCalledTimes(15);
      session.loop(now);
      expect(render).not.toHaveBeenCalled();
      hidden = false;
      visibilityChanged();
      expect(clearInterval).toHaveBeenCalledWith(1);
    } finally { vi.unstubAllGlobals(); }
  });
  it("does not collapse 60 Hz rendering to every other callback when timestamps arrive slightly early", () => {
    const interval = 1_000 / 60;
    const callbacks = Array.from({ length: 120 }, (_, index) =>
      index === 0 ? 0 : index * interval - .25,
    );

    expect(countScheduledFrames(callbacks, false)).toBe(120);
  });

  it("caps presentation at 60 FPS on 90, 120, 144, and 240 Hz displays", () => {
    for (const refreshRate of [90, 120, 144, 240]) {
      const callbacks = Array.from({ length: refreshRate + 1 }, (_, index) => index * (1_000 / refreshRate));
      expect(countScheduledFrames(callbacks, false)).toBe(61);
    }
  });

  it("keeps Low Performance mode at approximately 30 FPS on a 60 Hz display", () => {
    const callbacks = Array.from({ length: 121 }, (_, index) => index * (1_000 / 60));

    expect(countScheduledFrames(callbacks, true)).toBe(61);
  });

  it("enters idle presentation mode after two seconds and leaves immediately on input", () => {
    const lastInputAt = 1_000;
    expect(idlePresentationThrottleActive(false, lastInputAt + IDLE_PRESENTATION_DELAY_MS - 1, lastInputAt)).toBe(false);
    expect(idlePresentationThrottleActive(false, lastInputAt + IDLE_PRESENTATION_DELAY_MS, lastInputAt)).toBe(true);
    expect(idlePresentationThrottleActive(true, lastInputAt + IDLE_PRESENTATION_DELAY_MS, lastInputAt)).toBe(false);
  });

  it("restores active presentation for stationary combat, hits, and duels", () => {
    const idle = { hp: 100, combatFacing: null, throwClock: 0, hurtClock: 0 };
    expect(presentationCombatActive(idle, false)).toBe(false);
    for (const player of [
      { ...idle, combatFacing: 0 },
      { ...idle, throwClock: .1 },
      { ...idle, hurtClock: .1 },
    ]) {
      const active = presentationCombatActive(player, false);
      expect(active).toBe(true);
      expect(idlePresentationThrottleActive(active, 10_000, 0)).toBe(false);
    }
    expect(presentationCombatActive(idle, true)).toBe(true);
    expect(presentationCombatActive({ ...idle, hp: 0, combatFacing: 0 }, true)).toBe(false);
  });

  it("waits for the idle delay after combat ends and preserves the battery-mode cap", () => {
    let lastActivityAt = 0;
    for (const now of [3_000, 6_000, 9_000]) {
      const active = presentationCombatActive({ hp: 100, combatFacing: 0, throwClock: 0, hurtClock: 0 }, false);
      if (active) lastActivityAt = now;
      expect(idlePresentationThrottleActive(active, now, lastActivityAt)).toBe(false);
    }
    expect(idlePresentationThrottleActive(false, 10_999, lastActivityAt)).toBe(false);
    expect(idlePresentationThrottleActive(false, 11_000, lastActivityAt)).toBe(true);
    expect(presentationFrameDue(false, 9_001, 9_020)).toBe(false);
    expect(presentationFrameDue(true, 9_001, 9_020)).toBe(false);
  });

  it("exposes residual simulation time as presentation interpolation", () => {
    const result = advanceFixedSimulationClock(0, SIMULATION_STEP_SECONDS * 1.5);
    expect(result.steps).toBe(1);
    expect(result.interpolationAlpha).toBeCloseTo(.5);
  });

  it("turns fixed 60 Hz motion into even native-refresh presentation deltas", () => {
    for (const refreshRate of [90, 120, 144]) {
      const expectedDelta = 60 / refreshRate;
      for (const delta of interpolatedMotionDeltas(refreshRate, refreshRate)) {
        expect(delta).toBeCloseTo(expectedDelta, 6);
      }
    }
  });

  it("advances the same 60 Hz simulation at fast, low-performance, and dropped render rates", () => {
    expect([120, 60, 30, 20, 9].map((fps) => simulationStepsFor(fps, 10))).toEqual([600, 600, 600, 600, 600]);
  });

  it("keeps max base attack totals independent of render FPS", () => {
    expect([60, 30, 20, 9].map((fps) => attacksFor(fps, 10, MIN_ATTACK_INTERVAL))).toEqual([27, 27, 27, 27]);
  });

  it("bounds catch-up after a long stall instead of creating a resume burst", () => {
    const result = advanceFixedSimulationClock(0, .5);
    expect(result.steps).toBe(MAX_SIMULATION_STEPS_PER_FRAME);
    expect(result.accumulatorSeconds).toBeCloseTo(0);
    expect(result.droppedSeconds).toBeCloseTo(.5 - MAX_SIMULATION_CATCH_UP_SECONDS);
  });
});
