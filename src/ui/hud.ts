import { bagInventoryStacks, inventoryItemQuantity, ITEM_DEFINITIONS, type EquipmentSlot } from "../game/inventory";
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
  slot: string;
  description: string;
  stats: readonly string[];
};

const itemsById = ITEM_DEFINITIONS as Record<string, ItemDefinition>;

function itemArt(itemId: string, hidden = true) {
  return itemArtMarkup(itemId, hidden);
}

function renderEquipmentSlot(element: HTMLElement, itemId: string, label: string, selected: boolean) {
  element.classList.toggle("is-equipped", Boolean(itemId));
  element.classList.toggle("is-selected", selected);
  element.setAttribute("aria-label", itemId ? `${label}: ${itemsById[itemId]?.name ?? itemId}` : label);
  element.setAttribute("aria-pressed", String(selected));
  element.innerHTML = itemId ? itemArt(itemId, false) : label;
}

export function renderInventoryView(
  elements: InventoryElements,
  inventory: InventoryViewState,
  actions: {
    onSelect: (itemId: string, location: EquipmentSlot | "BAG" | "") => void;
    onMove: (itemId: string, destination: EquipmentSlot | "BAG") => void;
    onInspect: (itemId: string) => void;
  },
) {
  elements.items.replaceChildren();
  const bagStacks = bagInventoryStacks(inventory);
  elements.count.textContent = `${bagStacks.length} / 16`;
  renderEquipmentSlot(elements.equippedHead, inventory.equippedHead, "HEAD", inventory.selectedItemLocation === "HEAD" && inventory.selectedItemId === inventory.equippedHead);
  renderEquipmentSlot(elements.equippedChest, inventory.equippedChest, "CHEST", inventory.selectedItemLocation === "CHEST" && inventory.selectedItemId === inventory.equippedChest);
  renderEquipmentSlot(elements.equippedRightHand, inventory.equippedRightHand, "RIGHT", inventory.selectedItemLocation === "RIGHT_HAND" && inventory.selectedItemId === inventory.equippedRightHand);
  renderEquipmentSlot(elements.equippedLeftHand, inventory.equippedLeftHand, "LEFT", inventory.selectedItemLocation === "LEFT_HAND" && inventory.selectedItemId === inventory.equippedLeftHand);
  renderEquipmentSlot(elements.equippedFeet, inventory.equippedFeet, "FEET", inventory.selectedItemLocation === "FEET" && inventory.selectedItemId === inventory.equippedFeet);

  for (let index = 0; index < 16; index += 1) {
    const stack = bagStacks[index];
    const itemId = stack?.itemId;
    const stackQuantity = stack?.quantity ?? 0;
    const selected = inventory.selectedItemLocation === "BAG" && inventory.selectedItemId === itemId;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "inventory-item" + (itemId ? " is-filled" : "") +
      (selected ? " is-selected" : "");
    if (itemId) {
      const item = itemsById[itemId];
      button.setAttribute("aria-label", stackQuantity > 1 ? `${item.name}, quantity ${stackQuantity}` : item.name);
      button.setAttribute("aria-pressed", String(selected));
      button.innerHTML = itemArt(itemId);
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
      button.addEventListener("click", () => {
        if (canMoveSelectedToBag) actions.onMove(inventory.selectedItemId, "BAG");
        else actions.onSelect("", "");
      });
    }
    elements.items.appendChild(button);
  }

  const selected = itemsById[inventory.selectedItemId];
  if (!selected) {
    elements.detail.textContent = "SELECT AN ITEM TO VIEW ITS STATS";
    return;
  }
  elements.detail.innerHTML =
    `<div class="inventory-slot">${selected.slot} · ${inventory.selectedItemLocation && inventory.selectedItemLocation !== "BAG" ? "EQUIPPED" : "IN BAG"}${inventoryItemQuantity(inventory, selected.id) > 1 ? ` · OWNED ×${inventoryItemQuantity(inventory, selected.id)}` : ""}</div>` +
    `<strong>${selected.name}</strong><p>${selected.description}</p>` +
    `<div class="inventory-stats">${selected.stats.join(" · ")}</div>`;
  const actionRow = document.createElement("div");
  actionRow.className = "inventory-actions";
  const moveHint = document.createElement("span");
  moveHint.textContent = selected.slot === "HAND" ? "CLICK LEFT OR RIGHT HAND SLOT" : `CLICK ${selected.slot} SLOT`;
  const inspect = document.createElement("button");
  inspect.type = "button";
  inspect.className = "secondary-button";
  inspect.textContent = "INSPECT";
  inspect.addEventListener("click", () => actions.onInspect(selected.id));
  actionRow.append(moveHint, inspect);
  elements.detail.appendChild(actionRow);
}
