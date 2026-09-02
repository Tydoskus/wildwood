import { recentReleaseNotes } from "../app/changelog";
import { isDeveloperIdentity } from "../app/developer";
import {
  VIRTUAL_PLAYER_MOVEMENT_HZ,
  VIRTUAL_PLAYER_SAVE_INTERVAL_MS,
} from "../../shared/virtual-player-load-test";
import { createDevPanelController } from "./dev-panel-controller";
import { createGameActionsController } from "./game-actions-controller";
import { createLeaderboardController } from "./leaderboard-controller";
import { createOverlaysController } from "./overlays-controller";
import { createRuntimeHudController } from "./runtime-hud-controller";
import { createTechTreeController } from "./tech-tree-controller";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createGameOverlays(d: Record<string, any>) {
  const { e, coop } = d;
  const overlays = createOverlaysController({ update: { overlay: e.updateNoticeEl, items: e.updateNoticeItemsEl, toggle: e.signinVersionButton }, iconPicker: { overlay: e.profileIconPickerEl, choices: e.profileIconChoices, close: e.closeProfileIconPickerBtn } }, {
    releases: () => recentReleaseNotes(2), connected: () => Boolean(coop?.isConnected?.()), selectedIcon: () => coop?.profileIcon?.() ?? 0, setIcon: async (index: number) => coop?.setProfileIcon?.(index), paintIcon: d.applyProfileIcon, afterIconSet: d.afterIconSet, showMessage: d.showMessage,
  });
  e.signinVersionButton.textContent = `v${d.version}`;
  e.signinVersionButton.setAttribute("aria-label", `WildStat version ${d.version}. Toggle release notes`);
  e.minimapVersionEl.textContent = `v${d.version}`;
  e.minimapVersionEl.setAttribute("aria-label", `Game version ${d.version}`);
  return overlays;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createGameRuntimeHud(d: Record<string, any>) {
  const { e, coop } = d;
  return createRuntimeHudController({ elements: { message: e.messageEl, pickupLog: e.pickupLog, itemDropReveal: e.itemDropReveal, hpFill: e.hpFill, hpText: e.hpText, playerName: e.playerNameEl, playerPower: e.playerPowerEl, coopStatus: e.coopStatusEl, minimapPlayers: e.minimapPlayersEl, playerIcon: e.playerHudProfileIcon, duelControls: e.duelControls, duelStatus: e.duelStatusEl, duelRequest: e.duelRequestBtn, duelAccept: e.duelAcceptBtn, duelCountdown: e.duelCountdownEl, duelResult: e.duelResultEl, duelResultTitle: e.duelResultTitle, duelResultStats: e.duelResultStats, watchDuelReplay: e.watchDuelReplayBtn }, player: d.player, activeDuel: d.activeDuel, duelOpponentName: d.duelOpponentName, localDisplayName: () => coop?.localDisplayName?.() || "", localIdentity: () => coop?.localIdentity?.(), isGuest: (identity: string | undefined) => coop?.isGuest?.(identity) ?? false, playerGender: (identity: string | undefined) => coop?.playerGender?.(identity) ?? 0, remotePlayerCount: () => coop?.remotePlayerCount?.() ?? coop?.remotePlayers?.().length ?? 0, onlinePlayerCount: () => coop?.onlinePlayerCount?.() ?? null, connected: () => Boolean(coop?.isConnected?.()), isDeveloper: () => isDeveloperIdentity(coop?.localIdentity?.()), profileIcon: () => coop?.profileIcon?.() ?? 0, applyProfileIcon: d.applyProfileIcon, playerPower: d.playerPower, setDeveloperAccess: d.setDeveloperAccess, applyVitalityResearch: d.applyVitalityResearch, updateTechNotice: d.updateTechNotice, tickTechTree: d.tickTechTree, refreshAppStatus: d.refreshAppStatus, updateProfileDuelButton: d.updateProfileDuelButton, pulseDuel: () => { coop?.pulseDuel?.(); } });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createTechTreePanel(d: Record<string, any>) {
  const e = d.e;
  return createTechTreeController({ button: e.techTreeBtn, notice: e.techTreeNotice, overlay: e.techTreeOverlay, closeButton: e.closeTechTreeBtn, active: e.techTreeActive, canvas: e.techTreeCanvas, map: e.techTreeMap, detail: e.techTreeDetail, detailContent: e.techTreeDetailContent, closeDetailButton: e.closeTechTreeDetailBtn }, {
    researchRanks: d.researchRanks, activeResearch: d.activeResearch, startResearch: d.startResearch, gemBalance: d.gemBalance, speedUpResearch: d.speedUpResearch, showMessage: d.showMessage, beforeOpen: d.beforeOpen, nowMs: () => Date.now(),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDevPanel(d: Record<string, any>) {
  const { coop } = d;
  return createDevPanelController({
    isDeveloper: () => isDeveloperIdentity(coop?.localIdentity?.()),
    getPresenceVisible: () => coop?.developerPresenceVisible?.() === true,
    setPresenceVisible: (visible: boolean) => coop?.setDeveloperPresence?.(visible),
    getVirtualPlayerLoadTest: () => coop?.virtualPlayerLoadTestState?.() ?? { phase: "idle", requested: 0, connected: 0, failures: 0, movementHz: VIRTUAL_PLAYER_MOVEMENT_HZ, saveIntervalMs: VIRTUAL_PLAYER_SAVE_INTERVAL_MS },
    startVirtualPlayers: (count: number) => coop?.startVirtualPlayers?.(count),
    stopVirtualPlayers: () => coop?.stopVirtualPlayers?.(),
    getBugReports: () => coop?.bugReportEntries?.() ?? [],
    deleteBugReport: (id: bigint) => coop?.deleteBugReport?.(id),
    getMetrics: d.getMetrics,
    closeCompetingWindows: d.closeCompetingWindows,
    showMessage: d.showMessage,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createLeaderboardPanel(d: Record<string, any>) {
  const e = d.e;
  return createLeaderboardController({ button: e.leaderboardBtn, overlay: e.leaderboardEl, closeButton: e.closeLeaderboardBtn, tabs: { power: e.leaderboardPowerTab, damage: e.leaderboardDamageTab, health: e.leaderboardHealthTab, armor: e.leaderboardArmorTab, regen: e.leaderboardRegenTab, time: e.leaderboardTimeTab }, valueHeading: e.leaderboardValueHeading, podium: e.leaderboardPodiumEl, rows: e.leaderboardRowsEl, loading: e.leaderboardLoadingEl, empty: e.leaderboardEmptyEl }, d.options);
}

/** Wires standard game-window actions and escape priority from UI controllers. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createGameActionsRuntime(d: Record<string, any>) {
  const e = d.e;
  return createGameActionsController({
    elements: {
      settingsButton: e.settingsBtn, settingsPanel: e.settingsPanel, closeSettingsButton: e.closeSettingsBtn,
      inventoryButton: e.inventoryBtn, inventoryPanel: e.inventoryPanel, closeInventoryButton: e.closeInventoryBtn,
      resetProgressButton: e.resetProgressBtn, bootUpgrade: e.bootUpgradeEl,
      bootUpgradeClose: e.bootUpgradeClose, closeDuelResultButton: e.closeDuelResultBtn,
      closeDragonResultButton: e.closeDragonResultBtn, dragonResult: e.dragonResultEl,
      closeDuelReplayButton: e.closeDuelReplayBtn,
    },
    inventory: d.inventory,
    closeCompetingWindows: d.closeCompetingWindows,
    minimizeChat: d.minimizeChat,
    prepareInventoryOpen: d.inventoryController.prepareOpen,
    closeItemInspection: d.itemInspectionController.close,
    renderInventory: d.renderInventory,
    logPickup: d.logPickup,
    leaveDuelResult: d.leaveDuelResult,
    closeDuelReplay: d.closeDuelReplay,
    closeBootUpgrade: d.closeBootUpgrade,
    resetServerProgress: d.resetServerProgress,
    clearProgressState: d.clearProgressState,
    setTotalKills: d.setTotalKills,
    setBootsCollected: d.setBootsCollected,
    clearPlayerInput: d.clearPlayerInput,
    resetGame: d.resetGame,
    stopGame: d.stopGame,
    restartStartup: d.restartStartup,
    hideGameOver: d.hideGameOver,
    refreshFrameClock: d.refreshFrameClock,
    escapeWindows: {
      isMapGuideOpen: d.mapGuide.isOpen,
      closeMapGuide: d.mapGuide.close,
      isItemInspectionOpen: d.itemInspectionController.isOpen,
      closeItemInspection: d.itemInspectionController.close,
      isUpgradeBenchOpen: d.upgradeBenchController.isOpen,
      closeUpgradeBench: d.upgradeBenchController.close,
      isProfileIconPickerOpen: () => !e.profileIconPickerEl.hidden,
      closeProfileIconPicker: d.closeProfileIconPicker,
      isLeaderboardOpen: d.leaderboard.isOpen,
      closeLeaderboard: d.closeLeaderboard,
      isDevPanelOpen: d.devPanel.isOpen,
      closeDevPanel: d.devPanel.close,
      isProfileNameEditorOpen: d.profileWindow.isNameEditorOpen,
      closeProfileNameEditor: d.profileWindow.closeNameEditor,
      isPlayerProfileOpen: d.profileWindow.isOpen,
      closePlayerProfile: d.profileWindow.close,
    },
  });
}
