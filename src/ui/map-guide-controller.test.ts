import { describe, expect, it } from "vitest";
import {
  DARK_METAL_HELMET,
  FROST_ARMOR,
  FROST_BOW,
  FIRE_METAL_BOW,
  FIRE_METAL_HELMET,
  IRON_BOW,
  LAVA_BOW,
  MAGMA_ARMOR,
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
      [MAGMA_ARMOR, 30],
      [FIRE_METAL_HELMET, 50],
      [LAVA_BOW, 25],
    ]);
    expect(mapGuideDrops(INFERNAL_DEPTHS_MAP_ID).map(({ itemId, denominator }) => [itemId, denominator])).toEqual([
      [FIRE_METAL_BOW, 50],
      [DARK_METAL_HELMET, 65],
    ]);
    expect(mapGuideDropChance(25)).toBe("4%");
    expect(mapGuideDropChance(30)).toBe("3.3%");
  });

  it("summarizes the stats players need when evaluating a drop", () => {
    expect(mapGuideItemStats(IRON_BOW)).toEqual(["Damage 1.5×", "Attack Speed 1.1×"]);
    expect(mapGuideItemStats(MAGMA_ARMOR)).toEqual(["Damage 2×", "Max Health 2.25×", "Regen 2.25×"]);
    expect(mapGuideItemStats(FIRE_METAL_HELMET)).toEqual(["Damage 1.25×", "Max Health 1.25×", "Regen 1.5×"]);
    expect(mapGuideItemStats(FIRE_METAL_BOW)).toEqual(["Damage 6×", "Attack Speed 1.3×"]);
    expect(mapGuideItemStats(DARK_METAL_HELMET)).toEqual(["Damage 2.5×", "Max Health 2.5×", "Regen 3×"]);
  });

  it("groups live forest spawns into compact reward zones", () => {
    const zones = mapGuideZones(createSpawnSites({ x: 4_040, y: 4_040 }, TUTORIAL_FOREST_MAP_ID));
    expect(zones.find((zone) => zone.name === "Ember Fen")?.rewards.map((reward) => reward.label)).toEqual(["Max health"]);
    expect(zones.find((zone) => zone.name === "Glass Thicket")?.rewards.map((reward) => reward.label)).toEqual(["Attack speed"]);
    expect(zones.find((zone) => zone.name === "Cinder Quarry")?.rewards.map((reward) => reward.label)).toEqual(["Damage"]);
  });
});
