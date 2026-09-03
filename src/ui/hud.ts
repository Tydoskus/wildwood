import { bagInventoryStacks, itemFitsEquipmentSlot, ITEM_DEFINITIONS, type EquipmentSlot } from "../game/inventory";
import { itemArtMarkup } from "../game/item-presentation";
import { formatCompactNumber } from "./number-format";
import { appendPlayerGenderIcon } from "./player-gender";
import { bindLongPress } from "./long-press";
import { PLAYER_GENDER_UNSET, type PlayerGender } from "../../shared/player-gender";
import { isHiddenCosmeticItem } from "../../shared/equipment-appearance";
import { itemDisplayName, normalizeItemUpgradeLevel } from "../../shared/items";

type PlayerHudState = {
  hp: number;
  maxHp: number;
};

type HudElements = {
  hpFill: HTMLElement;
  hpText: HTMLElement;
  playerName: HTMLElement | null;
  playerPower: HTMLElement;
  coopStatus: HTMLElement | null;
  minimapPlayers: HTMLElement | null;
};

export function renderPlayerHud(
  elements: HudElements,
  player: PlayerHudState,
  displayName: string,
  playerCount: number,
  power: number,
  isDeveloper = false,
  gender: PlayerGender = PLAYER_GENDER_UNSET,
) {
  const hpRatio = Math.max(0, Math.min(1, player.hp / player.maxHp));
  const hpWidth = `${(hpRatio * 100).toFixed(1)}%`;
  if (elements.hpFill.style.width !== hpWidth) elements.hpFill.style.width = hpWidth;
  const hpText = `${formatCompactNumber(Math.max(0, Math.ceil(player.hp)))} / ${formatCompactNumber(Math.ceil(player.maxHp))}`;
  if (elements.hpText.textContent !== hpText) elements.hpText.textContent = hpText;
  if (elements.playerName) {
    const name = displayName || "WANDERER";
    const nameKey = `${isDeveloper ? "dev" : "player"}:${name}:${gender}`;
    if (elements.playerName.dataset.renderedName !== nameKey) {
      const nameText = document.createElement("span");
      nameText.className = "player-hud-name-text";
      nameText.textContent = name;
      if (isDeveloper) {
        const badge = document.createElement("span");
        badge.className = "dev-badge";
        badge.textContent = "[dev] ";
        elements.playerName.replaceChildren(badge, nameText);
      } else {
        elements.playerName.replaceChildren(nameText);
      }
      appendPlayerGenderIcon(elements.playerName, gender);
      elements.playerName.dataset.renderedName = nameKey;
    }
  }
  const powerText = formatCompactNumber(power);
  if (elements.playerPower.dataset.renderedPower !== powerText) {
    const powerIcon = document.createElement("img");
    powerIcon.className = "power-icon power-icon-hud";
    powerIcon.src = "assets/wildstat/icons/Icon_Battle_Candy_v2.png";
    powerIcon.alt = "Power";
    const powerValue = document.createElement("span");
    powerValue.className = "power-value";
    powerValue.textContent = powerText;
    elements.playerPower.replaceChildren(powerValue, powerIcon);
    elements.playerPower.dataset.renderedPower = powerText;
  }
  const status = `players online: ${playerCount}`;
  for (const statusElement of [elements.coopStatus, elements.minimapPlayers]) {
    if (statusElement && statusElement.textContent !== status) statusElement.textContent = status;
  }
}

type InventoryViewState = {
  itemIds: string[];
  equippedHead: string;
  equippedChest: string;
  equippedFeet: string;
  equippedRightHand: string;
  equippedLeftHand: string;
  cosmeticHead: string;
  cosmeticChest: string;
  cosmeticFeet: string;
  cosmeticRightHand: string;
  cosmeticLeftHand: string;
  selectedItemId: string;
  selectedItemLocation?: EquipmentSlot | "BAG" | "";
};

export type InventoryMode = "EQUIPMENT" | "COSMETICS";

type InventoryElements = {
  items: HTMLElement;
  count: HTMLElement;
  equippedHead: HTMLElement;
  equippedChest: HTMLElement;
  equippedFeet: HTMLElement;
  equippedRightHand: HTMLElement;
  equippedLeftHand: HTMLElement;
};

type ItemDefinition = {
  id: string;
  name: string;
  slot: "HEAD" | "CHEST" | "FEET" | "HAND";
  description: string;
  stats: readonly string[];
};

export type InventoryMoveAction = {
  label: string;
  destination: EquipmentSlot | "BAG";
  disabled?: boolean;
};

const itemsById = ITEM_DEFINITIONS as Record<string, ItemDefinition>;

function itemArt(itemId: string, hidden = true) {
  return itemArtMarkup(itemId, hidden);
}

function equipmentItemId(inventory: InventoryViewState, slot: EquipmentSlot, mode: InventoryMode) {
  if (mode === "COSMETICS") {
    return slot === "HEAD" ? inventory.cosmeticHead
      : slot === "CHEST" ? inventory.cosmeticChest
        : slot === "FEET" ? inventory.cosmeticFeet
          : slot === "RIGHT_HAND" ? inventory.cosmeticRightHand
            : inventory.cosmeticLeftHand;
  }
  return slot === "HEAD" ? inventory.equippedHead
    : slot === "CHEST" ? inventory.equippedChest
      : slot === "FEET" ? inventory.equippedFeet
        : slot === "RIGHT_HAND" ? inventory.equippedRightHand
          : inventory.equippedLeftHand;
}

function statEquipmentItemId(inventory: InventoryViewState, slot: EquipmentSlot) {
  return slot === "HEAD" ? inventory.equippedHead
    : slot === "CHEST" ? inventory.equippedChest
      : slot === "FEET" ? inventory.equippedFeet
        : slot === "RIGHT_HAND" ? inventory.equippedRightHand
          : inventory.equippedLeftHand;
}

export function inventoryMoveActions(
  inventory: InventoryViewState,
  itemId: string,
  location: EquipmentSlot | "BAG" | "" | undefined,
  mode: InventoryMode = "EQUIPMENT",
): InventoryMoveAction[] {
  const item = itemsById[itemId];
  if (!item || !location) return [];
  if (location !== "BAG") {
    const actions: InventoryMoveAction[] = [{ label: mode === "COSMETICS" ? "REMOVE COSMETIC" : "UNEQUIP", destination: "BAG" }];
    if (item.slot === "HAND") {
      const opposite = location === "RIGHT_HAND" ? "LEFT_HAND" : "RIGHT_HAND";
      actions.push({ label: opposite === "RIGHT_HAND" ? "MOVE TO RIGHT" : "MOVE TO LEFT", destination: opposite });
    }
    return actions;
  }
  if (item.slot === "HAND") {
    return (["RIGHT_HAND", "LEFT_HAND"] as const).map((destination) => ({
      label: equipmentItemId(inventory, destination, mode) === itemId
        ? mode === "COSMETICS"
          ? destination === "RIGHT_HAND" ? "RIGHT LOOK ACTIVE" : "LEFT LOOK ACTIVE"
          : destination === "RIGHT_HAND" ? "RIGHT HAND EQUIPPED" : "LEFT HAND EQUIPPED"
        : mode === "COSMETICS"
          ? destination === "RIGHT_HAND" ? "USE ON RIGHT" : "USE ON LEFT"
          : destination === "RIGHT_HAND" ? "EQUIP RIGHT" : "EQUIP LEFT",
      destination,
      disabled: equipmentItemId(inventory, destination, mode) === itemId,
    }));
  }
  const destination = item.slot;
  const alreadyEquipped = equipmentItemId(inventory, destination, mode) === itemId;
  return [{
    label: alreadyEquipped
      ? mode === "COSMETICS" ? "LOOK ACTIVE" : "ALREADY EQUIPPED"
      : mode === "COSMETICS" ? "USE COSMETIC" : "EQUIP",
    destination,
    disabled: alreadyEquipped,
  }];
}

function renderEquipmentSlot(
  element: HTMLElement,
  inventory: InventoryViewState,
  destination: EquipmentSlot,
  label: string,
  mode: InventoryMode,
  upgradeLevel: (itemId: string) => number,
) {
  const itemId = equipmentItemId(inventory, destination, mode);
  const item = itemsById[itemId];
  const cosmeticHidden = mode === "COSMETICS" && isHiddenCosmeticItem(itemId);
  const inheritedItemId = mode === "COSMETICS" && !item && !cosmeticHidden
    ? statEquipmentItemId(inventory, destination)
    : "";
  const inheritedItem = itemsById[inheritedItemId];
  element.dataset.inventoryDrop = destination;
  element.dataset.inventoryLocation = destination;
  if (item) {
    element.dataset.inventoryDragSource = "true";
    element.dataset.itemId = itemId;
  } else {
    delete element.dataset.inventoryDragSource;
    delete element.dataset.itemId;
  }
  element.classList.toggle("is-equipped", Boolean(item));
  element.classList.toggle("is-cosmetic", mode === "COSMETICS" && Boolean(item));
  element.classList.toggle("is-cosmetic-inherited", Boolean(inheritedItem));
  element.classList.toggle("is-cosmetic-hidden", cosmeticHidden);
  updateEquipmentSlotSelection(element, inventory, destination, mode);
  const level = item ? upgradeLevel(itemId) : 0;
  element.setAttribute("aria-label", item
    ? `${label}: ${itemDisplayName(itemId, level)}. Tap to select, drag to move, or hold briefly for details.`
    : cosmeticHidden
      ? `${label}: wearing nothing over equipped item. Tap to show equipment.`
      : inheritedItem
        ? `${label}: showing equipped ${itemDisplayName(inheritedItemId)}. Tap to wear nothing over it.`
        : mode === "COSMETICS" ? `${label}: nothing equipped` : `${label}: empty`);
  element.title = cosmeticHidden ? "Show equipped item" : inheritedItem ? "Wear nothing over equipped item" : "";
  const slotLabel = document.createElement("span");
  slotLabel.className = "equipment-slot-label";
  slotLabel.textContent = label;
  const art = document.createElement("span");
  art.className = "equipment-slot-art";
  if (item) art.innerHTML = itemArt(itemId, false);
  else if (cosmeticHidden) {
    const hidden = document.createElement("span");
    hidden.className = "cosmetic-hidden-icon";
    hidden.setAttribute("aria-hidden", "true");
    art.append(hidden);
  } else if (inheritedItem) art.innerHTML = itemArt(inheritedItemId, false);
  else {
    const empty = document.createElement("span");
    empty.className = "equipment-slot-empty";
    empty.textContent = mode === "COSMETICS" ? "—" : "+";
    art.append(empty);
  }
  const name = document.createElement("span");
  name.className = "equipment-slot-name";
  name.textContent = item?.name ?? (cosmeticHidden ? "NOTHING" : inheritedItem ? "GEAR VISIBLE" : mode === "COSMETICS" ? "NOTHING" : "EMPTY");
  element.replaceChildren(slotLabel, art, name);
  if (level > 0) {
    const badge = document.createElement("span");
    badge.className = "inventory-upgrade-level";
    badge.textContent = `+${level}`;
    element.append(badge);
  }
}

function updateEquipmentSlotSelection(
  element: HTMLElement,
  inventory: InventoryViewState,
  destination: EquipmentSlot,
  mode: InventoryMode,
) {
  const itemId = equipmentItemId(inventory, destination, mode);
  const selected = inventory.selectedItemLocation === destination && inventory.selectedItemId === itemId;
  const hasSelection = Boolean(itemsById[inventory.selectedItemId]);
  const compatible = hasSelection && !selected && itemFitsEquipmentSlot(inventory.selectedItemId, destination);
  element.classList.toggle("is-selected", selected);
  element.classList.toggle("is-compatible", compatible);
  element.classList.toggle("is-incompatible", hasSelection && !selected && !compatible);
  element.setAttribute("aria-pressed", String(selected));
}

function updateInventorySelection(elements: InventoryElements, inventory: InventoryViewState, mode: InventoryMode) {
  updateEquipmentSlotSelection(elements.equippedHead, inventory, "HEAD", mode);
  updateEquipmentSlotSelection(elements.equippedChest, inventory, "CHEST", mode);
  updateEquipmentSlotSelection(elements.equippedRightHand, inventory, "RIGHT_HAND", mode);
  updateEquipmentSlotSelection(elements.equippedLeftHand, inventory, "LEFT_HAND", mode);
  updateEquipmentSlotSelection(elements.equippedFeet, inventory, "FEET", mode);
  elements.items.querySelectorAll<HTMLButtonElement>(".inventory-item.is-filled").forEach((button) => {
    const selected = inventory.selectedItemLocation === "BAG" && inventory.selectedItemId === button.dataset.itemId;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

export function renderInventoryView(
  elements: InventoryElements,
  inventory: InventoryViewState,
  mode: InventoryMode,
  actions: {
    onSelect: (itemId: string, location: EquipmentSlot | "BAG" | "") => void;
    onPressSelect: (itemId: string, location: EquipmentSlot | "BAG") => void;
    onMove: (itemId: string, destination: EquipmentSlot | "BAG") => void;
    onInspect: (itemId: string, location: EquipmentSlot | "BAG") => void;
    upgradeLevel: (itemId: string) => number;
    slotCapacity: number;
    nextSlotCost?: bigint;
    onUnlockSlot?: () => void;
  },
) {
  elements.items.replaceChildren();
  const bagStacks = bagInventoryStacks(inventory);
  elements.count.textContent = `${bagStacks.length} / ${actions.slotCapacity} ITEMS`;
  renderEquipmentSlot(elements.equippedHead, inventory, "HEAD", "HEAD", mode, actions.upgradeLevel);
  renderEquipmentSlot(elements.equippedChest, inventory, "CHEST", "ARMOR", mode, actions.upgradeLevel);
  renderEquipmentSlot(elements.equippedRightHand, inventory, "RIGHT_HAND", "WEAPON", mode, actions.upgradeLevel);
  renderEquipmentSlot(elements.equippedLeftHand, inventory, "LEFT_HAND", "WEAPON", mode, actions.upgradeLevel);
  renderEquipmentSlot(elements.equippedFeet, inventory, "FEET", "BOOTS", mode, actions.upgradeLevel);

  for (let index = 0; index < actions.slotCapacity; index += 1) {
    const stack = bagStacks[index];
    const itemId = stack?.itemId;
    const selected = inventory.selectedItemLocation === "BAG" && inventory.selectedItemId === itemId;
    const button = document.createElement("button");
    let selectedAtPointerDown = false;
    button.type = "button";
    button.dataset.inventoryLocation = "BAG";
    button.className = "inventory-item" + (itemId ? " is-filled" : " is-empty") +
      (selected ? " is-selected" : "");
    if (itemId) {
      const level = normalizeItemUpgradeLevel(actions.upgradeLevel(itemId));
      button.setAttribute("aria-label", `${itemDisplayName(itemId, level)}. Tap to select, drag to equip, or hold briefly for details.`);
      button.setAttribute("aria-pressed", String(selected));
      button.dataset.itemId = itemId;
      button.dataset.inventoryDragSource = "true";
      const art = document.createElement("span");
      art.className = "inventory-item-art-wrap";
      art.innerHTML = itemArt(itemId);
      button.append(art);
      if (level > 0) {
        const badge = document.createElement("span");
        badge.className = "inventory-upgrade-level";
        badge.textContent = `+${level}`;
        button.appendChild(badge);
      }
      button.addEventListener("click", (event) => {
        // Pointer presses select immediately. Keep click for keyboard access
        // and for releasing an item that was already selected.
        if (event.detail === 0 || selectedAtPointerDown) actions.onSelect(itemId, "BAG");
      });
      bindLongPress(button, {
        onPress: () => {
          selectedAtPointerDown = inventory.selectedItemLocation === "BAG" && inventory.selectedItemId === itemId;
          if (!selectedAtPointerDown) {
            actions.onPressSelect(itemId, "BAG");
            updateInventorySelection(elements, inventory, mode);
          }
        },
        onLongPress: () => actions.onInspect(itemId, "BAG"),
      });
    } else {
      const canMoveSelectedToBag = Boolean(inventory.selectedItemId && inventory.selectedItemLocation && inventory.selectedItemLocation !== "BAG");
      button.setAttribute("aria-label", canMoveSelectedToBag ? "Move selected item to bag" : `Empty bag slot ${index + 1}: clear selection`);
      const empty = document.createElement("span");
      empty.className = "inventory-item-empty-mark";
      empty.textContent = "";
      button.append(empty);
      button.addEventListener("click", () => {
        if (canMoveSelectedToBag) actions.onMove(inventory.selectedItemId, "BAG");
        else actions.onSelect("", "");
      });
    }
    elements.items.appendChild(button);
  }
  if (actions.nextSlotCost !== undefined) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "inventory-item is-locked";
    button.disabled = !actions.onUnlockSlot;
    button.setAttribute(
      "aria-label",
      `Unlock bag slot ${actions.slotCapacity + 1} for ${actions.nextSlotCost} ${actions.nextSlotCost === 1n ? "Gem" : "Gems"}`,
    );
    const lock = document.createElement("span");
    lock.className = "inventory-slot-lock-symbol";
    lock.textContent = "🔒";
    lock.setAttribute("aria-hidden", "true");
    const cost = document.createElement("span");
    cost.className = "inventory-slot-unlock-cost";
    const icon = document.createElement("img");
    icon.src = "assets/wildstat/gems/gem-icon-v2.png";
    icon.alt = "";
    icon.setAttribute("aria-hidden", "true");
    icon.draggable = false;
    const amount = document.createElement("strong");
    amount.textContent = actions.nextSlotCost.toString();
    cost.append(icon, amount);
    button.append(lock, cost);
    button.addEventListener("click", () => actions.onUnlockSlot?.());
    elements.items.append(button);
  }
}
