import { describe, expect, it } from "vitest";
import { parseHexColor, webGLWorldRequested } from "./webgl-static-world-layer";

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
});
