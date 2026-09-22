import { runtimeMapBalance } from './map-balance-runtime';
import { CAMPAIGN_EQUIPMENT, type CampaignItemId } from "./campaign-equipment";
import { BASIC_PAPER_HAT, PAPER_HAT_DROP_DENOMINATOR, STARTER_BOW, WOODEN_ARMOR, FOREST_ITEM_DROP_DENOMINATOR, WOOD_FULL_HELM, IRON_BOW, DESERT_ITEM_DROP_DENOMINATOR, SNOW_BOW, SNOW_ITEM_DROP_DENOMINATOR, MAGMA_ARMOR, FIRE_METAL_HELMET, LAVA_ITEM_DROP_DENOMINATOR, LAVA_HELMET_ITEM_DROP_DENOMINATOR, NIGHT_BOW, FIRE_METAL_BOW, DARK_METAL_HELMET, BLACK_BOOTS, BLACK_BOOTS_DROP_DENOMINATOR, NIGHT_FOREST_BOW_ITEM_DROP_DENOMINATOR, INFERNAL_ITEM_DROP_DENOMINATOR, NIGHT_FOREST_HELMET_ITEM_DROP_DENOMINATOR } from "./items";
import { TUTORIAL_FOREST_MAP_ID, BEGINNER_DESERT_MAP_ID, INTERMEDIATE_SNOWLANDS_MAP_ID, ADVANCED_LAVA_WASTES_MAP_ID, INFERNAL_DEPTHS_MAP_ID, REGULAR_KILL_REPORT_SECONDS } from "./rules";
import { LAVA_ITEM_DROP_NUMERATOR } from "./items";
export const REGULAR_ENEMY_LOOT_BATCH_MAX = 100;
export const REGULAR_ENEMY_LOOT_DELAY_MS = REGULAR_KILL_REPORT_SECONDS * 1000;
import {
  WATER_ARMOR, WATER_ARMOR_DROP_DENOMINATOR, SKY_BOW, SKY_BOW_DROP_NUMERATOR, SKY_BOW_DROP_DENOMINATOR,
  SAMURAI_HAT, SAMURAI_HAT_ITEM_DROP_DENOMINATOR, SAMURAI_BOW, SAMURAI_BOW_DROP_NUMERATOR, SAMURAI_BOW_DROP_DENOMINATOR,
  CLOUDSPIRE_ARMOR, MOONFEN_ARMOR, CLOUDSPIRE_BOW, CLOUDSPIRE_HELMET, type ItemId,
} from "./items";
import { WATER_REACH_MAP_ID, SAMURAI_GARDEN_MAP_ID, CLOUDSPIRE_MAP_ID, MOONFEN_MAP_ID } from "./rules";

export type MapLootDrop = { itemId: ItemId; wins: number; outcomes: number };
/** Independent integer rolls keep fractional percentages exact. */
const LOOT: Readonly<Record<string, readonly MapLootDrop[]>> = {
  [TUTORIAL_FOREST_MAP_ID]: [
    { itemId: STARTER_BOW, wins: 1, outcomes: FOREST_ITEM_DROP_DENOMINATOR },
    { itemId: WOODEN_ARMOR, wins: 1, outcomes: FOREST_ITEM_DROP_DENOMINATOR },
    { itemId: BASIC_PAPER_HAT, wins: 1, outcomes: PAPER_HAT_DROP_DENOMINATOR },
  ],
  [BEGINNER_DESERT_MAP_ID]: [
    { itemId: WOOD_FULL_HELM, wins: 1, outcomes: DESERT_ITEM_DROP_DENOMINATOR },
    { itemId: IRON_BOW, wins: 1, outcomes: DESERT_ITEM_DROP_DENOMINATOR },
  ],
  [INTERMEDIATE_SNOWLANDS_MAP_ID]: [{ itemId: SNOW_BOW, wins: 1, outcomes: SNOW_ITEM_DROP_DENOMINATOR }],
  [ADVANCED_LAVA_WASTES_MAP_ID]: [
    { itemId: MAGMA_ARMOR, wins: LAVA_ITEM_DROP_NUMERATOR, outcomes: LAVA_ITEM_DROP_DENOMINATOR },
    { itemId: FIRE_METAL_HELMET, wins: 1, outcomes: LAVA_HELMET_ITEM_DROP_DENOMINATOR },
  ],
  [INFERNAL_DEPTHS_MAP_ID]: [
    { itemId: NIGHT_BOW, wins: 1, outcomes: NIGHT_FOREST_BOW_ITEM_DROP_DENOMINATOR },
    { itemId: FIRE_METAL_BOW, wins: 1, outcomes: INFERNAL_ITEM_DROP_DENOMINATOR },
    { itemId: DARK_METAL_HELMET, wins: 1, outcomes: NIGHT_FOREST_HELMET_ITEM_DROP_DENOMINATOR },
    { itemId: BLACK_BOOTS, wins: 1, outcomes: BLACK_BOOTS_DROP_DENOMINATOR },
  ],
  [WATER_REACH_MAP_ID]: [
    { itemId: WATER_ARMOR, wins: 1, outcomes: WATER_ARMOR_DROP_DENOMINATOR },
    { itemId: SKY_BOW, wins: SKY_BOW_DROP_NUMERATOR, outcomes: SKY_BOW_DROP_DENOMINATOR },
  ],
  [SAMURAI_GARDEN_MAP_ID]: [
    { itemId: SAMURAI_HAT, wins: 1, outcomes: SAMURAI_HAT_ITEM_DROP_DENOMINATOR },
    { itemId: SAMURAI_BOW, wins: SAMURAI_BOW_DROP_NUMERATOR, outcomes: SAMURAI_BOW_DROP_DENOMINATOR },
  ],
  [CLOUDSPIRE_MAP_ID]: [
    { itemId: CLOUDSPIRE_HELMET, wins: 1, outcomes: 125 }, // 0.8%
    { itemId: CLOUDSPIRE_BOW, wins: 1, outcomes: 200 }, // 0.5%
    { itemId: CLOUDSPIRE_ARMOR, wins: 7, outcomes: 1000 }, // 0.7%
  ],
  [MOONFEN_MAP_ID]: [{ itemId: MOONFEN_ARMOR, wins: 7, outcomes: 1000 }], // 0.7%
};
// Resolve the map lists once, not once per kill or map-guide render.
const ALL_LOOT: Record<string, readonly MapLootDrop[]> = { ...LOOT };
for (const [itemId, { mapId, wins, outcomes }] of Object.entries(CAMPAIGN_EQUIPMENT)) {
  ALL_LOOT[mapId] = [...(ALL_LOOT[mapId] ?? []), { itemId: itemId as CampaignItemId, wins, outcomes }];
}
export function regularMapLoot(mapId: string, authored = false): readonly MapLootDrop[] { return (!authored && runtimeMapBalance(mapId)?.loot) || ALL_LOOT[mapId] || []; }
