import { ITEM_DEFINITIONS, TRAILBLAZER_BOOTS } from "../game/inventory";
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
) {
  const hpRatio = Math.max(0, Math.min(1, player.hp / player.maxHp));
  elements.hpFill.style.width = `${(hpRatio * 100).toFixed(1)}%`;
  elements.hpText.textContent = `${formatCompactNumber(Math.max(0, Math.ceil(player.hp)))} / ${formatCompactNumber(Math.ceil(player.maxHp))} HP`;
  if (elements.playerName) elements.playerName.textContent = displayName || "WANDERER";
  elements.playerPower.textContent = `Power: ${formatCompactNumber(power)}`;
  if (elements.coopStatus) elements.coopStatus.textContent = `PLAYERS: ${playerCount}`;
}

type InventoryViewState = {
  itemIds: string[];
  equippedFeet: string;
  selectedItemId: string;
};

type InventoryElements = {
  items: HTMLElement;
  detail: HTMLElement;
  count: HTMLElement;
  equippedFeet: HTMLElement;
};

type ItemDefinition = {
  id: string;
  name: string;
  slot: string;
  description: string;
  stats: readonly string[];
};

const itemsById = ITEM_DEFINITIONS as Record<string, ItemDefinition>;

export function renderInventoryView(
  elements: InventoryElements,
  inventory: InventoryViewState,
  onSelect: (itemId: string) => void,
) {
  elements.items.replaceChildren();
  const itemIds = inventory.itemIds.filter((itemId) => itemsById[itemId]);
  if (!inventory.selectedItemId && itemIds.length) inventory.selectedItemId = itemIds[0];
  elements.count.textContent = `${itemIds.length} / 16`;
  elements.equippedFeet.classList.toggle("is-equipped", inventory.equippedFeet === TRAILBLAZER_BOOTS);
  elements.equippedFeet.innerHTML = inventory.equippedFeet === TRAILBLAZER_BOOTS
    ? `<span class="boot-pixel-icon" aria-hidden="true"><i></i><i></i></span><span>FEET</span>`
    : "<span>FEET</span>";

  for (let index = 0; index < 16; index += 1) {
    const itemId = itemIds[index];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "inventory-item" + (itemId ? " is-filled" : "") +
      (inventory.selectedItemId === itemId ? " is-selected" : "");
    if (itemId) {
      const item = itemsById[itemId];
      button.setAttribute("aria-label", item.name);
      button.setAttribute("aria-pressed", String(inventory.selectedItemId === itemId));
      button.innerHTML = `<span class="boot-pixel-icon" aria-hidden="true"><i></i><i></i></span>`;
      button.addEventListener("click", () => onSelect(itemId));
    } else {
      button.setAttribute("aria-label", `Empty bag slot ${index + 1}`);
      button.disabled = true;
    }
    elements.items.appendChild(button);
  }

  const selected = itemsById[inventory.selectedItemId] ?? itemsById[itemIds[0]];
  if (!selected) {
    elements.detail.textContent = "SELECT AN ITEM TO VIEW ITS STATS";
    return;
  }
  elements.detail.innerHTML =
    `<div class="inventory-slot">${selected.slot} · ${inventory.equippedFeet === selected.id ? "EQUIPPED" : "IN BAG"}</div>` +
    `<strong>${selected.name}</strong><p>${selected.description}</p>` +
    `<div class="inventory-stats">${selected.stats.join(" · ")}</div>`;
}
