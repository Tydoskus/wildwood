import {
  BASIC_PAPER_HAT,
  canonicalItemId,
  DEVELOPER_ITEM_IDS,
  FOREST_DROP_ITEM_IDS,
  ITEM_DEFINITIONS,
  itemDefinition,
  itemFitsEquipmentSlot,
  LEGENDARY_WHITE_GOLD_ARMOR,
  MAX_FOREST_ITEM_COUNT,
  STARTER_BOW,
  STARTER_STONE,
  STARTER_ITEM_IDS,
  SUPERIOR_GOLDEN_HELMET,
  TRAILBLAZER_BOOTS,
  WOODEN_ARMOR,
  type EquipmentSlot,
} from "../../shared/items";

export {
  BASIC_PAPER_HAT,
  ITEM_DEFINITIONS,
  itemDefinition,
  itemFitsEquipmentSlot,
  LEGENDARY_WHITE_GOLD_ARMOR,
  STARTER_BOW,
  STARTER_STONE,
  SUPERIOR_GOLDEN_HELMET,
  TRAILBLAZER_BOOTS,
  WOODEN_ARMOR,
  type EquipmentSlot,
  type ItemDefinition as InventoryItemDefinition,
} from "../../shared/items";

export type InventoryState = {
  itemIds: string[];
  equippedHead: string;
  equippedChest: string;
  equippedFeet: string;
  equippedRightHand: string;
  equippedLeftHand: string;
};

export type InventoryStack = { itemId: string; quantity: number };

export function inventoryItemQuantity(inventory: Pick<InventoryState, "itemIds">, itemId: string) {
  return inventory.itemIds.reduce((count, current) => count + Number(current === itemId), 0);
}

/** Replaces one stack's quantity while retaining its first inventory position. */
export function setInventoryItemQuantity(inventory: InventoryState, itemId: string, quantity: number) {
  const item = itemDefinition(itemId);
  if (!item?.stackable) return false;
  const nextQuantity = Math.max(0, Math.min(MAX_FOREST_ITEM_COUNT, Math.floor(quantity)));
  const firstIndex = inventory.itemIds.indexOf(itemId);
  const insertionIndex = firstIndex < 0 ? inventory.itemIds.length : firstIndex;
  const withoutItem = inventory.itemIds.filter((current) => current !== itemId);
  withoutItem.splice(insertionIndex, 0, ...Array(nextQuantity).fill(itemId));
  inventory.itemIds = withoutItem;
  if (nextQuantity === 0) {
    if (inventory.equippedHead === itemId) inventory.equippedHead = "";
    if (inventory.equippedChest === itemId) inventory.equippedChest = "";
    if (inventory.equippedFeet === itemId) inventory.equippedFeet = "";
    if (inventory.equippedRightHand === itemId) inventory.equippedRightHand = "";
    if (inventory.equippedLeftHand === itemId) inventory.equippedLeftHand = "";
  }
  return true;
}

/** Converts owned copies into one bag stack per item, subtracting equipped copies. */
export function bagInventoryStacks(inventory: InventoryState): InventoryStack[] {
  const counts = new Map<string, number>();
  for (const itemId of inventory.itemIds) {
    if (!itemDefinition(itemId)) continue;
    counts.set(itemId, (counts.get(itemId) ?? 0) + 1);
  }
  for (const itemId of [inventory.equippedHead, inventory.equippedChest, inventory.equippedFeet, inventory.equippedRightHand, inventory.equippedLeftHand]) {
    if (!itemId) continue;
    counts.set(itemId, Math.max(0, (counts.get(itemId) ?? 0) - 1));
  }
  return [...counts]
    .filter(([, quantity]) => quantity > 0)
    .map(([itemId, quantity]) => ({ itemId, quantity }));
}

/** Moves an owned item between bag and compatible equipment slots. */
export function moveInventoryItem(inventory: InventoryState, itemId: string, destination: EquipmentSlot | "BAG") {
  const item = itemDefinition(itemId);
  if (!item || !inventory.itemIds.includes(itemId)) return false;
  const equippedSlots: (keyof Pick<InventoryState, "equippedHead" | "equippedChest" | "equippedFeet" | "equippedRightHand" | "equippedLeftHand">)[] = [
    "equippedHead", "equippedChest", "equippedFeet", "equippedRightHand", "equippedLeftHand",
  ];
  const clearItem = () => {
    let changed = false;
    for (const slot of equippedSlots) {
      if (inventory[slot] !== itemId) continue;
      inventory[slot] = "";
      changed = true;
    }
    return changed;
  };
  if (destination === "BAG") return clearItem();
  const target = destination === "HEAD" ? "equippedHead"
    : destination === "CHEST" ? "equippedChest"
      : destination === "FEET" ? "equippedFeet"
        : destination === "RIGHT_HAND" ? "equippedRightHand"
          : "equippedLeftHand";
  const allowed = itemFitsEquipmentSlot(item.id, destination);
  if (!allowed || inventory[target] === itemId) return false;
  clearItem();
  if (item.slot === "HAND") {
    inventory.equippedRightHand = "";
    inventory.equippedLeftHand = "";
  }
  inventory[target] = itemId;
  return true;
}

export function normaliseInventory(itemIds: unknown, equippedFeet: unknown, equippedHead: unknown, equippedChest: unknown, ownsBoots: boolean, ownsDeveloperCosmetics = false, equippedRightHand: unknown = "", equippedLeftHand: unknown = ""): InventoryState {
  const requested = Array.isArray(itemIds) ? itemIds : [];
  const hasBoots = ownsBoots || requested.includes(TRAILBLAZER_BOOTS);
  const hasBetaTesterGoldenHelmet = ownsDeveloperCosmetics || requested.includes(SUPERIOR_GOLDEN_HELMET);
  const handStateWasSaved = requested.some((itemId) => itemDefinition(itemId)?.slot === "HAND");
  const developerItems = ownsDeveloperCosmetics
    ? DEVELOPER_ITEM_IDS
    : hasBetaTesterGoldenHelmet ? [SUPERIOR_GOLDEN_HELMET] : [];
  const forestDropItems = FOREST_DROP_ITEM_IDS.flatMap((itemId) =>
    Array(Math.min(MAX_FOREST_ITEM_COUNT, requested.filter((requestedId) => canonicalItemId(requestedId) === itemId).length)).fill(itemId));
  const items = [...STARTER_ITEM_IDS, ...developerItems, ...(hasBoots ? [TRAILBLAZER_BOOTS] : []), ...forestDropItems];
  const headItems = items.filter((itemId) => itemDefinition(itemId)?.slot === "HEAD");
  const chestItems = items.filter((itemId) => itemDefinition(itemId)?.slot === "CHEST");
  const handItems = items.filter((itemId) => itemDefinition(itemId)?.slot === "HAND");
  const savedLeftItem = canonicalItemId(equippedLeftHand);
  const savedRightItem = canonicalItemId(equippedRightHand);
  const savedLeftHand = savedLeftItem && handItems.includes(savedLeftItem) ? savedLeftItem : "";
  const savedRightHand = savedRightItem && handItems.includes(savedRightItem) ? savedRightItem : "";
  return {
    itemIds: items,
    equippedHead: equippedHead === ""
      ? ""
      : typeof equippedHead === "string" && headItems.includes(equippedHead) ? equippedHead : BASIC_PAPER_HAT,
    equippedChest: typeof equippedChest === "string" && chestItems.includes(equippedChest) ? equippedChest : "",
    equippedFeet: hasBoots && equippedFeet === TRAILBLAZER_BOOTS
      ? TRAILBLAZER_BOOTS
      : "",
    equippedRightHand: savedRightHand || (!handStateWasSaved && !savedLeftHand ? STARTER_STONE : ""),
    equippedLeftHand: savedRightHand ? "" : savedLeftHand,
  };
}

export function inventoryFromSave(inventoryJson: unknown, equippedFeet: unknown, equippedHead: unknown, equippedChest: unknown, ownsBoots: boolean, ownsDeveloperCosmetics = false, equippedRightHand: unknown = "", equippedLeftHand: unknown = ""): InventoryState {
  let itemIds: unknown = [];
  if (typeof inventoryJson === "string") {
    try { itemIds = JSON.parse(inventoryJson); } catch {}
  }
  return normaliseInventory(itemIds, equippedFeet, equippedHead, equippedChest, ownsBoots, ownsDeveloperCosmetics, equippedRightHand, equippedLeftHand);
}

export function serialiseInventory(inventory: InventoryState) {
  return JSON.stringify(inventory.itemIds);
}
