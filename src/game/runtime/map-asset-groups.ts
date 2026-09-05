import {
  ADVANCED_LAVA_WASTES_MAP_ID,
  BEGINNER_DESERT_MAP_ID,
  CLOUDSPIRE_MAP_ID,
  INFERNAL_DEPTHS_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  SAMURAI_GARDEN_MAP_ID,
  TUTORIAL_FOREST_MAP_ID,
  WATER_REACH_MAP_ID,
  MOONFEN_MAP_ID,
  CRYSTAL_HOLLOWS_MAP_ID, CLOCKWORK_RUINS_MAP_ID, DUSKFALL_ORCHARD_MAP_ID,
  type MapId,
} from "../world";
import type { EnemyKind } from "../enemies";

export type MapArtAssetGroup =
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
  | "cloudspireBoss"
  | "moonfenBoss"
  | "orchardDecor"
  | "crystalHollowsBoss" | "clockworkRuinsBoss" | "duskfallOrchardBoss";

export type MapAssetGroup = {
  /** Boss and scenery images used only by this map. */
  art: readonly MapArtAssetGroup[];
  /** Regular-enemy render definitions that must be ready before this map appears. */
  enemies: readonly EnemyKind[];
};

/** Source-of-truth for every image-backed asset that is gated by the active map. */
export const MAP_ASSET_GROUPS = {
  [TUTORIAL_FOREST_MAP_ID]: {
    art: ["forestBoss", "forestDecor"],
    enemies: ["Bramble", "Needle", "Mossback", "Spitter", "Brood", "Cindermaw", "King Slime", "Dread Warden"],
  },
  [BEGINNER_DESERT_MAP_ID]: {
    art: ["desertBoss"],
    enemies: ["Dune Raider", "Dune Archer", "Dune Regent", "Venom Guard", "Wastes Reaper", "Blight Oracle"],
  },
  [INTERMEDIATE_SNOWLANDS_MAP_ID]: {
    art: ["snowBoss", "snowDecor"],
    enemies: ["Frost Raider", "Glacier Archer", "Glacier Regent", "Rime Guard", "Whiteout Reaper", "Aurora Oracle"],
  },
  [ADVANCED_LAVA_WASTES_MAP_ID]: {
    art: ["lavaBoss", "lavaDecor"],
    enemies: ["Ember Raider", "Cinder Archer", "Cinder Regent", "Magma Guard", "Ash Reaper", "Inferno Oracle"],
  },
  [INFERNAL_DEPTHS_MAP_ID]: {
    art: ["nightBoss", "nightDecor"],
    enemies: ["Depth Raider", "Abyss Archer", "Abyss Regent", "Obsidian Colossus", "Doom Reaper", "Nether Oracle"],
  },
  [WATER_REACH_MAP_ID]: {
    art: ["waterBoss"],
    enemies: ["Tide Raider", "Reef Archer", "Reef Regent", "Coral Colossus", "Drowned Reaper", "Tidal Oracle"],
  },
  [SAMURAI_GARDEN_MAP_ID]: {
    art: ["samuraiBoss"],
    enemies: ["Sakura Ronin", "Petal Archer", "Petal Regent", "Bamboo Guardian", "Moonblade Reaper", "Shrine Oracle"],
  },
  [CLOUDSPIRE_MAP_ID]: {
    art: ["cloudspireBoss"],
    enemies: ["Gale Prowler", "Nimbus Archer", "Nimbus Regent", "Skyguard Colossus", "Thunder Reaper", "Tempest Oracle"],
  },
  [MOONFEN_MAP_ID]: {
    art: ["moonfenBoss"],
    enemies: ["Fen Prowler", "Glowcap Archer", "Glowcap Regent", "Bog Colossus", "Moonmire Reaper", "Wisp Oracle"],
  },
  [CRYSTAL_HOLLOWS_MAP_ID]: {
    art: ["crystalHollowsBoss"],
    enemies: ["Shard Hopper", "Crystal Spitter", "Crystal Regent", "Geode Guardian", "Prism Reaver", "Hollow Oracle"],
  }, [CLOCKWORK_RUINS_MAP_ID]: {
    art: ["clockworkRuinsBoss"],
    enemies: ["Gear Prowler", "Rivet Spitter", "Gear Regent", "Iron Guardian", "Scrap Reaver", "Spark Oracle"],
  }, [DUSKFALL_ORCHARD_MAP_ID]: {
    art: ["duskfallOrchardBoss", "orchardDecor"],
    enemies: ["Gourd Prowler", "Seed Spitter", "Harvest Regent", "Husk Guardian", "Thorn Reaver", "Harvest Oracle"],
  },
} as const satisfies Record<MapId, MapAssetGroup>;

/** Map-keyed view consumed by the regular-enemy image loader. */
export const MAP_ENEMY_SPRITE_GROUPS: Record<MapId, readonly EnemyKind[]> = {
  [TUTORIAL_FOREST_MAP_ID]: MAP_ASSET_GROUPS[TUTORIAL_FOREST_MAP_ID].enemies,
  [BEGINNER_DESERT_MAP_ID]: MAP_ASSET_GROUPS[BEGINNER_DESERT_MAP_ID].enemies,
  [INTERMEDIATE_SNOWLANDS_MAP_ID]: MAP_ASSET_GROUPS[INTERMEDIATE_SNOWLANDS_MAP_ID].enemies,
  [ADVANCED_LAVA_WASTES_MAP_ID]: MAP_ASSET_GROUPS[ADVANCED_LAVA_WASTES_MAP_ID].enemies,
  [INFERNAL_DEPTHS_MAP_ID]: MAP_ASSET_GROUPS[INFERNAL_DEPTHS_MAP_ID].enemies,
  [WATER_REACH_MAP_ID]: MAP_ASSET_GROUPS[WATER_REACH_MAP_ID].enemies,
  [SAMURAI_GARDEN_MAP_ID]: MAP_ASSET_GROUPS[SAMURAI_GARDEN_MAP_ID].enemies,
  [CLOUDSPIRE_MAP_ID]: MAP_ASSET_GROUPS[CLOUDSPIRE_MAP_ID].enemies,
  [MOONFEN_MAP_ID]: MAP_ASSET_GROUPS[MOONFEN_MAP_ID].enemies,
  [CRYSTAL_HOLLOWS_MAP_ID]: MAP_ASSET_GROUPS[CRYSTAL_HOLLOWS_MAP_ID].enemies, [CLOCKWORK_RUINS_MAP_ID]: MAP_ASSET_GROUPS[CLOCKWORK_RUINS_MAP_ID].enemies, [DUSKFALL_ORCHARD_MAP_ID]: MAP_ASSET_GROUPS[DUSKFALL_ORCHARD_MAP_ID].enemies,
};
