import { describe, expect, it } from "vitest";
import {
  DARK_METAL_HELMET,
  FROST_ARMOR,
  FROST_BOW,
  FIRE_METAL_BOW,
  FIRE_METAL_HELMET,
  IRON_BOW,
  INFERNAL_ITEM_DROP_DENOMINATOR,
  LAVA_BOW,
  LAVA_HELMET_ITEM_DROP_DENOMINATOR,
  LAVA_ITEM_DROP_DENOMINATOR,
  MAGMA_ARMOR,
  NIGHT_FOREST_HELMET_ITEM_DROP_DENOMINATOR,
  STARTER_BOW,
  WOOD_FULL_HELM,
  WOODEN_ARMOR,
} from "../../shared/items";
import {
  ADVANCED_LAVA_WASTES_MAP_ID,
  BEGINNER_DESERT_MAP_ID,
  INFERNAL_DEPTHS_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  TUTORIAL_FOREST_MAP_ID,
  createSpawnSites,
} from "../game/world";
import { mapGuideDropChance, mapGuideDrops, mapGuideItemStats, mapGuideZones } from "./map-guide-controller";

describe("map guide", () => {
  it("lists canonical per-map item sources and drop denominators", () => {
    expect(mapGuideDrops(TUTORIAL_FOREST_MAP_ID).map(({ itemId, denominator }) => [itemId, denominator])).toEqual([
      [STARTER_BOW, 25],
      [WOODEN_ARMOR, 25],
    ]);
    expect(mapGuideDrops(BEGINNER_DESERT_MAP_ID).map(({ itemId, denominator }) => [itemId, denominator])).toEqual([
      [WOOD_FULL_HELM, 50],
      [IRON_BOW, 50],
    ]);
    expect(mapGuideDrops(INTERMEDIATE_SNOWLANDS_MAP_ID).map(({ itemId, denominator }) => [itemId, denominator])).toEqual([
      [FROST_ARMOR, 5],
      [FROST_BOW, 25],
    ]);
    expect(mapGuideDrops(ADVANCED_LAVA_WASTES_MAP_ID).map(({ itemId, denominator }) => [itemId, denominator])).toEqual([
      [MAGMA_ARMOR, LAVA_ITEM_DROP_DENOMINATOR],
      [FIRE_METAL_HELMET, LAVA_HELMET_ITEM_DROP_DENOMINATOR],
      [LAVA_BOW, 25],
    ]);
    expect(mapGuideDrops(INFERNAL_DEPTHS_MAP_ID).map(({ itemId, denominator }) => [itemId, denominator])).toEqual([
      [FIRE_METAL_BOW, INFERNAL_ITEM_DROP_DENOMINATOR],
      [DARK_METAL_HELMET, NIGHT_FOREST_HELMET_ITEM_DROP_DENOMINATOR],
    ]);
    expect(mapGuideDropChance(25)).toBe("4%");
    expect(mapGuideDropChance(30)).toBe("3.3%");
    expect(mapGuideDropChance(LAVA_ITEM_DROP_DENOMINATOR)).toBe("0.08%");
    expect(mapGuideDropChance(LAVA_HELMET_ITEM_DROP_DENOMINATOR)).toBe("0.05%");
  });

  it("summarizes the stats players need when evaluating a drop", () => {
    expect(mapGuideItemStats(IRON_BOW)).toEqual(["Damage +25%"]);
    expect(mapGuideItemStats(MAGMA_ARMOR)).toEqual(["Max Health +50%", "Regen +50%"]);
    expect(mapGuideItemStats(FIRE_METAL_HELMET)).toEqual(["Max Health +12%", "Regen +20%"]);
    expect(mapGuideItemStats(FIRE_METAL_BOW)).toEqual(["Damage +60%"]);
    expect(mapGuideItemStats(DARK_METAL_HELMET)).toEqual(["Max Health +60%", "Regen +80%"]);
  });

  it("groups live forest spawns into compact reward zones", () => {
    const zones = mapGuideZones(createSpawnSites({ x: 4_040, y: 4_040 }, TUTORIAL_FOREST_MAP_ID));
    expect(zones.find((zone) => zone.name === "Ember Fen")?.rewards.map((reward) => reward.label)).toEqual(["Max health"]);
    expect(zones.find((zone) => zone.name === "Glass Thicket")?.rewards.map((reward) => reward.label)).toEqual(["Attack speed"]);
    expect(zones.find((zone) => zone.name === "Cinder Quarry")?.rewards.map((reward) => reward.label)).toEqual(["Damage"]);
  });
});
