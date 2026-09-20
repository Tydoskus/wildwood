import { createGemShopController } from "./gem-shop-controller";
import { recentReleaseNotes } from "../app/changelog";
import { isDeveloperIdentity } from "../app/developer";
import {
  VIRTUAL_PLAYER_MOVEMENT_HZ,
  VIRTUAL_PLAYER_SAVE_INTERVAL_MS,
} from "../../shared/virtual-player-load-test";
import { createDevPanelController } from "./dev-panel-controller";
import { createEndlessTravelControl } from "./endless-travel-control";
import { createGameActionsController } from "./game-actions-controller";
import { createLeaderboardController } from "./leaderboard-controller";
import { createOverlaysController } from "./overlays-controller";
import { createRuntimeHudController } from "./runtime-hud-controller";
import { createPrestigeController } from "./prestige-panel";
import { createTechTreeController } from "./tech-tree-controller";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createGameOverlays(d: Record<string, any>) {
  const { e, coop } = d;
  const overlays = createOverlaysController({ update: { overlay: e.updateNoticeEl, items: e.updateNoticeItemsEl, toggle: e.signinVersionButton }, iconPicker: { overlay: e.profileIconPickerEl, choices: e.profileIconChoices, close: e.closeProfileIconPickerBtn } }, {
    supporter: coop,
    releases: () => recentReleaseNotes(2), connected: () => Boolean(coop?.isConnected?.()), selectedIcon: () => coop?.profileIcon?.() ?? 0, setIcon: async (index: number) => coop?.setProfileIcon?.(index), paintIcon: d.applyProfileIcon, afterIconSet: d.afterIconSet, showMessage: d.showMessage,
  });
  e.signinVersionButton.textContent = `v${d.version}`;
  e.signinVersionButton.setAttribute("aria-label", `WildStat version ${d.version}. Toggle release notes`);
  e.minimapVersionEl.textContent = `v${d.version}`;
  e.minimapVersionEl.setAttribute("aria-label", `Game version ${d.version}. Open release notes`);
  return overlays;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createGameRuntimeHud(d: Record<string, any>) {
  const { e, coop } = d;
  const controller = createRuntimeHudController({ elements: { message: e.messageEl, pickupLog: e.pickupLog, itemDropReveal: e.itemDropReveal, hpFill: e.hpFill, hpText: e.hpText, playerName: e.playerNameEl, playerPower: e.playerPowerEl, coopStatus: e.coopStatusEl, minimapPlayers: e.minimapPlayersEl, playerIcon: e.playerHudProfileIcon, duelControls: e.duelControls, duelStatus: e.duelStatusEl, duelRequest: e.duelRequestBtn, duelAccept: e.duelAcceptBtn, duelCountdown: e.duelCountdownEl, duelResult: e.duelResultEl, duelResultTitle: e.duelResultTitle, duelResultStats: e.duelResultStats, shareDuelBtn: e.shareDuelBtn, watchDuelReplay: e.watchDuelReplayBtn }, player: d.player, activeDuel: d.activeDuel, duelOpponentName: d.duelOpponentName, localDisplayName: () => coop?.localDisplayName?.() || "", localIdentity: () => coop?.localIdentity?.(), isGuest: (identity: string | undefined) => coop?.isGuest?.(identity) ?? false, playerGender: (identity: string | undefined) => coop?.playerGender?.(identity) ?? 0, remotePlayerCount: () => coop?.remotePlayerCount?.() ?? coop?.remotePlayers?.().length ?? 0, onlinePlayerCount: () => coop?.onlinePlayerCount?.() ?? null, connected: () => Boolean(coop?.isConnected?.()), isDeveloper: () => isDeveloperIdentity(coop?.localIdentity?.()), profileIcon: () => coop?.profileIcon?.() ?? 0, applyProfileIcon: d.applyProfileIcon, playerPower: d.playerPower, setDeveloperAccess: d.setDeveloperAccess, applyVitalityResearch: d.applyVitalityResearch, updateTechNotice: d.updateTechNotice, tickTechTree: d.tickTechTree, refreshAppStatus: d.refreshAppStatus, updateProfileDuelButton: d.updateProfileDuelButton, pulseDuel: () => { coop?.pulseDuel?.(); }, shareDuel: (id: bigint) => coop?.shareDuelReplay?.(id) ?? Promise.resolve({ ok: false, error: "NOT CONNECTED" }) });
  e.shareDuelBtn.addEventListener("click", () => { void controller.shareDuelResult(); });
  return controller;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createPrestigePanel(d: Record<string, any>) {
  const e = d.e;
  return createPrestigeController({ openButton: e.prestigeBtn, ownActions: e.profileOwnActions, overlay: e.prestigeOverlay,
    closeButton: e.closePrestigeBtn, confirmButton: e.prestigeConfirmBtn, level: e.prestigeLevel, bonus: e.prestigeBonus,
    points: e.prestigePoints, peak: e.prestigePeak, cost: e.prestigeCost, status: e.prestigeStatus,
    prestige: d.prestige, unlocked: d.unlocked, runPrestige: d.runPrestige,
    showMessage: d.showMessage, beforeOpen: d.beforeOpen });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createTechTreePanel(d: Record<string, any>) {
  const e = d.e;
  return createTechTreeController({ notice: e.techTreeNotice, overlay: e.techTreeOverlay, closeButton: e.closeTechTreeBtn, active: e.techTreeActive, canvas: e.techTreeCanvas, map: e.techTreeMap, detail: e.techTreeDetail, detailContent: e.techTreeDetailContent, closeDetailButton: e.closeTechTreeDetailBtn }, {
    researchRanks: d.researchRanks, activeResearch: d.activeResearch, startResearch: d.startResearch, gemBalance: d.gemBalance, speedUpResearch: d.speedUpResearch, showMessage: d.showMessage, beforeOpen: d.beforeOpen, nowMs: () => Date.now(),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDevPanel(d: Record<string, any>) {
  const { coop } = d;
  const travel = createEndlessTravelControl(document.getElementById("developerSettingsRow")!.parentElement!, {
    allowed: () => coop?.canTeleportEndless?.() === true,
    travel: d.teleportEndless,
    showMessage: d.showMessage,
  });
  document.getElementById("developerSettingsRow")!.after(travel.element);
  const panel = createDevPanelController({
    teleportPlayer: d.teleportPlayer,
    balance: {
      load: () => coop.balanceEditor(), preview: (map, settings) => coop.previewBalance(map, settings),
      save: (revision, settings) => coop.saveBalance(revision, settings), restore: (expected, revision) => coop.restoreBalance(expected, revision),
    },
    forestPrototype: {
      state: () => coop?.forestRewardPrototypeState?.() ?? null,
      send: (action) => coop?.devForestRewardPrototype?.(action),
    },
    isDeveloper: () => isDeveloperIdentity(coop?.localIdentity?.()),
    getNameTagVisible: () => coop?.developerNameTagVisible?.() !== false,
    setNameTagVisible: (visible: boolean) => coop?.setDeveloperNameTag?.(visible),
    getPresenceVisible: () => coop?.developerPresenceVisible?.() === true,
    setPresenceVisible: (visible: boolean) => coop?.setDeveloperPresence?.(visible),
    getVirtualPlayerLoadTest: () => coop?.virtualPlayerLoadTestState?.() ?? { phase: "idle", requested: 0, connected: 0, failures: 0, movementHz: VIRTUAL_PLAYER_MOVEMENT_HZ, saveIntervalMs: VIRTUAL_PLAYER_SAVE_INTERVAL_MS },
    startVirtualPlayers: (count: number) => coop?.startVirtualPlayers?.(count),
    stopVirtualPlayers: () => coop?.stopVirtualPlayers?.(),
    loadModerationHistory: (beforeId) => coop?.moderationHistory?.(beforeId) ?? Promise.reject(new Error("Connect to view moderation history.")),
    getBugReports: () => coop?.bugReportEntries?.() ?? [],
    deleteBugReport: (id: bigint) => coop?.deleteBugReport?.(id),
    getMetrics: d.getMetrics,
    closeCompetingWindows: d.closeCompetingWindows,
    showMessage: d.showMessage,
  });
  return { ...panel, setDeveloperAccess(developer: boolean) {
    panel.setDeveloperAccess(developer);
    travel.render();
  } };
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
  const shop = createGemShopController({ button: e.shopBtn, setOpen: d.setShopOpen, openSupporter: d.openSupporter, supporter: d.coop });
  return createGameActionsController({
    shop,
    elements: {
      settingsButton: e.settingsBtn, settingsPanel: e.settingsPanel, closeSettingsButton: e.closeSettingsBtn,
      inventoryButton: e.inventoryBtn, inventoryPanel: e.inventoryPanel, closeInventoryButton: e.closeInventoryBtn,
      shopButton: e.shopBtn,
      resetProgressButton: e.resetProgressBtn, bootUpgrade: e.bootUpgradeEl,
      bootUpgradeClose: e.bootUpgradeClose, closeDuelResultButton: e.closeDuelResultBtn,
      closeDuelReplayButton: e.closeDuelReplayBtn,
    },
    inventory: d.inventory,
    closeCompetingWindows: d.closeCompetingWindows,
    minimizeChat: d.minimizeChat,
    prepareInventoryOpen: d.inventoryController.prepareOpen,
    closeItemInspection: d.itemInspectionController.close,
    renderInventory: d.renderInventory,
    logPickup: d.logPickup,
    showMessage: d.showMessage,
    leaveDuelResult: d.leaveDuelResult,
    closeDuelReplay: d.closeDuelReplay,
    closeBootUpgrade: d.closeBootUpgrade,
    resetServerProgress: d.resetServerProgress,
    setResetPending: d.setResetPending,
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
      isRespawnAdPromptOpen: d.rewardedRespawnAd.isPromptOpen,
      closeRespawnAdPrompt: d.rewardedRespawnAd.closePrompt,
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
