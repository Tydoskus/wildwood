import {
  BASIC_PAPER_HAT,
  canonicalItemId,
  DEVELOPER_ITEM_IDS,
  ITEM_DEFINITIONS,
  itemDefinition,
  itemFitsEquipmentSlot,
  LEGENDARY_WHITE_GOLD_ARMOR,
  LEGACY_STARTER_STONE,
  STARTER_BOW,
  STARTER_ITEM_IDS,
  SUPERIOR_GOLDEN_HELMET,
  TRAILBLAZER_BOOTS,
  type EquipmentSlot,
} from "../../shared/items";

export {
  BASIC_PAPER_HAT,
  ITEM_DEFINITIONS,
  itemDefinition,
  LEGENDARY_WHITE_GOLD_ARMOR,
  LEGACY_STARTER_STONE,
  STARTER_BOW,
  SUPERIOR_GOLDEN_HELMET,
  TRAILBLAZER_BOOTS,
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
  inventory[target] = itemId;
  return true;
}

export function normaliseInventory(itemIds: unknown, equippedFeet: unknown, equippedHead: unknown, equippedChest: unknown, ownsBoots: boolean, ownsDeveloperCosmetics = false, equippedRightHand: unknown = "", equippedLeftHand: unknown = ""): InventoryState {
  const requested = Array.isArray(itemIds) ? itemIds : [];
  const hasBoots = ownsBoots || requested.includes(TRAILBLAZER_BOOTS);
  const hasBetaTesterGoldenHelmet = ownsDeveloperCosmetics || requested.includes(SUPERIOR_GOLDEN_HELMET);
  const starterWeaponWasSaved = requested.includes(STARTER_BOW) || requested.includes(LEGACY_STARTER_STONE);
  const developerItems = ownsDeveloperCosmetics
    ? DEVELOPER_ITEM_IDS
    : hasBetaTesterGoldenHelmet ? [SUPERIOR_GOLDEN_HELMET] : [];
  const items = [...STARTER_ITEM_IDS, ...developerItems, ...(hasBoots ? [TRAILBLAZER_BOOTS] : [])];
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
    equippedRightHand: savedRightHand || (!starterWeaponWasSaved && !savedLeftHand ? STARTER_BOW : ""),
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
