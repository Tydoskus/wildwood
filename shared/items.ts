// Browser- and server-safe equipment catalog. Add gameplay-facing item data
// here; client-only sprites and draw anchors live in item-presentation.ts.

export const BASIC_PAPER_HAT = "basic_paper_hat";
export const SUPERIOR_GOLDEN_HELMET = "superior_golden_helmet";
export const LEGENDARY_WHITE_GOLD_ARMOR = "legendary_white_gold_armor";
export const TRAILBLAZER_BOOTS = "trailblazer_boots";
export const STARTER_STONE = "starter_stone";
export const STARTER_BOW = "starter_bow";
export const FROST_BOW = "frost_bow";
export const FROST_ARMOR = "frost_armor";
export const WOODEN_ARMOR = "wooden_armor";
export const FOREST_ITEM_DROP_DENOMINATOR = 25;
export const SNOW_BOSS_ITEM_DROP_DENOMINATOR = 25;
export const SNOW_BOSS_ARMOR_DROP_DENOMINATOR = 5;
export const MAX_FOREST_ITEM_COUNT = 999;

export type ItemSlot = "HEAD" | "CHEST" | "FEET" | "HAND";
export type EquipmentSlot = "HEAD" | "CHEST" | "FEET" | "RIGHT_HAND" | "LEFT_HAND";
export type ItemAcquisition = "STARTER" | "PROGRESSION" | "DEVELOPER" | "FOREST_DROP" | "SNOW_BOSS_DROP";
export type ProjectileKind = "ROCK" | "ARROW";

export type ItemDefinition = {
  id: string;
  name: string;
  slot: ItemSlot;
  acquisition: ItemAcquisition;
  description: string;
  stats: readonly string[];
  stackable?: boolean;
  modifiers?: {
    maxHealthMultiplierBonus?: number;
    regenerationMultiplierBonus?: number;
  };
  weapon?: {
    mode: "RANGED";
    projectile: ProjectileKind;
    damageMultiplierBonus?: number;
    attackSpeedMultiplierBonus?: number;
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
    acquisition: "FOREST_DROP",
    description: "A dependable wooden bow for hunting Wildwood monsters.",
    stats: ["DAMAGE MULTIPLIER +0.05×", "ATTACK SPEED MULTIPLIER +0.05×"],
    stackable: true,
    weapon: {
      mode: "RANGED",
      projectile: "ARROW",
      damageMultiplierBonus: .05,
      attackSpeedMultiplierBonus: .05,
    },
  },
  [FROST_BOW]: {
    id: FROST_BOW,
    name: "FROST BOW",
    slot: "HAND",
    acquisition: "SNOW_BOSS_DROP",
    description: "A frozen bow claimed from Frostclaw, built for swift and devastating shots.",
    stats: ["DAMAGE MULTIPLIER 3.00×", "ATTACK SPEED MULTIPLIER 1.20×"],
    stackable: true,
    weapon: {
      mode: "RANGED",
      projectile: "ARROW",
      damageMultiplierBonus: 2,
      attackSpeedMultiplierBonus: .2,
    },
  },
  [FROST_ARMOR]: {
    id: FROST_ARMOR,
    name: "FROST ARMOR",
    slot: "CHEST",
    acquisition: "SNOW_BOSS_DROP",
    description: "Frozen blue armor claimed from Frostclaw that fortifies health and regeneration.",
    stats: ["MAX HEALTH MULTIPLIER 2.00×", "REGEN MULTIPLIER 2.00×"],
    stackable: true,
    modifiers: {
      maxHealthMultiplierBonus: 1,
      regenerationMultiplierBonus: 1,
    },
  },
  [WOODEN_ARMOR]: {
    id: WOODEN_ARMOR,
    name: "WOODEN ARMOR",
    slot: "CHEST",
    acquisition: "FOREST_DROP",
    description: "Wooden forest plate that reinforces its wearer with extra health.",
    stats: ["MAX HEALTH MULTIPLIER +0.05×"],
    stackable: true,
    modifiers: { maxHealthMultiplierBonus: .05 },
  },
} as const satisfies Record<string, ItemDefinition>;

export type ItemId = keyof typeof ITEM_DEFINITIONS;

export const STARTER_ITEM_IDS = Object.values(ITEM_DEFINITIONS)
  .filter((item) => item.acquisition === "STARTER")
  .map((item) => item.id) as ItemId[];
export const DEVELOPER_ITEM_IDS = Object.values(ITEM_DEFINITIONS)
  .filter((item) => item.acquisition === "DEVELOPER")
  .map((item) => item.id) as ItemId[];
export const FOREST_DROP_ITEM_IDS = Object.values(ITEM_DEFINITIONS)
  .filter((item) => item.acquisition === "FOREST_DROP")
  .map((item) => item.id) as ItemId[];
export const SNOW_BOSS_DROP_ITEM_IDS = Object.values(ITEM_DEFINITIONS)
  .filter((item) => item.acquisition === "SNOW_BOSS_DROP")
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

/** Counts one canonical stackable item in a saved inventory payload. */
export function inventoryJsonItemQuantity(inventoryJson: unknown, itemId: unknown) {
  const canonical = canonicalItemId(itemId);
  if (!canonical || typeof inventoryJson !== "string") return 0;
  try {
    const itemIds = JSON.parse(inventoryJson);
    if (!Array.isArray(itemIds)) return 0;
    return Math.min(
      MAX_FOREST_ITEM_COUNT,
      itemIds.reduce((count, savedItemId) => count + Number(canonicalItemId(savedItemId) === canonical), 0),
    );
  } catch {
    return 0;
  }
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

/** Equipment bonuses add to research multipliers instead of multiplying them. */
export function weaponDamageMultiplier(itemId: unknown, researchMultiplier = 1) {
  return researchMultiplier + (itemDefinition(canonicalItemId(itemId))?.weapon?.damageMultiplierBonus ?? 0);
}

export function weaponAttackSpeedMultiplier(itemId: unknown, researchMultiplier = 1) {
  return researchMultiplier + (itemDefinition(canonicalItemId(itemId))?.weapon?.attackSpeedMultiplierBonus ?? 0);
}

export function weaponAttackInterval(itemId: unknown, baseInterval: number, researchMultiplier = 1) {
  return baseInterval / weaponAttackSpeedMultiplier(itemId, researchMultiplier);
}

export function itemMaxHealthMultiplier(itemId: unknown, researchMultiplier = 1) {
  return researchMultiplier + (itemDefinition(canonicalItemId(itemId))?.modifiers?.maxHealthMultiplierBonus ?? 0);
}

/** Equipment regeneration bonuses add to research multipliers. */
export function itemRegenerationMultiplier(itemId: unknown, researchMultiplier = 1) {
  return researchMultiplier + (itemDefinition(canonicalItemId(itemId))?.modifiers?.regenerationMultiplierBonus ?? 0);
}
