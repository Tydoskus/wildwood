import { bagInventoryStacks, inventoryItemQuantity, itemFitsEquipmentSlot, ITEM_DEFINITIONS, type EquipmentSlot } from "../game/inventory";
import { itemArtMarkup } from "../game/item-presentation";
import { formatCompactNumber } from "./number-format";
import { appendPlayerGenderIcon } from "./player-gender";
import { PLAYER_GENDER_UNSET, type PlayerGender } from "../../shared/player-gender";

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
    powerIcon.src = "assets/wildwood/icons/Icon_Battle_Candy_v1.png";
    powerIcon.alt = "Power";
    const powerValue = document.createElement("span");
    powerValue.className = "power-value";
    powerValue.textContent = powerText;
    elements.playerPower.replaceChildren(powerValue, powerIcon);
    elements.playerPower.dataset.renderedPower = powerText;
  }
  if (elements.coopStatus) {
    const status = `Players online: ${playerCount}`;
    if (elements.coopStatus.textContent !== status) elements.coopStatus.textContent = status;
  }
}

type InventoryViewState = {
  itemIds: string[];
  equippedHead: string;
  equippedChest: string;
  equippedFeet: string;
  equippedRightHand: string;
  equippedLeftHand: string;
  selectedItemId: string;
  selectedItemLocation?: EquipmentSlot | "BAG" | "";
};

type InventoryElements = {
  items: HTMLElement;
  detail: HTMLElement;
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

function equipmentItemId(inventory: InventoryViewState, slot: EquipmentSlot) {
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
): InventoryMoveAction[] {
  const item = itemsById[itemId];
  if (!item || !location) return [];
  if (location !== "BAG") {
    const actions: InventoryMoveAction[] = [{ label: "UNEQUIP", destination: "BAG" }];
    if (item.slot === "HAND") {
      const opposite = location === "RIGHT_HAND" ? "LEFT_HAND" : "RIGHT_HAND";
      actions.push({ label: opposite === "RIGHT_HAND" ? "MOVE TO RIGHT" : "MOVE TO LEFT", destination: opposite });
    }
    return actions;
  }
  if (item.slot === "HAND") {
    return (["RIGHT_HAND", "LEFT_HAND"] as const).map((destination) => ({
      label: equipmentItemId(inventory, destination) === itemId
        ? destination === "RIGHT_HAND" ? "RIGHT HAND EQUIPPED" : "LEFT HAND EQUIPPED"
        : destination === "RIGHT_HAND" ? "EQUIP RIGHT" : "EQUIP LEFT",
      destination,
      disabled: equipmentItemId(inventory, destination) === itemId,
    }));
  }
  const destination = item.slot;
  const alreadyEquipped = equipmentItemId(inventory, destination) === itemId;
  return [{
    label: alreadyEquipped ? "ALREADY EQUIPPED" : "EQUIP",
    destination,
    disabled: alreadyEquipped,
  }];
}

function renderEquipmentSlot(
  element: HTMLElement,
  inventory: InventoryViewState,
  destination: EquipmentSlot,
  label: string,
) {
  const itemId = equipmentItemId(inventory, destination);
  const item = itemsById[itemId];
  const selected = inventory.selectedItemLocation === destination && inventory.selectedItemId === itemId;
  const hasSelection = Boolean(itemsById[inventory.selectedItemId]);
  const compatible = hasSelection && !selected && itemFitsEquipmentSlot(inventory.selectedItemId, destination);
  element.classList.toggle("is-equipped", Boolean(itemId));
  element.classList.toggle("is-selected", selected);
  element.classList.toggle("is-compatible", compatible);
  element.classList.toggle("is-incompatible", hasSelection && !selected && !compatible);
  element.setAttribute("aria-label", itemId ? `${label}: ${item?.name ?? itemId}` : `${label}: empty`);
  element.setAttribute("aria-pressed", String(selected));
  const slotLabel = document.createElement("span");
  slotLabel.className = "equipment-slot-label";
  slotLabel.textContent = label;
  const art = document.createElement("span");
  art.className = "equipment-slot-art";
  if (itemId) art.innerHTML = itemArt(itemId, false);
  else {
    const empty = document.createElement("span");
    empty.className = "equipment-slot-empty";
    empty.textContent = "+";
    art.append(empty);
  }
  const name = document.createElement("span");
  name.className = "equipment-slot-name";
  name.textContent = item?.name ?? "EMPTY";
  element.replaceChildren(slotLabel, art, name);
}

export function renderInventoryView(
  elements: InventoryElements,
  inventory: InventoryViewState,
  actions: {
    onSelect: (itemId: string, location: EquipmentSlot | "BAG" | "") => void;
    onMove: (itemId: string, destination: EquipmentSlot | "BAG") => void;
  },
) {
  elements.items.replaceChildren();
  const bagStacks = bagInventoryStacks(inventory);
  elements.count.textContent = `${bagStacks.length} / 16 STACKS`;
  renderEquipmentSlot(elements.equippedHead, inventory, "HEAD", "HEAD");
  renderEquipmentSlot(elements.equippedChest, inventory, "CHEST", "ARMOR");
  renderEquipmentSlot(elements.equippedRightHand, inventory, "RIGHT_HAND", "R HAND");
  renderEquipmentSlot(elements.equippedLeftHand, inventory, "LEFT_HAND", "L HAND");
  renderEquipmentSlot(elements.equippedFeet, inventory, "FEET", "BOOTS");

  for (let index = 0; index < 16; index += 1) {
    const stack = bagStacks[index];
    const itemId = stack?.itemId;
    const stackQuantity = stack?.quantity ?? 0;
    const selected = inventory.selectedItemLocation === "BAG" && inventory.selectedItemId === itemId;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "inventory-item" + (itemId ? " is-filled" : " is-empty") +
      (selected ? " is-selected" : "");
    if (itemId) {
      const item = itemsById[itemId];
      button.setAttribute("aria-label", stackQuantity > 1 ? `${item.name}, quantity ${stackQuantity}` : item.name);
      button.setAttribute("aria-pressed", String(selected));
      const art = document.createElement("span");
      art.className = "inventory-item-art-wrap";
      art.innerHTML = itemArt(itemId);
      const name = document.createElement("span");
      name.className = "inventory-item-name";
      name.textContent = item.name;
      button.append(art, name);
      if (stackQuantity > 1) {
        const quantity = document.createElement("span");
        quantity.className = "inventory-stack-count";
        quantity.textContent = `×${stackQuantity}`;
        button.appendChild(quantity);
      }
      button.addEventListener("click", () => actions.onSelect(itemId, "BAG"));
    } else {
      const canMoveSelectedToBag = Boolean(inventory.selectedItemId && inventory.selectedItemLocation && inventory.selectedItemLocation !== "BAG");
      button.setAttribute("aria-label", canMoveSelectedToBag ? "Move selected item to bag" : `Empty bag slot ${index + 1}: clear selection`);
      button.classList.toggle("is-drop-target", canMoveSelectedToBag);
      const empty = document.createElement("span");
      empty.className = "inventory-item-empty-mark";
      empty.textContent = canMoveSelectedToBag ? "↓" : "";
      button.append(empty);
      button.addEventListener("click", () => {
        if (canMoveSelectedToBag) actions.onMove(inventory.selectedItemId, "BAG");
        else actions.onSelect("", "");
      });
    }
    elements.items.appendChild(button);
  }

  const selected = itemsById[inventory.selectedItemId];
  if (!selected) {
    elements.detail.classList.remove("has-selection");
    const prompt = document.createElement("div");
    prompt.className = "inventory-detail-empty";
    prompt.innerHTML = "<strong>SELECT AN ITEM</strong><span>VIEW STATS AND EQUIP IT FROM HERE</span>";
    elements.detail.replaceChildren(prompt);
    return;
  }
  elements.detail.classList.add("has-selection");
  const icon = document.createElement("div");
  icon.className = "inventory-detail-icon";
  icon.innerHTML = itemArt(selected.id, false);
  const copy = document.createElement("div");
  copy.className = "inventory-detail-copy";
  const location = document.createElement("div");
  location.className = "inventory-slot";
  const quantity = inventoryItemQuantity(inventory, selected.id);
  location.textContent = `${selected.slot} · ${inventory.selectedItemLocation && inventory.selectedItemLocation !== "BAG" ? "EQUIPPED" : "IN BAG"}${quantity > 1 ? ` · OWNED ×${quantity}` : ""}`;
  const name = document.createElement("strong");
  name.textContent = selected.name;
  const description = document.createElement("p");
  description.textContent = selected.description;
  const stats = document.createElement("div");
  stats.className = "inventory-stats";
  for (const stat of selected.stats) {
    const value = document.createElement("span");
    value.textContent = stat;
    stats.append(value);
  }
  copy.append(location, name, description, stats);
  const actionRow = document.createElement("div");
  actionRow.className = "inventory-actions";
  for (const action of inventoryMoveActions(inventory, selected.id, inventory.selectedItemLocation)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = action.destination === "BAG" ? "inventory-action-secondary" : "inventory-action-primary";
    button.textContent = action.label;
    button.disabled = action.disabled === true;
    button.addEventListener("click", () => actions.onMove(selected.id, action.destination));
    actionRow.append(button);
  }
  elements.detail.replaceChildren(icon, copy, actionRow);
}
