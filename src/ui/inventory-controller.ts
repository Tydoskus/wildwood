import {
  BASIC_PAPER_HAT,
  itemDefinition,
  LEGENDARY_WHITE_GOLD_ARMOR,
  SUPERIOR_GOLDEN_HELMET,
  type EquipmentSlot,
  type InventoryState,
} from "../game/inventory";
import { requiredElement } from "../game/runtime/dom";
import { renderInventoryView } from "./hud";

type SelectableInventory = InventoryState & { selectedItemId: string };

type InventoryDependencies = {
  inventory: SelectableInventory;
  move: (itemId: string, destination: EquipmentSlot | "BAG") => void;
};

/** Inventory grid, equipped-slot selection, and item inspection modal. */
export function createInventoryController(dependencies: InventoryDependencies) {
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
        onSelect(itemId) {
          dependencies.inventory.selectedItemId = itemId;
          render();
        },
        onMove(itemId, destination) {
          dependencies.move(itemId, destination);
          render();
        },
        onInspect: openInspect,
      },
    );
  }

  function openInspect(itemId: string) {
    const item = itemDefinition(itemId);
    if (!item) return;
    const equipped = [dependencies.inventory.equippedHead, dependencies.inventory.equippedChest, dependencies.inventory.equippedFeet, dependencies.inventory.equippedRightHand, dependencies.inventory.equippedLeftHand].includes(item.id);
    inspectSlot.textContent = `${item.slot} · ${equipped ? "EQUIPPED" : "IN BAG"}`;
    inspectName.textContent = item.name;
    inspectDescription.textContent = item.description;
    inspectStats.textContent = item.stats.join(" · ");
    inspectIcon.innerHTML = inspectArt(item.id);
    inspect.hidden = false;
  }

  function close() {
    inspect.hidden = true;
  }

  function clickEquipment(destination: EquipmentSlot, itemId: string) {
    const selectedItemId = dependencies.inventory.selectedItemId;
    if (selectedItemId) {
      dependencies.move(selectedItemId, destination);
      render();
      return;
    }
    if (!itemId) return;
    dependencies.inventory.selectedItemId = itemId;
    render();
  }

  equippedHead.addEventListener("click", () => clickEquipment("HEAD", dependencies.inventory.equippedHead));
  equippedChest.addEventListener("click", () => clickEquipment("CHEST", dependencies.inventory.equippedChest));
  equippedRightHand.addEventListener("click", () => clickEquipment("RIGHT_HAND", dependencies.inventory.equippedRightHand));
  equippedLeftHand.addEventListener("click", () => clickEquipment("LEFT_HAND", dependencies.inventory.equippedLeftHand));
  equippedFeet.addEventListener("click", () => clickEquipment("FEET", dependencies.inventory.equippedFeet));
  closeInspect.addEventListener("click", close);

  return {
    clearSelection: () => { dependencies.inventory.selectedItemId = ""; },
    close,
    isInspectOpen: () => !inspect.hidden,
    render,
  };
}

function inspectArt(itemId: string) {
  if (itemId === BASIC_PAPER_HAT) return '<span class="inventory-item-art basic-paper-hat-art" aria-hidden="true"></span>';
  if (itemId === SUPERIOR_GOLDEN_HELMET) return '<span class="inventory-item-art superior-golden-helmet-art" aria-hidden="true"></span>';
  if (itemId === LEGENDARY_WHITE_GOLD_ARMOR) return '<span class="inventory-item-art legendary-white-gold-armor-art" aria-hidden="true"></span>';
  return '<span class="boot-pixel-icon" aria-hidden="true"><i></i><i></i></span>';
}
