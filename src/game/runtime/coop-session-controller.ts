import { wildwoodCoop } from "../../wildwood-coop";

type CoopClient = typeof wildwoodCoop;
type AccountState = ReturnType<CoopClient["accountState"]>;

type CoopSessionDependencies = {
  coop: CoopClient | null;
  syncLifetimeKills: (identity: string) => void;
  refreshGemCounter: () => void;
  refreshOpenProfile: () => void;
  refreshLeaderboard: () => void;
  refreshDevPanel: () => void;
  loadProgress: () => void;
  observedSessionGeneration: () => number;
  setObservedSessionGeneration: (generation: number) => void;
  resetMovementSync: () => void;
  running: () => boolean;
  syncPlayerState: () => void;
  reconcileMap: () => void;
  syncBossState: () => void;
  finishStartup: () => void;
  clearSignInPending: () => void;
  updateProtocolGate: (account: AccountState) => void;
  showSessionConflict: () => void;
  shouldShowSigningIn: (account: AccountState) => boolean;
  showSigningIn: () => void;
  shouldShowLoading: (account: AccountState) => boolean;
  showLoading: () => void;
  shouldShowAccountChoice: (account: AccountState) => boolean;
  showAccountChoice: () => void;
  refreshChat: () => void;
  updateDuelControls: () => void;
  refreshAppStatus: () => void;
  refreshReconnectOverlay: () => void;
};

/** Applies a server-table change to the local gameplay and account session. */
export function createCoopSessionController(dependencies: CoopSessionDependencies) {
  function onChange() {
    const coop = dependencies.coop;
    if (!coop) return;

    const identity = coop.localIdentity?.() || "";
    dependencies.syncLifetimeKills(identity);
    dependencies.refreshGemCounter();
    dependencies.refreshOpenProfile();
    dependencies.refreshLeaderboard();
    dependencies.refreshDevPanel();
    dependencies.loadProgress();

    const nextGeneration = coop.sessionGeneration?.() || 0;
    if (nextGeneration !== dependencies.observedSessionGeneration()) {
      dependencies.setObservedSessionGeneration(nextGeneration);
      dependencies.resetMovementSync();
      if (dependencies.running()) {
        dependencies.syncPlayerState();
      }
    }

    dependencies.reconcileMap();
    dependencies.syncBossState();
    dependencies.finishStartup();
    const account = coop.accountState?.();
    if (account?.signedIn) dependencies.clearSignInPending();
    dependencies.updateProtocolGate(account);
    if (account?.sessionConflict) dependencies.showSessionConflict();
    else if (dependencies.shouldShowSigningIn(account)) dependencies.showSigningIn();
    else if (dependencies.shouldShowLoading(account)) dependencies.showLoading();
    else if (dependencies.shouldShowAccountChoice(account)) dependencies.showAccountChoice();
    dependencies.refreshChat();
    dependencies.updateDuelControls();
    dependencies.refreshAppStatus();
    dependencies.refreshReconnectOverlay();
  }

  return { onChange };
}
