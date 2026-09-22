import { describe, expect, it, vi } from "vitest";
import { paintStaticTile, type StaticTileScene } from "./static-tile-painter";

function treeScene(treeShadowsVisible: boolean): StaticTileScene {
  return {
    tileSize: 640,
    colors: { ground: "#000", path: "#111", pathDetail: "#222" },
    paths: [],
    decor: [{ type: "tree", x: 100, y: 120, s: 1, variant: 0 }],
    treeBounds: [{ x: 0, y: 0, w: 100, h: 100, groundCenter: 50, groundWidth: 40, canopyWidth: 80 }],
    treeShadowsVisible,
    snowPineAspect: 0,
  };
}

function tileContext() {
  const drawImage = vi.fn();
  return {
    drawImage,
    context: {
      fillStyle: "",
      globalAlpha: 1,
      imageSmoothingEnabled: false,
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      drawImage,
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      ellipse: vi.fn(),
      fill: vi.fn(),
    } as unknown as CanvasRenderingContext2D,
  };
}

describe("static tree shadows", () => {
  it("omits the baked shadow when the map disables tree shadows", () => {
    const hidden = tileContext();
    paintStaticTile(hidden.context, treeScene(false), 0, 0, {} as CanvasImageSource);
    expect(hidden.drawImage).not.toHaveBeenCalled();

    const visible = tileContext();
    paintStaticTile(visible.context, treeScene(true), 0, 0, {} as CanvasImageSource);
    expect(visible.drawImage).toHaveBeenCalledTimes(1);
  });

  it("wraps the variant on the sheet this map actually has", () => {
    // The samurai garden's cherry sheet holds four variants while the layout
    // numbers its trees up to fifteen. Wrapping on a hard sixteen looked up
    // nothing for twelve of every sixteen, and those trees stood with no
    // shadow at all.
    const scene = treeScene(true);
    scene.decor = [0, 4, 9, 15].map((variant, index) => ({ type: "tree" as const, x: 100 + index * 40, y: 120, s: 1, variant }));
    const { context, drawImage } = tileContext();
    paintStaticTile(context, scene, 0, 0, {} as CanvasImageSource);
    expect(drawImage).toHaveBeenCalledTimes(4);
  });

  it("skips the shadow rather than throwing when a sheet has not measured yet", () => {
    const scene = treeScene(true);
    scene.treeBounds = [];
    const { context, drawImage } = tileContext();
    paintStaticTile(context, scene, 0, 0, {} as CanvasImageSource);
    expect(drawImage).not.toHaveBeenCalled();
  });
});

describe("crystal tile boundaries", () => {
  it("paints the tall crystal tip in the preceding tile without painting distant crystals", () => {
    const { context } = tileContext();
    const scene = treeScene(false);
    scene.treeBounds = [];
    scene.decor = [
      { type: "skyShard", x: 100, y: scene.tileSize + 90, s: 3, variant: 0 },
      { type: "skyShard", x: 200, y: scene.tileSize + 300, s: 3, variant: 0 },
    ];
    paintStaticTile(context, scene, 0, 0);
    expect(context.moveTo).toHaveBeenCalledWith(100, 628);
    expect(context.moveTo).not.toHaveBeenCalledWith(200, 838);
    expect(context.ellipse).toHaveBeenCalledTimes(1);

    vi.mocked(context.moveTo).mockClear();
    paintStaticTile(context, scene, 0, 1);
    expect(context.moveTo).toHaveBeenCalledWith(100, -12);
    expect(context.moveTo).toHaveBeenCalledWith(200, 198);
  });
});
