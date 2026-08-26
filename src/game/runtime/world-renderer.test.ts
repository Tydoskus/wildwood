import { describe, expect, it } from "vitest";
import { snapWorldRenderCoordinate, staticWorldTileRange } from "./world-renderer";

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

  it("warms the visible spawn tiles plus a one-tile movement ring", () => {
    expect(staticWorldTileRange(360, 360, 1_000, 700)).toEqual({
      startX: 0,
      startY: 0,
      endX: 3,
      endY: 2,
    });
  });

  it("clamps the warm tile ring to the world edges", () => {
    expect(staticWorldTileRange(4_500, 4_500, 1_000, 700)).toEqual({
      startX: 6,
      startY: 6,
      endX: 7,
      endY: 7,
    });
  });
});
