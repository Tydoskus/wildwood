import { describe, expect, it, vi } from "vitest";

vi.mock("../../wildstat-coop", () => ({ wildstatCoop: {} }));

import { createCoopSessionController, createSessionWindowRefresh } from "./coop-session-controller";

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
    syncLifetimeKills: noop, refreshGemCounter: noop, refreshGiftsAndMail: noop,
    refreshWindows: noop, refreshLeaderboard: noop, refreshDevPanel: noop, loadProgress,
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

it("refreshes inventory card rows and an open Smith even with no profile open", () => {
  const inventory = { render: vi.fn() }, smith = { isOpen: () => true, render: vi.fn() };
  const gearSellers = { isOpen: () => false, render: vi.fn(), refreshNotice: vi.fn() };
  const profileWindow = { identity: () => null, render: vi.fn() };
  const refresh = createSessionWindowRefresh({ coop: null, playerSafety: { refresh: vi.fn() }, inventory, smith, gearSellers, profileWindow });
  refresh();
  expect(inventory.render).toHaveBeenCalledOnce();
  expect(smith.render).toHaveBeenCalledOnce();
  expect(profileWindow.render).not.toHaveBeenCalled();
  smith.isOpen = () => false;
  refresh();
  expect(smith.render).toHaveBeenCalledOnce();
  // The HUD's gear upgrades chip follows every refresh, a seller open or not.
  expect(gearSellers.refreshNotice).toHaveBeenCalledTimes(2);
});
