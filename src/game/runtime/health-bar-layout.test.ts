import { describe, expect, it } from "vitest";
import { WORLD_HEALTH_BAR_HEIGHT, WORLD_HEALTH_BAR_RADIUS } from "./game-settings";
import { HEALTH_BAR_TEXT_OPTICAL_OFFSET_Y, healthBarTextY } from "./health-bar-layout";

describe("healthBarTextY", () => {
  it("keeps player and regular-enemy bars at one pill height", () => {
    // 16 read as about twice the old bar once the ends were rounded, because a
    // pill is a heavier shape than the rectangle it replaced.
    expect(WORLD_HEALTH_BAR_HEIGHT).toBe(11);
    // Softened, not pilled: well under half the height.
    expect(WORLD_HEALTH_BAR_RADIUS).toBeLessThan(WORLD_HEALTH_BAR_HEIGHT / 2);
  });

  it("centers floating HP digits on the geometric midpoint", () => {
    expect(HEALTH_BAR_TEXT_OPTICAL_OFFSET_Y).toBe(0);
    expect(healthBarTextY(10, 16)).toBe(18);
  });

  it("centres an odd-height bar exactly, rather than rounding off it", () => {
    // Rounding put the digits half a pixel low, which shows once the bar is
    // short. The canvas is drawn at device-pixel scale, so .5 is a real pixel.
    expect(healthBarTextY(10, 15)).toBe(17.5);
    expect(healthBarTextY(0, 11)).toBe(5.5);
  });
});
