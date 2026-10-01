import { afterEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { createWebGLStaticWorldLayer, type StaticWorldLayerFrame } from "./webgl-static-world-layer";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function fixture() {
  const { document } = parseHTML('<html><body><canvas id="game"></canvas></body></html>');
  const operations: string[] = [];
  const attributes = new Set<number>();
  let programNumber = 0, textureNumber = 0, currentProgram = 0;
  const gl = new Proxy({
    NO_ERROR: 0, OUT_OF_MEMORY: 0x505,
    createShader: vi.fn(() => ({})),
    getShaderParameter: vi.fn(() => true),
    createProgram: vi.fn(() => ({ index: programNumber++ })),
    getProgramParameter: vi.fn(() => true),
    getAttribLocation: vi.fn((program, name) => program.index === 0 ? 0 : program.index === 1 ? (name === "a_screen_position" ? 1 : 2) : (name === "a_screen_position" ? 3 : 4)),
    getUniformLocation: vi.fn(() => ({})), createBuffer: vi.fn(() => ({})),
    useProgram: vi.fn(program => { currentProgram = program.index; }),
    enableVertexAttribArray: vi.fn(slot => attributes.add(slot)),
    disableVertexAttribArray: vi.fn(slot => attributes.delete(slot)),
    createTexture: vi.fn(() => { const id = ++textureNumber; operations.push(`allocate:${id}`); return { id }; }),
    deleteTexture: vi.fn(texture => operations.push(`release:${texture.id}`)),
    getError: vi.fn(() => 0),
    drawArrays: vi.fn(() => {
      const expected = currentProgram === 0 ? [0] : currentProgram === 1 ? [1, 2] : [3, 4];
      expect([...attributes].sort()).toEqual(expected);
    }),
  } as any, { get: (target, key) => target[key] ??= /^[A-Z_0-9]+$/.test(String(key)) ? 1 : vi.fn() });
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((name: string) => {
    const element = createElement(name);
    if (name === "canvas") Object.assign(element, { getContext: () => gl });
    return element;
  });
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", { location: { search: "" } });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const layer = createWebGLStaticWorldLayer(document.getElementById("game") as HTMLCanvasElement)!;
  expect(layer.prepare()).toBe(true);
  const frame: StaticWorldLayerFrame = {
    backgroundColor: "#123456", width: 400, height: 800, dpr: 1, zoom: 1,
    tiles: [{ key: "old", source: createElement("canvas"), left: 0, top: 0, width: 640, height: 640 }],
  };
  return { layer, frame, gl, document, operations };
}

it("releases the old view before uploading movement tiles and checks only upload frames", () => {
  const f = fixture();
  expect(f.layer.render(f.frame)).toBe(true);
  expect(f.layer.render(f.frame)).toBe(true);
  expect(f.gl.getError).toHaveBeenCalledTimes(1);
  f.frame.tiles = [{ ...f.frame.tiles[0], key: "new", source: f.document.createElement("canvas") }];
  expect(f.layer.render(f.frame)).toBe(true);
  expect(f.operations).toEqual(["allocate:1", "release:1", "allocate:2"]);
  expect(f.gl.getError).toHaveBeenCalledTimes(2);
});

it("requests Canvas fallback immediately when moving triggers a silent GPU allocation error", () => {
  const f = fixture();
  expect(f.layer.render(f.frame)).toBe(true);
  f.frame.tiles = [{ ...f.frame.tiles[0], key: "next" }];
  f.gl.getError.mockReturnValueOnce(f.gl.OUT_OF_MEMORY);
  expect(f.layer.render(f.frame)).toBe(false);
  expect(f.layer.active()).toBe(false);
  expect(f.document.getElementById("gameGpu")!.hidden).toBe(true);
  expect(f.document.documentElement.dataset.worldRenderer).toBe("canvas2d");
  expect(f.layer.render(f.frame)).toBe(false);
  expect(f.gl.createTexture).toHaveBeenCalledTimes(2);
});

it("isolates vertex attributes across terrain, projectiles, particles, and the next frame", () => {
  const f = fixture();
  f.frame.sprites = [{ source: f.document.createElement("canvas"), left: 10, top: 20, width: 10, height: 10 }];
  f.frame.colorQuads = [{ left: 1, top: 2, width: 3, height: 4, color: [1, 1, 1], opacity: .5 }];
  expect(f.layer.render(f.frame)).toBe(true);
  f.frame.sprites = []; f.frame.colorQuads = [];
  expect(f.layer.render(f.frame)).toBe(true);
  expect(f.gl.drawArrays).toHaveBeenCalledTimes(4);
});
