import { recentReleaseNotes } from "../app/changelog";
import { isDeveloperIdentity } from "../app/developer";
import type { ResearchId } from "../../shared/research";
import { createAppShellController } from "./app-shell-controller";
import { createDevPanelController } from "./dev-panel-controller";
import { createGameActionsController } from "./game-actions-controller";
import { createLeaderboardController } from "./leaderboard-controller";
import { createOverlaysController } from "./overlays-controller";
import { createRuntimeHudController } from "./runtime-hud-controller";
import { createStartupController } from "./startup-controller";
import { createTechTreeController } from "./tech-tree-controller";

/** UI controller composition. Dependencies stay explicit at the composition boundary. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createGameUiRuntime(d: Record<string, any>) {
  const { elements: e, coop } = d;
  const overlays = createOverlaysController({
    update: { overlay: e.updateNoticeEl, title: e.updateNoticeTitleEl, items: e.updateNoticeItemsEl, close: e.closeUpdateNoticeBtn },
    iconPicker: { overlay: e.profileIconPickerEl, choices: e.profileIconChoices, close: e.closeProfileIconPickerBtn },
  }, {
    version: d.version, releases: () => recentReleaseNotes(2),
    seenVersion: () => { try { return localStorage.getItem(d.seenVersionKey) || ""; } catch { return ""; } },
    markSeen: () => { try { localStorage.setItem(d.seenVersionKey, d.version); } catch {} },
    connected: () => Boolean(coop?.isConnected?.()), selectedIcon: () => coop?.profileIcon?.() ?? 0,
    setIcon: async (index: number) => coop?.setProfileIcon?.(index), paintIcon: d.applyProfileIcon,
    afterIconSet: () => { d.applyProfileIcon(e.playerHudProfileIcon, coop?.profileIcon?.() ?? 0); if (d.profileWindow.identity() === coop?.localIdentity?.()) d.applyProfileIcon(e.playerProfileIcon, coop?.profileIcon?.() ?? 0); },
    showMessage: d.showMessage,
  });
  e.signinVersionEl.textContent = `v${d.version}`;

  const appShell = createAppShellController({
    mapMusic: d.mapMusic, storageKeys: d.storageKeys,
    connected: () => Boolean(coop?.isConnected?.()), latencyMs: () => coop?.latencyMs?.(), accountState: () => coop?.accountState?.(),
    signIn: () => { void coop?.signIn?.(); }, signOut: () => { coop?.signOut?.(); }, canPlayMusic: d.canPlayMusic,
    onScreenShakeDisabled: d.onScreenShakeDisabled, onLowPerformanceChanged: d.onLowPerformanceChanged, showMessage: d.showMessage,
  });

  const startup = createStartupController({
    accountState: () => coop?.accountState?.(), connected: () => Boolean(coop?.isConnected?.()), knownCharacter: () => coop?.knownCharacter?.() ?? "", defaultPlayerName: () => coop?.localDisplayName?.() ?? "WANDERER",
    isSignInScreenReady: d.isSignInScreenReady, getLoadingStages: d.getLoadingStages, onLoadingComplete: d.finishStartup,
    onShowAccountChoice: overlays.showUpdateNotice,
    onShowConnecting: () => { e.dragonResultEl.hidden = true; e.dragonWorldNoticeEl.hidden = true; },
    onContinueGuest: () => { d.setGuestContinuationChosen(); coop?.continueAsGuest?.(); d.finishStartup(); },
    onBeginAdventure: (name: string) => { if (name !== (coop?.localDisplayName?.() || "")) coop?.setDisplayName?.(name); d.startGame(true); },
    signIn: () => coop?.signIn?.(), takeOverSession: () => coop?.takeOverSession?.(), showMessage: d.showMessage,
  });

  let techTree: ReturnType<typeof createTechTreeController>;
  let leaderboard: ReturnType<typeof createLeaderboardController>;
  let devPanel: ReturnType<typeof createDevPanelController>;
  const closeLeaderboard = () => leaderboard.close();
  techTree = createTechTreeController({ button: e.techTreeBtn, notice: e.techTreeNotice, overlay: e.techTreeOverlay, closeButton: e.closeTechTreeBtn, active: e.techTreeActive, canvas: e.techTreeCanvas, map: e.techTreeMap, detail: e.techTreeDetail, detailContent: e.techTreeDetailContent, closeDetailButton: e.closeTechTreeDetailBtn }, {
    researchRanks: d.researchRanks, activeResearch: () => coop?.activeResearch?.() ?? null, startResearch: async (id: ResearchId) => coop?.startResearch?.(id), showMessage: d.showMessage,
    beforeOpen: () => { e.settingsPanel.hidden = true; e.inventoryPanel.hidden = true; closeLeaderboard(); devPanel.close(); }, nowMs: () => Date.now(),
  });
  leaderboard = createLeaderboardController({ button: e.leaderboardBtn, overlay: e.leaderboardEl, closeButton: e.closeLeaderboardBtn, tabs: { power: e.leaderboardPowerTab, damage: e.leaderboardDamageTab, health: e.leaderboardHealthTab, armor: e.leaderboardArmorTab, regen: e.leaderboardRegenTab, time: e.leaderboardTimeTab }, valueHeading: e.leaderboardValueHeading, rows: e.leaderboardRowsEl, loading: e.leaderboardLoadingEl, empty: e.leaderboardEmptyEl }, {
    entries: () => coop?.leaderboardEntries?.() ?? [], loadSnapshot: async () => coop?.loadLeaderboardSnapshot?.() ?? [], localIdentity: () => coop?.localIdentity?.() || "", isDeveloper: isDeveloperIdentity,
    paintProfileIcon: (canvas: HTMLCanvasElement, identity: string) => d.paintProfileIconCanvas(canvas, coop?.profileIcon?.(identity) ?? 0), openProfile: (identity: string, name: string) => { void d.profileWindow.open(identity, name); },
    beforeOpen: () => { devPanel.close(); techTree.close(); e.settingsPanel.hidden = true; e.inventoryPanel.hidden = true; e.settingsBtn.setAttribute("aria-expanded", "false"); e.inventoryBtn.setAttribute("aria-expanded", "false"); },
  });
  devPanel = createDevPanelController({
    isDeveloper: () => isDeveloperIdentity(coop?.localIdentity?.()), getPresenceVisible: () => coop?.developerPresenceVisible?.() === true, setPresenceVisible: (visible: boolean) => coop?.setDeveloperPresence?.(visible), getBugReports: () => coop?.bugReportEntries?.() ?? [], deleteBugReport: (id: bigint) => coop?.deleteBugReport?.(id), getMetrics: d.getMetrics,
    getVirtualPlayerLoadTest: () => coop?.virtualPlayerLoadTestState?.() ?? { phase: "idle", requested: 0, connected: 0, failures: 0, movementHz: 15, saveIntervalMs: 2_500 },
    startVirtualPlayers: (count: number) => coop?.startVirtualPlayers?.(count),
    stopVirtualPlayers: () => coop?.stopVirtualPlayers?.(),
    closeCompetingWindows: () => { e.settingsPanel.hidden = true; e.inventoryPanel.hidden = true; closeLeaderboard(); techTree.close(); }, showMessage: d.showMessage,
  });
  const runtimeHud = createRuntimeHudController({
    elements: { message: e.messageEl, pickupLog: e.pickupLog, hpFill: e.hpFill, hpText: e.hpText, playerName: e.playerNameEl, playerPower: e.playerPowerEl, coopStatus: e.coopStatusEl, playerIcon: e.playerHudProfileIcon, duelControls: e.duelControls, duelStatus: e.duelStatusEl, duelRequest: e.duelRequestBtn, duelAccept: e.duelAcceptBtn, duelCountdown: e.duelCountdownEl, duelResult: e.duelResultEl, duelResultTitle: e.duelResultTitle, duelResultStats: e.duelResultStats, watchDuelReplay: e.watchDuelReplayBtn },
    player: d.player, activeDuel: d.activeDuel, duelOpponentName: d.duelOpponentName, localDisplayName: () => coop?.localDisplayName?.() || "", localIdentity: () => coop?.localIdentity?.(), isGuest: (identity: string | undefined) => coop?.isGuest?.(identity) ?? false, remotePlayerCount: () => coop?.remotePlayerCount?.() ?? coop?.remotePlayers?.().length ?? 0, onlinePlayerCount: () => coop?.onlinePlayerCount?.() ?? null, connected: () => Boolean(coop?.isConnected?.()), isDeveloper: () => isDeveloperIdentity(coop?.localIdentity?.()), profileIcon: () => coop?.profileIcon?.() ?? 0,
    applyProfileIcon: d.applyProfileIcon, playerPower: d.playerPower, setDeveloperAccess: devPanel.setDeveloperAccess, applyVitalityResearch: d.applyVitalityResearch, updateTechNotice: techTree.updateNotice, tickTechTree: techTree.tick, refreshAppStatus: appShell.refreshStatus, updateProfileDuelButton: d.profileWindow.updateDuelButton, pulseDuel: () => { coop?.pulseDuel?.(); },
  });
  return { overlays, appShell, startup, techTree, leaderboard, devPanel, runtimeHud, closeLeaderboard };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createGameOverlays(d: Record<string, any>) {
  const { e, coop } = d;
  const overlays = createOverlaysController({ update: { overlay: e.updateNoticeEl, title: e.updateNoticeTitleEl, items: e.updateNoticeItemsEl, close: e.closeUpdateNoticeBtn }, iconPicker: { overlay: e.profileIconPickerEl, choices: e.profileIconChoices, close: e.closeProfileIconPickerBtn } }, {
    version: d.version, releases: () => recentReleaseNotes(2), seenVersion: () => { try { return localStorage.getItem(d.seenVersionKey) || ""; } catch { return ""; } }, markSeen: () => { try { localStorage.setItem(d.seenVersionKey, d.version); } catch {} }, connected: () => Boolean(coop?.isConnected?.()), selectedIcon: () => coop?.profileIcon?.() ?? 0, setIcon: async (index: number) => coop?.setProfileIcon?.(index), paintIcon: d.applyProfileIcon, afterIconSet: d.afterIconSet, showMessage: d.showMessage,
  });
  e.signinVersionEl.textContent = `v${d.version}`;
  return overlays;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createGameRuntimeHud(d: Record<string, any>) {
  const { e, coop } = d;
  return createRuntimeHudController({ elements: { message: e.messageEl, pickupLog: e.pickupLog, hpFill: e.hpFill, hpText: e.hpText, playerName: e.playerNameEl, playerPower: e.playerPowerEl, coopStatus: e.coopStatusEl, playerIcon: e.playerHudProfileIcon, duelControls: e.duelControls, duelStatus: e.duelStatusEl, duelRequest: e.duelRequestBtn, duelAccept: e.duelAcceptBtn, duelCountdown: e.duelCountdownEl, duelResult: e.duelResultEl, duelResultTitle: e.duelResultTitle, duelResultStats: e.duelResultStats, watchDuelReplay: e.watchDuelReplayBtn }, player: d.player, activeDuel: d.activeDuel, duelOpponentName: d.duelOpponentName, localDisplayName: () => coop?.localDisplayName?.() || "", localIdentity: () => coop?.localIdentity?.(), isGuest: (identity: string | undefined) => coop?.isGuest?.(identity) ?? false, remotePlayerCount: () => coop?.remotePlayerCount?.() ?? coop?.remotePlayers?.().length ?? 0, onlinePlayerCount: () => coop?.onlinePlayerCount?.() ?? null, connected: () => Boolean(coop?.isConnected?.()), isDeveloper: () => isDeveloperIdentity(coop?.localIdentity?.()), profileIcon: () => coop?.profileIcon?.() ?? 0, applyProfileIcon: d.applyProfileIcon, playerPower: d.playerPower, setDeveloperAccess: d.setDeveloperAccess, applyVitalityResearch: d.applyVitalityResearch, updateTechNotice: d.updateTechNotice, tickTechTree: d.tickTechTree, refreshAppStatus: d.refreshAppStatus, updateProfileDuelButton: d.updateProfileDuelButton, pulseDuel: () => { coop?.pulseDuel?.(); } });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createTechTreePanel(d: Record<string, any>) {
  const e = d.e;
  return createTechTreeController({ button: e.techTreeBtn, notice: e.techTreeNotice, overlay: e.techTreeOverlay, closeButton: e.closeTechTreeBtn, active: e.techTreeActive, canvas: e.techTreeCanvas, map: e.techTreeMap, detail: e.techTreeDetail, detailContent: e.techTreeDetailContent, closeDetailButton: e.closeTechTreeDetailBtn }, {
    researchRanks: d.researchRanks, activeResearch: d.activeResearch, startResearch: d.startResearch, showMessage: d.showMessage, beforeOpen: d.beforeOpen, nowMs: () => Date.now(),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDevPanel(d: Record<string, any>) {
  const { coop } = d;
  return createDevPanelController({
    isDeveloper: () => isDeveloperIdentity(coop?.localIdentity?.()),
    getPresenceVisible: () => coop?.developerPresenceVisible?.() === true,
    setPresenceVisible: (visible: boolean) => coop?.setDeveloperPresence?.(visible),
    getVirtualPlayerLoadTest: () => coop?.virtualPlayerLoadTestState?.() ?? { phase: "idle", requested: 0, connected: 0, failures: 0, movementHz: 15, saveIntervalMs: 2_500 },
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
  return createLeaderboardController({ button: e.leaderboardBtn, overlay: e.leaderboardEl, closeButton: e.closeLeaderboardBtn, tabs: { power: e.leaderboardPowerTab, damage: e.leaderboardDamageTab, health: e.leaderboardHealthTab, armor: e.leaderboardArmorTab, regen: e.leaderboardRegenTab, time: e.leaderboardTimeTab }, valueHeading: e.leaderboardValueHeading, rows: e.leaderboardRowsEl, loading: e.leaderboardLoadingEl, empty: e.leaderboardEmptyEl }, d.options);
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
      closeUpdateNoticeButton: e.closeUpdateNoticeBtn, closeDuelReplayButton: e.closeDuelReplayBtn,
    },
    inventory: d.inventory,
    closeCompetingWindows: d.closeCompetingWindows,
    clearInventorySelection: d.inventoryController.clearSelection,
    renderInventory: d.renderInventory,
    logPickup: d.logPickup,
    leaveDuelResult: d.leaveDuelResult,
    closeUpdateNotice: d.closeUpdateNotice,
    closeDuelReplay: d.closeDuelReplay,
    closeBootUpgrade: d.closeBootUpgrade,
    resetServerProgress: d.resetServerProgress,
    clearProgressState: d.clearProgressState,
    setTotalKills: d.setTotalKills,
    setBootsCollected: d.setBootsCollected,
    clearPlayerInput: d.clearPlayerInput,
    resetGame: d.resetGame,
    stopGame: d.stopGame,
    startConnecting: d.startConnecting,
    hideGameOver: d.hideGameOver,
    refreshFrameClock: d.refreshFrameClock,
    escapeWindows: {
      isProfileIconPickerOpen: () => !e.profileIconPickerEl.hidden,
      closeProfileIconPicker: d.closeProfileIconPicker,
      isInventoryInspectOpen: d.inventoryController.isInspectOpen,
      closeInventoryInspect: d.inventoryController.close,
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
