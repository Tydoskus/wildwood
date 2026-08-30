import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import {
  ADVANCED_LAVA_WASTES_MAP_ID,
  BEGINNER_DESERT_MAP_ID,
  INFERNAL_DEPTHS_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  SAMURAI_GARDEN_MAP_ID,
  TUTORIAL_FOREST_MAP_ID,
  WATER_REACH_MAP_ID,
} from "./world";
import { PORTAL_SWIRL_SOURCE, portalDestinationColor, portalDestinationTextColor } from "./portal-presentation";

describe("portal destination presentation", () => {
  it("uses one shared portal sheet for every destination tint", () => {
    expect(PORTAL_SWIRL_SOURCE).toBe("assets/wildwood/portal-swirl-spritesheet.png");
    expect(existsSync(new URL("../../public/assets/wildwood/portal-swirl-spritesheet.png", import.meta.url))).toBe(true);
    for (const color of ["green", "gold", "red", "black"]) {
      expect(existsSync(new URL(`../../public/assets/wildwood/portal-swirl-spritesheet-${color}.png`, import.meta.url))).toBe(false);
    }
  });

  it("uses matching destination colors for map markers", () => {
    expect(portalDestinationColor(TUTORIAL_FOREST_MAP_ID)).toBe("#61e87c");
    expect(portalDestinationColor(BEGINNER_DESERT_MAP_ID)).toBe("#ffd34d");
    expect(portalDestinationColor(INTERMEDIATE_SNOWLANDS_MAP_ID)).toBe("#8deeff");
    expect(portalDestinationColor(ADVANCED_LAVA_WASTES_MAP_ID)).toBe("#ff6258");
    expect(portalDestinationColor(INFERNAL_DEPTHS_MAP_ID)).toBe("#000000");
    expect(portalDestinationColor(WATER_REACH_MAP_ID)).toBe("#54e3e9");
    expect(portalDestinationColor(SAMURAI_GARDEN_MAP_ID)).toBe("#ff83bd");
  });

  it("uses outlined white text for the Night Forest portal label", () => {
    expect(portalDestinationTextColor(INFERNAL_DEPTHS_MAP_ID)).toBe("#ffffff");
    expect(portalDestinationTextColor(ADVANCED_LAVA_WASTES_MAP_ID)).toBe(portalDestinationColor(ADVANCED_LAVA_WASTES_MAP_ID));
  });
});
