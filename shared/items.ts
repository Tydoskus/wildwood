// Browser- and server-safe equipment catalog. Add gameplay-facing item data
// here; client-only sprites and draw anchors live in item-presentation.ts.

export const BASIC_PAPER_HAT = "basic_paper_hat";
export const SUPERIOR_GOLDEN_HELMET = "superior_golden_helmet";
export const LEGENDARY_WHITE_GOLD_ARMOR = "legendary_white_gold_armor";
export const TRAILBLAZER_BOOTS = "trailblazer_boots";
export const STARTER_STONE = "starter_stone";
export const STARTER_BOW = "starter_bow";

export type ItemSlot = "HEAD" | "CHEST" | "FEET" | "HAND";
export type EquipmentSlot = "HEAD" | "CHEST" | "FEET" | "RIGHT_HAND" | "LEFT_HAND";
export type ItemAcquisition = "STARTER" | "PROGRESSION" | "DEVELOPER";
export type ProjectileKind = "ROCK" | "ARROW";

export type ItemDefinition = {
  id: string;
  name: string;
  slot: ItemSlot;
  acquisition: ItemAcquisition;
  description: string;
  stats: readonly string[];
  weapon?: {
    mode: "RANGED";
    projectile: ProjectileKind;
  };
};

export const ITEM_DEFINITIONS = {
  [BASIC_PAPER_HAT]: {
    id: BASIC_PAPER_HAT,
    name: "BASIC PAPER HAT",
    slot: "HEAD",
    acquisition: "STARTER",
    description: "A folded brown paper hat. No stats, just style.",
    stats: ["NO STATS"],
  },
  [SUPERIOR_GOLDEN_HELMET]: {
    id: SUPERIOR_GOLDEN_HELMET,
    name: "BETA TESTER GOLDEN HELMET",
    slot: "HEAD",
    acquisition: "DEVELOPER",
    description: "A gleaming winged helmet for Wildwood beta testers.",
    stats: ["COSMETIC · NO STATS"],
  },
  [LEGENDARY_WHITE_GOLD_ARMOR]: {
    id: LEGENDARY_WHITE_GOLD_ARMOR,
    name: "LEGENDARY WHITE GOLD ARMOR",
    slot: "CHEST",
    acquisition: "DEVELOPER",
    description: "White gold plate with a legendary gleam. Cosmetic only.",
    stats: ["COSMETIC · NO STATS"],
  },
  [TRAILBLAZER_BOOTS]: {
    id: TRAILBLAZER_BOOTS,
    name: "TRAILBLAZER BOOTS",
    slot: "FEET",
    acquisition: "PROGRESSION",
    description: "Leather boots built for crossing Wildwood faster.",
    stats: ["MOVE SPEED +25"],
  },
  [STARTER_STONE]: {
    id: STARTER_STONE,
    name: "STARTER STONE",
    slot: "HAND",
    acquisition: "STARTER",
    description: "Your trusty first throwing stone.",
    stats: ["STARTER WEAPON · NO STATS"],
    weapon: { mode: "RANGED", projectile: "ROCK" },
  },
  [STARTER_BOW]: {
    id: STARTER_BOW,
    name: "BOW",
    slot: "HAND",
    acquisition: "DEVELOPER",
    description: "A dependable wooden bow for hunting Wildwood monsters.",
    stats: ["RANGED WEAPON · NO STATS"],
    weapon: { mode: "RANGED", projectile: "ARROW" },
  },
} as const satisfies Record<string, ItemDefinition>;

export type ItemId = keyof typeof ITEM_DEFINITIONS;

export const STARTER_ITEM_IDS = Object.values(ITEM_DEFINITIONS)
  .filter((item) => item.acquisition === "STARTER")
  .map((item) => item.id) as ItemId[];
export const DEVELOPER_ITEM_IDS = Object.values(ITEM_DEFINITIONS)
  .filter((item) => item.acquisition === "DEVELOPER")
  .map((item) => item.id) as ItemId[];

export function itemDefinition(itemId: unknown): ItemDefinition | undefined {
  return typeof itemId === "string"
    ? ITEM_DEFINITIONS[itemId as ItemId]
    : undefined;
}

export function canonicalItemId(itemId: unknown): ItemId | undefined {
  if (typeof itemId !== "string") return undefined;
  return itemDefinition(itemId)?.id as ItemId | undefined;
}

export function itemFitsEquipmentSlot(itemId: unknown, destination: EquipmentSlot) {
  const slot = itemDefinition(canonicalItemId(itemId))?.slot;
  return slot === "HAND"
    ? destination === "RIGHT_HAND" || destination === "LEFT_HAND"
    : slot === destination;
}

export function isWeaponItem(itemId: unknown) {
  return Boolean(itemDefinition(canonicalItemId(itemId))?.weapon);
}
