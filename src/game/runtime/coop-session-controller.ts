import { wildstatCoop } from "../../wildstat-coop";
import { createFrameCoalescer, type FrameCoalescerScheduler } from "./frame-coalescer";
import { lookRefine, setLocalItemRefineSource } from "../local-item-refines";

type CoopClient = typeof wildstatCoop;

/**
 * The coop client, and the bridge every kill is reported through: regular,
 * Auto Farm, personal and procedural bosses. The window API has no kill call;
 * the game claims this bridge once, at boot, and nothing else can afterwards.
 * Each report carries the game time the session simulated since the previous.
 */
export function claimCoopClient(simulatedSeconds: () => number) {
  const coop: CoopClient | null = window.wildstatCoop ?? window.wildwoodCoop ?? null;
  const gameBridge = coop?.claimGameBridge?.(simulatedSeconds) ?? null;
  // coop-client.js is a bundle of its own, so the character's refine looks read the client here.
  setLocalItemRefineSource(lookRefine(itemId => coop?.itemRefine?.(itemId) ?? 0, itemId => coop?.cosmeticRefine?.(itemId) ?? 0));
  // Every kill this session would be dropped without a word; say so where it can be seen.
  if (coop && !gameBridge) console.error("WildStat: kill reporting is unavailable (the game bridge was already claimed or refused).");
  return { coop, gameBridge };
}
type AccountState = ReturnType<CoopClient["accountState"]>;

/** Refresh row-backed windows even when the saved inventory's ownership has not changed. */
export function createSessionWindowRefresh(options: {
  coop: CoopClient | null;
  playerSafety: { refresh: () => void };
  profileWindow: { identity: () => string | null; render: (profile: NonNullable<ReturnType<CoopClient["playerProfile"]>>) => void };
  inventory: { render: () => void };
  smith: { isOpen: () => boolean; render: () => void };
  cardSeller?: { isOpen: () => boolean; render: () => void };
  gearSellers?: { isOpen: () => boolean; render: () => void; refreshNotice: () => void };
}) {
  return () => {
    options.playerSafety.refresh();
    options.inventory.render();
    if (options.smith.isOpen()) options.smith.render();
    if (options.cardSeller?.isOpen()) options.cardSeller.render();
    if (options.gearSellers?.isOpen()) options.gearSellers.render();
    options.gearSellers?.refreshNotice();
    const identity = options.profileWindow.identity();
    const profile = identity ? options.coop?.playerProfile?.(identity) : null;
    if (profile) options.profileWindow.render(profile);
  };
}

type CoopSessionDependencies = {
  coop: CoopClient | null;
  syncLifetimeKills: (identity: string) => void;
  refreshGemCounter: () => void;
  refreshGiftsAndMail: () => void;
  refreshWindows: () => void;
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
    dependencies.refreshLeaderboard();
    dependencies.refreshDevPanel();
    dependencies.loadProgress();
    dependencies.refreshWindows();

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
    dependencies.refreshGiftsAndMail();
    const account = coop.accountState?.();
    dependencies.updateProtocolGate(account);
    dependencies.refreshChat();
    dependencies.updateDuelControls();
    dependencies.refreshAppStatus();
    dependencies.refreshReconnectOverlay();
  }

  return { onChange, refreshNow };
}
