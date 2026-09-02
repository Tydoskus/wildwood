import { enforceLatestVersion } from "../app/version";
import { resolveStartupRoute, type StartupRouteAccount } from "../coop/startup-route";

type AccountState = StartupRouteAccount & {
  updating?: boolean;
};

type StartupCoordinatorDependencies = {
  version: string;
  gameUpdateGate: HTMLElement;
  accountState: () => AccountState | undefined;
  pageLoadComplete: () => boolean;
  playerSpriteReady: () => boolean;
  worldArtReady: () => boolean;
  guestContinuationChosen: () => boolean;
  newPlayerIntroShown: () => boolean;
  setNewPlayerIntroShown: () => void;
  refreshLoading: () => void;
  showSessionConflict: () => void;
  legalConsentAccepted: () => boolean;
  showLegalGate: () => void;
  showAccountChoice: () => void;
  showLoading: () => void;
  showNewPlayerIntro: () => void;
  isLoadingSequenceComplete: () => boolean;
  hasStarted: () => boolean;
  isRunning: () => boolean;
  connected: () => boolean;
  progressLoaded: () => boolean;
  hasLocalState: () => boolean;
  localProfileReady: () => boolean;
  startupKind: () => "new" | "returning" | null;
  beginAdventure: () => void;
  startGame: () => void;
  prepareUpdateReload: (latestVersion: string) => void;
};

/** Coordinates startup readiness, account protocol gating, and version polling. */
export function createStartupCoordinator(dependencies: StartupCoordinatorDependencies) {
  let updateReloadPending = false;

  function showGameUpdating(latestVersion = "") {
    if (latestVersion && (dependencies.hasStarted() || dependencies.isRunning())) {
      dependencies.prepareUpdateReload(latestVersion);
    }
    updateReloadPending = true;
    dependencies.gameUpdateGate.hidden = false;
  }

  function isSignInScreenReady() {
    return dependencies.pageLoadComplete() && dependencies.playerSpriteReady() && dependencies.worldArtReady();
  }

  function finishStartup() {
    dependencies.refreshLoading();
    const account = dependencies.accountState();
    const runtimeReady = dependencies.pageLoadComplete()
      && dependencies.isLoadingSequenceComplete()
      && dependencies.playerSpriteReady()
      && dependencies.worldArtReady()
      && dependencies.connected()
      && dependencies.progressLoaded()
      && dependencies.hasLocalState()
      && (!account?.signedIn || dependencies.localProfileReady());
    const route = resolveStartupRoute({
      mode: "game-runtime",
      account,
      guestContinuationChosen: dependencies.guestContinuationChosen(),
      legalAccepted: dependencies.legalConsentAccepted(),
      shellReady: isSignInScreenReady(),
      runtimeReady,
      started: dependencies.hasStarted() || dependencies.isRunning(),
      startupKind: dependencies.startupKind(),
    });
    switch (route) {
      case "session-conflict":
        dependencies.showSessionConflict();
        return;
      case "legal":
        dependencies.showLegalGate();
        return;
      case "account-choice":
        dependencies.showAccountChoice();
        return;
      case "verifying-sign-in":
      case "loading":
        dependencies.showLoading();
        return;
      case "new-player":
        if (!dependencies.newPlayerIntroShown()) {
          dependencies.setNewPlayerIntroShown();
          dependencies.showNewPlayerIntro();
        }
        return;
      case "enter-game":
        dependencies.beginAdventure();
        dependencies.startGame();
        return;
      default:
        return;
    }
  }

  function updateProtocolGate(account = dependencies.accountState()) {
    dependencies.gameUpdateGate.hidden = !(account?.updating || updateReloadPending);
    if (account?.updating) enforceLatestVersion(dependencies.version, showGameUpdating);
  }

  function startVersionPolling() {
    enforceLatestVersion(dependencies.version, showGameUpdating);
    window.setInterval(() => enforceLatestVersion(dependencies.version, showGameUpdating), 120_000);
    window.setInterval(() => {
      if (dependencies.accountState()?.updating) enforceLatestVersion(dependencies.version, showGameUpdating);
    }, 5_000);
  }

  return { finishStartup, isSignInScreenReady, showGameUpdating, startVersionPolling, updateProtocolGate };
}
