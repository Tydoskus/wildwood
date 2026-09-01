import {
  BASIC_PAPER_HAT,
  LEGENDARY_WHITE_GOLD_ARMOR,
  STARTER_STONE,
  SUPERIOR_GOLDEN_HELMET,
  type EquipmentSlot,
  type InventoryState,
} from "../game/inventory";

type WindowActionsElements = {
  settingsButton: HTMLElement;
  settingsPanel: HTMLElement;
  closeSettingsButton: HTMLElement;
  inventoryButton: HTMLElement;
  inventoryPanel: HTMLElement;
  closeInventoryButton: HTMLElement;
  resetProgressButton: HTMLElement;
  bootUpgrade: HTMLElement;
  bootUpgradeClose: HTMLElement;
  closeDuelResultButton: HTMLElement;
  closeDragonResultButton: HTMLElement;
  dragonResult: HTMLElement;
  closeDuelReplayButton: HTMLElement;
};

type EscapeWindows = {
  isMapGuideOpen: () => boolean;
  closeMapGuide: () => void;
  isItemInspectionOpen: () => boolean;
  closeItemInspection: () => void;
  isUpgradeBenchOpen: () => boolean;
  closeUpgradeBench: () => void;
  isProfileIconPickerOpen: () => boolean;
  closeProfileIconPicker: () => void;
  isLeaderboardOpen: () => boolean;
  closeLeaderboard: () => void;
  isDevPanelOpen: () => boolean;
  closeDevPanel: () => void;
  isProfileNameEditorOpen: () => boolean;
  closeProfileNameEditor: () => void;
  isPlayerProfileOpen: () => boolean;
  closePlayerProfile: () => void;
};

type GameActionsDependencies = {
  elements: WindowActionsElements;
  inventory: InventoryState & { selectedItemId: string; selectedItemLocation?: EquipmentSlot | "BAG" | "" };
  closeCompetingWindows: () => void;
  minimizeChat: () => void;
  prepareInventoryOpen: () => void;
  closeItemInspection: () => void;
  renderInventory: () => void;
  logPickup: (message: string, color: string) => void;
  leaveDuelResult: () => void;
  closeDuelReplay: () => void;
  closeBootUpgrade: () => void;
  resetServerProgress: () => void;
  clearProgressState: () => void;
  setTotalKills: (value: number) => void;
  setBootsCollected: (collected: boolean) => void;
  clearPlayerInput: () => void;
  resetGame: () => void;
  stopGame: () => void;
  startConnecting: () => void;
  hideGameOver: () => void;
  refreshFrameClock: () => void;
  escapeWindows: EscapeWindows;
};

/** Low-coupling gameplay-window actions and their DOM event bindings. */
export function createGameActionsController(dependencies: GameActionsDependencies) {
  const { elements } = dependencies;

  function closeSettings() {
    elements.settingsPanel.hidden = true;
    elements.settingsButton.setAttribute("aria-expanded", "false");
  }

  function closeInventory() {
    dependencies.closeItemInspection();
    elements.inventoryPanel.hidden = true;
    elements.inventoryButton.setAttribute("aria-expanded", "false");
  }

  function closeDragonResult() {
    elements.dragonResult.hidden = true;
    dependencies.refreshFrameClock();
  }

  function resetProgress() {
    if (!confirm("Erase all saved Wildstat progress and start over?")) return;

    dependencies.clearProgressState();
    dependencies.resetServerProgress();
    dependencies.setTotalKills(0);
    dependencies.setBootsCollected(false);
    const { inventory } = dependencies;
    inventory.itemIds = [
      BASIC_PAPER_HAT,
      STARTER_STONE,
      ...inventory.itemIds.filter((itemId) => itemId === SUPERIOR_GOLDEN_HELMET || itemId === LEGENDARY_WHITE_GOLD_ARMOR),
    ];
    inventory.equippedHead = BASIC_PAPER_HAT;
    inventory.equippedChest = "";
    inventory.equippedFeet = "";
    inventory.equippedRightHand = STARTER_STONE;
    inventory.equippedLeftHand = "";
    inventory.cosmeticHead = "";
    inventory.cosmeticChest = "";
    inventory.cosmeticFeet = "";
    inventory.cosmeticRightHand = "";
    inventory.cosmeticLeftHand = "";
    inventory.selectedItemId = "";
    inventory.selectedItemLocation = "";
    dependencies.renderInventory();
    elements.bootUpgrade.hidden = true;
    dependencies.clearPlayerInput();
    dependencies.resetGame();
    dependencies.stopGame();
    dependencies.refreshFrameClock();
    dependencies.startConnecting();
    dependencies.hideGameOver();
    closeSettings();
    closeInventory();
    dependencies.closeCompetingWindows();
  }

  function handleInputEscape() {
    const windows = dependencies.escapeWindows;
    if (windows.isMapGuideOpen()) { windows.closeMapGuide(); return true; }
    if (windows.isItemInspectionOpen()) { windows.closeItemInspection(); return true; }
    if (windows.isUpgradeBenchOpen()) { windows.closeUpgradeBench(); return true; }
    if (windows.isProfileIconPickerOpen()) { windows.closeProfileIconPicker(); return true; }
    if (windows.isLeaderboardOpen()) { windows.closeLeaderboard(); return true; }
    if (windows.isDevPanelOpen()) { windows.closeDevPanel(); return true; }
    if (windows.isProfileNameEditorOpen()) { windows.closeProfileNameEditor(); return true; }
    if (windows.isPlayerProfileOpen()) { windows.closePlayerProfile(); return true; }
    return false;
  }

  elements.settingsButton.addEventListener("click", () => {
    const opening = elements.settingsPanel.hidden;
    if (opening) dependencies.minimizeChat();
    elements.settingsPanel.hidden = !opening;
    closeInventory();
    elements.settingsButton.setAttribute("aria-expanded", String(opening));
    dependencies.closeCompetingWindows();
  });
  elements.closeSettingsButton.addEventListener("click", closeSettings);

  elements.inventoryButton.addEventListener("click", () => {
    const opening = elements.inventoryPanel.hidden;
    if (opening) {
      dependencies.minimizeChat();
      dependencies.prepareInventoryOpen();
    } else {
      dependencies.closeItemInspection();
    }
    elements.inventoryPanel.hidden = !opening;
    closeSettings();
    elements.inventoryButton.setAttribute("aria-expanded", String(opening));
    dependencies.closeCompetingWindows();
    if (opening) dependencies.renderInventory();
  });
  elements.closeInventoryButton.addEventListener("click", closeInventory);

  elements.closeDuelResultButton.addEventListener("click", dependencies.leaveDuelResult);
  elements.closeDragonResultButton.addEventListener("click", closeDragonResult);
  elements.closeDuelReplayButton.addEventListener("click", dependencies.closeDuelReplay);
  elements.bootUpgradeClose.addEventListener("click", () => {
    dependencies.closeBootUpgrade();
    dependencies.refreshFrameClock();
  });
  elements.resetProgressButton.addEventListener("click", resetProgress);

  return { handleInputEscape };
}
