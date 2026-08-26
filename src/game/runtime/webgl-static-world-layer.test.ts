import { describe, expect, it } from "vitest";
import { parseHexColor, webGLSpriteBatchVertices, webGLWorldRequested, writeWebGLColorQuadVertices } from "./webgl-static-world-layer";

describe("WebGL static world layer", () => {
  it("is enabled by default with an explicit Canvas compatibility switch", () => {
    expect(webGLWorldRequested("")).toBe(true);
    expect(webGLWorldRequested("?renderer=webgl")).toBe(true);
    expect(webGLWorldRequested("?renderer=canvas")).toBe(false);
  });

  it("converts map ground colors to normalized WebGL channels", () => {
    expect(parseHexColor("#ff8000")).toEqual([1, 128 / 255, 0]);
    expect(parseHexColor("#fff")).toEqual([1, 1, 1]);
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

  it("rotates sprite geometry around its center without changing texture coordinates", () => {
    const vertices = Array.from(webGLSpriteBatchVertices([
      { left: 0, top: 0, width: 20, height: 10, rotation: Math.PI / 2 },
    ], 1));
    expect(vertices).toHaveLength(24);
    expect(vertices.filter((_, index) => index % 4 >= 2)).toEqual([
      0, 0, 1, 0, 0, 1,
      0, 1, 1, 0, 1, 1,
    ]);
    expect(vertices[0]).toBeCloseTo(15);
    expect(vertices[1]).toBeCloseTo(-5);
    expect(vertices[4]).toBeCloseTo(15);
    expect(vertices[5]).toBeCloseTo(15);
    expect(vertices[8]).toBeCloseTo(5);
    expect(vertices[9]).toBeCloseTo(-5);
    expect(vertices[20]).toBeCloseTo(5);
    expect(vertices[21]).toBeCloseTo(15);
  });

  it("writes one colored, opacity-clamped GPU quad with zoom and screen shake", () => {
    const vertices = new Float32Array(36);
    expect(writeWebGLColorQuadVertices([{
      left: 1,
      top: 2,
      width: 3,
      height: 4,
      color: [.25, .5, .75],
      opacity: 2,
    }], vertices, 2, 5, -1)).toBe(36);
    expect(Array.from(vertices)).toEqual([
      7, 3, .25, .5, .75, 1,
      13, 3, .25, .5, .75, 1,
      7, 11, .25, .5, .75, 1,
      7, 11, .25, .5, .75, 1,
      13, 3, .25, .5, .75, 1,
      13, 11, .25, .5, .75, 1,
    ]);
  });
});
