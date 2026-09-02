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
      guestContinuationChosen: () => false,
      newPlayerIntroShown: () => false,
      setNewPlayerIntroShown: () => {},
      refreshLoading: () => {},
      showSessionConflict: () => {},
      legalConsentAccepted: () => true,
      showLegalGate: () => {},
      showAccountChoice: () => {},
      showLoading: () => {},
      showNewPlayerIntro: () => {},
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
    createStartupCoordinator({
      ...base,
      accountState: () => ({ signedIn: true }),
      connected: () => true,
      progressLoaded: () => true,
      hasLocalState: () => true,
      localProfileReady: () => true,
      startupKind: () => "returning" as const,
      beginAdventure,
      startGame,
    }).finishStartup();

    expect(beginAdventure).toHaveBeenCalledTimes(1);
    expect(startGame).toHaveBeenCalledTimes(1);
  });
});
