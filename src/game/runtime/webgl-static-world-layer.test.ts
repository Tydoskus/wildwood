import { describe, expect, it } from "vitest";
import { parseHexColor, webGLSpriteBatchVertices, webGLWorldRequested } from "./webgl-static-world-layer";

describe("WebGL static world layer", () => {
  it("is enabled by default with an explicit Canvas compatibility switch", () => {
    expect(webGLWorldRequested("")).toBe(true);
    expect(webGLWorldRequested("?renderer=webgl")).toBe(true);
    expect(webGLWorldRequested("?renderer=canvas")).toBe(false);
  });

  it("converts map ground colors to normalized WebGL channels", () => {
    expect(parseHexColor("#ff8000")).toEqual([1, 128 / 255, 0]);
    expect(parseHexColor("not-a-color")).toEqual([0, 0, 0]);
  });

  it("builds two GPU triangles per sprite with zoom and screen shake applied", () => {
    expect(Array.from(webGLSpriteBatchVertices([
      { left: 10, top: 20, width: 30, height: 40 },
    ], 2, 3, -4))).toEqual([
      23, 36, 0, 0,
      83, 36, 1, 0,
      23, 116, 0, 1,
      23, 116, 0, 1,
      83, 36, 1, 0,
      83, 116, 1, 1,
    ]);
  });
});
