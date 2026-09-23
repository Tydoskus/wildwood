import { wildstatCoop } from "../../wildstat-coop";
import { createFrameCoalescer, type FrameCoalescerScheduler } from "./frame-coalescer";

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
  scheduler?: FrameCoalescerScheduler;
};

/**
 * Applies a server-table change to the local gameplay and account session.
 *
 * Every kill, presence row and profile row notifies, so a busy map asks for
 * this many times a frame. Steady-state changes share one pass per frame. A
 * new session or a changed identity still runs at once: movement sync, the
 * protocol gate and startup must not see one frame of the previous session.
 */
export function createCoopSessionController(dependencies: CoopSessionDependencies) {
  let refreshedIdentity = "";
  const coalescer = createFrameCoalescer(refresh, dependencies.scheduler);

  function onChange() {
    const coop = dependencies.coop;
    if (!coop) return;
    const sessionChanged = (coop.sessionGeneration?.() || 0) !== dependencies.observedSessionGeneration();
    if (sessionChanged || (coop.localIdentity?.() || "") !== refreshedIdentity) refreshNow();
    else coalescer.request();
  }

  function refreshNow() {
    coalescer.cancel();
    refresh();
  }

  function refresh() {
    const coop = dependencies.coop;
    if (!coop) return;

    const identity = coop.localIdentity?.() || "";
    refreshedIdentity = identity;
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

  return { onChange, refreshNow };
}
