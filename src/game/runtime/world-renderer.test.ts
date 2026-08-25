import { describe, expect, it } from "vitest";
import { snapWorldRenderCoordinate } from "./world-renderer";

describe("world render coordinate snapping", () => {
  it("lands live decor and static tiles on the same physical-pixel grid", () => {
    const zoom = .85;
    const devicePixelRatio = 2;
    const snapped = snapWorldRenderCoordinate(13.37, zoom, devicePixelRatio);

    expect(snapped * zoom * devicePixelRatio).toBeCloseTo(Math.round(13.37 * zoom * devicePixelRatio));
  });

  it("falls back to whole world pixels for invalid render scales", () => {
    expect(snapWorldRenderCoordinate(13.37, 0, 2)).toBe(13);
    expect(snapWorldRenderCoordinate(13.72, Number.NaN, 2)).toBe(14);
  });
});
