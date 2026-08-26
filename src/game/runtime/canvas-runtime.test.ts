import { describe, expect, it } from "vitest";
import { canvasViewportMetrics, gameplayBottomInset } from "./canvas-runtime";

describe("gameplay canvas bottom inset", () => {
  it("reserves only the toolbar so compact chat overlays the world", () => {
    expect(gameplayBottomInset(64)).toBe(64);
  });
});

describe("gameplay canvas viewport", () => {
  it("computes a bounded high-DPI backing store", () => {
    expect(canvasViewportMetrics(390, 844, 64, 4)).toEqual({
      width: 390,
      height: 780,
      reservedBottom: 64,
      dpr: 3,
      backingWidth: 1170,
      backingHeight: 2340,
    });
  });

  it("returns identical metrics for duplicate resize events", () => {
    const first = canvasViewportMetrics(430, 932, 70, 3);
    expect(canvasViewportMetrics(430, 932, 70, 3)).toEqual(first);
  });
});
