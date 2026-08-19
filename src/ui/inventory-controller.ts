import {
  itemDefinition,
  itemFitsEquipmentSlot,
  type EquipmentSlot,
  type InventoryState,
} from "../game/inventory";
import { itemArtMarkup } from "../game/item-presentation";
import { requiredElement } from "../game/runtime/dom";
import { renderInventoryView } from "./hud";

type InventoryLocation = EquipmentSlot | "BAG" | "";
type SelectableInventory = InventoryState & { selectedItemId: string; selectedItemLocation?: InventoryLocation };

type InventoryDependencies = {
  inventory: SelectableInventory;
  move: (itemId: string, destination: EquipmentSlot | "BAG") => void;
};

export function nextInventorySelection(currentItemId: string, tappedItemId: string) {
  return currentItemId === tappedItemId ? "" : tappedItemId;
}

/** Inventory grid, equipped-slot selection, and item inspection modal. */
export function createInventoryController(dependencies: InventoryDependencies) {
  const panel = requiredElement("inventoryPanel");
  const items = requiredElement("inventoryItems");
  const detail = requiredElement("inventoryDetail");
  const count = requiredElement("inventoryCount");
  const equippedHead = requiredElement("equippedHeadSlot");
  const equippedChest = requiredElement("equippedChestSlot");
  const equippedFeet = requiredElement("equippedFeetSlot");
  const equippedRightHand = requiredElement("equippedRightHandSlot");
  const equippedLeftHand = requiredElement("equippedLeftHandSlot");
  const inspect = requiredElement("itemInspect");
  const closeInspect = requiredElement("closeItemInspectBtn");
  const inspectIcon = requiredElement("itemInspectIcon");
  const inspectSlot = requiredElement("itemInspectSlot");
  const inspectName = requiredElement("itemInspectName");
  const inspectDescription = requiredElement("itemInspectDescription");
  const inspectStats = requiredElement("itemInspectStats");

  function render() {
    renderInventoryView(
      { items, detail, count, equippedHead, equippedChest, equippedFeet, equippedRightHand, equippedLeftHand },
      dependencies.inventory,
      {
        onSelect(itemId, location) {
          const tappedAgain = dependencies.inventory.selectedItemId === itemId && dependencies.inventory.selectedItemLocation === location;
          dependencies.inventory.selectedItemId = tappedAgain ? "" : itemId;
          dependencies.inventory.selectedItemLocation = tappedAgain || !itemId ? "" : location;
          render();
        },
        onMove(itemId, destination) {
          dependencies.move(itemId, destination);
          dependencies.inventory.selectedItemId = "";
          dependencies.inventory.selectedItemLocation = "";
          render();
        },
        onInspect: openInspect,
      },
    );
  }

  function openInspect(itemId: string) {
    const item = itemDefinition(itemId);
    if (!item) return;
    const equipped = dependencies.inventory.selectedItemId === item.id
      ? Boolean(dependencies.inventory.selectedItemLocation && dependencies.inventory.selectedItemLocation !== "BAG")
      : [dependencies.inventory.equippedHead, dependencies.inventory.equippedChest, dependencies.inventory.equippedFeet, dependencies.inventory.equippedRightHand, dependencies.inventory.equippedLeftHand].includes(item.id);
    inspectSlot.textContent = `${item.slot} · ${equipped ? "EQUIPPED" : "IN BAG"}`;
    inspectName.textContent = item.name;
    inspectDescription.textContent = item.description;
    inspectStats.textContent = item.stats.join(" · ");
    inspectIcon.innerHTML = itemArtMarkup(item.id, false);
    inspect.hidden = false;
  }

  function close() {
    inspect.hidden = true;
  }

  function clickEquipment(destination: EquipmentSlot, itemId: string) {
    const selectedItemId = dependencies.inventory.selectedItemId;
    if (selectedItemId) {
      const tappedAgain = dependencies.inventory.selectedItemLocation === destination && selectedItemId === itemId;
      if (!tappedAgain && itemFitsEquipmentSlot(selectedItemId, destination)) dependencies.move(selectedItemId, destination);
      dependencies.inventory.selectedItemId = "";
      dependencies.inventory.selectedItemLocation = "";
      render();
      return;
    }
    if (!itemId) return;
    dependencies.inventory.selectedItemId = itemId;
    dependencies.inventory.selectedItemLocation = destination;
    render();
  }

  equippedHead.addEventListener("click", () => clickEquipment("HEAD", dependencies.inventory.equippedHead));
  equippedChest.addEventListener("click", () => clickEquipment("CHEST", dependencies.inventory.equippedChest));
  equippedRightHand.addEventListener("click", () => clickEquipment("RIGHT_HAND", dependencies.inventory.equippedRightHand));
  equippedLeftHand.addEventListener("click", () => clickEquipment("LEFT_HAND", dependencies.inventory.equippedLeftHand));
  equippedFeet.addEventListener("click", () => clickEquipment("FEET", dependencies.inventory.equippedFeet));
  panel.addEventListener("click", (event) => {
    const target = event.target;
    // Equipment rendering replaces its inner art during the button's click
    // handler. Use the original event path so the detached art node is still
    // recognized as a button click when the event reaches this panel.
    const clickedButton = event.composedPath().some((entry) => entry instanceof HTMLButtonElement);
    if (!(target instanceof Element) || clickedButton || !dependencies.inventory.selectedItemId) return;
    dependencies.inventory.selectedItemId = "";
    dependencies.inventory.selectedItemLocation = "";
    render();
  });
  closeInspect.addEventListener("click", close);

  return {
    clearSelection: () => { dependencies.inventory.selectedItemId = ""; dependencies.inventory.selectedItemLocation = ""; },
    close,
    isInspectOpen: () => !inspect.hidden,
    render,
  };
}
