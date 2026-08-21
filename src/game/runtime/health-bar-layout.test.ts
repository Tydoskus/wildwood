import { describe, expect, it } from "vitest";
import { HEALTH_BAR_TEXT_OPTICAL_OFFSET_Y, healthBarTextY } from "./health-bar-layout";

describe("healthBarTextY", () => {
  it("centers floating HP digits on the geometric midpoint", () => {
    expect(HEALTH_BAR_TEXT_OPTICAL_OFFSET_Y).toBe(0);
    expect(healthBarTextY(10, 16)).toBe(18);
  });

  it("keeps odd-height bars on a whole canvas pixel", () => {
    expect(healthBarTextY(10, 15)).toBe(18);
  });
});
