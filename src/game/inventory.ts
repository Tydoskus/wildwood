import { BASIC_PAPER_HAT, LEGENDARY_WHITE_GOLD_ARMOR, SUPERIOR_GOLDEN_HELMET, TRAILBLAZER_BOOTS } from "../../shared/rules";

export { BASIC_PAPER_HAT, LEGENDARY_WHITE_GOLD_ARMOR, SUPERIOR_GOLDEN_HELMET, TRAILBLAZER_BOOTS };

export type InventoryState = {
  itemIds: string[];
  equippedHead: string;
  equippedChest: string;
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
  [SUPERIOR_GOLDEN_HELMET]: {
    id: SUPERIOR_GOLDEN_HELMET,
    name: "BETA TESTER GOLDEN HELMET",
    slot: "HEAD",
    description: "A gleaming winged helmet for Wildwood beta testers.",
    stats: ["COSMETIC · NO STATS"],
  },
  [LEGENDARY_WHITE_GOLD_ARMOR]: {
    id: LEGENDARY_WHITE_GOLD_ARMOR,
    name: "LEGENDARY WHITE GOLD ARMOR",
    slot: "CHEST",
    description: "White gold plate with a legendary gleam. Cosmetic only.",
    stats: ["COSMETIC · NO STATS"],
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

export function normaliseInventory(itemIds: unknown, equippedFeet: unknown, equippedHead: unknown, equippedChest: unknown, ownsBoots: boolean, ownsDeveloperCosmetics = false): InventoryState {
  const requested = Array.isArray(itemIds) ? itemIds : [];
  const hasBoots = ownsBoots || requested.includes(TRAILBLAZER_BOOTS);
  const hasBetaTesterGoldenHelmet = ownsDeveloperCosmetics || requested.includes(SUPERIOR_GOLDEN_HELMET);
  const headItems = [BASIC_PAPER_HAT, ...(hasBetaTesterGoldenHelmet ? [SUPERIOR_GOLDEN_HELMET] : [])];
  const chestItems = ownsDeveloperCosmetics ? [LEGENDARY_WHITE_GOLD_ARMOR] : [];
  const items = [...headItems, ...chestItems, ...(hasBoots ? [TRAILBLAZER_BOOTS] : [])];
  return {
    itemIds: items,
    equippedHead: typeof equippedHead === "string" && headItems.includes(equippedHead) ? equippedHead : BASIC_PAPER_HAT,
    equippedChest: typeof equippedChest === "string" && chestItems.includes(equippedChest) ? equippedChest : "",
    equippedFeet: hasBoots && equippedFeet === TRAILBLAZER_BOOTS
      ? TRAILBLAZER_BOOTS
      : "",
  };
}

export function inventoryFromSave(inventoryJson: unknown, equippedFeet: unknown, equippedHead: unknown, equippedChest: unknown, ownsBoots: boolean, ownsDeveloperCosmetics = false): InventoryState {
  let itemIds: unknown = [];
  if (typeof inventoryJson === "string") {
    try { itemIds = JSON.parse(inventoryJson); } catch {}
  }
  return normaliseInventory(itemIds, equippedFeet, equippedHead, equippedChest, ownsBoots, ownsDeveloperCosmetics);
}

export function serialiseInventory(inventory: InventoryState) {
  return JSON.stringify(inventory.itemIds);
}
