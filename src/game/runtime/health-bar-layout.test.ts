import { describe, expect, it } from "vitest";
import { WORLD_HEALTH_BAR_HEIGHT } from "./game-settings";
import { HEALTH_BAR_TEXT_OPTICAL_OFFSET_Y, healthBarTextY } from "./health-bar-layout";

describe("healthBarTextY", () => {
  it("keeps player and regular-enemy bars at the compact 13px height", () => {
    expect(WORLD_HEALTH_BAR_HEIGHT).toBe(13);
  });

  it("centers floating HP digits on the geometric midpoint", () => {
    expect(HEALTH_BAR_TEXT_OPTICAL_OFFSET_Y).toBe(0);
    expect(healthBarTextY(10, 16)).toBe(18);
  });

  it("keeps odd-height bars on a whole canvas pixel", () => {
    expect(healthBarTextY(10, 15)).toBe(18);
  });
});
