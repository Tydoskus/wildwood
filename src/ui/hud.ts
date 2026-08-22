import { bagInventoryStacks, itemFitsEquipmentSlot, ITEM_DEFINITIONS, type EquipmentSlot } from "../game/inventory";
import { itemArtMarkup } from "../game/item-presentation";
import { formatCompactNumber } from "./number-format";
import { appendPlayerGenderIcon } from "./player-gender";
import { bindLongPress } from "./long-press";
import { PLAYER_GENDER_UNSET, type PlayerGender } from "../../shared/player-gender";
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
  const selected = inventory.selectedItemLocation === destination && inventory.selectedItemId === itemId;
  const hasSelection = Boolean(itemsById[inventory.selectedItemId]);
  const compatible = hasSelection && !selected && itemFitsEquipmentSlot(inventory.selectedItemId, destination);
  element.classList.toggle("is-equipped", Boolean(itemId));
  element.classList.toggle("is-cosmetic", mode === "COSMETICS" && Boolean(itemId));
  element.classList.toggle("is-selected", selected);
  element.classList.toggle("is-compatible", compatible);
  element.classList.toggle("is-incompatible", hasSelection && !selected && !compatible);
  const level = upgradeLevel(itemId);
  element.setAttribute("aria-label", itemId
    ? `${label}: ${itemDisplayName(itemId, level)}. Tap to select. Hold for two seconds for details.`
    : mode === "COSMETICS" ? `${label}: use equipped appearance` : `${label}: empty`);
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
  name.textContent = item?.name ?? (mode === "COSMETICS" ? "EQUIPPED LOOK" : "EMPTY");
  element.replaceChildren(slotLabel, art, name);
  if (level > 0) {
    const badge = document.createElement("span");
    badge.className = "inventory-upgrade-level";
    badge.textContent = `+${level}`;
    element.append(badge);
  }
}

export function renderInventoryView(
  elements: InventoryElements,
  inventory: InventoryViewState,
  mode: InventoryMode,
  actions: {
    onSelect: (itemId: string, location: EquipmentSlot | "BAG" | "") => void;
    onMove: (itemId: string, destination: EquipmentSlot | "BAG") => void;
    onInspect: (itemId: string, location: EquipmentSlot | "BAG") => void;
    upgradeLevel: (itemId: string) => number;
  },
) {
  elements.items.replaceChildren();
  const bagStacks = bagInventoryStacks(inventory);
  elements.count.textContent = `${bagStacks.length} / 16 ITEMS`;
  renderEquipmentSlot(elements.equippedHead, inventory, "HEAD", "HEAD", mode, actions.upgradeLevel);
  renderEquipmentSlot(elements.equippedChest, inventory, "CHEST", "ARMOR", mode, actions.upgradeLevel);
  renderEquipmentSlot(elements.equippedRightHand, inventory, "RIGHT_HAND", "R HAND", mode, actions.upgradeLevel);
  renderEquipmentSlot(elements.equippedLeftHand, inventory, "LEFT_HAND", "L HAND", mode, actions.upgradeLevel);
  renderEquipmentSlot(elements.equippedFeet, inventory, "FEET", "BOOTS", mode, actions.upgradeLevel);

  for (let index = 0; index < 16; index += 1) {
    const stack = bagStacks[index];
    const itemId = stack?.itemId;
    const selected = inventory.selectedItemLocation === "BAG" && inventory.selectedItemId === itemId;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "inventory-item" + (itemId ? " is-filled" : " is-empty") +
      (selected ? " is-selected" : "");
    if (itemId) {
      const item = itemsById[itemId];
      const level = normalizeItemUpgradeLevel(actions.upgradeLevel(itemId));
      button.setAttribute("aria-label", `${itemDisplayName(itemId, level)}. Tap to select. Hold for two seconds for details.`);
      button.setAttribute("aria-pressed", String(selected));
      const art = document.createElement("span");
      art.className = "inventory-item-art-wrap";
      art.innerHTML = itemArt(itemId);
      const name = document.createElement("span");
      name.className = "inventory-item-name";
      name.textContent = item.name;
      button.append(art, name);
      if (level > 0) {
        const badge = document.createElement("span");
        badge.className = "inventory-upgrade-level";
        badge.textContent = `+${level}`;
        button.appendChild(badge);
      }
      button.addEventListener("click", () => actions.onSelect(itemId, "BAG"));
      bindLongPress(button, { onLongPress: () => actions.onInspect(itemId, "BAG") });
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
}
