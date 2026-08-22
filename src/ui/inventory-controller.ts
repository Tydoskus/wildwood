import {
  itemFitsEquipmentSlot,
  type EquipmentSlot,
  type InventoryState,
} from "../game/inventory";
import { requiredElement } from "../game/runtime/dom";
import { itemDefinition } from "../../shared/items";
import { inventoryMoveActions, renderInventoryView, type InventoryMode } from "./hud";
import type { ItemInspectionController } from "./item-inspection-controller";
import { bindLongPress } from "./long-press";

type InventoryLocation = EquipmentSlot | "BAG" | "";
type SelectableInventory = InventoryState & { selectedItemId: string; selectedItemLocation?: InventoryLocation };

type InventoryDependencies = {
  inventory: SelectableInventory;
  move: (itemId: string, destination: EquipmentSlot | "BAG") => boolean;
  moveCosmetic: (itemId: string, destination: EquipmentSlot | "BAG") => boolean;
  upgradeLevel: (itemId: string) => number;
  itemInspection: ItemInspectionController;
};

export function nextInventorySelection(currentItemId: string, tappedItemId: string) {
  return currentItemId === tappedItemId ? "" : tappedItemId;
}

export function clearInventorySelection(inventory: Pick<SelectableInventory, "selectedItemId" | "selectedItemLocation">) {
  inventory.selectedItemId = "";
  inventory.selectedItemLocation = "";
}

/** Paper-doll loadout, inventory selection, and direct equipment actions. */
export function createInventoryController(dependencies: InventoryDependencies) {
  const panel = requiredElement("inventoryPanel");
  const items = requiredElement("inventoryItems");
  const count = requiredElement("inventoryCount");
  const equippedHead = requiredElement("equippedHeadSlot");
  const equippedChest = requiredElement("equippedChestSlot");
  const equippedFeet = requiredElement("equippedFeetSlot");
  const equippedRightHand = requiredElement("equippedRightHandSlot");
  const equippedLeftHand = requiredElement("equippedLeftHandSlot");
  const equipmentTab = requiredElement<HTMLButtonElement>("inventoryEquipmentTab");
  const cosmeticsTab = requiredElement<HTMLButtonElement>("inventoryCosmeticsTab");
  const content = requiredElement("inventoryContent");
  const loadout = panel.querySelector<HTMLElement>(".inventory-loadout");
  let mode: InventoryMode = "EQUIPMENT";

  const equipmentElements: Record<EquipmentSlot, HTMLElement> = {
    HEAD: equippedHead,
    CHEST: equippedChest,
    FEET: equippedFeet,
    RIGHT_HAND: equippedRightHand,
    LEFT_HAND: equippedLeftHand,
  };

  function setSelection(itemId: string, location: InventoryLocation) {
    dependencies.inventory.selectedItemId = itemId;
    dependencies.inventory.selectedItemLocation = itemId ? location : "";
  }

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
    setSelection(itemId, destination);
    render();
    playMoveFeedback(destination);
    return true;
  }

  function inspect(itemId: string, location: Exclude<InventoryLocation, "">) {
    const item = itemDefinition(itemId);
    if (!item) return;
    const visuallyEquipped = location !== "BAG";
    const context = mode === "COSMETICS"
      ? `${item.slot} · VISUAL ONLY · ${visuallyEquipped ? "COSMETIC ACTIVE" : "OWNED"}`
      : `${item.slot} · ${visuallyEquipped ? "EQUIPPED" : "IN BAG"}`;
    const description = mode === "COSMETICS"
      ? `${item.description} Cosmetic slots change appearance only; Equipment supplies your stats.`
      : item.description;
    dependencies.itemInspection.open({
      itemId,
      upgradeLevel: dependencies.upgradeLevel(itemId),
      context,
      description,
      actions: inventoryMoveActions(dependencies.inventory, itemId, location, mode).map((action) => ({
        label: action.label,
        kind: action.destination === "BAG" ? "SECONDARY" as const : "PRIMARY" as const,
        disabled: action.disabled,
        onActivate: () => {
          if (move(itemId, action.destination)) dependencies.itemInspection.close();
        },
      })),
    });
  }

  function render() {
    const cosmeticsActive = mode === "COSMETICS";
    equipmentTab.classList.toggle("is-active", !cosmeticsActive);
    equipmentTab.setAttribute("aria-selected", String(!cosmeticsActive));
    equipmentTab.tabIndex = cosmeticsActive ? -1 : 0;
    cosmeticsTab.classList.toggle("is-active", cosmeticsActive);
    cosmeticsTab.setAttribute("aria-selected", String(cosmeticsActive));
    cosmeticsTab.tabIndex = cosmeticsActive ? 0 : -1;
    content.setAttribute("aria-labelledby", cosmeticsActive ? cosmeticsTab.id : equipmentTab.id);
    if (loadout) loadout.setAttribute("aria-label", cosmeticsActive ? "Cosmetic items" : "Equipped items");
    renderInventoryView(
      { items, count, equippedHead, equippedChest, equippedFeet, equippedRightHand, equippedLeftHand },
      dependencies.inventory,
      mode,
      {
        onSelect(itemId, location) {
          const tappedAgain = dependencies.inventory.selectedItemId === itemId && dependencies.inventory.selectedItemLocation === location;
          setSelection(tappedAgain ? "" : itemId, tappedAgain ? "" : location);
          render();
        },
        onMove(itemId, destination) {
          move(itemId, destination);
        },
        onInspect: inspect,
        upgradeLevel: dependencies.upgradeLevel,
      },
    );
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
    const selectedItemId = dependencies.inventory.selectedItemId;
    if (selectedItemId) {
      const tappedAgain = dependencies.inventory.selectedItemLocation === destination && selectedItemId === itemId;
      if (tappedAgain) setSelection("", "");
      else if (itemFitsEquipmentSlot(selectedItemId, destination) && move(selectedItemId, destination)) return;
      else if (itemId) setSelection(itemId, destination);
      render();
      return;
    }
    if (!itemId) return;
    setSelection(itemId, destination);
    render();
  }

  equippedHead.addEventListener("click", () => clickEquipment("HEAD", itemInSlot("HEAD")));
  equippedChest.addEventListener("click", () => clickEquipment("CHEST", itemInSlot("CHEST")));
  equippedRightHand.addEventListener("click", () => clickEquipment("RIGHT_HAND", itemInSlot("RIGHT_HAND")));
  equippedLeftHand.addEventListener("click", () => clickEquipment("LEFT_HAND", itemInSlot("LEFT_HAND")));
  equippedFeet.addEventListener("click", () => clickEquipment("FEET", itemInSlot("FEET")));
  for (const [destination, element] of Object.entries(equipmentElements) as Array<[EquipmentSlot, HTMLElement]>) {
    bindLongPress(element, {
      onLongPress: () => {
        const itemId = itemInSlot(destination);
        if (itemId) inspect(itemId, destination);
      },
    });
  }
  const setMode = (nextMode: InventoryMode) => {
    if (mode === nextMode) return;
    mode = nextMode;
    setSelection("", "");
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
  panel.addEventListener("click", (event) => {
    const target = event.target;
    // Equipment rendering replaces its inner art during the button's click
    // handler. Use the original event path so the detached art node is still
    // recognized as a button click when the event reaches this panel.
    const clickedButton = event.composedPath().some((entry) => entry instanceof HTMLButtonElement);
    if (!(target instanceof Element) || clickedButton || !dependencies.inventory.selectedItemId) return;
    setSelection("", "");
    render();
  });

  return {
    render,
    prepareOpen: () => {
      dependencies.itemInspection.close();
      clearInventorySelection(dependencies.inventory);
    },
    mode: () => mode,
  };
}
