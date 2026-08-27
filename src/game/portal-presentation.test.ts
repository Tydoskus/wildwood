import { describe, expect, it } from "vitest";
import {
  ADVANCED_LAVA_WASTES_MAP_ID,
  BEGINNER_DESERT_MAP_ID,
  INFERNAL_DEPTHS_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  TUTORIAL_FOREST_MAP_ID,
  WATER_REACH_MAP_ID,
} from "./world";
import { PORTAL_SWIRL_SOURCES, portalDestinationColor, portalDestinationTextColor } from "./portal-presentation";

describe("portal destination presentation", () => {
  it("maps each destination to its matching portal swirl", () => {
    expect(PORTAL_SWIRL_SOURCES[TUTORIAL_FOREST_MAP_ID]).toContain("-green.png");
    expect(PORTAL_SWIRL_SOURCES[BEGINNER_DESERT_MAP_ID]).toContain("-gold.png");
    expect(PORTAL_SWIRL_SOURCES[INTERMEDIATE_SNOWLANDS_MAP_ID]).toBe("assets/wildwood/portal-swirl-spritesheet.png");
    expect(PORTAL_SWIRL_SOURCES[ADVANCED_LAVA_WASTES_MAP_ID]).toContain("-red.png");
    expect(PORTAL_SWIRL_SOURCES[INFERNAL_DEPTHS_MAP_ID]).toContain("-black.png");
    expect(PORTAL_SWIRL_SOURCES[WATER_REACH_MAP_ID]).toBe("assets/wildwood/portal-swirl-spritesheet.png");
  });

  it("uses matching destination colors for map markers", () => {
    expect(portalDestinationColor(TUTORIAL_FOREST_MAP_ID)).toBe("#61e87c");
    expect(portalDestinationColor(BEGINNER_DESERT_MAP_ID)).toBe("#ffd34d");
    expect(portalDestinationColor(INTERMEDIATE_SNOWLANDS_MAP_ID)).toBe("#8deeff");
    expect(portalDestinationColor(ADVANCED_LAVA_WASTES_MAP_ID)).toBe("#ff6258");
    expect(portalDestinationColor(INFERNAL_DEPTHS_MAP_ID)).toBe("#625a70");
    expect(portalDestinationColor(WATER_REACH_MAP_ID)).toBe("#54e3e9");
  });

  it("uses outlined white text for the Night Forest portal label", () => {
    expect(portalDestinationTextColor(INFERNAL_DEPTHS_MAP_ID)).toBe("#ffffff");
    expect(portalDestinationTextColor(ADVANCED_LAVA_WASTES_MAP_ID)).toBe(portalDestinationColor(ADVANCED_LAVA_WASTES_MAP_ID));
  });
});
