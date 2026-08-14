import { BASIC_PAPER_HAT, LEGENDARY_WHITE_GOLD_ARMOR, SUPERIOR_GOLDEN_HELMET, TRAILBLAZER_BOOTS } from "../../shared/rules";

export { BASIC_PAPER_HAT, LEGENDARY_WHITE_GOLD_ARMOR, SUPERIOR_GOLDEN_HELMET, TRAILBLAZER_BOOTS };

export type InventoryState = {
  itemIds: string[];
  equippedHead: string;
  equippedChest: string;
  equippedFeet: string;
  equippedRightHand: string;
  equippedLeftHand: string;
};

export type EquipmentSlot = "HEAD" | "CHEST" | "FEET" | "RIGHT_HAND" | "LEFT_HAND";
export type InventoryItemDefinition = {
  id: string;
  name: string;
  slot: "HEAD" | "CHEST" | "FEET" | "HAND";
  description: string;
  stats: readonly string[];
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

export function itemDefinition(itemId: string): InventoryItemDefinition | undefined {
  return ITEM_DEFINITIONS[itemId as keyof typeof ITEM_DEFINITIONS];
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
  const allowed = item.slot === "HAND"
    ? destination === "RIGHT_HAND" || destination === "LEFT_HAND"
    : item.slot === destination;
  if (!allowed || inventory[target] === itemId) return false;
  clearItem();
  inventory[target] = itemId;
  return true;
}

export function normaliseInventory(itemIds: unknown, equippedFeet: unknown, equippedHead: unknown, equippedChest: unknown, ownsBoots: boolean, ownsDeveloperCosmetics = false, equippedRightHand: unknown = "", equippedLeftHand: unknown = ""): InventoryState {
  const requested = Array.isArray(itemIds) ? itemIds : [];
  const hasBoots = ownsBoots || requested.includes(TRAILBLAZER_BOOTS);
  const hasBetaTesterGoldenHelmet = ownsDeveloperCosmetics || requested.includes(SUPERIOR_GOLDEN_HELMET);
  const headItems = [BASIC_PAPER_HAT, ...(hasBetaTesterGoldenHelmet ? [SUPERIOR_GOLDEN_HELMET] : [])];
  const chestItems = ownsDeveloperCosmetics ? [LEGENDARY_WHITE_GOLD_ARMOR] : [];
  const items = [...headItems, ...chestItems, ...(hasBoots ? [TRAILBLAZER_BOOTS] : [])];
  const handItems = items.filter((itemId) => itemDefinition(itemId)?.slot === "HAND");
  return {
    itemIds: items,
    equippedHead: typeof equippedHead === "string" && headItems.includes(equippedHead) ? equippedHead : BASIC_PAPER_HAT,
    equippedChest: typeof equippedChest === "string" && chestItems.includes(equippedChest) ? equippedChest : "",
    equippedFeet: hasBoots && equippedFeet === TRAILBLAZER_BOOTS
      ? TRAILBLAZER_BOOTS
      : "",
    equippedRightHand: typeof equippedRightHand === "string" && handItems.includes(equippedRightHand) ? equippedRightHand : "",
    equippedLeftHand: typeof equippedLeftHand === "string" && handItems.includes(equippedLeftHand) ? equippedLeftHand : "",
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
