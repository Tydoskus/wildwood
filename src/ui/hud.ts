import { formatEquipmentAmount } from "./equipment-stat-format";
import { itemTier } from "../../shared/item-tier";
import { appendItemTierLabel } from "./item-tier-label";
import { cosmeticInventoryStacks, bagInventoryStacks, ITEM_DEFINITIONS, type EquipmentSlot } from "../game/inventory";
import { itemArtMarkup } from "../game/item-presentation";
import { formatCompactNumber } from "./number-format";
import { appendPlayerGenderIcon } from "./player-gender";
import { PLAYER_GENDER_UNSET, type PlayerGender } from "../../shared/player-gender";
import { isHiddenCosmeticItem } from "../../shared/equipment-appearance";
import { type ItemSlot, itemDefinition, isCosmeticOnlyItem, itemStats, itemDisplayName, normalizeItemUpgradeLevel } from "../../shared/items";

import { appendPlayerNameTags, appendPrestigeBadge, playerNamePrefix, playerPrestigeLevel } from "../app/player-name-tags";

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
  identity?: string,
  guest = false,
) {
  const hpRatio = Math.max(0, Math.min(1, player.hp / player.maxHp));
  const hpWidth = `${(hpRatio * 100).toFixed(1)}%`;
  if (elements.hpFill.style.width !== hpWidth) elements.hpFill.style.width = hpWidth;
  const hpText = `${formatCompactNumber(Math.max(0, Math.ceil(player.hp)))} / ${formatCompactNumber(Math.ceil(player.maxHp))}`;
  if (elements.hpText.textContent !== hpText) elements.hpText.textContent = hpText;
  if (elements.playerName) {
    const name = displayName || "WANDERER";
    const nameKey = `${playerNamePrefix(identity, isDeveloper)}:${name}:${gender}:${guest}:${playerPrestigeLevel(identity)}`;
    if (elements.playerName.dataset.renderedName !== nameKey) {
      const nameText = document.createElement("span");
      nameText.className = "player-hud-name-text";
      nameText.textContent = name;
      elements.playerName.replaceChildren();
      appendPlayerNameTags(elements.playerName, identity, isDeveloper);
      elements.playerName.append(nameText);
      appendPrestigeBadge(elements.playerName, identity);
      appendPlayerGenderIcon(elements.playerName, gender);
      // The guest note follows the marks, the way chat orders them, so the
      // badge stays against the name it belongs to instead of after the note.
      if (guest) elements.playerName.append(document.createTextNode(" (guest)"));
      elements.playerName.dataset.renderedName = nameKey;
    }
  }
  const powerText = formatCompactNumber(power);
  if (elements.playerPower.dataset.renderedPower !== powerText) {
    const powerIcon = document.createElement("img");
    powerIcon.className = "power-icon power-icon-hud";
    powerIcon.src = "assets/wildstat/icons/Icon_Battle_Candy_v2.webp";
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
  cosmeticItemIds?: string[];
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

/** One visible weapon slot also supports older saves that use the left hand. */
export function inventoryWeaponSlot(inventory: InventoryViewState, mode: InventoryMode): "RIGHT_HAND" | "LEFT_HAND" {
  if (mode === "COSMETICS") {
    if (inventory.cosmeticRightHand) return "RIGHT_HAND";
    if (inventory.cosmeticLeftHand) return "LEFT_HAND";
  }
  return inventory.equippedRightHand || !inventory.equippedLeftHand ? "RIGHT_HAND" : "LEFT_HAND";
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
    return [{ label: mode === "COSMETICS" ? "REMOVE COSMETIC" : "UNEQUIP", destination: "BAG" }];
  }
  const appearanceOwned = isCosmeticOnlyItem(itemId) || inventory.cosmeticItemIds?.includes(itemId);
  if (mode === "COSMETICS" ? !appearanceOwned : isCosmeticOnlyItem(itemId)) return [];
  if (item.slot === "HAND") {
    const destination = inventoryWeaponSlot(inventory, mode);
    const alreadyEquipped = equipmentItemId(inventory, destination, mode) === itemId;
    return [{
      label: alreadyEquipped
        ? mode === "COSMETICS" ? "COSMETIC ACTIVE" : "EQUIPPED"
        : mode === "COSMETICS" ? "USE COSMETIC" : "EQUIP",
      destination,
      disabled: alreadyEquipped,
    }];
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
  element.dataset.inventoryLocation = destination;
  if (item) {
    element.dataset.itemId = itemId;
  } else {
    delete element.dataset.itemId;
  }
  element.classList.toggle("is-equipped", Boolean(item));
  element.classList.toggle("is-cosmetic", mode === "COSMETICS" && Boolean(item));
  element.classList.toggle("is-cosmetic-inherited", Boolean(inheritedItem));
  element.classList.toggle("is-cosmetic-hidden", cosmeticHidden);
  const level = item ? upgradeLevel(itemId) : 0;
  element.setAttribute("aria-label", item
    ? `${label}: ${itemDisplayName(itemId, level)}. Tap to inspect.`
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
  // A filled equipment slot reads as its upgrade level rather than the item's
  // name: the name is on the artwork, and the level is the thing this panel is
  // for. Cosmetic slots have no level, so they keep saying what is in them.
  const equipped = item && mode === "EQUIPMENT";
  name.textContent = equipped
    ? `Lvl: +${level}`
    : item?.name ?? (cosmeticHidden ? "NOTHING" : inheritedItem ? "GEAR VISIBLE" : mode === "COSMETICS" ? "NOTHING" : "EMPTY");
  element.replaceChildren(slotLabel, art, name);
  element.classList.toggle("is-filled", Boolean(equipped));
  if (equipped) appendItemTierLabel(element, itemId);
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
    onInspect: (itemId: string, location: EquipmentSlot | "BAG") => void;
    upgradeLevel: (itemId: string) => number;
    slotCapacity: number;
    filter?: ItemSlot;
    nextSlotCost?: bigint;
    onUnlockSlot?: () => void;
  },
) {
  elements.items.replaceChildren();
  const cosmetics = mode === "COSMETICS";
  const bagStacks = cosmetics ? cosmeticInventoryStacks(inventory) : bagInventoryStacks(inventory)
    .sort((a, b) => (itemTier(b.itemId) ?? 0) - (itemTier(a.itemId) ?? 0)
      || itemDisplayName(a.itemId).localeCompare(itemDisplayName(b.itemId)));
  const slotCapacity = cosmetics ? Math.max(50, bagStacks.length) : actions.slotCapacity;
  elements.count.textContent = `${bagStacks.length} / ${slotCapacity} ${cosmetics ? "Cosmetics" : "Items"}`;
  renderEquipmentSlot(elements.equippedHead, inventory, "HEAD", "HEAD", mode, actions.upgradeLevel);
  renderEquipmentSlot(elements.equippedChest, inventory, "CHEST", "ARMOR", mode, actions.upgradeLevel);
  renderEquipmentSlot(elements.equippedRightHand, inventory, inventoryWeaponSlot(inventory, mode), "WEAPON", mode, actions.upgradeLevel);
  renderEquipmentSlot(elements.equippedFeet, inventory, "FEET", "BOOTS", mode, actions.upgradeLevel);

  const visibleStacks = actions.filter ? bagStacks.filter(stack => itemDefinition(stack.itemId)?.slot === actions.filter) : bagStacks;
  // Keep the full grid footprint while filtering so scroll clamping cannot
  // pull the character preview/tabs around, even when there are no matches.
  const visibleSlots = slotCapacity + (actions.filter && !cosmetics && actions.nextSlotCost !== undefined ? 1 : 0);
  for (let index = 0; index < visibleSlots; index += 1) {
    const stack = visibleStacks[index];
    const itemId = stack?.itemId;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.inventoryLocation = "BAG";
    button.className = "inventory-item" + (itemId ? " is-filled" : " is-empty");
    if (itemId) {
      const level = normalizeItemUpgradeLevel(actions.upgradeLevel(itemId));
      button.setAttribute("aria-label", `${itemDisplayName(itemId, level)}. Tap to inspect and equip.`);
      button.dataset.itemId = itemId;
      const art = document.createElement("span");
      art.className = "inventory-item-art-wrap";
      art.innerHTML = itemArt(itemId);
      button.append(art);
      if (!cosmetics) appendItemTierLabel(button, itemId, "above");
      if (!cosmetics) {
        const bonuses = document.createElement("span");
        bonuses.className = "inventory-item-bonuses";
        const stats = itemStats(itemId, level);
        for (const stat of stats) {
          const match = /^(DAMAGE|MAX HEALTH|REGEN) (\+[\d.]+)(%?)$/.exec(stat);
          if (!match) continue;
          const value = document.createElement("span");
          value.dataset.statKind = match[1] === "DAMAGE" ? "damage" : match[1] === "MAX HEALTH" ? "health" : "regen";
          value.textContent = `+${formatEquipmentAmount(Number(match[2]))}${match[3]}`;
          value.title = stat;
          value.setAttribute("aria-label", stat);
          bonuses.append(value);
        }
        button.append(bonuses);
      }
      // No +N on a loose item: the number belongs to the slot it goes in, and
      // showing it here made every weapon in the bag claim the weapon slot's
      // tier as its own.
      button.addEventListener("click", () => actions.onInspect(itemId, "BAG"));
    } else {
      button.setAttribute("aria-label", `Empty bag slot ${index + 1}`);
      button.disabled = true;
      if (actions.filter) { button.classList.add("is-filter-placeholder"); button.setAttribute("aria-hidden", "true"); }
      const empty = document.createElement("span");
      empty.className = "inventory-item-empty-mark";
      empty.textContent = "";
      button.append(empty);
    }
    elements.items.appendChild(button);
  }
  if (actions.filter && visibleStacks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "inventory-filter-empty";
    empty.textContent = `No ${{ HAND: "weapons", CHEST: "armor", HEAD: "helmets", FEET: "boots" }[actions.filter] ?? "items"}`;
    elements.items.append(empty);
  }
  if (!actions.filter && !cosmetics && actions.nextSlotCost !== undefined) {
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
    icon.src = "assets/wildstat/gems/gem-icon-v2.webp";
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
