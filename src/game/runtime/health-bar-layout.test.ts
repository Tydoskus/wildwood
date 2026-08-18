import { describe, expect, it } from "vitest";
import { HEALTH_BAR_TEXT_OPTICAL_OFFSET_Y, healthBarTextY } from "./health-bar-layout";

describe("healthBarTextY", () => {
  it("optically centers floating HP digits below the geometric midpoint", () => {
    expect(HEALTH_BAR_TEXT_OPTICAL_OFFSET_Y).toBe(4);
    expect(healthBarTextY(10, 16)).toBe(22);
  });

  it("keeps odd-height bars on a whole canvas pixel", () => {
    expect(healthBarTextY(10, 15)).toBe(22);
  });
});
