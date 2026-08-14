import { BASIC_PAPER_HAT, TRAILBLAZER_BOOTS } from "../../shared/rules";

export { BASIC_PAPER_HAT, TRAILBLAZER_BOOTS };

export type InventoryState = {
  itemIds: string[];
  equippedHead: string;
  equippedFeet: string;
};

export const ITEM_DEFINITIONS = {
  [BASIC_PAPER_HAT]: {
    id: BASIC_PAPER_HAT,
    name: "BASIC PAPER HAT",
    slot: "HEAD",
    description: "A folded brown paper hat. No stats, just style.",
    stats: ["NO STATS"],
  },
  [TRAILBLAZER_BOOTS]: {
    id: TRAILBLAZER_BOOTS,
    name: "TRAILBLAZER BOOTS",
    slot: "FEET",
    description: "Leather boots built for crossing Wildwood faster.",
    stats: ["MOVE SPEED +25"],
  },
} as const;

export function itemDefinition(itemId: string) {
  return ITEM_DEFINITIONS[itemId as keyof typeof ITEM_DEFINITIONS];
}

export function normaliseInventory(itemIds: unknown, equippedFeet: unknown, equippedHead: unknown, ownsBoots: boolean): InventoryState {
  const requested = Array.isArray(itemIds) ? itemIds : [];
  const hasBoots = ownsBoots || requested.includes(TRAILBLAZER_BOOTS);
  const items = [BASIC_PAPER_HAT, ...(hasBoots ? [TRAILBLAZER_BOOTS] : [])];
  return {
    itemIds: items,
    equippedHead: typeof equippedHead === "string" ? (equippedHead === BASIC_PAPER_HAT ? BASIC_PAPER_HAT : "") : BASIC_PAPER_HAT,
    equippedFeet: hasBoots && equippedFeet === TRAILBLAZER_BOOTS
      ? TRAILBLAZER_BOOTS
      : "",
  };
}

export function inventoryFromSave(inventoryJson: unknown, equippedFeet: unknown, equippedHead: unknown, ownsBoots: boolean): InventoryState {
  let itemIds: unknown = [];
  if (typeof inventoryJson === "string") {
    try { itemIds = JSON.parse(inventoryJson); } catch {}
  }
  return normaliseInventory(itemIds, equippedFeet, equippedHead, ownsBoots);
}

export function serialiseInventory(inventory: InventoryState) {
  return JSON.stringify(inventory.itemIds);
}
