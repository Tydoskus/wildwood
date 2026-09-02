import { wildstatCoop } from "../../wildstat-coop";

type CoopClient = typeof wildstatCoop;
type AccountState = ReturnType<CoopClient["accountState"]>;

type CoopSessionDependencies = {
  coop: CoopClient | null;
  syncLifetimeKills: (identity: string) => void;
  refreshGemCounter: () => void;
  refreshBalanceApologyGift: () => void;
  refreshDailyGemBonus: () => void;
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
  updateProtocolGate: (account: AccountState) => void;
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
    dependencies.refreshBalanceApologyGift();
    dependencies.refreshDailyGemBonus();
    const account = coop.accountState?.();
    dependencies.updateProtocolGate(account);
    dependencies.refreshChat();
    dependencies.updateDuelControls();
    dependencies.refreshAppStatus();
    dependencies.refreshReconnectOverlay();
  }

  return { onChange };
}
