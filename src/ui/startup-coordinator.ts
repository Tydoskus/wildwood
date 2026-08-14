import { enforceLatestVersion } from "../app/version";

type AccountState = {
  signedIn?: boolean;
  authInProgress?: boolean;
  returningFromSignIn?: boolean;
  sessionConflict?: boolean;
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
  showAccountChoice: () => void;
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
};

/** Coordinates startup readiness, account protocol gating, and version polling. */
export function createStartupCoordinator(dependencies: StartupCoordinatorDependencies) {
  let updateReloadPending = false;

  function showGameUpdating() {
    updateReloadPending = true;
    dependencies.gameUpdateGate.hidden = false;
  }

  function isSignInScreenReady() {
    return dependencies.pageLoadComplete() && dependencies.playerSpriteReady() && dependencies.worldArtReady();
  }

  function finishStartup() {
    dependencies.refreshLoading();
    const account = dependencies.accountState();
    if (account?.sessionConflict) {
      dependencies.showSessionConflict();
      return;
    }
    if (dependencies.hasStarted() || dependencies.isRunning()) return;
    if (!account?.signedIn && !account?.authInProgress && !account?.returningFromSignIn
      && !dependencies.guestContinuationChosen() && isSignInScreenReady()) {
      dependencies.showAccountChoice();
      return;
    }
    if (!dependencies.pageLoadComplete() || !dependencies.isLoadingSequenceComplete() || !dependencies.playerSpriteReady()
      || !dependencies.worldArtReady() || !dependencies.connected()) return;
    if (!dependencies.progressLoaded() || !dependencies.hasLocalState()) return;
    if (account?.signedIn && !dependencies.localProfileReady()) return;
    if (dependencies.startupKind() === "new") {
      if (!dependencies.newPlayerIntroShown()) {
        dependencies.setNewPlayerIntroShown();
        dependencies.showNewPlayerIntro();
      }
      return;
    }
    if (dependencies.startupKind() === "returning") {
      dependencies.beginAdventure();
      dependencies.startGame();
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
