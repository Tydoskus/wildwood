import { BASIC_PAPER_HAT, ITEM_DEFINITIONS, SUPERIOR_GOLDEN_HELMET, TRAILBLAZER_BOOTS } from "../game/inventory";
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
  elements.hpFill.style.width = `${(hpRatio * 100).toFixed(1)}%`;
  elements.hpText.textContent = `${formatCompactNumber(Math.max(0, Math.ceil(player.hp)))} / ${formatCompactNumber(Math.ceil(player.maxHp))}`;
  if (elements.playerName) {
    const name = displayName || "WANDERER";
    if (isDeveloper) {
      const badge = document.createElement("span");
      badge.className = "dev-badge";
      badge.textContent = "[DEV] ";
      elements.playerName.replaceChildren(badge, document.createTextNode(name));
    } else {
      elements.playerName.textContent = name;
    }
  }
  const powerLabel = document.createElement("span");
  powerLabel.className = "power-label";
  powerLabel.textContent = "Power:";
  const powerValue = document.createElement("span");
  powerValue.className = "power-value";
  powerValue.textContent = formatCompactNumber(power);
  elements.playerPower.replaceChildren(powerLabel, " ", powerValue);
  if (elements.coopStatus) elements.coopStatus.textContent = `Players online: ${playerCount}`;
}

type InventoryViewState = {
  itemIds: string[];
  equippedHead: string;
  equippedFeet: string;
  selectedItemId: string;
};

type InventoryElements = {
  items: HTMLElement;
  detail: HTMLElement;
  count: HTMLElement;
  equippedHead: HTMLElement;
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

function itemArt(itemId: string, hidden = true) {
  const aria = hidden ? ' aria-hidden="true"' : "";
  if (itemId === BASIC_PAPER_HAT) return `<span class="inventory-item-art basic-paper-hat-art"${aria}></span>`;
  if (itemId === SUPERIOR_GOLDEN_HELMET) return `<span class="inventory-item-art superior-golden-helmet-art"${aria}></span>`;
  return '<span class="boot-pixel-icon" aria-hidden="true"><i></i><i></i></span>';
}

export function renderInventoryView(
  elements: InventoryElements,
  inventory: InventoryViewState,
  actions: {
    onSelect: (itemId: string) => void;
    onEquip: (itemId: string) => void;
    onUnequip: (itemId: string) => void;
    onInspect: (itemId: string) => void;
  },
) {
  elements.items.replaceChildren();
  const itemIds = inventory.itemIds.filter((itemId) => itemsById[itemId]);
  const equippedIds = new Set([inventory.equippedHead, inventory.equippedFeet].filter(Boolean));
  const bagItemIds = itemIds.filter((itemId) => !equippedIds.has(itemId));
  if (!inventory.selectedItemId && (bagItemIds[0] || itemIds[0])) inventory.selectedItemId = bagItemIds[0] || itemIds[0];
  elements.count.textContent = `${bagItemIds.length} / 16`;
  elements.equippedHead.classList.toggle("is-equipped", Boolean(inventory.equippedHead));
  elements.equippedHead.innerHTML = inventory.equippedHead
    ? itemArt(inventory.equippedHead, false)
    : "HEAD";
  elements.equippedFeet.classList.toggle("is-equipped", inventory.equippedFeet === TRAILBLAZER_BOOTS);
  elements.equippedFeet.textContent = inventory.equippedFeet === TRAILBLAZER_BOOTS ? "BOOTS" : "FEET";

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
    `<div class="inventory-slot">${selected.slot} · ${(selected.slot === "HEAD" ? inventory.equippedHead : inventory.equippedFeet) === selected.id ? "EQUIPPED" : "IN BAG"}</div>` +
    `<strong>${selected.name}</strong><p>${selected.description}</p>` +
    `<div class="inventory-stats">${selected.stats.join(" · ")}</div>`;
  const actionRow = document.createElement("div");
  actionRow.className = "inventory-actions";
  const equip = document.createElement("button");
  equip.type = "button";
  const equipped = (selected.slot === "HEAD" ? inventory.equippedHead : inventory.equippedFeet) === selected.id;
  equip.textContent = equipped ? "UNEQUIP" : "EQUIP";
  equip.addEventListener("click", () => equipped ? actions.onUnequip(selected.id) : actions.onEquip(selected.id));
  const inspect = document.createElement("button");
  inspect.type = "button";
  inspect.className = "secondary-button";
  inspect.textContent = "INSPECT";
  inspect.addEventListener("click", () => actions.onInspect(selected.id));
  actionRow.append(equip, inspect);
  elements.detail.appendChild(actionRow);
}
