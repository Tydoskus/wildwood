// Browser- and server-safe equipment catalog. Add gameplay-facing item data
// here; client-only sprites and draw anchors live in item-presentation.ts.

export const BASIC_PAPER_HAT = "basic_paper_hat";
export const SUPERIOR_GOLDEN_HELMET = "superior_golden_helmet";
export const WOOD_FULL_HELM = "wood_full_helm";
export const FIRE_METAL_HELMET = "fire_metal_helmet";
export const DARK_METAL_HELMET = "dark_metal_helmet";
export const LEGENDARY_WHITE_GOLD_ARMOR = "legendary_white_gold_armor";
export const TRAILBLAZER_BOOTS = "trailblazer_boots";
export const STARTER_STONE = "starter_stone";
export const STARTER_BOW = "starter_bow";
export const IRON_BOW = "iron_bow";
export const FROST_BOW = "frost_bow";
export const LAVA_BOW = "lava_bow";
export const FIRE_METAL_BOW = "fire_metal_bow";
export const FROST_ARMOR = "frost_armor";
export const MAGMA_ARMOR = "magma_armor";
export const WOODEN_ARMOR = "wooden_armor";
export const FOREST_ITEM_DROP_DENOMINATOR = 25;
export const DESERT_ITEM_DROP_DENOMINATOR = 50;
export const LAVA_ITEM_DROP_DENOMINATOR = 30;
export const LAVA_HELMET_ITEM_DROP_DENOMINATOR = 50;
export const LAVA_BOSS_ITEM_DROP_DENOMINATOR = 25;
export const INFERNAL_ITEM_DROP_DENOMINATOR = 50;
export const NIGHT_FOREST_HELMET_ITEM_DROP_DENOMINATOR = 65;
export const SNOW_BOSS_ITEM_DROP_DENOMINATOR = 25;
export const SNOW_BOSS_ARMOR_DROP_DENOMINATOR = 5;
export const MAX_OWNED_ITEM_COUNT = 1;
// Kept as a compatibility export for older client/server call sites. Wildwood
// equipment is unique now, so every durable quantity is clamped to one.
export const MAX_FOREST_ITEM_COUNT = MAX_OWNED_ITEM_COUNT;
export const MAX_ITEM_UPGRADE_LEVEL = 10;
// Each level adds this share of the stat's level-zero full multiplier.
export const ITEM_UPGRADE_STAT_BONUS = .2;
export const ITEM_UPGRADE_BASE_DURATION_MS = 3 * 60 * 1_000;
export const ITEM_UPGRADE_DURATION_GROWTH = 1.4;

export type ItemSlot = "HEAD" | "CHEST" | "FEET" | "HAND";
export type EquipmentSlot = "HEAD" | "CHEST" | "FEET" | "RIGHT_HAND" | "LEFT_HAND";
export type ItemAcquisition = "STARTER" | "PROGRESSION" | "DEVELOPER" | "FOREST_DROP" | "DESERT_DROP" | "SNOW_BOSS_DROP" | "LAVA_DROP" | "LAVA_BOSS_DROP" | "INFERNAL_DROP";
export type ProjectileKind = "ROCK" | "ARROW";

export type ItemDefinition = {
  id: string;
  name: string;
  slot: ItemSlot;
  acquisition: ItemAcquisition;
  description: string;
  stats: readonly string[];
  modifiers?: {
    damageMultiplierBonus?: number;
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
  [WOOD_FULL_HELM]: {
    id: WOOD_FULL_HELM,
    name: "WOOD FULL HELM",
    slot: "HEAD",
    acquisition: "DESERT_DROP",
    description: "A sturdy wooden full helm carried by Beginner Desert monsters that increases maximum health.",
    stats: ["MAX HEALTH MULTIPLIER 1.25×"],
    modifiers: { maxHealthMultiplierBonus: .25 },
  },
  [FIRE_METAL_HELMET]: {
    id: FIRE_METAL_HELMET,
    name: "FIRE METAL HELMET",
    slot: "HEAD",
    acquisition: "LAVA_DROP",
    description: "A red-hot metal helm carried by Advanced Lava Lake monsters that amplifies damage, health, and regeneration.",
    stats: ["DAMAGE MULTIPLIER 1.25×", "MAX HEALTH MULTIPLIER 1.25×", "REGEN MULTIPLIER 1.50×"],
    modifiers: {
      damageMultiplierBonus: .25,
      maxHealthMultiplierBonus: .25,
      regenerationMultiplierBonus: .5,
    },
  },
  [DARK_METAL_HELMET]: {
    id: DARK_METAL_HELMET,
    name: "DARK METAL HELMET",
    slot: "HEAD",
    acquisition: "INFERNAL_DROP",
    description: "A horned dark-metal helm carried by Night Forest monsters that greatly amplifies damage, health, and regeneration.",
    stats: ["DAMAGE MULTIPLIER 2.50×", "MAX HEALTH MULTIPLIER 2.50×", "REGEN MULTIPLIER 3.00×"],
    modifiers: {
      damageMultiplierBonus: 1.5,
      maxHealthMultiplierBonus: 1.5,
      regenerationMultiplierBonus: 2,
    },
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
    weapon: {
      mode: "RANGED",
      projectile: "ARROW",
      damageMultiplierBonus: .05,
      attackSpeedMultiplierBonus: .05,
    },
  },
  [IRON_BOW]: {
    id: IRON_BOW,
    name: "IRON BOW",
    slot: "HAND",
    acquisition: "DESERT_DROP",
    description: "A reinforced iron bow carried by Beginner Desert monsters, balancing stronger hits with faster attacks.",
    stats: ["DAMAGE MULTIPLIER 1.50×", "ATTACK SPEED MULTIPLIER 1.10×"],
    weapon: {
      mode: "RANGED",
      projectile: "ARROW",
      damageMultiplierBonus: .5,
      attackSpeedMultiplierBonus: .1,
    },
  },
  [FROST_BOW]: {
    id: FROST_BOW,
    name: "FROST BOW",
    slot: "HAND",
    acquisition: "SNOW_BOSS_DROP",
    description: "A frozen bow claimed from Frostclaw, built for swift and devastating shots.",
    stats: ["DAMAGE MULTIPLIER 3.00×", "ATTACK SPEED MULTIPLIER 1.20×"],
    weapon: {
      mode: "RANGED",
      projectile: "ARROW",
      damageMultiplierBonus: 2,
      attackSpeedMultiplierBonus: .2,
    },
  },
  [LAVA_BOW]: {
    id: LAVA_BOW,
    name: "LAVA BOW",
    slot: "HAND",
    acquisition: "LAVA_BOSS_DROP",
    description: "A blazing red bow claimed from the Magmalisk, built for overwhelming damage and rapid fire.",
    stats: ["DAMAGE MULTIPLIER 5.00×", "ATTACK SPEED MULTIPLIER 1.30×"],
    weapon: {
      mode: "RANGED",
      projectile: "ARROW",
      damageMultiplierBonus: 4,
      attackSpeedMultiplierBonus: .3,
    },
  },
  [FIRE_METAL_BOW]: {
    id: FIRE_METAL_BOW,
    name: "FIRE METAL BOW",
    slot: "HAND",
    acquisition: "INFERNAL_DROP",
    description: "A forged bow carried by Night Forest monsters, built for extreme damage and rapid fire.",
    stats: ["DAMAGE MULTIPLIER 6.00×", "ATTACK SPEED MULTIPLIER 1.30×"],
    weapon: {
      mode: "RANGED",
      projectile: "ARROW",
      damageMultiplierBonus: 5,
      attackSpeedMultiplierBonus: .3,
    },
  },
  [FROST_ARMOR]: {
    id: FROST_ARMOR,
    name: "FROST ARMOR",
    slot: "CHEST",
    acquisition: "SNOW_BOSS_DROP",
    description: "Frozen blue armor claimed from Frostclaw that fortifies health and regeneration.",
    stats: ["MAX HEALTH MULTIPLIER 2.00×", "REGEN MULTIPLIER 2.00×"],
    modifiers: {
      maxHealthMultiplierBonus: 1,
      regenerationMultiplierBonus: 1,
    },
  },
  [MAGMA_ARMOR]: {
    id: MAGMA_ARMOR,
    name: "MAGMA ARMOR",
    slot: "CHEST",
    acquisition: "LAVA_DROP",
    description: "Molten orange armor carried by Lava Wastes monsters that amplifies damage, health, and regeneration.",
    stats: ["DAMAGE MULTIPLIER 2.00×", "MAX HEALTH MULTIPLIER 2.25×", "REGEN MULTIPLIER 2.25×"],
    modifiers: {
      damageMultiplierBonus: 1,
      maxHealthMultiplierBonus: 1.25,
      regenerationMultiplierBonus: 1.25,
    },
  },
  [WOODEN_ARMOR]: {
    id: WOODEN_ARMOR,
    name: "WOODEN ARMOR",
    slot: "CHEST",
    acquisition: "FOREST_DROP",
    description: "Wooden forest plate that reinforces its wearer with extra health.",
    stats: ["MAX HEALTH MULTIPLIER +0.05×"],
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
export const DESERT_DROP_ITEM_IDS = Object.values(ITEM_DEFINITIONS)
  .filter((item) => item.acquisition === "DESERT_DROP")
  .map((item) => item.id) as ItemId[];
export const SNOW_BOSS_DROP_ITEM_IDS = Object.values(ITEM_DEFINITIONS)
  .filter((item) => item.acquisition === "SNOW_BOSS_DROP")
  .map((item) => item.id) as ItemId[];
export const LAVA_DROP_ITEM_IDS = Object.values(ITEM_DEFINITIONS)
  .filter((item) => item.acquisition === "LAVA_DROP")
  .map((item) => item.id) as ItemId[];
export const LAVA_BOSS_DROP_ITEM_IDS = Object.values(ITEM_DEFINITIONS)
  .filter((item) => item.acquisition === "LAVA_BOSS_DROP")
  .map((item) => item.id) as ItemId[];
export const INFERNAL_DROP_ITEM_IDS = Object.values(ITEM_DEFINITIONS)
  .filter((item) => item.acquisition === "INFERNAL_DROP")
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

/** Counts one canonical unique item in a saved inventory payload. */
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

export function normalizeItemUpgradeLevel(level: unknown) {
  return Number.isFinite(level)
    ? Math.max(0, Math.min(MAX_ITEM_UPGRADE_LEVEL, Math.floor(Number(level))))
    : 0;
}

export function itemUpgradeDurationMs(currentLevel: unknown) {
  const level = normalizeItemUpgradeLevel(currentLevel);
  return Math.round(ITEM_UPGRADE_BASE_DURATION_MS * ITEM_UPGRADE_DURATION_GROWTH ** level);
}

export function isUpgradeableItem(itemId: unknown) {
  const item = itemDefinition(canonicalItemId(itemId));
  if (!item || (item.slot !== "HAND" && item.slot !== "HEAD" && item.slot !== "CHEST")) return false;
  return item.weapon?.damageMultiplierBonus !== undefined ||
    item.weapon?.attackSpeedMultiplierBonus !== undefined ||
    item.modifiers?.damageMultiplierBonus !== undefined ||
    item.modifiers?.maxHealthMultiplierBonus !== undefined ||
    item.modifiers?.regenerationMultiplierBonus !== undefined;
}

function upgradedStatMultiplier(baseBonus: number, level: unknown) {
  // Upgrades improve only the item's additive bonus. The universal baseline
  // 1× is never itself amplified by item levels.
  return 1 + baseBonus * (1 + normalizeItemUpgradeLevel(level) * ITEM_UPGRADE_STAT_BONUS);
}

function upgradeBonus(itemId: unknown, level: unknown, baseBonus: number | undefined) {
  return baseBonus !== undefined && isUpgradeableItem(itemId)
    ? baseBonus * normalizeItemUpgradeLevel(level) * ITEM_UPGRADE_STAT_BONUS
    : 0;
}

export function itemDisplayName(itemId: unknown, upgradeLevel: unknown = 0) {
  const item = itemDefinition(canonicalItemId(itemId));
  if (!item) return "ITEM";
  const level = normalizeItemUpgradeLevel(upgradeLevel);
  return level > 0 ? `${item.name} +${level}` : item.name;
}

export function itemStats(itemId: unknown, upgradeLevel: unknown = 0): readonly string[] {
  const item = itemDefinition(canonicalItemId(itemId));
  if (!item || !isUpgradeableItem(item.id)) return item?.stats ?? [];
  const level = normalizeItemUpgradeLevel(upgradeLevel);
  const stats: string[] = [];
  if (item.weapon?.damageMultiplierBonus !== undefined) {
    stats.push(`DAMAGE MULTIPLIER ${upgradedStatMultiplier(item.weapon.damageMultiplierBonus, level).toFixed(2)}×`);
  }
  if (item.weapon?.attackSpeedMultiplierBonus !== undefined) {
    stats.push(`ATTACK SPEED MULTIPLIER ${upgradedStatMultiplier(item.weapon.attackSpeedMultiplierBonus, level).toFixed(2)}×`);
  }
  if (item.modifiers?.damageMultiplierBonus !== undefined) {
    stats.push(`DAMAGE MULTIPLIER ${upgradedStatMultiplier(item.modifiers.damageMultiplierBonus, level).toFixed(2)}×`);
  }
  if (item.modifiers?.maxHealthMultiplierBonus !== undefined) {
    stats.push(`MAX HEALTH MULTIPLIER ${upgradedStatMultiplier(item.modifiers.maxHealthMultiplierBonus, level).toFixed(2)}×`);
  }
  if (item.modifiers?.regenerationMultiplierBonus !== undefined) {
    stats.push(`REGEN MULTIPLIER ${upgradedStatMultiplier(item.modifiers.regenerationMultiplierBonus, level).toFixed(2)}×`);
  }
  return stats;
}

export function itemUpgradeStatChanges(itemId: unknown, currentLevel: unknown) {
  const level = normalizeItemUpgradeLevel(currentLevel);
  if (!isUpgradeableItem(itemId) || level >= MAX_ITEM_UPGRADE_LEVEL) return [];
  const current = itemStats(itemId, level);
  const next = itemStats(itemId, level + 1);
  return current.map((stat, index) => {
    const splitAt = stat.lastIndexOf(" ");
    return {
      label: splitAt >= 0 ? stat.slice(0, splitAt) : stat,
      current: splitAt >= 0 ? stat.slice(splitAt + 1) : stat,
      next: next[index]?.slice(next[index].lastIndexOf(" ") + 1) ?? "",
    };
  });
}

function equipmentStatMultiplier(itemId: unknown, upgradeLevel: unknown, bonus: number | undefined) {
  return 1 + (bonus ?? 0) + upgradeBonus(itemId, upgradeLevel, bonus);
}

/** Research boosts the base stat, then equipment multiplies that boosted value. */
export function weaponDamageMultiplier(itemId: unknown, researchMultiplier = 1, upgradeLevel = 0) {
  const bonus = itemDefinition(canonicalItemId(itemId))?.weapon?.damageMultiplierBonus;
  return researchMultiplier * equipmentStatMultiplier(itemId, upgradeLevel, bonus);
}

export function itemDamageMultiplier(itemId: unknown, researchMultiplier = 1, upgradeLevel = 0) {
  const bonus = itemDefinition(canonicalItemId(itemId))?.modifiers?.damageMultiplierBonus;
  return researchMultiplier * equipmentStatMultiplier(itemId, upgradeLevel, bonus);
}

/** Weapon, head, chest, and research damage bonuses are independent multipliers. */
export function equipmentDamageMultiplier(
  weaponItemId: unknown,
  headItemId: unknown,
  chestItemId: unknown,
  researchMultiplier = 1,
  weaponUpgradeLevel = 0,
  headUpgradeLevel = 0,
  chestUpgradeLevel = 0,
) {
  return weaponDamageMultiplier(weaponItemId, researchMultiplier, weaponUpgradeLevel) *
    itemDamageMultiplier(headItemId, 1, headUpgradeLevel) *
    itemDamageMultiplier(chestItemId, 1, chestUpgradeLevel);
}

export function weaponAttackSpeedMultiplier(itemId: unknown, researchMultiplier = 1, upgradeLevel = 0) {
  const bonus = itemDefinition(canonicalItemId(itemId))?.weapon?.attackSpeedMultiplierBonus;
  return researchMultiplier * equipmentStatMultiplier(itemId, upgradeLevel, bonus);
}

export function weaponAttackInterval(itemId: unknown, baseInterval: number, researchMultiplier = 1, upgradeLevel = 0) {
  return baseInterval / weaponAttackSpeedMultiplier(itemId, researchMultiplier, upgradeLevel);
}

export function itemMaxHealthMultiplier(itemId: unknown, researchMultiplier = 1, upgradeLevel = 0) {
  const bonus = itemDefinition(canonicalItemId(itemId))?.modifiers?.maxHealthMultiplierBonus;
  return researchMultiplier * equipmentStatMultiplier(itemId, upgradeLevel, bonus);
}

/** Head, chest, and research max-health bonuses are independent multipliers. */
export function equipmentMaxHealthMultiplier(
  headItemId: unknown,
  chestItemId: unknown,
  researchMultiplier = 1,
  headUpgradeLevel = 0,
  chestUpgradeLevel = 0,
) {
  return itemMaxHealthMultiplier(headItemId, researchMultiplier, headUpgradeLevel) *
    itemMaxHealthMultiplier(chestItemId, 1, chestUpgradeLevel);
}

/** Regeneration uses the same research-then-equipment multiplication order. */
export function itemRegenerationMultiplier(itemId: unknown, researchMultiplier = 1, upgradeLevel = 0) {
  const bonus = itemDefinition(canonicalItemId(itemId))?.modifiers?.regenerationMultiplierBonus;
  return researchMultiplier * equipmentStatMultiplier(itemId, upgradeLevel, bonus);
}

/** Head, chest, and research regeneration bonuses are independent multipliers. */
export function equipmentRegenerationMultiplier(
  headItemId: unknown,
  chestItemId: unknown,
  researchMultiplier = 1,
  headUpgradeLevel = 0,
  chestUpgradeLevel = 0,
) {
  return itemRegenerationMultiplier(headItemId, researchMultiplier, headUpgradeLevel) *
    itemRegenerationMultiplier(chestItemId, 1, chestUpgradeLevel);
}
