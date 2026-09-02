import { describe, expect, it, vi } from "vitest";
import { createStartupCoordinator } from "./startup-coordinator";

function dependencies(running: boolean) {
  const prepareUpdateReload = vi.fn();
  const gameUpdateGate = { hidden: true } as HTMLElement;
  return {
    prepareUpdateReload,
    gameUpdateGate,
    values: {
      version: "0.419",
      gameUpdateGate,
      accountState: () => undefined,
      pageLoadComplete: () => true,
      playerSpriteReady: () => true,
      worldArtReady: () => true,
      refreshLoading: () => {},
      restartLoading: () => {},
      showSessionConflict: () => {},
      legalConsentAccepted: () => true,
      showLegalGate: () => {},
      showAccountChoice: () => {},
      showAccountAction: () => {},
      showConnectionFailure: () => {},
      showLoading: () => {},
      showNewPlayerIntro: () => {},
      hideStart: () => {},
      isLoadingSequenceComplete: () => true,
      hasStarted: () => running,
      isRunning: () => running,
      connected: () => false,
      progressLoaded: () => false,
      hasLocalState: () => false,
      localProfileReady: () => false,
      startupKind: () => null as null,
      beginAdventure: () => {},
      startGame: () => {},
      retryConnection: () => true,
      prepareUpdateReload,
    },
  };
}

describe("startup update handoff", () => {
  it("records auto-resume only when a forced update interrupts an active game", () => {
    const active = dependencies(true);
    const inactive = dependencies(false);

    createStartupCoordinator(active.values).showGameUpdating("0.420");
    createStartupCoordinator(inactive.values).showGameUpdating("0.420");

    expect(active.prepareUpdateReload).toHaveBeenCalledWith("0.420");
    expect(active.gameUpdateGate.hidden).toBe(false);
    expect(inactive.prepareUpdateReload).not.toHaveBeenCalled();
  });
});

describe("startup screen coordination", () => {
  it("keeps account choice ahead of legal consent for an unapproved visitor", () => {
    const base = dependencies(false).values;
    const showAccountChoice = vi.fn();
    const showLegalGate = vi.fn();
    createStartupCoordinator({
      ...base,
      accountState: () => ({}),
      legalConsentAccepted: () => false,
      showAccountChoice,
      showLegalGate,
    }).finishStartup();

    expect(showAccountChoice).toHaveBeenCalledTimes(1);
    expect(showLegalGate).not.toHaveBeenCalled();
  });

  it("moves an approved visitor from legal consent to loading through one router", () => {
    const base = dependencies(false).values;
    const showLegalGate = vi.fn();
    const showLoading = vi.fn();
    const approved = { guestSessionApproved: true };
    const coordinator = createStartupCoordinator({
      ...base,
      accountState: () => approved,
      legalConsentAccepted: () => false,
      showLegalGate,
      showLoading,
    });
    coordinator.finishStartup();
    expect(showLegalGate).toHaveBeenCalledTimes(1);

    createStartupCoordinator({
      ...base,
      accountState: () => approved,
      legalConsentAccepted: () => true,
      showLoading,
    }).finishStartup();
    expect(showLoading).toHaveBeenCalledTimes(1);
  });

  it("enters a fully ready returning session once", () => {
    const base = dependencies(false).values;
    const beginAdventure = vi.fn();
    const startGame = vi.fn();
    const coordinator = createStartupCoordinator({
      ...base,
      accountState: () => ({ signedIn: true }),
      connected: () => true,
      progressLoaded: () => true,
      hasLocalState: () => true,
      localProfileReady: () => true,
      startupKind: () => "returning" as const,
      beginAdventure,
      startGame,
    });
    coordinator.finishStartup();
    coordinator.finishStartup();

    expect(beginAdventure).toHaveBeenCalledTimes(1);
    expect(startGame).toHaveBeenCalledTimes(1);
  });

  it("shows new-player setup only on the transition into that state", () => {
    const base = dependencies(false).values;
    const showNewPlayerIntro = vi.fn();
    const coordinator = createStartupCoordinator({
      ...base,
      accountState: () => ({ guestSessionApproved: true }),
      connected: () => true,
      progressLoaded: () => true,
      hasLocalState: () => true,
      localProfileReady: () => true,
      startupKind: () => "new" as const,
      showNewPlayerIntro,
    });

    coordinator.finishStartup();
    coordinator.finishStartup();

    expect(showNewPlayerIntro).toHaveBeenCalledTimes(1);
    expect(coordinator.state().value).toBe("new-player");
  });

  it("removes a recovery screen when a previously started session is approved again", () => {
    const base = dependencies(true).values;
    let account = { signedIn: true, sessionConflict: true };
    const showSessionConflict = vi.fn();
    const hideStart = vi.fn();
    const coordinator = createStartupCoordinator({
      ...base,
      accountState: () => account,
      showSessionConflict,
      hideStart,
    });

    coordinator.finishStartup();
    account = { signedIn: true, sessionConflict: false };
    coordinator.finishStartup();
    coordinator.finishStartup();

    expect(showSessionConflict).toHaveBeenCalledTimes(1);
    expect(hideStart).toHaveBeenCalledTimes(1);
    expect(coordinator.state().value).toBe("running");
  });

  it("renders a retryable connection failure as an explicit machine state", () => {
    const base = dependencies(false).values;
    const showConnectionFailure = vi.fn();
    const showLoading = vi.fn();
    const retryConnection = vi.fn(() => true);
    const coordinator = createStartupCoordinator({
      ...base,
      accountState: () => ({
        guestSessionApproved: true,
        connectionIssue: { message: "Server connection timed out" },
      }),
      showConnectionFailure,
      showLoading,
      retryConnection,
    });

    coordinator.finishStartup();
    expect(coordinator.state()).toEqual({
      value: "connection-failed",
      message: "Server connection timed out",
    });
    expect(showConnectionFailure).toHaveBeenCalledWith("Server connection timed out");

    expect(coordinator.retryConnection()).toBe(true);
    expect(retryConnection).toHaveBeenCalledTimes(1);
    expect(showLoading).toHaveBeenCalled();
  });

  it("routes account actions and failures through the central machine", () => {
    const base = dependencies(false).values;
    const showAccountAction = vi.fn();
    const showAccountChoice = vi.fn();
    const coordinator = createStartupCoordinator({
      ...base,
      accountState: () => ({}),
      showAccountAction,
      showAccountChoice,
    });
    coordinator.finishStartup();

    coordinator.beginAccountAction("sign-in", "Opening Sign-In…");
    expect(showAccountAction).toHaveBeenCalledWith("sign-in", "Opening Sign-In…");

    coordinator.failAccountAction("SIGN-IN FAILED · TRY AGAIN");
    expect(showAccountChoice).toHaveBeenLastCalledWith("SIGN-IN FAILED · TRY AGAIN");
    expect(coordinator.state()).toEqual({ value: "account-choice", detail: "SIGN-IN FAILED · TRY AGAIN" });
  });

  it("restarts a running session through an explicit loading transition", () => {
    const base = dependencies(true).values;
    const restartLoading = vi.fn();
    const coordinator = createStartupCoordinator({
      ...base,
      accountState: () => ({ signedIn: true }),
      restartLoading,
    });
    coordinator.finishStartup();

    expect(coordinator.restart()).toBe(true);
    expect(restartLoading).toHaveBeenCalledTimes(1);
    expect(coordinator.state()).toEqual({ value: "loading-runtime" });
  });
});
