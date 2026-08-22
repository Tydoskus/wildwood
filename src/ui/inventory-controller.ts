import {
  itemFitsEquipmentSlot,
  type EquipmentSlot,
  type InventoryState,
} from "../game/inventory";
import { requiredElement } from "../game/runtime/dom";
import { renderInventoryView } from "./hud";

type InventoryLocation = EquipmentSlot | "BAG" | "";
type SelectableInventory = InventoryState & { selectedItemId: string; selectedItemLocation?: InventoryLocation };

type InventoryDependencies = {
  inventory: SelectableInventory;
  move: (itemId: string, destination: EquipmentSlot | "BAG") => boolean;
};

export function nextInventorySelection(currentItemId: string, tappedItemId: string) {
  return currentItemId === tappedItemId ? "" : tappedItemId;
}

/** Paper-doll loadout, inventory selection, and direct equipment actions. */
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
    if (!dependencies.move(itemId, destination)) return false;
    setSelection(itemId, destination);
    render();
    playMoveFeedback(destination);
    return true;
  }

  function render() {
    renderInventoryView(
      { items, detail, count, equippedHead, equippedChest, equippedFeet, equippedRightHand, equippedLeftHand },
      dependencies.inventory,
      {
        onSelect(itemId, location) {
          const tappedAgain = dependencies.inventory.selectedItemId === itemId && dependencies.inventory.selectedItemLocation === location;
          setSelection(tappedAgain ? "" : itemId, tappedAgain ? "" : location);
          render();
        },
        onMove(itemId, destination) {
          move(itemId, destination);
        },
      },
    );
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
    setSelection("", "");
    render();
  });

  return {
    render,
  };
}
