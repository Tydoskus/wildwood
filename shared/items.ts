import { equipmentStatDefinition } from "./equipment-budget";
import { CAMPAIGN_ITEM_DEFINITIONS } from "./campaign-equipment";

// Browser- and server-safe equipment catalog. Add gameplay-facing item data
// here; client-only sprites and draw anchors live in item-presentation.ts.

export const WOODEN_SWORD = "wooden_sword";
export const BASIC_PAPER_HAT = "basic_paper_hat";
export const SUPERIOR_GOLDEN_HELMET = "superior_golden_helmet";
export const WOOD_FULL_HELM = "wood_full_helm";
export const FIRE_METAL_HELMET = "fire_metal_helmet";
export const DARK_METAL_HELMET = "dark_metal_helmet";
export const CLOUDSPIRE_ARMOR = "cloudspire_armor";
export const MOONFEN_ARMOR = "moonfen_armor";
export const CLOUDSPIRE_BOW = "cloudspire_bow";
export const CLOUDSPIRE_HELMET = "cloudspire_helmet";
export const SKY_BOW = "sky_bow";
export const SKY_BOW_DROP_NUMERATOR = 7;
export const SKY_BOW_DROP_DENOMINATOR = 1_000; // Exactly 0.7%, independently of armor.
export const WATER_ARMOR = "water_armor";
export const WATER_ARMOR_DROP_DENOMINATOR = 100; // 1% per regular Water Reach enemy.
export const SAMURAI_BOW = "samurai_bow";
export const SAMURAI_BOW_DROP_NUMERATOR = 13;
export const SAMURAI_BOW_DROP_DENOMINATOR = 2_000; // Exactly 0.65%, independently of the helmet.
export const SAMURAI_HAT = "samurai_hat";
export const LEGENDARY_WHITE_GOLD_ARMOR = "legendary_white_gold_armor";
export const BLACK_BOOTS = "black_boots";
export const BLACK_BOOTS_DROP_DENOMINATOR = 50;
export const BLACK_BOOTS_SPEED_BONUS = 25;
export const BLACK_BOOTS_COMBAT_DELAY_MS = 5_000;
export const STARTER_STONE = "starter_stone";
export const STARTER_BOW = "starter_bow";
export const IRON_BOW = "iron_bow";
export const SNOW_BOW = "snow_bow";
export const FROST_BOW = "frost_bow";
export const LAVA_BOW = "lava_bow";
export const NIGHT_BOW = "night_bow";
export const FIRE_METAL_BOW = "fire_metal_bow";
export const FROST_ARMOR = "frost_armor";
export const MAGMA_ARMOR = "magma_armor";
export const WOODEN_ARMOR = "wooden_armor";
export const FOREST_ITEM_DROP_DENOMINATOR = 25;
/** The paper hat is a one-in-a-hundred find, not starting equipment. */
export const PAPER_HAT_DROP_DENOMINATOR = 100;
export const DESERT_ITEM_DROP_DENOMINATOR = 50;
export const SNOW_ITEM_DROP_DENOMINATOR = 50;
// Per-enemy odds match the later-map equipment range, independent of kill batching.
export const LAVA_ITEM_DROP_NUMERATOR = 7;
export const LAVA_ITEM_DROP_DENOMINATOR = 1_000; // Magma Armor: 0.7%.
export const LAVA_HELMET_ITEM_DROP_DENOMINATOR = 125; // Fire Metal Helmet: 0.8%.
export const LAVA_BOSS_ITEM_DROP_DENOMINATOR = 25;
export const INFERNAL_ITEM_DROP_DENOMINATOR = 200; // Fire Metal Bow: 0.5%.
export const NIGHT_FOREST_BOW_ITEM_DROP_DENOMINATOR = 100;
export const NIGHT_FOREST_HELMET_ITEM_DROP_DENOMINATOR = 125; // Dark Metal Helmet: 0.8%.
export const SAMURAI_HAT_ITEM_DROP_DENOMINATOR = 125; // 0.8% per regular Samurai Gardens enemy.
export const SNOW_BOSS_ITEM_DROP_DENOMINATOR = 25;
export const SNOW_BOSS_ARMOR_DROP_DENOMINATOR = 5;
export const MAX_OWNED_ITEM_COUNT = 1;
// Kept as a compatibility export for older client/server call sites. Wildstat
// equipment is unique now, so every durable quantity is clamped to one.
export const MAX_FOREST_ITEM_COUNT = MAX_OWNED_ITEM_COUNT;
/**
 * Upgrades belong to an equipment slot, not to the item in it.
 *
 * A tier earned on the Weapon slot applies to whatever weapon is held, so a
 * better drop is an upgrade rather than a reason to start again. The track is
 * long on purpose: thirty-five tiers is an endgame goal, where ten was
 * something the next map's drop could make pointless overnight.
 */
export const MAX_SLOT_UPGRADE_TIER = 35;
/** The slots with a tier track. Both hands share the weapon's. */
export const UPGRADE_SLOTS = ["HAND", "HEAD", "CHEST"] as const;
export type UpgradeSlot = typeof UPGRADE_SLOTS[number];
export const MAX_ITEM_UPGRADE_LEVEL = MAX_SLOT_UPGRADE_TIER;
/**
 * Each tier adds this share of the item's tier-zero bonus. Less per tier than
 * the old ten-level track's .08, over three and a half times as many tiers: a
 * finished slot is +140% where a finished item was +80%.
 */
export const ITEM_UPGRADE_STAT_BONUS = .04;
export const ITEM_UPGRADE_BASE_DURATION_MS = 3 * 60 * 1_000;
/**
 * Growth per tier, set so a finished slot is about three hundred hours: the
 * early tiers still land in minutes, tier 20 takes a couple of hours and the
 * last one takes a couple of days. The old 1.4 cannot stretch from ten tiers
 * to thirty-five — it would ask for years on the final tier alone.
 */
export const ITEM_UPGRADE_DURATION_GROWTH = 1.2294;

export type ItemSlot = "HEAD" | "CHEST" | "FEET" | "HAND";
export type EquipmentSlot = "HEAD" | "CHEST" | "FEET" | "RIGHT_HAND" | "LEFT_HAND";
export type ItemAcquisition = "STARTER" | "PROGRESSION" | "DEVELOPER" | "FOREST_DROP" | "DESERT_DROP" | "SNOW_DROP" | "SNOW_BOSS_DROP" | "LAVA_DROP" | "LAVA_BOSS_DROP" | "INFERNAL_DROP" | "SAMURAI_DROP" | "WATER_DROP" | "CLOUDSPIRE_DROP" | "MOONFEN_DROP" | "CAMPAIGN_DROP";
export type ProjectileKind = "ROCK" | "ARROW";

export type ItemDefinition = {
  id: string;
  name: string;
  slot: ItemSlot;
  acquisition: ItemAcquisition;
  description: string;
  stats: readonly string[];
  cosmeticOnly?: boolean;
  modifiers?: {
    damageMultiplierBonus?: number;
    maxHealthMultiplierBonus?: number;
    regenerationMultiplierBonus?: number;
  };
  weapon?: {
    mode: "RANGED" | "MELEE";
    projectile?: ProjectileKind;
    range?: number;
    damageMultiplierBonus?: number;
  };
};

export const ITEM_DEFINITIONS = {
  ...CAMPAIGN_ITEM_DEFINITIONS,
  [WOODEN_SWORD]: {
    id: WOODEN_SWORD, name: "WOODEN SWORD", slot: "HAND", acquisition: "DEVELOPER",
    description: "A simple wooden practice sword for close-range combat.",
    stats: ["MELEE · 75 RANGE"],
    weapon: { mode: "MELEE", range: 75 },
  },
  [BASIC_PAPER_HAT]: {
    id: BASIC_PAPER_HAT,
    cosmeticOnly: true,
    name: "BASIC PAPER HAT",
    slot: "HEAD",
    // A rare find in the forest rather than something everyone opens with.
    acquisition: "FOREST_DROP",
    description: "A folded brown paper hat. No stats, just style.",
    stats: ["NO STATS"],
  },
  [SUPERIOR_GOLDEN_HELMET]: {
    id: SUPERIOR_GOLDEN_HELMET,
    cosmeticOnly: true,
    name: "ALPHA TESTER HELMET",
    slot: "HEAD",
    acquisition: "DEVELOPER",
    description: "A gleaming winged helmet for Wildstat alpha testers.",
    stats: ["COSMETIC · NO STATS"],
  },
  [WOOD_FULL_HELM]: {
    id: WOOD_FULL_HELM,
    name: "WOOD FULL HELM",
    slot: "HEAD",
    acquisition: "DESERT_DROP",
    description: "A sturdy wooden full helm carried by Beginner Desert monsters that increases regeneration.",
    ...equipmentStatDefinition(2, "HEAD"),
  },
  [FIRE_METAL_HELMET]: {
    id: FIRE_METAL_HELMET,
    name: "FIRE METAL HELMET",
    slot: "HEAD",
    acquisition: "LAVA_DROP",
    description: "A red-hot metal helm carried by Advanced Lava Lake monsters that fortifies regeneration.",
    ...equipmentStatDefinition(4, "HEAD"),
  },
  [DARK_METAL_HELMET]: {
    id: DARK_METAL_HELMET,
    name: "DARK METAL HELMET",
    slot: "HEAD",
    acquisition: "INFERNAL_DROP",
    description: "A horned dark-metal helm carried by Night Forest monsters that greatly amplifies regeneration.",
    ...equipmentStatDefinition(5, "HEAD"),
  },
  [SAMURAI_HAT]: {
    id: SAMURAI_HAT,
    name: "SAMURAI HAT",
    slot: "HEAD",
    acquisition: "SAMURAI_DROP",
    description: "A crimson samurai helmet carried by Samurai Gardens monsters that strengthens regeneration.",
    ...equipmentStatDefinition(7, "HEAD"),
  },
  [LEGENDARY_WHITE_GOLD_ARMOR]: {
    id: LEGENDARY_WHITE_GOLD_ARMOR,
    cosmeticOnly: true,
    name: "LEGENDARY WHITE GOLD ARMOR",
    slot: "CHEST",
    acquisition: "DEVELOPER",
    description: "White gold plate with a legendary gleam. Cosmetic only.",
    stats: ["COSMETIC · NO STATS"],
  },
  [BLACK_BOOTS]: {
    id: BLACK_BOOTS,
    name: "BLACK BOOTS",
    slot: "FEET",
    acquisition: "INFERNAL_DROP",
    description: "Quiet boots from Night Forest. Speed returns after 5 seconds without attacking or taking a hit.",
    stats: ["OUT OF COMBAT MOVE SPEED +25", "REACTIVATES AFTER 5 SECONDS"],
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
    description: "A dependable wooden bow for hunting Wildstat monsters.",
    ...equipmentStatDefinition(1, "HAND"),
  },
  [IRON_BOW]: {
    id: IRON_BOW,
    name: "IRON BOW",
    slot: "HAND",
    acquisition: "DESERT_DROP",
    description: "A reinforced iron bow carried by Beginner Desert monsters that strengthens every shot.",
    ...equipmentStatDefinition(2, "HAND"),
  },
  [SNOW_BOW]: {
    id: SNOW_BOW,
    name: "SNOW BOW",
    slot: "HAND",
    acquisition: "SNOW_DROP",
    description: "A white bow carried by Snowlands monsters, balanced as a stepping stone toward Frostclaw's weapon.",
    ...equipmentStatDefinition(3, "HAND", 0.85),
  },
  [FROST_BOW]: {
    id: FROST_BOW,
    name: "FROST BOW",
    slot: "HAND",
    acquisition: "SNOW_BOSS_DROP",
    description: "A frozen bow claimed from Frostclaw, built for devastating shots.",
    ...equipmentStatDefinition(3, "HAND"),
  },
  [LAVA_BOW]: {
    id: LAVA_BOW,
    name: "LAVA BOW",
    slot: "HAND",
    acquisition: "LAVA_BOSS_DROP",
    description: "A blazing red bow claimed from the Magmalisk, built for overwhelming damage.",
    ...equipmentStatDefinition(4, "HAND"),
  },
  [NIGHT_BOW]: {
    id: NIGHT_BOW,
    name: "NIGHT BOW",
    slot: "HAND",
    acquisition: "INFERNAL_DROP",
    description: "A purple bow carried by Night Forest monsters that provides a dependable bridge to rarer Night Forest equipment.",
    ...equipmentStatDefinition(5, "HAND", 0.85),
  },
  [FIRE_METAL_BOW]: {
    id: FIRE_METAL_BOW,
    name: "FIRE METAL BOW",
    slot: "HAND",
    acquisition: "INFERNAL_DROP",
    description: "A forged bow carried by Night Forest monsters, built for extreme damage.",
    ...equipmentStatDefinition(5, "HAND"),
  },
  [FROST_ARMOR]: {
    id: FROST_ARMOR,
    name: "FROST ARMOR",
    slot: "CHEST",
    acquisition: "SNOW_BOSS_DROP",
    description: "Frozen blue armor claimed from Frostclaw that fortifies health.",
    ...equipmentStatDefinition(3, "CHEST"),
  },
  [CLOUDSPIRE_ARMOR]: {
    id: CLOUDSPIRE_ARMOR,
    name: "CLOUDSPIRE ARMOR",
    slot: "CHEST",
    acquisition: "CLOUDSPIRE_DROP",
    description: "Golden armor carried by Cloudspire monsters that strengthens health.",
    ...equipmentStatDefinition(8, "CHEST"),
  },
  [MOONFEN_ARMOR]: {
    id: MOONFEN_ARMOR,
    name: "MOONFEN ARMOR",
    slot: "CHEST",
    acquisition: "MOONFEN_DROP",
    description: "Green armor carried by Moonfen monsters that strengthens health.",
    ...equipmentStatDefinition(9, "CHEST"),
  },
  [CLOUDSPIRE_BOW]: {
    id: CLOUDSPIRE_BOW,
    name: "CLOUDSPIRE BOW",
    slot: "HAND",
    acquisition: "CLOUDSPIRE_DROP",
    description: "A golden bow carried by Cloudspire monsters that strengthens every shot.",
    ...equipmentStatDefinition(8, "HAND"),
  },
  [CLOUDSPIRE_HELMET]: {
    id: CLOUDSPIRE_HELMET,
    name: "CLOUDSPIRE HELMET",
    slot: "HEAD",
    acquisition: "CLOUDSPIRE_DROP",
    description: "A golden helmet carried by Cloudspire monsters that strengthens regeneration.",
    ...equipmentStatDefinition(8, "HEAD"),
  },
  [SAMURAI_BOW]: {
    id: SAMURAI_BOW,
    name: "SAMURAI BOW",
    slot: "HAND",
    acquisition: "SAMURAI_DROP",
    description: "A magenta bow carried by Samurai Gardens monsters that strengthens every shot.",
    ...equipmentStatDefinition(7, "HAND"),
  },
  [SKY_BOW]: {
    id: SKY_BOW,
    name: "SKY BOW",
    slot: "HAND",
    acquisition: "WATER_DROP",
    description: "A sky-blue bow carried by Water Reach monsters that amplifies every shot.",
    ...equipmentStatDefinition(6, "HAND"),
  },
  [WATER_ARMOR]: {
    id: WATER_ARMOR,
    name: "WATER ARMOR",
    slot: "CHEST",
    acquisition: "WATER_DROP",
    description: "Blue-gray armor carried by Water Reach monsters that strengthens health.",
    ...equipmentStatDefinition(6, "CHEST"),
  },
  [MAGMA_ARMOR]: {
    id: MAGMA_ARMOR,
    name: "MAGMA ARMOR",
    slot: "CHEST",
    acquisition: "LAVA_DROP",
    description: "Molten orange armor carried by Lava Wastes monsters that amplifies health.",
    ...equipmentStatDefinition(4, "CHEST"),
  },
  [WOODEN_ARMOR]: {
    id: WOODEN_ARMOR,
    name: "WOODEN ARMOR",
    slot: "CHEST",
    acquisition: "FOREST_DROP",
    description: "Wooden forest plate that reinforces its wearer with extra health.",
    ...equipmentStatDefinition(1, "CHEST"),
  },
} as const satisfies Record<string, ItemDefinition>;

export type ItemId = keyof typeof ITEM_DEFINITIONS;

/** All durable enemy/boss drops, including future map sets. */
export const EQUIPMENT_DROP_ITEM_IDS = Object.values(ITEM_DEFINITIONS)
  .filter(item => item.acquisition.endsWith("_DROP"))
  .map(item => item.id) as ItemId[];

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
export const SNOW_DROP_ITEM_IDS = Object.values(ITEM_DEFINITIONS)
  .filter((item) => item.acquisition === "SNOW_DROP")
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
export const MOONFEN_DROP_ITEM_IDS = Object.values(ITEM_DEFINITIONS)
  .filter((item) => item.acquisition === "MOONFEN_DROP")
  .map((item) => item.id);
export const CLOUDSPIRE_DROP_ITEM_IDS = Object.values(ITEM_DEFINITIONS)
  .filter((item) => item.acquisition === "CLOUDSPIRE_DROP")
  .map((item) => item.id);
export const WATER_DROP_ITEM_IDS = Object.values(ITEM_DEFINITIONS)
  .filter((item) => item.acquisition === "WATER_DROP")
  .map((item) => item.id);
export const SAMURAI_DROP_ITEM_IDS = Object.values(ITEM_DEFINITIONS)
  .filter((item) => item.acquisition === "SAMURAI_DROP")
  .map((item) => item.id);
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
    item.modifiers?.damageMultiplierBonus !== undefined ||
    item.modifiers?.maxHealthMultiplierBonus !== undefined ||
    item.modifiers?.regenerationMultiplierBonus !== undefined;
}

function upgradedStatBonus(baseBonus: number, level: unknown) {
  return Math.round(baseBonus * (1 + normalizeItemUpgradeLevel(level) * ITEM_UPGRADE_STAT_BONUS) * 100) / 100;
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
    stats.push(`DAMAGE +${upgradedStatBonus(item.weapon.damageMultiplierBonus * 100, level)}%`);
  }
  if (item.modifiers?.damageMultiplierBonus !== undefined) {
    stats.push(`DAMAGE +${upgradedStatBonus(item.modifiers.damageMultiplierBonus * 100, level)}%`);
  }
  if (item.modifiers?.maxHealthMultiplierBonus !== undefined) {
    stats.push(`MAX HEALTH +${upgradedStatBonus(item.modifiers.maxHealthMultiplierBonus * 100, level)}%`);
  }
  if (item.modifiers?.regenerationMultiplierBonus !== undefined) {
    stats.push(`REGEN +${upgradedStatBonus(item.modifiers.regenerationMultiplierBonus * 100, level)}%`);
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

/** Equipment percentages scale earned stats without changing saved base values. */
export function itemDamageMultiplierBonus(itemId: unknown, upgradeLevel = 0) {
  const item = itemDefinition(canonicalItemId(itemId));
  return upgradedStatBonus(((item?.weapon?.damageMultiplierBonus ?? 0) + (item?.modifiers?.damageMultiplierBonus ?? 0)) * 100, upgradeLevel) / 100;
}
export function itemMaxHealthMultiplierBonus(itemId: unknown, upgradeLevel = 0) {
  return upgradedStatBonus((itemDefinition(canonicalItemId(itemId))?.modifiers?.maxHealthMultiplierBonus ?? 0) * 100, upgradeLevel) / 100;
}
export function itemRegenerationMultiplierBonus(itemId: unknown, upgradeLevel = 0) {
  return upgradedStatBonus((itemDefinition(canonicalItemId(itemId))?.modifiers?.regenerationMultiplierBonus ?? 0) * 100, upgradeLevel) / 100;
}
export function equipmentDamageMultiplierBonus(weapon: unknown, head: unknown, chest: unknown, weaponLevel = 0, headLevel = 0, chestLevel = 0) {
  return itemDamageMultiplierBonus(weapon, weaponLevel) + itemDamageMultiplierBonus(head, headLevel) + itemDamageMultiplierBonus(chest, chestLevel);
}
export function equipmentMaxHealthMultiplierBonus(head: unknown, chest: unknown, headLevel = 0, chestLevel = 0) {
  return itemMaxHealthMultiplierBonus(head, headLevel) + itemMaxHealthMultiplierBonus(chest, chestLevel);
}
export function equipmentRegenerationMultiplierBonus(head: unknown, chest: unknown, headLevel = 0, chestLevel = 0) {
  return itemRegenerationMultiplierBonus(head, headLevel) + itemRegenerationMultiplierBonus(chest, chestLevel);
}
export function equipmentDamage(base: number, weapon: unknown, head: unknown, chest: unknown, researchMultiplier = 1, weaponLevel = 0, headLevel = 0, chestLevel = 0) {
  return base * (1 + equipmentDamageMultiplierBonus(weapon, head, chest, weaponLevel, headLevel, chestLevel)) * researchMultiplier;
}
export function equipmentMaxHealth(base: number, head: unknown, chest: unknown, researchMultiplier = 1, headLevel = 0, chestLevel = 0) {
  return base * (1 + equipmentMaxHealthMultiplierBonus(head, chest, headLevel, chestLevel)) * researchMultiplier;
}
export function equipmentRegeneration(base: number, head: unknown, chest: unknown, researchMultiplier = 1, headLevel = 0, chestLevel = 0) {
  return base * (1 + equipmentRegenerationMultiplierBonus(head, chest, headLevel, chestLevel)) * researchMultiplier;
}

/** Permanent unlocks and starter items are restored by inventory normalization. */
export function canDestroyEquipment(itemId: unknown) {
  const item = itemDefinition(canonicalItemId(itemId));
  return !!item && item.acquisition.endsWith("_DROP");
}

/** Explicit category: weapons without stat bonuses are still equipment. */
export function isCosmeticOnlyItem(itemId: unknown): boolean {
  return itemDefinition(itemId)?.cosmeticOnly === true;
}
