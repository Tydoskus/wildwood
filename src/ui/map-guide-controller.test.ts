import { regularMapLoot } from "../../shared/regular-map-loot";
import { WATER_ARMOR, SKY_BOW, SAMURAI_HAT, SAMURAI_BOW, CLOUDSPIRE_HELMET, CLOUDSPIRE_BOW, CLOUDSPIRE_ARMOR, MOONFEN_ARMOR } from "../../shared/items";
import { WATER_REACH_MAP_ID, SAMURAI_GARDEN_MAP_ID, CLOUDSPIRE_MAP_ID, MOONFEN_MAP_ID } from "../../shared/rules";
import { BLACK_BOOTS, BLACK_BOOTS_DROP_DENOMINATOR } from "../../shared/items";
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
  NIGHT_FOREST_BOW_ITEM_DROP_DENOMINATOR,
  NIGHT_BOW,
  SNOW_BOW,
  SNOW_ITEM_DROP_DENOMINATOR,
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
      ["basic_paper_hat", 100],
      ["forest_cap", 25],
    ]);
    expect(mapGuideDrops(BEGINNER_DESERT_MAP_ID).map(({ itemId, denominator }) => [itemId, denominator])).toEqual([
      [WOOD_FULL_HELM, 50],
      [IRON_BOW, 50],
      ["desert_armor", 50],
    ]);
    expect(mapGuideDrops(INTERMEDIATE_SNOWLANDS_MAP_ID).map(({ itemId, denominator }) => [itemId, denominator])).toEqual([
      [SNOW_BOW, SNOW_ITEM_DROP_DENOMINATOR],
      ["snow_helmet", 50],
      [FROST_ARMOR, 5],
      [FROST_BOW, 25],
    ]);
    expect(mapGuideDrops(ADVANCED_LAVA_WASTES_MAP_ID).map(({ itemId, denominator }) => [itemId, denominator])).toEqual([
      [MAGMA_ARMOR, LAVA_ITEM_DROP_DENOMINATOR],
      [FIRE_METAL_HELMET, LAVA_HELMET_ITEM_DROP_DENOMINATOR],
      [LAVA_BOW, 25],
    ]);
    expect(mapGuideDrops(INFERNAL_DEPTHS_MAP_ID).map(({ itemId, denominator }) => [itemId, denominator])).toEqual([
      [NIGHT_BOW, NIGHT_FOREST_BOW_ITEM_DROP_DENOMINATOR],
      [FIRE_METAL_BOW, INFERNAL_ITEM_DROP_DENOMINATOR],
      [DARK_METAL_HELMET, NIGHT_FOREST_HELMET_ITEM_DROP_DENOMINATOR],
      [BLACK_BOOTS, BLACK_BOOTS_DROP_DENOMINATOR],
      ["night_armor", 1000],
    ]);
    expect(mapGuideDropChance(25)).toBe("4%");
    expect(mapGuideDropChance(30)).toBe("3.3%");
    const magma = mapGuideDrops(ADVANCED_LAVA_WASTES_MAP_ID).find(drop => drop.itemId === MAGMA_ARMOR)!;
    expect(mapGuideDropChance(magma.denominator, magma.numerator)).toBe("0.70%");
    expect(mapGuideDropChance(LAVA_HELMET_ITEM_DROP_DENOMINATOR)).toBe("0.80%");
    expect(mapGuideDrops(INFERNAL_DEPTHS_MAP_ID).map(drop => mapGuideDropChance(drop.denominator, drop.numerator)))
      .toEqual(["1%", "0.50%", "0.80%", "2%", "0.70%"]);
  });

  it.each([
    [WATER_REACH_MAP_ID, [[WATER_ARMOR, "1%"], [SKY_BOW, "0.70%"], ["water_helmet", "0.80%"]]],
    [SAMURAI_GARDEN_MAP_ID, [[SAMURAI_HAT, "0.80%"], [SAMURAI_BOW, "0.65%"], ["samurai_armor", "0.70%"]]],
    [CLOUDSPIRE_MAP_ID, [[CLOUDSPIRE_HELMET, "0.80%"], [CLOUDSPIRE_BOW, "0.50%"], [CLOUDSPIRE_ARMOR, "0.70%"]]],
    [MOONFEN_MAP_ID, [[MOONFEN_ARMOR, "0.70%"], ["moonfen_bow", "0.50%"], ["moonfen_helmet", "0.80%"]]],
  ] as const)("shows every server drop and its exact chance for %s", (mapId, expected) => {
    const drops = mapGuideDrops(mapId);
    expect(drops.map(drop => [drop.itemId, mapGuideDropChance(drop.denominator, drop.numerator)])).toEqual(expected);
    expect(drops.map(drop => [drop.itemId, drop.numerator, drop.denominator])).toEqual(
      regularMapLoot(mapId).map(drop => [drop.itemId, drop.wins, drop.outcomes]),
    );
  });

  it("summarizes the stats players need when evaluating a drop", () => {
    expect(mapGuideItemStats(IRON_BOW)).toEqual(["Damage +7.5%"]);
    expect(mapGuideItemStats(MAGMA_ARMOR)).toEqual(["Max Health +12.5%"]);
    expect(mapGuideItemStats(FIRE_METAL_HELMET)).toEqual(["Regen +12.5%"]);
    expect(mapGuideItemStats(FIRE_METAL_BOW)).toEqual(["Damage +15%"]);
    expect(mapGuideItemStats(SNOW_BOW)).toEqual(["Damage +8.5%"]);
    expect(mapGuideItemStats(NIGHT_BOW)).toEqual(["Damage +12.75%"]);
    expect(mapGuideItemStats(DARK_METAL_HELMET)).toEqual(["Regen +15%"]);
  });

  it("groups live forest spawns into compact reward zones", () => {
    const zones = mapGuideZones(createSpawnSites({ x: 4_040, y: 4_040 }, TUTORIAL_FOREST_MAP_ID));
    expect(zones.find((zone) => zone.name === "Ember Fen")?.rewards.map((reward) => reward.label)).toEqual(["Max health"]);
    expect(zones.find((zone) => zone.name === "Glass Thicket")?.rewards.map((reward) => reward.label)).toEqual(["Attack speed"]);
    expect(zones.find((zone) => zone.name === "Cinder Quarry")?.rewards.map((reward) => reward.label)).toEqual(["Damage"]);
  });
});
