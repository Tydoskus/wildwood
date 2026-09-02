import { enforceLatestVersion } from "../app/version";
import {
  createStartupStateMachine,
  type StartupAccountSnapshot,
  type StartupState,
} from "../coop/startup-state-machine";

type AccountState = StartupAccountSnapshot & {
  updating?: boolean;
  connectionIssue?: { message: string } | null;
};

type StartupCoordinatorDependencies = {
  version: string;
  gameUpdateGate: HTMLElement;
  accountState: () => AccountState | undefined;
  pageLoadComplete: () => boolean;
  playerSpriteReady: () => boolean;
  worldArtReady: () => boolean;
  refreshLoading: () => void;
  restartLoading: () => void;
  showSessionConflict: () => void;
  legalConsentAccepted: () => boolean;
  showLegalGate: () => void;
  showAccountChoice: (detail?: string) => void;
  showAccountAction: (action: "sign-in" | "guest" | "takeover", detail: string) => void;
  showConnectionFailure: (message: string) => void;
  showLoading: () => void;
  showNewPlayerIntro: () => void;
  hideStart: () => void;
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
  retryConnection: () => boolean | void;
  prepareUpdateReload: (latestVersion: string) => void;
};

/** Coordinates startup readiness, account protocol gating, and version polling. */
export function createStartupCoordinator(dependencies: StartupCoordinatorDependencies) {
  const machine = createStartupStateMachine("game-runtime");

  function showGameUpdating(latestVersion = "") {
    if (latestVersion && (dependencies.hasStarted() || dependencies.isRunning())) {
      dependencies.prepareUpdateReload(latestVersion);
    }
    machine.dispatch({ type: "update-detected", version: latestVersion });
    dependencies.gameUpdateGate.hidden = false;
  }

  function isSignInScreenReady() {
    return dependencies.pageLoadComplete() && dependencies.playerSpriteReady() && dependencies.worldArtReady();
  }

  function renderState(state: StartupState, changed = true) {
    switch (state.value) {
      case "session-conflict":
        dependencies.showSessionConflict();
        return;
      case "legal-consent":
        dependencies.showLegalGate();
        return;
      case "account-choice":
        dependencies.showAccountChoice(state.detail);
        return;
      case "account-action":
        dependencies.showAccountAction(state.action, state.detail);
        return;
      case "connection-failed":
        dependencies.showConnectionFailure(state.message);
        return;
      case "verifying-sign-in":
      case "loading-shell":
      case "loading-runtime":
        dependencies.showLoading();
        return;
      case "new-player":
        if (changed) dependencies.showNewPlayerIntro();
        return;
      case "entering-game":
        if (changed) {
          dependencies.beginAdventure();
          dependencies.startGame();
        }
        return;
      case "updating":
        dependencies.gameUpdateGate.hidden = false;
        return;
      case "running":
        if (changed) dependencies.hideStart();
        return;
      case "failed":
        dependencies.showConnectionFailure(state.message);
        return;
      case "loading-game":
      case "disposed":
      default:
        return;
    }
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
    const transition = machine.sync({
      account,
      connectionIssue: account?.connectionIssue,
      legalAccepted: dependencies.legalConsentAccepted(),
      shellReady: isSignInScreenReady(),
      runtimeReady,
      started: dependencies.hasStarted() || dependencies.isRunning(),
      startupKind: dependencies.startupKind(),
    });
    renderState(transition.state, transition.changed);
  }

  function beginAccountAction(action: "sign-in" | "guest" | "takeover", detail: string) {
    const transition = machine.dispatch({ type: "begin-account-action", action, detail });
    renderState(transition.state, transition.changed);
  }

  function completeAccountAction() {
    machine.dispatch({ type: "complete-account-action" });
    finishStartup();
  }

  function failAccountAction(detail: string) {
    const transition = machine.dispatch({ type: "fail-account-action", detail });
    renderState(transition.state, transition.changed);
  }

  function retryConnection() {
    if (machine.state().value !== "connection-failed") return false;
    if (dependencies.retryConnection() === false) return false;
    const transition = machine.dispatch({ type: "retry-connection" });
    renderState(transition.state, transition.changed);
    return true;
  }

  function restart() {
    const transition = machine.dispatch({ type: "restart" });
    if (!transition.changed) return false;
    dependencies.restartLoading();
    return true;
  }

  function updateProtocolGate(account = dependencies.accountState()) {
    if (account?.updating && machine.state().value !== "updating") {
      machine.dispatch({ type: "update-detected" });
    }
    dependencies.gameUpdateGate.hidden = machine.state().value !== "updating";
    if (account?.updating) enforceLatestVersion(dependencies.version, showGameUpdating);
  }

  function startVersionPolling() {
    enforceLatestVersion(dependencies.version, showGameUpdating);
    window.setInterval(() => enforceLatestVersion(dependencies.version, showGameUpdating), 120_000);
    window.setInterval(() => {
      if (dependencies.accountState()?.updating) enforceLatestVersion(dependencies.version, showGameUpdating);
    }, 5_000);
  }

  return {
    beginAccountAction,
    completeAccountAction,
    failAccountAction,
    finishStartup,
    isSignInScreenReady,
    restart,
    retryConnection,
    showGameUpdating,
    startVersionPolling,
    state: machine.state,
    updateProtocolGate,
  };
}
