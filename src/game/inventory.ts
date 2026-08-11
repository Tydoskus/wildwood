export const TRAILBLAZER_BOOTS = "trailblazer_boots";

export type InventoryState = {
  itemIds: string[];
  equippedFeet: string;
};

export const ITEM_DEFINITIONS = {
  [TRAILBLAZER_BOOTS]: {
    id: TRAILBLAZER_BOOTS,
    name: "TRAILBLAZER BOOTS",
    slot: "FEET",
    description: "Leather boots built for crossing Wildwood faster.",
    stats: ["MOVE SPEED +25"],
  },
} as const;

export function normaliseInventory(itemIds: unknown, equippedFeet: unknown, ownsBoots: boolean): InventoryState {
  const requested = Array.isArray(itemIds) ? itemIds : [];
  const hasBoots = ownsBoots || requested.includes(TRAILBLAZER_BOOTS);
  const items = hasBoots ? [TRAILBLAZER_BOOTS] : [];
  return {
    itemIds: items,
    equippedFeet: hasBoots && equippedFeet === TRAILBLAZER_BOOTS
      ? TRAILBLAZER_BOOTS
      : "",
  };
}

export function inventoryFromSave(inventoryJson: unknown, equippedFeet: unknown, ownsBoots: boolean): InventoryState {
  let itemIds: unknown = [];
  if (typeof inventoryJson === "string") {
    try { itemIds = JSON.parse(inventoryJson); } catch {}
  }
  return normaliseInventory(itemIds, equippedFeet, ownsBoots);
}

export function serialiseInventory(inventory: InventoryState) {
  return JSON.stringify(inventory.itemIds);
}
