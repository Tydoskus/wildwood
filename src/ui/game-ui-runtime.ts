import { onProfileSnapshotsChanged } from "../app/profile-snapshot-portraits";
export { challengeMinimumInterval } from "../../shared/prestige-challenge";
export { attackCapInterval } from "../../shared/stat-rating";
export { createSmithRuntime } from "./smith-window";
export { createCardSellerRuntime } from "./card-seller-window";
export { createExchangeRuntime } from "./exchange-window";
export { createGearSellerRuntime } from "./gear-seller-window";
import type { GearSeller } from "../../shared/grade-shop";
export { createSchoolWindowRuntime } from "./school-window";
export { createStarterChestRuntime } from "./starter-chest-window";
export { watchCardDrops } from "./card-drop-feedback";
import { createGemShopController } from "./gem-shop-controller";
import { installDesktopHotkeys } from "./desktop-hotkeys";
import { TOWN_ARMOR_SELLER_POSITION, TOWN_CARD_SELLER_POSITION, TOWN_CARD_SELLER_REACH, TOWN_EXCHANGE_POSITION, TOWN_EXCHANGE_REACH, TOWN_FEET_OFFSET, TOWN_GEAR_SELLER_REACH, TOWN_WEAPON_SELLER_POSITION, TOWN_OX_POSITION, TOWN_OX_REACH, TOWN_QUEST_BOARD_POSITION, TOWN_RESEARCH_POSITION, TOWN_SCHOOL_POSITIONS, TOWN_SCHOOL_REACH, TOWN_SMITH_POSITION, TOWN_SMITH_REACH } from "../../shared/town";
import { WEAPON_SCHOOLS, type WeaponSchool } from "../../shared/weapon-mastery";
import { recentReleaseNotes } from "../app/changelog";
import { installAppUpdateNotice } from "../app/app-update-notice";
import { isDeveloperIdentity } from "../app/developer";
import {
  VIRTUAL_PLAYER_MOVEMENT_HZ,
  VIRTUAL_PLAYER_SAVE_INTERVAL_MS,
} from "../../shared/virtual-player-load-test";
import { createDevPanelController } from "./dev-panel-controller";
import { gameConfirm } from "./confirm-dialog";
import { createEndlessTravelControl } from "./endless-travel-control";
import { createGameActionsController } from "./game-actions-controller";
import { createLeaderboardController } from "./leaderboard-controller";
import { createOverlaysController } from "./overlays-controller";
import { createRuntimeHudController } from "./runtime-hud-controller";
import { createPrestigeController } from "./prestige-panel";
import { createPrestigeUnlockPopup } from "./prestige-unlock-popup";
import { createDuplicateLoginPopup } from "./duplicate-login-popup";
import { createSignedInAsNotice } from "./signed-in-as-notice";
import { installLoginMove } from "./login-move-controller";
import { createTechTreeController } from "./tech-tree-controller";
import { installCameraZoomControl } from "./camera-zoom-control";
import { createStationLatch, STATION_REARM_DISTANCE } from "./station-reach";

/** Tech Research, the Weekly Quests board and Ox's shop, in the Town's windmill, Inn and bottom-right house, the Smith in the forge house's yard, the market's Card, Weapon and Armor Sellers and each school's building, open as a player walks up to them. */
export function createHomeStationTouchHandler(
  isHome: () => boolean,
  player: { x: number; y: number },
  openResearch: () => void,
  updateSlotUpgrades: () => void,
  openQuestBoard?: () => void,
  openOxShop?: () => void,
  openSmith?: () => void,
  openCardSeller?: () => void,
  openSchool?: (school: WeaponSchool) => void,
  openGearSeller?: (seller: GearSeller) => void,
  openExchange?: () => void,
) {
  const latches = new Map<string, ReturnType<typeof createStationLatch>>();
  const visit = (key: string, distance: number, reach: number, open?: () => void) => {
    let latch = latches.get(key);
    if (!latch) latches.set(key, latch = createStationLatch());
    const home = isHome();
    if (latch(home && distance < reach, !home || distance >= reach + STATION_REARM_DISTANCE)) open?.();
  };
  const feet = (at: { x: number; y: number }) => Math.hypot(player.x - at.x, player.y + TOWN_FEET_OFFSET - at.y);
  return () => {
    visit("research", Math.hypot(player.x - TOWN_RESEARCH_POSITION.x, player.y - (TOWN_RESEARCH_POSITION.y - 36)), 42.5, openResearch);
    // The board is wider than the desk: walk up to its face to read it.
    visit("board", Math.hypot(player.x - TOWN_QUEST_BOARD_POSITION.x, player.y - (TOWN_QUEST_BOARD_POSITION.y - 30)), 55, openQuestBoard);
    // Ox, the Smith and the Card Seller feet against feet.
    visit("ox", feet(TOWN_OX_POSITION), TOWN_OX_REACH, openOxShop);
    visit("smith", feet(TOWN_SMITH_POSITION), TOWN_SMITH_REACH, openSmith);
    visit("cards", feet(TOWN_CARD_SELLER_POSITION), TOWN_CARD_SELLER_REACH, openCardSeller);
    visit("exchange", feet(TOWN_EXCHANGE_POSITION), TOWN_EXCHANGE_REACH, openExchange);
    // The Weapon and Armor Sellers the same way, each at its own stall.
    for (const [seller, at] of [["weapons", TOWN_WEAPON_SELLER_POSITION], ["armor", TOWN_ARMOR_SELLER_POSITION]] as const) {
      visit(seller, feet(at), TOWN_GEAR_SELLER_REACH, () => openGearSeller?.(seller));
    }
    // Each school from the floor under its sign, feet against its spot.
    for (const school of WEAPON_SCHOOLS) visit(`school-${school}`, feet(TOWN_SCHOOL_POSITIONS[school]), TOWN_SCHOOL_REACH, () => openSchool?.(school));
    updateSlotUpgrades();
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createGameOverlays(d: Record<string, any>) {
  const { e, coop } = d;
  const overlays = createOverlaysController({ update: { overlay: e.updateNoticeEl, items: e.updateNoticeItemsEl, toggle: e.signinVersionButton }, iconPicker: { overlay: e.profileIconPickerEl, choices: e.profileIconChoices, close: e.closeProfileIconPickerBtn } }, {
    supporter: coop,
    releases: () => recentReleaseNotes(2), connected: () => Boolean(coop?.isConnected?.()), selectedIcon: () => coop?.profileIcon?.() ?? 0, setIcon: async (index: number) => coop?.setProfileIcon?.(index), paintIcon: d.applyProfileIcon, afterIconSet: d.afterIconSet, showMessage: d.showMessage,
    snapshot: { identity: () => coop?.localIdentity?.(), exists: () => Boolean(coop?.profileSnapshot?.()), take: async () => coop?.snapshotProfileCharacter?.(), onChanged: onProfileSnapshotsChanged },
  });
  // The game says it is in alpha on the sign-in screen; the version label is
  // where a player looks for it while playing.
  const versionLabel = `alpha v${d.version}`;
  e.signinVersionButton.textContent = versionLabel;
  e.signinVersionButton.setAttribute("aria-label", `WildStat alpha version ${d.version}. Toggle release notes`);
  e.minimapVersionEl.textContent = versionLabel;
  e.minimapVersionEl.setAttribute("aria-label", `Game alpha version ${d.version}. Open release notes`);
  installAppUpdateNotice();
  return overlays;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createGameRuntimeHud(d: Record<string, any>) {
  const { e, coop } = d;
  const controller = createRuntimeHudController({ elements: { message: e.messageEl, pickupLog: e.pickupLog, itemDropReveal: e.itemDropReveal, hpFill: e.hpFill, hpText: e.hpText, playerName: e.playerNameEl, playerPower: e.playerPowerEl, coopStatus: e.coopStatusEl, minimapPlayers: e.minimapPlayersEl, playerIcon: e.playerHudProfileIcon, duelControls: e.duelControls, duelStatus: e.duelStatusEl, duelCountdown: e.duelCountdownEl, duelResult: e.duelResultEl, duelResultTitle: e.duelResultTitle, duelResultStats: e.duelResultStats, shareDuelBtn: e.shareDuelBtn, watchDuelReplay: e.watchDuelReplayBtn }, player: d.player, playerShield: d.playerShield, attackCap: () => coop?.attackCapInPlay?.(), activeDuel: d.activeDuel, duelOpponentName: d.duelOpponentName, localDisplayName: () => coop?.localDisplayName?.() || "", localIdentity: () => coop?.localIdentity?.(), isGuest: (identity: string | undefined) => coop?.isGuest?.(identity) ?? false, playerGender: (identity: string | undefined) => coop?.playerGender?.(identity) ?? 0, remotePlayerCount: () => coop?.remotePlayerCount?.() ?? coop?.remotePlayers?.().length ?? 0, onlinePlayerCount: () => coop?.onlinePlayerCount?.() ?? null, connected: () => Boolean(coop?.isConnected?.()), isDeveloper: () => isDeveloperIdentity(coop?.localIdentity?.()), profileIcon: () => coop?.profileIcon?.() ?? 0, applyProfileIcon: d.applyProfileIcon, playerPower: d.playerPower, powerJump: d.powerJump, setDeveloperAccess: d.setDeveloperAccess, applyVitalityResearch: d.applyVitalityResearch, updateTechNotice: d.updateTechNotice, tickTechTree: d.tickTechTree, refreshAppStatus: d.refreshAppStatus, updateProfileDuelButton: d.updateProfileDuelButton, pulseDuel: () => { coop?.pulseDuel?.(); }, shareDuel: (id: bigint) => coop?.shareDuelReplay?.(id) ?? Promise.resolve({ ok: false, error: "NOT CONNECTED" }) });
  e.shareDuelBtn.addEventListener("click", () => { void controller.shareDuelResult(); });
  installCameraZoomControl(document, document.getElementById("game"));
  return controller;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createPrestigePanel(d: Record<string, any>) {
  const e = d.e;
  return createPrestigeController({ openButton: e.prestigeBtn, ownActions: e.profileOwnActions, overlay: e.prestigeOverlay,
    closeButton: e.closePrestigeBtn, confirmButton: e.prestigeConfirmBtn, level: e.prestigeLevel, bonus: e.prestigeBonus,
    points: e.prestigePoints, peak: e.prestigePeak, cost: e.prestigeCost, status: e.prestigeStatus,
    perkList: e.prestigePerks, prestige: d.prestige, unlocked: d.unlocked, completed: d.completed, runPrestige: d.runPrestige,
    perks: d.perks, spendPerk: d.spendPerk, respec: d.respec, expanded: d.expanded, expansionCountdown: d.expansionCountdown, challenge: d.challenge,
    // Each of these once went missing here, and the window quietly ran without it.
    challengeGoal: d.challengeGoal, challengesWon: d.challengesWon,
    showMessage: d.showMessage, beforeOpen: d.beforeOpen });
}

/**
 * The "Prestige N unlocked" window, reading the same rows the prestige panel
 * reads and prestiging through the same reducer.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createPrestigeUnlockRuntime(d: Record<string, any>) {
  const { coop } = d;
  return createPrestigeUnlockPopup({
    identity: () => coop?.localIdentity?.() ?? "",
    // The player row comes only with the game subscription, in the same
    // applied batch as the prestige row and the Endless count. The account
    // subscription before it carries campaign progress alone, which with no
    // prestige row reads as a level-0 account that has finished the campaign.
    ready: () => Boolean(d.playing() && !coop?.prestigeChallenge?.()?.active && coop?.isConnected?.() && coop?.localState?.() && !coop?.accountState?.()?.sessionConflict),
    blocked: d.blocked,
    level: () => coop?.prestige?.()?.level ?? 0,
    campaignComplete: () => Boolean(coop?.prestigeCampaignComplete?.((coop?.prestige?.()?.level ?? 0) + 1)),
    completedEndless: () => coop?.proceduralCompleted?.() ?? 0,
    expanded: d.expanded,
    runPrestige: d.runPrestige,
    showMessage: d.showMessage,
  });
}

/**
 * The "this email already has a character" window. Tutorial included: that is
 * where a login that opened a new, empty character starts. Settings' "Move to
 * Google Sign-In" is the deliberate version of the same fix.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDuplicateLoginRuntime(d: Record<string, any>) {
  const { coop } = d;
  installLoginMove(document, {
    signedIn: () => Boolean(coop?.accountState?.()?.signedIn),
    move: async () => await coop?.moveToGoogleSignIn?.() ?? { ok: false, error: "Connect to your character first." },
  });
  // Not blocking, so it shows straight away rather than waiting for a free screen like the popup.
  const signedInAs = createSignedInAsNotice({
    name: () => coop?.accountState?.()?.signedInAs ?? "",
    switchAccount: () => { void coop?.switchAccount?.(); },
  });
  const popup = createDuplicateLoginPopup({
    identity: () => coop?.localIdentity?.() ?? "",
    ready: () => Boolean(d.started() && coop?.isConnected?.() && coop?.accountState?.()?.signedIn
      && !coop?.accountState?.()?.sessionConflict),
    lookup: () => coop?.otherCharacterForLogin?.() ?? Promise.resolve(""),
    signOut: () => { coop?.signOut?.(); },
    pause: d.pause,
  });
  return { ...popup, poll() { popup.poll(); signedInAs.poll(); } };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createTechTreePanel(d: Record<string, any>) {
  const e = d.e;
  return createTechTreeController({ notice: e.researchReadyHint, overlay: e.techTreeOverlay, title: e.techTreeTitle, categories: e.techTreeCategories, viewport: e.techTreeViewport, closeButton: e.closeTechTreeBtn, active: e.techTreeActive, canvas: e.techTreeCanvas, map: e.techTreeMap, detail: e.techTreeDetail, detailContent: e.techTreeDetailContent, closeDetailButton: e.closeTechTreeDetailBtn }, {
    researchRanks: d.researchRanks, activeResearch: d.activeResearch, startResearch: d.startResearch, gemBalance: d.gemBalance, speedUpResearch: d.speedUpResearch, pausedResearch: d.pausedResearch, pauseResearch: d.pauseResearch, showMessage: d.showMessage, localIdentity: d.localIdentity, isConnected: d.isConnected, onResearchFinished: d.onResearchFinished, beforeOpen: d.beforeOpen, nowMs: () => Date.now(),
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
    simulateTimeAway: d.simulateTimeAway, offlineWindowRank: d.offlineWindowRank,
    previewPrestigeUnlock: d.previewPrestigeUnlock,
    balance: {
      load: () => coop.balanceEditor(), preview: (map, settings) => coop.previewBalance(map, settings),
      save: (revision, settings) => coop.saveBalance(revision, settings), restore: (expected, revision) => coop.restoreBalance(expected, revision),
    },
    review: () => coop?.devModeration ?? null,
    confirm: gameConfirm,
    localIdentity: () => coop?.localIdentity?.() ?? "",
    isDeveloper: () => isDeveloperIdentity(coop?.localIdentity?.()),
    getNameTagVisible: () => coop?.developerNameTagVisible?.() !== false,
    setNameTagVisible: (visible: boolean) => coop?.setDeveloperNameTag?.(visible),
    getPresenceVisible: () => coop?.developerPresenceVisible?.() === true,
    setPresenceVisible: (visible: boolean) => coop?.setDeveloperPresence?.(visible),
    getVirtualPlayerLoadTest: () => coop?.virtualPlayerLoadTestState?.() ?? { phase: "idle", requested: 0, connected: 0, failures: 0, movementHz: VIRTUAL_PLAYER_MOVEMENT_HZ, saveIntervalMs: VIRTUAL_PLAYER_SAVE_INTERVAL_MS },
    startVirtualPlayers: (count: number) => coop?.startVirtualPlayers?.(count),
    stopVirtualPlayers: () => coop?.stopVirtualPlayers?.(),
    loadModerationLog: (query, beforeId) => coop?.devModeration?.moderationLog(query, beforeId) ?? Promise.reject(new Error("Connect to view the moderation log.")),
    getBugReports: () => coop?.bugReportEntries?.() ?? [],
    deleteBugReport: (id: bigint) => coop?.deleteBugReport?.(id),
    loadAnalytics: (fromDayKey: string, toDayKey: string) => coop?.analyticsDashboard?.(fromDayKey, toDayKey) ?? Promise.reject(new Error("Connect to view analytics.")),
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
  return createLeaderboardController({ button: e.leaderboardBtn, overlay: e.leaderboardEl, closeButton: e.closeLeaderboardBtn, tabs: { rivals: e.leaderboardRivalsTab, power: e.leaderboardPowerTab, prestige: e.leaderboardPrestigeTab, time: e.leaderboardTimeTab }, valueHeading: e.leaderboardValueHeading, podium: e.leaderboardPodiumEl, rows: e.leaderboardRowsEl, loading: e.leaderboardLoadingEl, empty: e.leaderboardEmptyEl, filterChips: e.leaderboardPrestigeChips, filterHeading: e.leaderboardPrestigeHeading }, d.options);
}

/** Wires standard game-window actions and escape priority from UI controllers. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createGameActionsRuntime(d: Record<string, any>) {
  const e = d.e;
  const shop = createGemShopController({ button: e.shopBtn, setOpen: d.setShopOpen, openSupporter: d.openSupporter, supporter: d.coop,
    drawDiamondLook: d.drawDiamondLook, serverBoost: d.coop });
  installDesktopHotkeys(e.shopBtn.ownerDocument);
  return createGameActionsController({
    shop,
    elements: {
      settingsButton: e.settingsBtn, settingsPanel: e.settingsPanel, closeSettingsButton: e.closeSettingsBtn,
      inventoryButton: e.inventoryBtn, inventoryPanel: e.inventoryPanel, closeInventoryButton: e.closeInventoryBtn,
      shopButton: e.shopBtn,
      resetProgressButton: e.resetProgressBtn, closeDuelResultButton: e.closeDuelResultBtn,
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
      isSlotUpgradesOpen: d.slotUpgradesController.isOpen,
      closeSlotUpgrades: d.slotUpgradesController.close,
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
