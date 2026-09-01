import { describe, expect, it } from "vitest";
import {
  ADVANCED_LAVA_WASTES_MAP_ID,
  BEGINNER_DESERT_MAP_ID,
  CLOUDSPIRE_MAP_ID,
  INFERNAL_DEPTHS_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  SAMURAI_GARDEN_MAP_ID,
  TUTORIAL_FOREST_MAP_ID,
  WATER_REACH_MAP_ID,
} from "../world";
import { MAP_ASSET_GROUPS } from "./map-asset-groups";

describe("lazy map asset groups", () => {
  it("loads each boss only with its own map", () => {
    expect(MAP_ASSET_GROUPS[TUTORIAL_FOREST_MAP_ID]).toContain("forestBoss");
    expect(MAP_ASSET_GROUPS[BEGINNER_DESERT_MAP_ID]).toContain("desertBoss");
    expect(MAP_ASSET_GROUPS[INTERMEDIATE_SNOWLANDS_MAP_ID]).toContain("snowBoss");
    expect(MAP_ASSET_GROUPS[ADVANCED_LAVA_WASTES_MAP_ID]).toContain("lavaBoss");
    expect(MAP_ASSET_GROUPS[INFERNAL_DEPTHS_MAP_ID]).toContain("nightBoss");
    expect(MAP_ASSET_GROUPS[WATER_REACH_MAP_ID]).toContain("waterBoss");
    expect(MAP_ASSET_GROUPS[SAMURAI_GARDEN_MAP_ID]).toContain("samuraiBoss");
    expect(MAP_ASSET_GROUPS[CLOUDSPIRE_MAP_ID]).toContain("cloudspireBoss");
  });

  it("keeps image-based scenery with only the maps that use it", () => {
    expect(MAP_ASSET_GROUPS[TUTORIAL_FOREST_MAP_ID]).toContain("forestDecor");
    expect(MAP_ASSET_GROUPS[INTERMEDIATE_SNOWLANDS_MAP_ID]).toContain("snowDecor");
    expect(MAP_ASSET_GROUPS[ADVANCED_LAVA_WASTES_MAP_ID]).toContain("lavaDecor");
    expect(MAP_ASSET_GROUPS[INFERNAL_DEPTHS_MAP_ID]).toContain("nightDecor");
    expect(MAP_ASSET_GROUPS[BEGINNER_DESERT_MAP_ID]).not.toContain("lavaDecor");
    expect(MAP_ASSET_GROUPS[WATER_REACH_MAP_ID]).not.toContain("snowDecor");
  });
});
