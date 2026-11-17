import { FISHING_TREASURES } from "./fishing-treasures";
import { CAMPAIGN_EQUIPMENT } from "./campaign-equipment";
import {
  BLACK_BOOTS, CLOUDSPIRE_ARMOR, CLOUDSPIRE_BOW, CLOUDSPIRE_HELMET, DARK_METAL_HELMET, FIRE_METAL_BOW, FIRE_METAL_HELMET,
  FROST_ARMOR, FROST_BOW, IRON_BOW, LAVA_BOW, MAGMA_ARMOR, MOONFEN_ARMOR, NIGHT_BOW, SAMURAI_BOW, SAMURAI_HAT, SKY_BOW, SNOW_BOW,
  STARTER_BOW, STARTER_STONE, WATER_ARMOR, WOOD_FULL_HELM, WOODEN_ARMOR, isCosmeticOnlyItem,
} from "./items";
import { MAP_IDS } from "./rules";
import { GEAR_GRADES, GEAR_GRADE_NAMES } from "./gear-grades";
import { gradeOf } from "./grade-equipment";

// Tier follows each item's map (the first maps' gear plus each campaign item's own map), not item power
// or upgrade level, so owned items keep their tiers and refine grades.
const TIERS = new Map<string, number>([[STARTER_STONE, 1], [STARTER_BOW, 1], [WOODEN_ARMOR, 1],
  [WOOD_FULL_HELM, 2], [IRON_BOW, 2], [FROST_ARMOR, 3], [FROST_BOW, 3], [SNOW_BOW, 3], [LAVA_BOW, 4],
  [MAGMA_ARMOR, 4], [FIRE_METAL_HELMET, 4], [NIGHT_BOW, 5], [FIRE_METAL_BOW, 5], [DARK_METAL_HELMET, 5], [BLACK_BOOTS, 5],
  [WATER_ARMOR, 6], [SKY_BOW, 6], [SAMURAI_HAT, 7], [SAMURAI_BOW, 7],
  [CLOUDSPIRE_HELMET, 8], [CLOUDSPIRE_BOW, 8], [CLOUDSPIRE_ARMOR, 8], [MOONFEN_ARMOR, 9]]);
for (const item of FISHING_TREASURES) TIERS.set(item.id, item.tier);
for (const [itemId, { mapId }] of Object.entries(CAMPAIGN_EQUIPMENT)) {
  const index = MAP_IDS.indexOf(mapId);
  if (index >= 0 && !TIERS.has(itemId)) TIERS.set(itemId, index + 1);
}
export function itemTier(itemId: string): number | undefined {
  return isCosmeticOnlyItem(itemId) ? undefined : TIERS.get(itemId);
}

/**
 * Where a piece stands on the grade ladder, 0 (Crude) to 14 (Eternal), for its tile's color: a graded piece by its
 * grade, older gear by its tier, which stands for the same grade (GRADE_ITEM_TIER). Undefined for anything else.
 */
export function itemGradeRank(itemId: string): number | undefined {
  const grade = gradeOf(itemId);
  if (grade) return GEAR_GRADES.indexOf(grade);
  const treasure = FISHING_TREASURES.find(item => item.id === itemId);
  if (treasure) return GEAR_GRADES.findIndex(grade => GEAR_GRADE_NAMES[grade] === treasure.rarity);
  const tier = itemTier(itemId);
  return tier === undefined ? undefined : Math.max(0, Math.min(GEAR_GRADES.length - 1, tier - 1));
}
