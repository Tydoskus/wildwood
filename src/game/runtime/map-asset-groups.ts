import {
  ADVANCED_LAVA_WASTES_MAP_ID,
  BEGINNER_DESERT_MAP_ID,
  CLOUDSPIRE_MAP_ID,
  INFERNAL_DEPTHS_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  SAMURAI_GARDEN_MAP_ID,
  TUTORIAL_FOREST_MAP_ID,
  WATER_REACH_MAP_ID,
  type MapId,
} from "../world";

export type MapAssetGroup =
  | "forestBoss"
  | "forestDecor"
  | "desertBoss"
  | "snowBoss"
  | "snowDecor"
  | "lavaBoss"
  | "lavaDecor"
  | "nightBoss"
  | "nightDecor"
  | "waterBoss"
  | "samuraiBoss"
  | "cloudspireBoss";

/** Source-of-truth for art that should begin loading only when its map is needed. */
export const MAP_ASSET_GROUPS: Record<MapId, readonly MapAssetGroup[]> = {
  [TUTORIAL_FOREST_MAP_ID]: ["forestBoss", "forestDecor"],
  [BEGINNER_DESERT_MAP_ID]: ["desertBoss"],
  [INTERMEDIATE_SNOWLANDS_MAP_ID]: ["snowBoss", "snowDecor"],
  [ADVANCED_LAVA_WASTES_MAP_ID]: ["lavaBoss", "lavaDecor"],
  [INFERNAL_DEPTHS_MAP_ID]: ["nightBoss", "nightDecor"],
  [WATER_REACH_MAP_ID]: ["waterBoss"],
  [SAMURAI_GARDEN_MAP_ID]: ["samuraiBoss"],
  [CLOUDSPIRE_MAP_ID]: ["cloudspireBoss"],
};
