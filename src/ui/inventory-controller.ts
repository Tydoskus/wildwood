import { createInventoryFilters, type InventoryFilter } from "./inventory-filters";
import {
  type EquipmentSlot,
  type InventoryState,
} from "../game/inventory";
import { requiredElement } from "../game/runtime/dom";
import { canDestroyEquipment, itemDefinition, itemDisplayName } from "../../shared/items";
import { COSMETIC_CONVERSION_GEM_COST, canConvertToCosmetic } from "../../shared/cosmetic-conversion";
import { inventoryMoveActions, inventoryWeaponSlot, renderInventoryView, type InventoryMode } from "./hud";
import type { ItemInspectionController } from "./item-inspection-controller";
import {
  MAX_INVENTORY_SLOT_CAPACITY,
  inventorySlotCapacity,
  inventorySlotUnlockCost,
} from "../../shared/gems";
import { gemSpendConfirmation } from "./gem-spend-confirmation";
import { gameConfirm, type ConfirmPrompt, type ConfirmRequest } from "./confirm-dialog";

type InventoryLocation = EquipmentSlot | "BAG" | "";
type SelectableInventory = InventoryState & { selectedItemId: string; selectedItemLocation?: InventoryLocation };

type InventoryDependencies = {
  inventory: SelectableInventory;
  move: (itemId: string, destination: EquipmentSlot | "BAG") => boolean;
  moveCosmetic: (itemId: string, destination: EquipmentSlot | "BAG") => boolean;
  toggleCosmeticVisibility: (destination: EquipmentSlot) => boolean;
  upgradeLevel: (itemId: string) => number;
  equipBest?: () => boolean;
  equipmentRequirement?: (itemId: string) => string | null;
  itemInspection: ItemInspectionController;
  inventorySlotsUnlocked: () => number;
  gemBalance: () => bigint;
  destroyEquipment: (itemId: string) => Promise<{ ok: boolean; error?: string } | undefined>;
  convertItemToCosmetic?: (itemId: string) => Promise<{ ok: boolean; error?: string } | undefined>;
  unlockInventorySlot: () => Promise<{ ok: boolean; error?: string } | undefined>;
  confirmGemSpend?: ConfirmPrompt;
  confirmDestroy?: ConfirmPrompt;
  showMessage: (message: string, color?: string) => void;
};

export function clearInventorySelection(inventory: Pick<SelectableInventory, "selectedItemId" | "selectedItemLocation">) {
  inventory.selectedItemId = "";
  inventory.selectedItemLocation = "";
}

/** Inspect items with one tap; loadout changes are explicit inspection actions. */
export function createInventoryController(dependencies: InventoryDependencies) {
  const panel = requiredElement("inventoryPanel");
  const items = requiredElement("inventoryItems");
  const count = requiredElement("inventoryCount");
  const equippedHead = requiredElement("equippedHeadSlot");
  const equippedChest = requiredElement("equippedChestSlot");
  const equippedFeet = requiredElement("equippedFeetSlot");
  const equippedRightHand = requiredElement("equippedRightHandSlot");
  const equipmentTab = requiredElement<HTMLButtonElement>("inventoryEquipmentTab");
  const cosmeticsTab = requiredElement<HTMLButtonElement>("inventoryCosmeticsTab");
  const content = requiredElement("inventoryContent");
  const loadout = panel.querySelector<HTMLElement>(".inventory-loadout");
  const tabs = equipmentTab.closest(".inventory-tabs");
  if (tabs) {
    const scroll = document.createElement("div");
    scroll.className = "inventory-scroll";
    tabs.before(scroll);
    scroll.append(tabs, content);
  }
  const countRow = count.closest(".inventory-section-title");
  if (countRow) items.after(countRow);
  const cosmeticsNote = document.createElement("p");
  cosmeticsNote.className = "inventory-cosmetics-note";
  cosmeticsNote.textContent = "Permanent looks change appearance only. Unlock an owned item's look for 10 Gems; keep the item.";
  cosmeticsNote.hidden = true;
  items.before(cosmeticsNote);
  function syncSlotSizes() {
    if (!loadout || !items.clientWidth) return;
    const trackWidth = parseFloat(getComputedStyle(items).gridTemplateColumns);
    if (!Number.isFinite(trackWidth) || trackWidth <= 0) return;
    const size = `${trackWidth}px`;
    if (loadout.style.getPropertyValue("--inventory-slot-size") !== size) loadout.style.setProperty("--inventory-slot-size", size);
  }
  if (loadout && typeof ResizeObserver !== "undefined") new ResizeObserver(syncSlotSizes).observe(items);

  let filter: InventoryFilter = "ALL";
  const filters = createInventoryFilters(next => {
    filter = next;
    render();
  }, () => {
    if (mode !== "EQUIPMENT" || !dependencies.equipBest) return;
    const changed = dependencies.equipBest();
    if (!changed) dependencies.showMessage("BEST EQUIPMENT ALREADY EQUIPPED", "#72ef58");
    clearInventorySelection(dependencies.inventory);
    render();
  });
  items.before(filters.bar);
  let renderedState = "";
  let mode: InventoryMode = "EQUIPMENT";
  let unlockingSlot = false;
  // A prompt is awaited, so the pending flags below are not yet set while it is
  // open. Without this a second click opens a second prompt over the first and
  // both answers act. window.confirm used to block the page and hide the gap.
  let confirming = false;
  async function ask(prompt: ConfirmPrompt, request: ConfirmRequest) {
    if (confirming) return false;
    confirming = true;
    try { return await prompt(request); } finally { confirming = false; }
  }
  const confirmGemSpend = dependencies.confirmGemSpend ?? gameConfirm;
  const confirmDestroy = dependencies.confirmDestroy ?? gameConfirm;

  const equipmentElements: Record<EquipmentSlot, HTMLElement> = {
    HEAD: equippedHead,
    CHEST: equippedChest,
    FEET: equippedFeet,
    RIGHT_HAND: equippedRightHand,
    LEFT_HAND: equippedRightHand,
  };
  function playMoveFeedback(destination: EquipmentSlot | "BAG") {
    if (destination !== "BAG") {
      const target = equipmentElements[destination];
      target.classList.remove("is-equipped-now");
      void target.offsetWidth;
      target.classList.add("is-equipped-now");
      window.setTimeout(() => target.classList.remove("is-equipped-now"), 360);
    }
    if (typeof navigator.vibrate === "function") navigator.vibrate(10);
  }

  function move(itemId: string, destination: EquipmentSlot | "BAG") {
    const moved = mode === "COSMETICS"
      ? dependencies.moveCosmetic(itemId, destination)
      : dependencies.move(itemId, destination);
    if (!moved) return false;
    clearInventorySelection(dependencies.inventory);
    render();
    playMoveFeedback(destination);
    return true;
  }

  function inspect(itemId: string, location: Exclude<InventoryLocation, "">) {
    clearInventorySelection(dependencies.inventory);
    const item = itemDefinition(itemId);
    if (!item) return;
    const requiredMap = mode === "EQUIPMENT" ? dependencies.equipmentRequirement?.(itemId) : null;
    dependencies.itemInspection.open({
      itemId,
      upgradeLevel: dependencies.upgradeLevel(itemId),
      ...(mode === "COSMETICS" ? { context: "Cosmetic · Appearance only" } : {}),
      ...(requiredMap ? { context: `Reach ${requiredMap} to equip` } : {}),
      actions: [...inventoryMoveActions(dependencies.inventory, itemId, location, mode).map((action) => ({
        label: action.label,
        kind: action.destination === "BAG" ? "SECONDARY" as const : "PRIMARY" as const,
        disabled: action.disabled || Boolean(requiredMap && action.destination !== "BAG"),
        onActivate: () => {
          if (move(itemId, action.destination)) dependencies.itemInspection.close();
        },
      })), ...conversionActions(itemId), ...destructionActions(itemId)],
    });
  }

  function conversionActions(itemId: string) {
    if (mode !== "EQUIPMENT" || !dependencies.convertItemToCosmetic ||
        !dependencies.inventory.itemIds.includes(itemId) || !canConvertToCosmetic(itemId) ||
        dependencies.inventory.cosmeticItemIds?.includes(itemId)) return [];
    return [{
      label: `Convert to Cosmetic · ${COSMETIC_CONVERSION_GEM_COST} Gems`,
      kind: "SECONDARY" as const,
      onActivate: async () => {
        const balance = dependencies.gemBalance();
        if (balance < COSMETIC_CONVERSION_GEM_COST) {
          dependencies.showMessage(`NOT ENOUGH GEMS · NEED ${COSMETIC_CONVERSION_GEM_COST}`, "#ff9b91");
          return;
        }
        const confirmation = gemSpendConfirmation(
          `permanently unlock ${itemDisplayName(itemId)} as a cosmetic`, COSMETIC_CONVERSION_GEM_COST, balance,
        );
        if (!await ask(confirmGemSpend, {
          ...confirmation,
          details: [{ label: "Item", value: "Kept in inventory" }, ...(confirmation.details ?? [])],
          confirmLabel: "Convert",
        })) return;
        const result = await dependencies.convertItemToCosmetic?.(itemId);
        if (result?.ok) {
          dependencies.itemInspection.close();
          clearInventorySelection(dependencies.inventory);
          render();
          dependencies.showMessage("COSMETIC UNLOCKED", "#f0c66b");
        } else dependencies.showMessage(result?.error ?? "NOT CONNECTED", "#ff9b91");
      },
    }];
  }

  function destructionActions(itemId: string) {
    if (!dependencies.inventory.itemIds.includes(itemId)) return [];
    return canDestroyEquipment(itemId) ? [{
      label: "Destroy item",
      kind: "DESTROY" as const,
      onActivate: async () => {
        if (!await ask(confirmDestroy, {
          message: `Destroy ${itemDisplayName(itemId, dependencies.upgradeLevel(itemId))} permanently?`,
          details: [{ label: "This cannot be undone", value: "No refund" }],
          confirmLabel: "Destroy", danger: true,
        })) return;
        dependencies.itemInspection.close();
        const result = await dependencies.destroyEquipment(itemId);
        if (result?.ok) {
          clearInventorySelection(dependencies.inventory);
          render();
          dependencies.showMessage("ITEM DESTROYED", "#ff9b91");
        } else dependencies.showMessage(result?.error ?? "NOT CONNECTED", "#ff9b91");
      },
    }] : [];
  }

  function render() {
    const inventory = dependencies.inventory;
    const nextState = JSON.stringify([mode, filter, inventory, dependencies.inventorySlotsUnlocked(), unlockingSlot,
      inventory.itemIds.map(itemId => dependencies.upgradeLevel(itemId))]);
    if (nextState === renderedState) return;
    renderedState = nextState;
    const cosmeticsActive = mode === "COSMETICS";
    cosmeticsNote.hidden = !cosmeticsActive;
    filters.setCosmetics(cosmeticsActive);
    equipmentTab.classList.toggle("is-active", !cosmeticsActive);
    equipmentTab.setAttribute("aria-selected", String(!cosmeticsActive));
    equipmentTab.tabIndex = cosmeticsActive ? -1 : 0;
    cosmeticsTab.classList.toggle("is-active", cosmeticsActive);
    cosmeticsTab.setAttribute("aria-selected", String(cosmeticsActive));
    cosmeticsTab.tabIndex = cosmeticsActive ? 0 : -1;
    content.setAttribute("aria-labelledby", cosmeticsActive ? cosmeticsTab.id : equipmentTab.id);
    if (loadout) loadout.setAttribute("aria-label", cosmeticsActive ? "Cosmetic items" : "Equipped items");
    const slotsUnlocked = dependencies.inventorySlotsUnlocked();
    const slotCapacity = inventorySlotCapacity(slotsUnlocked);
    renderInventoryView(
      { items, count, equippedHead, equippedChest, equippedFeet, equippedRightHand },
      dependencies.inventory,
      mode,
      {
        onInspect: inspect,
        filter: filter === "ALL" ? undefined : filter,
        upgradeLevel: dependencies.upgradeLevel,
        slotCapacity,
        nextSlotCost: slotCapacity < MAX_INVENTORY_SLOT_CAPACITY
          ? inventorySlotUnlockCost(slotsUnlocked)
          : undefined,
        onUnlockSlot: unlockingSlot || slotCapacity >= MAX_INVENTORY_SLOT_CAPACITY
          ? undefined
          : () => { void unlockNextSlot(); },
      },
    );
    syncSlotSizes();
  }

  async function unlockNextSlot() {
    if (unlockingSlot) return;
    const slotsUnlocked = dependencies.inventorySlotsUnlocked();
    const capacity = inventorySlotCapacity(slotsUnlocked);
    if (capacity >= MAX_INVENTORY_SLOT_CAPACITY) return;
    const cost = inventorySlotUnlockCost(slotsUnlocked);
    if (dependencies.gemBalance() < cost) {
      dependencies.showMessage(`NOT ENOUGH GEMS · NEED ${cost}`, "#ff9b91");
      return;
    }
    if (!await ask(confirmGemSpend, gemSpendConfirmation(`permanently unlock Bag slot ${capacity + 1}`, cost, dependencies.gemBalance()))) return;
    unlockingSlot = true;
    render();
    const result = await dependencies.unlockInventorySlot();
    unlockingSlot = false;
    render();
    if (result?.ok) dependencies.showMessage(`BAG SLOT ${capacity + 1} UNLOCKED`, "#f3a6ce");
    else if (result?.error) dependencies.showMessage(result.error, "#ff9b91");
  }

  function itemInSlot(destination: EquipmentSlot) {
    if (mode === "COSMETICS") {
      return destination === "HEAD" ? dependencies.inventory.cosmeticHead
        : destination === "CHEST" ? dependencies.inventory.cosmeticChest
          : destination === "FEET" ? dependencies.inventory.cosmeticFeet
            : destination === "RIGHT_HAND" ? dependencies.inventory.cosmeticRightHand
              : dependencies.inventory.cosmeticLeftHand;
    }
    return destination === "HEAD" ? dependencies.inventory.equippedHead
      : destination === "CHEST" ? dependencies.inventory.equippedChest
        : destination === "FEET" ? dependencies.inventory.equippedFeet
          : destination === "RIGHT_HAND" ? dependencies.inventory.equippedRightHand
            : dependencies.inventory.equippedLeftHand;
  }

  function clickEquipment(destination: EquipmentSlot, itemId: string) {
    if (mode === "COSMETICS" && !itemDefinition(itemId)) {
      if (dependencies.toggleCosmeticVisibility(destination)) {
        clearInventorySelection(dependencies.inventory);
        render();
        playMoveFeedback(destination);
      }
      return;
    }
    if (!itemDefinition(itemId)) return;
    inspect(itemId, destination);
  }

  equippedHead.addEventListener("click", () => clickEquipment("HEAD", itemInSlot("HEAD")));
  equippedChest.addEventListener("click", () => clickEquipment("CHEST", itemInSlot("CHEST")));
  equippedRightHand.addEventListener("click", () => {
    const destination = inventoryWeaponSlot(dependencies.inventory, mode);
    clickEquipment(destination, itemInSlot(destination));
  });
  equippedFeet.addEventListener("click", () => clickEquipment("FEET", itemInSlot("FEET")));
  const setMode = (nextMode: InventoryMode) => {
    if (mode === nextMode) return;
    mode = nextMode;
    clearInventorySelection(dependencies.inventory);
    render();
  };
  equipmentTab.addEventListener("click", () => setMode("EQUIPMENT"));
  cosmeticsTab.addEventListener("click", () => setMode("COSMETICS"));
  for (const tab of [equipmentTab, cosmeticsTab]) {
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const nextTab = tab === equipmentTab ? cosmeticsTab : equipmentTab;
      setMode(nextTab === cosmeticsTab ? "COSMETICS" : "EQUIPMENT");
      nextTab.focus();
    });
  }

  return {
    destructionActions,
    render,
    prepareOpen: () => {
      dependencies.itemInspection.close();
      clearInventorySelection(dependencies.inventory);
    },
    mode: () => mode,
  };
}
