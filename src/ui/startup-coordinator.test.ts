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
      showAccountChoice: () => {},
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
