import { itemStatLine } from "./item-stat-line";

/**
 * How much an item's own stats grow with the map it drops from.
 *
 * The first map's items are worth 1x and the fifteenth's 2x, interpolated between,
 * so every rung is worth the climb.
 *
 * This is the item's base. Slot upgrade tiers apply on top of it.
 */
export const EQUIPMENT_TOP_TIER_STAT_SCALE = 2;
export function itemMapTierStatScale(tier: number) {
  if (!Number.isFinite(tier)) return 1;
  const rung = Math.min(15, Math.max(1, Math.floor(tier)));
  return 1 + (EQUIPMENT_TOP_TIER_STAT_SCALE - 1) * (rung - 1) / 14;
}

/** All stat-bearing equipment scales earned stats by a modest percentage.
 * Tier steps are independent of campaign combat/reward tuning. */
export function equipmentStatDefinition(tier: number, slot: "HAND" | "HEAD" | "CHEST", quality = 1) {
  if (!Number.isInteger(tier) || tier < 1 || tier > 15) throw new RangeError("Equipment tier must be 1–15");
  if (!Number.isFinite(quality) || quality <= 0 || quality > 1) throw new RangeError("Equipment quality must be >0 and <=1");
  // Quality preserves the regular Snow/Night bows below their rarer alternatives.
  const percent = Math.round((5 + (tier - 1) * 2.5) * itemMapTierStatScale(tier) * quality * 100) / 100;
  // The tier rides along on bows: it sets the range their skills roll in.
  if (slot === "HAND") return { stats: [itemStatLine("DAMAGE", percent)], weapon: { mode: "RANGED" as const, projectile: "ARROW" as const, damageMultiplierBonus: percent / 100, tier } };
  if (slot === "HEAD") return { stats: [itemStatLine("REGEN", percent)], modifiers: { regenerationMultiplierBonus: percent / 100 } };
  return { stats: [itemStatLine("MAX HEALTH", percent)], modifiers: { maxHealthMultiplierBonus: percent / 100 } };
}
