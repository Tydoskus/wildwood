import { describe, expect, it } from "vitest";
import { snapToDevicePixel } from "./render-controller";

describe("snapToDevicePixel", () => {
  it("keeps shake transforms on physical pixel boundaries", () => {
    expect(snapToDevicePixel(1.26, 2)).toBe(1.5);
    expect(snapToDevicePixel(-1.26, 2)).toBe(-1.5);
    expect(snapToDevicePixel(.2, 3)).toBeCloseTo(1 / 3);
  });

  it("falls back safely for invalid pixel ratios", () => {
    expect(snapToDevicePixel(1.6, Number.NaN)).toBe(2);
    expect(snapToDevicePixel(1.6, 0)).toBe(2);
  });
});
