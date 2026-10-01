import { describe, expect, it } from "vitest";

describe("High Resolution setting", () => {
  it("lifts the canvas pixel ratio cap from 2 to 3, and only on screens that have it", async () => {
    const { canvasRenderPixelRatio, setHighResolutionCanvas } = await import("./render-budget");
    expect(canvasRenderPixelRatio(3)).toBe(2);
    setHighResolutionCanvas(true);
    try {
      expect(canvasRenderPixelRatio(3)).toBe(3);
      expect(canvasRenderPixelRatio(4)).toBe(3);
      expect(canvasRenderPixelRatio(2)).toBe(2);
      expect(canvasRenderPixelRatio(1)).toBe(1);
    } finally { setHighResolutionCanvas(false); }
    expect(canvasRenderPixelRatio(3)).toBe(2);
  });
});
