import {
  BASIC_PAPER_HAT,
  canonicalItemId,
  DEVELOPER_ITEM_IDS,
  FOREST_DROP_ITEM_IDS,
  FROST_ARMOR,
  FROST_BOW,
  ITEM_DEFINITIONS,
  itemDefinition,
  itemFitsEquipmentSlot,
  LEGENDARY_WHITE_GOLD_ARMOR,
  MAX_FOREST_ITEM_COUNT,
  STARTER_BOW,
  STARTER_STONE,
  STARTER_ITEM_IDS,
  SNOW_BOSS_DROP_ITEM_IDS,
  SUPERIOR_GOLDEN_HELMET,
  TRAILBLAZER_BOOTS,
  WOODEN_ARMOR,
  type EquipmentSlot,
} from "../../shared/items";
import { resolveEquipmentAppearance, type EquipmentAppearance } from "../../shared/equipment-appearance";

export {
  BASIC_PAPER_HAT,
  FROST_ARMOR,
  FROST_BOW,
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
  cosmeticHead: string;
  cosmeticChest: string;
  cosmeticFeet: string;
  cosmeticRightHand: string;
  cosmeticLeftHand: string;
};

export type { EquipmentAppearance } from "../../shared/equipment-appearance";

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
    if (inventory.cosmeticHead === itemId) inventory.cosmeticHead = "";
    if (inventory.cosmeticChest === itemId) inventory.cosmeticChest = "";
    if (inventory.cosmeticFeet === itemId) inventory.cosmeticFeet = "";
    if (inventory.cosmeticRightHand === itemId) inventory.cosmeticRightHand = "";
    if (inventory.cosmeticLeftHand === itemId) inventory.cosmeticLeftHand = "";
  }
  return true;
}

/** Converts every owned copy into one stack per item without consuming cosmetics. */
export function ownedInventoryStacks(inventory: Pick<InventoryState, "itemIds">): InventoryStack[] {
  const counts = new Map<string, number>();
  for (const itemId of inventory.itemIds) {
    if (!itemDefinition(itemId)) continue;
    counts.set(itemId, (counts.get(itemId) ?? 0) + 1);
  }
  return [...counts].map(([itemId, quantity]) => ({ itemId, quantity }));
}

/** Converts owned copies into one bag stack per item, subtracting stat equipment. */
export function bagInventoryStacks(inventory: InventoryState): InventoryStack[] {
  const counts = new Map(ownedInventoryStacks(inventory).map(({ itemId, quantity }) => [itemId, quantity]));
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

/** Assigns an owned item as a visual override without moving or consuming it. */
export function moveCosmeticInventoryItem(inventory: InventoryState, itemId: string, destination: EquipmentSlot | "BAG") {
  const item = itemDefinition(itemId);
  if (!item || !inventory.itemIds.includes(itemId)) return false;
  const cosmeticSlots: (keyof Pick<InventoryState, "cosmeticHead" | "cosmeticChest" | "cosmeticFeet" | "cosmeticRightHand" | "cosmeticLeftHand">)[] = [
    "cosmeticHead", "cosmeticChest", "cosmeticFeet", "cosmeticRightHand", "cosmeticLeftHand",
  ];
  const clearItem = () => {
    let changed = false;
    for (const slot of cosmeticSlots) {
      if (inventory[slot] !== itemId) continue;
      inventory[slot] = "";
      changed = true;
    }
    return changed;
  };
  if (destination === "BAG") return clearItem();
  if (!itemFitsEquipmentSlot(item.id, destination)) return false;
  const target = destination === "HEAD" ? "cosmeticHead"
    : destination === "CHEST" ? "cosmeticChest"
      : destination === "FEET" ? "cosmeticFeet"
        : destination === "RIGHT_HAND" ? "cosmeticRightHand"
          : "cosmeticLeftHand";
  if (inventory[target] === itemId) return false;
  clearItem();
  if (item.slot === "HAND") {
    inventory.cosmeticRightHand = "";
    inventory.cosmeticLeftHand = "";
  }
  inventory[target] = itemId;
  return true;
}

/** Resolves final outfit art while keeping stat equipment untouched. */
export function equipmentAppearance(inventory: Pick<InventoryState,
  "equippedHead" | "equippedChest" | "equippedFeet" | "equippedRightHand" | "equippedLeftHand"
> & Partial<Pick<InventoryState,
  "cosmeticHead" | "cosmeticChest" | "cosmeticFeet" | "cosmeticRightHand" | "cosmeticLeftHand"
>>): EquipmentAppearance {
  return resolveEquipmentAppearance(inventory);
}

export function normaliseInventory(itemIds: unknown, equippedFeet: unknown, equippedHead: unknown, equippedChest: unknown, ownsBoots: boolean, ownsDeveloperCosmetics = false, equippedRightHand: unknown = "", equippedLeftHand: unknown = "", cosmeticHead: unknown = "", cosmeticChest: unknown = "", cosmeticFeet: unknown = "", cosmeticRightHand: unknown = "", cosmeticLeftHand: unknown = ""): InventoryState {
  const requested = Array.isArray(itemIds) ? itemIds : [];
  const hasBoots = ownsBoots || requested.includes(TRAILBLAZER_BOOTS);
  const hasBetaTesterGoldenHelmet = ownsDeveloperCosmetics || requested.includes(SUPERIOR_GOLDEN_HELMET);
  const handStateWasSaved = requested.some((itemId) => itemDefinition(itemId)?.slot === "HAND");
  const developerItems = ownsDeveloperCosmetics
    ? DEVELOPER_ITEM_IDS
    : hasBetaTesterGoldenHelmet ? [SUPERIOR_GOLDEN_HELMET] : [];
  const forestDropItems = FOREST_DROP_ITEM_IDS.flatMap((itemId) =>
    Array(Math.min(MAX_FOREST_ITEM_COUNT, requested.filter((requestedId) => canonicalItemId(requestedId) === itemId).length)).fill(itemId));
  const snowBossDropItems = SNOW_BOSS_DROP_ITEM_IDS.flatMap((itemId) =>
    Array(Math.min(MAX_FOREST_ITEM_COUNT, requested.filter((requestedId) => canonicalItemId(requestedId) === itemId).length)).fill(itemId));
  const items = [...STARTER_ITEM_IDS, ...developerItems, ...(hasBoots ? [TRAILBLAZER_BOOTS] : []), ...forestDropItems, ...snowBossDropItems];
  const headItems = items.filter((itemId) => itemDefinition(itemId)?.slot === "HEAD");
  const chestItems = items.filter((itemId) => itemDefinition(itemId)?.slot === "CHEST");
  const handItems = items.filter((itemId) => itemDefinition(itemId)?.slot === "HAND");
  const savedLeftItem = canonicalItemId(equippedLeftHand);
  const savedRightItem = canonicalItemId(equippedRightHand);
  const savedLeftHand = savedLeftItem && handItems.includes(savedLeftItem) ? savedLeftItem : "";
  const savedRightHand = savedRightItem && handItems.includes(savedRightItem) ? savedRightItem : "";
  const cosmeticItem = (requestedItem: unknown, slot: EquipmentSlot) => {
    const itemId = canonicalItemId(requestedItem);
    return itemId && items.includes(itemId) && itemFitsEquipmentSlot(itemId, slot) ? itemId : "";
  };
  const savedCosmeticRightHand = cosmeticItem(cosmeticRightHand, "RIGHT_HAND");
  const savedCosmeticLeftHand = savedCosmeticRightHand ? "" : cosmeticItem(cosmeticLeftHand, "LEFT_HAND");
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
    cosmeticHead: cosmeticItem(cosmeticHead, "HEAD"),
    cosmeticChest: cosmeticItem(cosmeticChest, "CHEST"),
    cosmeticFeet: cosmeticItem(cosmeticFeet, "FEET"),
    cosmeticRightHand: savedCosmeticRightHand,
    cosmeticLeftHand: savedCosmeticLeftHand,
  };
}

export function inventoryFromSave(inventoryJson: unknown, equippedFeet: unknown, equippedHead: unknown, equippedChest: unknown, ownsBoots: boolean, ownsDeveloperCosmetics = false, equippedRightHand: unknown = "", equippedLeftHand: unknown = "", cosmeticHead: unknown = "", cosmeticChest: unknown = "", cosmeticFeet: unknown = "", cosmeticRightHand: unknown = "", cosmeticLeftHand: unknown = ""): InventoryState {
  let itemIds: unknown = [];
  if (typeof inventoryJson === "string") {
    try { itemIds = JSON.parse(inventoryJson); } catch {}
  }
  return normaliseInventory(itemIds, equippedFeet, equippedHead, equippedChest, ownsBoots, ownsDeveloperCosmetics, equippedRightHand, equippedLeftHand, cosmeticHead, cosmeticChest, cosmeticFeet, cosmeticRightHand, cosmeticLeftHand);
}

export function serialiseInventory(inventory: InventoryState) {
  return JSON.stringify(inventory.itemIds);
}
