import { describe, expect, it, vi } from "vitest";

vi.mock("../../wildstat-coop", () => ({ wildstatCoop: {} }));

import { createCoopSessionController } from "./coop-session-controller";

function harness() {
  const frames: Array<() => void> = [];
  const state = { generation: 1, identity: "a", observed: 0 };
  const loadProgress = vi.fn();
  const resetMovementSync = vi.fn();
  const coop = {
    localIdentity: () => state.identity,
    sessionGeneration: () => state.generation,
    accountState: () => undefined,
  } as never;
  const noop = () => {};
  const controller = createCoopSessionController({
    coop,
    syncLifetimeKills: noop, refreshGemCounter: noop, refreshBalanceApologyGift: noop, refreshDailyGemBonus: noop,
    refreshOpenProfile: noop, refreshLeaderboard: noop, refreshDevPanel: noop, loadProgress,
    observedSessionGeneration: () => state.observed,
    setObservedSessionGeneration: (generation) => { state.observed = generation; },
    resetMovementSync, running: () => false, syncPlayerState: noop, reconcileMap: noop, syncBossState: noop,
    finishStartup: noop, updateProtocolGate: noop, refreshChat: noop, updateDuelControls: noop,
    refreshAppStatus: noop, refreshReconnectOverlay: noop,
    scheduler: {
      requestFrame: (callback) => frames.push(callback),
      cancelFrame: (handle) => { frames[handle - 1] = () => {}; },
      setTimer: () => 0,
      clearTimer: () => {},
      hidden: () => false,
    },
  });
  const runFrame = () => { const pending = frames.splice(0); pending.forEach(callback => callback()); };
  return { controller, state, loadProgress, resetMovementSync, runFrame };
}

describe("coop session controller", () => {
  it("refreshes a new session at once, then coalesces steady-state changes per frame", () => {
    const h = harness();
    h.controller.onChange();
    expect(h.loadProgress).toHaveBeenCalledTimes(1);
    expect(h.resetMovementSync).toHaveBeenCalledTimes(1);

    for (let kill = 0; kill < 30; kill += 1) h.controller.onChange();
    expect(h.loadProgress).toHaveBeenCalledTimes(1);
    h.runFrame();
    expect(h.loadProgress).toHaveBeenCalledTimes(2);
  });

  it("does not leave the next session waiting a frame behind a queued refresh", () => {
    const h = harness();
    h.controller.onChange();
    h.controller.onChange();
    h.state.generation = 2;
    h.controller.onChange();
    expect(h.loadProgress).toHaveBeenCalledTimes(2);
    expect(h.resetMovementSync).toHaveBeenCalledTimes(2);
    h.runFrame();
    expect(h.loadProgress).toHaveBeenCalledTimes(2);
  });

  it("refreshes at once when the signed-in identity changes", () => {
    const h = harness();
    h.controller.onChange();
    h.state.identity = "b";
    h.controller.onChange();
    expect(h.loadProgress).toHaveBeenCalledTimes(2);
  });
});
