import { describe, expect, it } from "vitest";
import { mapVisualTheme } from "./map-design";
import { createWorldLayout, TUTORIAL_FOREST_MAP_ID } from "./world";

describe("map editor game integration", () => {
  it("keeps the authored map palette available to every renderer", () => {
    const theme = mapVisualTheme(TUTORIAL_FOREST_MAP_ID);
    expect(theme.ground).toMatch(/^(?:#|rgb|hsl)/i);
    expect(theme.path).toMatch(/^(?:#|rgb|hsl)/i);
    expect(theme.pathDetail).toMatch(/^(?:#|rgb|hsl)/i);
    expect(theme.decorColors.grass).toHaveLength(2);
    expect(theme.decorColors.grass?.every((color) => /^(?:#|rgb|hsl)/i.test(color))).toBe(true);
  });

  it("builds a stable tutorial layout so editor coordinates round-trip", () => {
    const spawn = { x: 360, y: 360 };
    expect(createWorldLayout(spawn, TUTORIAL_FOREST_MAP_ID)).toEqual(
      createWorldLayout(spawn, TUTORIAL_FOREST_MAP_ID),
    );
  });
});
