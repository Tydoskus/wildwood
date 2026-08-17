import { BASIC_PAPER_HAT, ITEM_DEFINITIONS, LEGENDARY_WHITE_GOLD_ARMOR, STARTER_STONE, SUPERIOR_GOLDEN_HELMET, TRAILBLAZER_BOOTS, type EquipmentSlot } from "../game/inventory";
import { formatCompactNumber } from "./number-format";

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
) {
  const hpRatio = Math.max(0, Math.min(1, player.hp / player.maxHp));
  const hpWidth = `${(hpRatio * 100).toFixed(1)}%`;
  if (elements.hpFill.style.width !== hpWidth) elements.hpFill.style.width = hpWidth;
  const hpText = `${formatCompactNumber(Math.max(0, Math.ceil(player.hp)))} / ${formatCompactNumber(Math.ceil(player.maxHp))}`;
  if (elements.hpText.textContent !== hpText) elements.hpText.textContent = hpText;
  if (elements.playerName) {
    const name = displayName || "WANDERER";
    const nameKey = `${isDeveloper ? "dev" : "player"}:${name}`;
    if (elements.playerName.dataset.renderedName !== nameKey) {
      if (isDeveloper) {
        const badge = document.createElement("span");
        badge.className = "dev-badge";
        badge.textContent = "[dev] ";
        elements.playerName.replaceChildren(badge, document.createTextNode(name));
      } else {
        elements.playerName.textContent = name;
      }
      elements.playerName.dataset.renderedName = nameKey;
    }
  }
  const powerText = formatCompactNumber(power);
  if (elements.playerPower.dataset.renderedPower !== powerText) {
    const powerIcon = document.createElement("img");
    powerIcon.className = "power-icon power-icon-hud";
    powerIcon.src = "assets/wildwood/icons/Icon_Battle.png";
    powerIcon.alt = "Power";
    const powerValue = document.createElement("span");
    powerValue.className = "power-value";
    powerValue.textContent = powerText;
    elements.playerPower.replaceChildren(powerIcon, powerValue);
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
  const aria = hidden ? ' aria-hidden="true"' : "";
  if (itemId === BASIC_PAPER_HAT) return `<span class="inventory-item-art basic-paper-hat-art"${aria}></span>`;
  if (itemId === SUPERIOR_GOLDEN_HELMET) return `<span class="inventory-item-art superior-golden-helmet-art"${aria}></span>`;
  if (itemId === LEGENDARY_WHITE_GOLD_ARMOR) return `<span class="inventory-item-art legendary-white-gold-armor-art"${aria}></span>`;
  if (itemId === STARTER_STONE) return `<span class="inventory-item-art starter-stone-art"${aria}></span>`;
  return '<span class="boot-pixel-icon" aria-hidden="true"><i></i><i></i></span>';
}

function equippedItem(inventory: InventoryViewState, slot: string) {
  if (slot === "HEAD") return inventory.equippedHead;
  if (slot === "CHEST") return inventory.equippedChest;
  if (slot === "FEET") return inventory.equippedFeet;
  if (slot === "RIGHT_HAND") return inventory.equippedRightHand;
  return inventory.equippedLeftHand;
}

function renderEquipmentSlot(element: HTMLElement, itemId: string, label: string) {
  element.classList.toggle("is-equipped", Boolean(itemId));
  element.innerHTML = itemId ? itemArt(itemId, false) : label;
}

export function renderInventoryView(
  elements: InventoryElements,
  inventory: InventoryViewState,
  actions: {
    onSelect: (itemId: string) => void;
    onMove: (itemId: string, destination: EquipmentSlot | "BAG") => void;
    onInspect: (itemId: string) => void;
  },
) {
  elements.items.replaceChildren();
  const itemIds = inventory.itemIds.filter((itemId) => itemsById[itemId]);
  const equippedIds = new Set([inventory.equippedHead, inventory.equippedChest, inventory.equippedFeet, inventory.equippedRightHand, inventory.equippedLeftHand].filter(Boolean));
  const bagItemIds = itemIds.filter((itemId) => !equippedIds.has(itemId));
  elements.count.textContent = `${bagItemIds.length} / 16`;
  renderEquipmentSlot(elements.equippedHead, inventory.equippedHead, "HEAD");
  renderEquipmentSlot(elements.equippedChest, inventory.equippedChest, "CHEST");
  renderEquipmentSlot(elements.equippedRightHand, inventory.equippedRightHand, "RIGHT");
  renderEquipmentSlot(elements.equippedLeftHand, inventory.equippedLeftHand, "LEFT");
  renderEquipmentSlot(elements.equippedFeet, inventory.equippedFeet, "FEET");

  for (let index = 0; index < 16; index += 1) {
    const itemId = bagItemIds[index];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "inventory-item" + (itemId ? " is-filled" : "") +
      (inventory.selectedItemId === itemId ? " is-selected" : "");
    if (itemId) {
      const item = itemsById[itemId];
      button.setAttribute("aria-label", item.name);
      button.setAttribute("aria-pressed", String(inventory.selectedItemId === itemId));
      button.innerHTML = itemArt(itemId);
      button.addEventListener("click", () => actions.onSelect(itemId));
    } else {
      const canMoveSelectedToBag = Boolean(inventory.selectedItemId && equippedIds.has(inventory.selectedItemId));
      button.setAttribute("aria-label", canMoveSelectedToBag ? "Move selected item to bag" : `Empty bag slot ${index + 1}: clear selection`);
      button.addEventListener("click", () => {
        if (canMoveSelectedToBag) actions.onMove(inventory.selectedItemId, "BAG");
        else actions.onSelect("");
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
    `<div class="inventory-slot">${selected.slot} · ${equippedItem(inventory, selected.slot) === selected.id ? "EQUIPPED" : "IN BAG"}</div>` +
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
