import { describe, expect, it, vi } from "vitest";
import { createWebGLStaticWorldLayer, parseHexColor, webGLSpriteBatchVertices, webGLWorldRequested, writeWebGLColorQuadVertices } from "./webgl-static-world-layer";

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

  it("builds two GPU triangles per sprite with zoom applied", () => {
    expect(Array.from(webGLSpriteBatchVertices([
      { left: 10, top: 20, width: 30, height: 40 },
    ], 2))).toEqual([
      20, 40, 0, 0,
      80, 40, 1, 0,
      20, 120, 0, 1,
      20, 120, 0, 1,
      80, 40, 1, 0,
      80, 120, 1, 1,
    ]);
  });

  it("reuses vertex storage without drawing stale vertices after a batch shrinks", () => {
    const storage = new Float32Array(48);
    const sprite = { left: 2, top: 3, width: 4, height: 5 };
    const full = webGLSpriteBatchVertices([sprite, sprite], 1, storage);
    expect(full.buffer).toBe(storage.buffer);
    expect(full.length).toBe(48);
    const smaller = webGLSpriteBatchVertices([sprite], 2, storage);
    expect(smaller.buffer).toBe(storage.buffer);
    expect(smaller.length).toBe(24);
    expect([...smaller]).toEqual([...webGLSpriteBatchVertices([sprite], 2)]);
    expect(webGLSpriteBatchVertices([], 1, storage).length).toBe(0);
    expect(() => webGLSpriteBatchVertices([sprite], 1, new Float32Array(23))).toThrow(RangeError);
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

  it("writes one colored, opacity-clamped GPU quad with zoom", () => {
    const vertices = new Float32Array(36);
    expect(writeWebGLColorQuadVertices([{
      left: 1,
      top: 2,
      width: 3,
      height: 4,
      color: [.25, .5, .75],
      opacity: 2,
    }], vertices, 2)).toBe(36);
    expect(Array.from(vertices)).toEqual([
      2, 4, .25, .5, .75, 1,
      8, 4, .25, .5, .75, 1,
      2, 12, .25, .5, .75, 1,
      2, 12, .25, .5, .75, 1,
      8, 4, .25, .5, .75, 1,
      8, 12, .25, .5, .75, 1,
    ]);
  });
});

it("hands a lost context's frame to Canvas2D, then rebuilds the layer on a fresh canvas", () => {
  let lost = false;
  // Enough of a WebGL context for the layer: every call succeeds, constants are numbers.
  const gl = new Proxy({}, { get: (_target, key) => key === "isContextLost" ? () => lost
    : key === "getProgramParameter" || key === "getShaderParameter" ? () => true
    : key === "getError" ? () => 0
    : typeof key === "string" && /^[A-Z0-9_]+$/.test(key) ? 1
    : () => ({}) });
  // Just the page the layer touches: canvases it inserts and removes, and the reset event.
  const canvases: { removed: boolean }[] = [];
  const makeCanvas = () => {
    const canvas = { id: "", hidden: false, width: 0, height: 0, style: {}, removed: false, setAttribute() {}, addEventListener() {},
      remove() { canvas.removed = true; }, getContext: (type: string) => type === "webgl" ? gl : null };
    canvases.push(canvas);
    return canvas;
  };
  const resets: string[] = [];
  vi.stubGlobal("document", { createElement: makeCanvas, body: { classList: { add() {}, remove() {} } }, documentElement: { dataset: {} } });
  vi.stubGlobal("window", { location: { search: "" }, dispatchEvent: (event: { detail: string }) => { resets.push(event.detail); return true; } });
  vi.stubGlobal("CustomEvent", class { constructor(public type: string, init: { detail: string }) { Object.assign(this, init); } });
  const layer = createWebGLStaticWorldLayer({ before() {} } as never)!;
  expect(layer.prepare()).toBe(true);
  // Nothing to rebuild while the context holds.
  expect(layer.recover!()).toBe(false);
  lost = true;
  expect(layer.render({ backgroundColor: "#000", width: 10, height: 10, dpr: 1, zoom: 1, tiles: [] })).toBe(false);
  expect(layer.active()).toBe(false);
  expect(resets).toEqual(["lost"]);
  lost = false;
  expect(layer.recover!()).toBe(true);
  expect(layer.active()).toBe(true);
  // The old canvas went with the old context.
  expect(canvases.map(canvas => canvas.removed)).toEqual([true, false]);
  vi.unstubAllGlobals();
});
