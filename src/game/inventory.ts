import {
  canonicalItemId,
  DEVELOPER_ITEM_IDS,
  EQUIPMENT_DROP_ITEM_IDS,
  itemDefinition,
  isCosmeticOnlyItem,
  itemFitsEquipmentSlot,
  MAX_FOREST_ITEM_COUNT,
  STARTER_STONE,
  STARTER_ITEM_IDS,
  type EquipmentSlot,
} from "../../shared/items";
import {
  HIDDEN_COSMETIC_ITEM_ID,
  isHiddenCosmeticItem,
  resolveEquipmentAppearance,
  type EquipmentAppearance,
} from "../../shared/equipment-appearance";
import { cosmeticUnlocks } from "../../shared/cosmetic-conversion";

export {
  BASIC_PAPER_HAT,
  DARK_METAL_HELMET,
  SAMURAI_HAT,
  FIRE_METAL_BOW,
  FIRE_METAL_HELMET,
  FROST_ARMOR,
  FROST_BOW,
  IRON_BOW,
  ITEM_DEFINITIONS,
  itemDefinition,
  itemFitsEquipmentSlot,
  LEGENDARY_WHITE_GOLD_ARMOR,
  LAVA_BOW,
  MAGMA_ARMOR,
  NIGHT_BOW,
  SNOW_BOW,
  STARTER_BOW,
  STARTER_STONE,
  SUPERIOR_GOLDEN_HELMET,
  WOOD_FULL_HELM,
  WOODEN_ARMOR,
  type EquipmentSlot,
  type ItemDefinition as InventoryItemDefinition,
} from "../../shared/items";

export type InventoryState = {
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
};

export type { EquipmentAppearance } from "../../shared/equipment-appearance";
export { HIDDEN_COSMETIC_ITEM_ID } from "../../shared/equipment-appearance";

export type InventoryStack = { itemId: string; quantity: number };

const EQUIPPED_ITEM_FIELDS = [
  "equippedHead", "equippedChest", "equippedFeet", "equippedRightHand", "equippedLeftHand",
] as const;
const COSMETIC_ITEM_FIELDS = [
  "cosmeticHead", "cosmeticChest", "cosmeticFeet", "cosmeticRightHand", "cosmeticLeftHand",
] as const;
const SLOTTED_ITEM_FIELDS = [...EQUIPPED_ITEM_FIELDS, ...COSMETIC_ITEM_FIELDS] as const;

export function inventoryItemQuantity(inventory: Pick<InventoryState, "itemIds">, itemId: string) {
  return inventory.itemIds.reduce((count, current) => count + Number(current === itemId), 0);
}

/** Adds or removes one unique item while retaining its original bag position. */
export function setInventoryItemQuantity(inventory: InventoryState, itemId: string, quantity: number) {
  const item = itemDefinition(itemId);
  if (!item) return false;
  const nextQuantity = Math.max(0, Math.min(MAX_FOREST_ITEM_COUNT, Math.floor(quantity)));
  const firstIndex = inventory.itemIds.indexOf(itemId);
  const insertionIndex = firstIndex < 0 ? inventory.itemIds.length : firstIndex;
  const withoutItem = inventory.itemIds.filter((current) => current !== itemId);
  withoutItem.splice(insertionIndex, 0, ...Array(nextQuantity).fill(itemId));
  inventory.itemIds = withoutItem;
  if (nextQuantity === 0) {
    for (const field of SLOTTED_ITEM_FIELDS) {
      if (field.startsWith("cosmetic") && inventory.cosmeticItemIds?.includes(itemId)) continue;
      if (inventory[field] === itemId) inventory[field] = "";
    }
  }
  return true;
}

/** Converts owned IDs into unique inventory entries before slot assignment. */
export function ownedInventoryStacks(inventory: Pick<InventoryState, "itemIds">): InventoryStack[] {
  const counts = new Map<string, number>();
  for (const itemId of inventory.itemIds) {
    if (!itemDefinition(itemId)) continue;
    counts.set(itemId, 1);
  }
  return [...counts].map(([itemId, quantity]) => ({ itemId, quantity }));
}

/** Converts unassigned unique items into bag entries; cosmetic references do not consume items. */
export function bagInventoryStacks(inventory: InventoryState): InventoryStack[] {
  const counts = new Map(ownedInventoryStacks(inventory).filter(({ itemId }) => !isCosmeticOnlyItem(itemId)).map(({ itemId, quantity }) => [itemId, quantity]));
  for (const field of EQUIPPED_ITEM_FIELDS) {
    const itemId = inventory[field];
    if (!itemDefinition(itemId)) continue;
    counts.set(itemId, Math.max(0, (counts.get(itemId) ?? 0) - 1));
  }
  return [...counts]
    .filter(([, quantity]) => quantity > 0)
    .map(([itemId, quantity]) => ({ itemId, quantity }));
}

/** Cosmetic ownership is a separate, uncapped collection; active looks stay selectable. */
export function cosmeticInventoryStacks(inventory: InventoryState): InventoryStack[] {
  return [...new Set([
    ...ownedInventoryStacks(inventory).filter(({ itemId }) => isCosmeticOnlyItem(itemId)).map(({ itemId }) => itemId),
    ...(inventory.cosmeticItemIds ?? []),
  ])].map(itemId => ({ itemId, quantity: 1 }));
}

/** Move old cosmetic-only equipment into appearance slots without losing ownership or hiding choices. */
export function separateCosmeticLoadout<T extends InventoryState>(inventory: T): T {
  const next = { ...inventory };
  for (let index = 0; index < EQUIPPED_ITEM_FIELDS.length; index++) {
    const equipped = EQUIPPED_ITEM_FIELDS[index], cosmetic = COSMETIC_ITEM_FIELDS[index];
    if (!isCosmeticOnlyItem(next[equipped])) continue;
    if (!next[cosmetic]) next[cosmetic] = next[equipped];
    next[equipped] = "";
  }
  return next;
}

function hasFreeOrMovableCopy(
  inventory: InventoryState,
  itemId: string,
  movableFields: readonly (typeof EQUIPPED_ITEM_FIELDS)[number][],
) {
  if (movableFields.some((field) => inventory[field] === itemId)) return true;
  const equippedQuantity = EQUIPPED_ITEM_FIELDS.reduce(
    (count, field) => count + Number(inventory[field] === itemId),
    0,
  );
  return inventoryItemQuantity(inventory, itemId) > equippedQuantity;
}

/** Moves an owned item between bag and compatible equipment slots. */
export function moveInventoryItem(inventory: InventoryState, itemId: string, destination: EquipmentSlot | "BAG") {
  const item = itemDefinition(itemId);
  if (!item || isCosmeticOnlyItem(itemId) || !inventory.itemIds.includes(itemId)) return false;
  const clearItem = () => {
    let changed = false;
    for (const slot of EQUIPPED_ITEM_FIELDS) {
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
  if (!hasFreeOrMovableCopy(inventory, itemId, EQUIPPED_ITEM_FIELDS)) return false;
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
  if (!item || !(inventory.itemIds.includes(itemId) || inventory.cosmeticItemIds?.includes(itemId))) return false;
  const clearItem = () => {
    let changed = false;
    for (const slot of COSMETIC_ITEM_FIELDS) {
      if (inventory[slot] !== itemId) continue;
      inventory[slot] = "";
      changed = true;
    }
    return changed;
  };
  if (destination === "BAG") return clearItem();
  if (!isCosmeticOnlyItem(itemId) && !inventory.cosmeticItemIds?.includes(itemId)) return false;
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

export type CosmeticVisibilityChange = "HIDDEN" | "EQUIPMENT";

/** Tapping an inherited Cosmetics slot switches between stat-equipment art and no art. */
export function toggleCosmeticEquipmentVisibility(
  inventory: InventoryState,
  destination: EquipmentSlot,
): CosmeticVisibilityChange | null {
  const cosmeticTarget = destination === "HEAD" ? "cosmeticHead"
    : destination === "CHEST" ? "cosmeticChest"
      : destination === "FEET" ? "cosmeticFeet"
        : destination === "RIGHT_HAND" ? "cosmeticRightHand"
          : "cosmeticLeftHand";
  const equippedTarget = destination === "HEAD" ? "equippedHead"
    : destination === "CHEST" ? "equippedChest"
      : destination === "FEET" ? "equippedFeet"
        : destination === "RIGHT_HAND" ? "equippedRightHand"
          : "equippedLeftHand";
  const currentCosmetic = inventory[cosmeticTarget];
  if (isHiddenCosmeticItem(currentCosmetic)) {
    inventory[cosmeticTarget] = "";
    return "EQUIPMENT";
  }
  if (currentCosmetic || !inventory[equippedTarget]) return null;
  if (destination === "RIGHT_HAND" || destination === "LEFT_HAND") {
    inventory.cosmeticRightHand = "";
    inventory.cosmeticLeftHand = "";
  }
  inventory[cosmeticTarget] = HIDDEN_COSMETIC_ITEM_ID;
  return "HIDDEN";
}

/** Resolves final outfit art while keeping stat equipment untouched. */
export function equipmentAppearance(inventory: Pick<InventoryState,
  "equippedHead" | "equippedChest" | "equippedFeet" | "equippedRightHand" | "equippedLeftHand"
> & Partial<Pick<InventoryState,
  "cosmeticHead" | "cosmeticChest" | "cosmeticFeet" | "cosmeticRightHand" | "cosmeticLeftHand"
>>): EquipmentAppearance {
  return resolveEquipmentAppearance(inventory);
}

export function normaliseInventory(itemIds: unknown, equippedFeet: unknown, equippedHead: unknown, equippedChest: unknown, ownsBoots: boolean, ownsDeveloperCosmetics = false, equippedRightHand: unknown = "", equippedLeftHand: unknown = "", cosmeticHead: unknown = "", cosmeticChest: unknown = "", cosmeticFeet: unknown = "", cosmeticRightHand: unknown = "", cosmeticLeftHand: unknown = "", cosmeticItemsJson: unknown = "[]"): InventoryState {
  const requested = Array.isArray(itemIds) ? itemIds : [];
  // Trailblazer Boots are gone. `ownsBoots` is kept in the signature because
  // saved rows still carry the flag; it no longer grants anything.
  void ownsBoots;
  const handStateWasSaved = requested.some((itemId) => itemDefinition(itemId)?.slot === "HAND");
  const developerItems = ownsDeveloperCosmetics
    ? DEVELOPER_ITEM_IDS
    : DEVELOPER_ITEM_IDS.filter(id => requested.includes(id));
  const requestedDrops = new Set(requested.map(canonicalItemId));
  const dropItems = EQUIPMENT_DROP_ITEM_IDS.filter(itemId => requestedDrops.has(itemId));
  const items: string[] = [...STARTER_ITEM_IDS, ...developerItems, ...dropItems];
  const headItems = items.filter((itemId) => itemDefinition(itemId)?.slot === "HEAD");
  const chestItems = items.filter((itemId) => itemDefinition(itemId)?.slot === "CHEST");
  const handItems = items.filter((itemId) => itemDefinition(itemId)?.slot === "HAND");
  const savedLeftItem = canonicalItemId(equippedLeftHand);
  const savedRightItem = canonicalItemId(equippedRightHand);
  const savedLeftHand = savedLeftItem && handItems.includes(savedLeftItem) ? savedLeftItem : "";
  const savedRightHand = savedRightItem && handItems.includes(savedRightItem) ? savedRightItem : "";
  // Bare-headed when the saved hat is not owned. It used to fall back to the
  // paper hat, which everyone was given; it is a rare forest drop now, so that
  // fallback would put one on a player who has never found it.
  const savedHead = typeof equippedHead === "string" && headItems.includes(equippedHead) ? equippedHead : "";
  const savedChest = typeof equippedChest === "string" && chestItems.includes(equippedChest) ? equippedChest : "";
  const savedFeet = typeof equippedFeet === "string" && items.includes(equippedFeet) && itemDefinition(equippedFeet)?.slot === "FEET" ? equippedFeet : "";
  const resolvedRightHand = savedRightHand || (!handStateWasSaved && !savedLeftHand ? STARTER_STONE : "");
  const resolvedLeftHand = savedRightHand ? "" : savedLeftHand;
  const cosmeticItemIds = cosmeticUnlocks(cosmeticItemsJson);
  const ownedItemIds = new Set([...items, ...cosmeticItemIds]);
  const cosmeticItem = (requestedItem: unknown, slot: EquipmentSlot) => {
    if (isHiddenCosmeticItem(requestedItem)) return HIDDEN_COSMETIC_ITEM_ID;
    const itemId = canonicalItemId(requestedItem);
    return itemId && ownedItemIds.has(itemId) && itemFitsEquipmentSlot(itemId, slot) ? itemId : "";
  };
  const savedCosmeticHead = cosmeticItem(cosmeticHead, "HEAD");
  const savedCosmeticChest = cosmeticItem(cosmeticChest, "CHEST");
  const savedCosmeticFeet = cosmeticItem(cosmeticFeet, "FEET");
  const savedCosmeticRightHand = cosmeticItem(cosmeticRightHand, "RIGHT_HAND");
  const savedCosmeticLeftHand = savedCosmeticRightHand ? "" : cosmeticItem(cosmeticLeftHand, "LEFT_HAND");
  return separateCosmeticLoadout({
    itemIds: items,
    cosmeticItemIds,
    equippedHead: savedHead,
    equippedChest: savedChest,
    equippedFeet: savedFeet,
    equippedRightHand: resolvedRightHand,
    equippedLeftHand: resolvedLeftHand,
    cosmeticHead: savedCosmeticHead,
    cosmeticChest: savedCosmeticChest,
    cosmeticFeet: savedCosmeticFeet,
    cosmeticRightHand: savedCosmeticRightHand,
    cosmeticLeftHand: savedCosmeticLeftHand,
  });
}

export function inventoryFromSave(inventoryJson: unknown, equippedFeet: unknown, equippedHead: unknown, equippedChest: unknown, ownsBoots: boolean, ownsDeveloperCosmetics = false, equippedRightHand: unknown = "", equippedLeftHand: unknown = "", cosmeticHead: unknown = "", cosmeticChest: unknown = "", cosmeticFeet: unknown = "", cosmeticRightHand: unknown = "", cosmeticLeftHand: unknown = "", cosmeticItemsJson: unknown = "[]"): InventoryState {
  let itemIds: unknown = [];
  if (typeof inventoryJson === "string") {
    try { itemIds = JSON.parse(inventoryJson); } catch {}
  }
  return normaliseInventory(itemIds, equippedFeet, equippedHead, equippedChest, ownsBoots, ownsDeveloperCosmetics, equippedRightHand, equippedLeftHand, cosmeticHead, cosmeticChest, cosmeticFeet, cosmeticRightHand, cosmeticLeftHand, cosmeticItemsJson);
}

export function serialiseInventory(inventory: InventoryState) {
  return JSON.stringify(inventory.itemIds);
}
