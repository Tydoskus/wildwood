import { describe, expect, it, vi } from "vitest";
import { bossSheetFrameGeometry } from "./boss-frame-crop";
import { createGloomrootSpriteCache, GLOOMROOT_REBAKE_INTERVAL_MS, GLOOMROOT_SPRITE_FILTER } from "./gloomroot-sprite-cache";

function bakeContext() {
  const gradient = { addColorStop: vi.fn() };
  return {
    filter: "none",
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "low",
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(),
    createRadialGradient: vi.fn(() => gradient),
    fillStyle: "",
    filterAtDraw: [] as string[],
  };
}

function harness() {
  const clock = { now: 0 };
  const bakes: Array<{ canvas: { width: number; height: number }; ctx: ReturnType<typeof bakeContext> }> = [];
  const cache = createGloomrootSpriteCache({
    createCanvas: () => {
      const ctx = bakeContext();
      ctx.drawImage.mockImplementation(() => { ctx.filterAtDraw.push(ctx.filter); });
      const canvas = { width: 0, height: 0, getContext: () => ctx };
      bakes.push({ canvas, ctx });
      return canvas as unknown as HTMLCanvasElement;
    },
    now: () => clock.now,
  });
  const transform = { a: 2, b: 0 };
  const main = {
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low",
    getTransform: () => transform,
    drawImage: vi.fn(),
  };
  const sheet = { width: 800, height: 800 } as unknown as HTMLCanvasElement;
  const frame = (index: number) => ({ bossId: "GLOOMROOT", frame: index, cellWidth: 400, cellHeight: 400, columns: 2, drawWidth: 430, drawHeight: 430 });
  return { cache, clock, bakes, main, ctx: main as unknown as CanvasRenderingContext2D, transform, sheet, frame };
}

describe("gloomroot sprite cache", () => {
  it("bakes each filtered frame once and then only copies it", () => {
    const h = harness();
    for (let tick = 0; tick < 60; tick += 1) expect(h.cache.drawFrame(h.ctx, h.sheet, h.frame(0))).toBe(true);
    expect(h.bakes).toHaveLength(1);
    const bake = h.bakes[0];
    // The same filter string, applied when the sheet cell is drawn, with the game's smoothing.
    expect(bake.ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(bake.ctx.filterAtDraw).toEqual([GLOOMROOT_SPRITE_FILTER]);
    expect(bake.ctx.imageSmoothingEnabled).toBe(false);
    expect(h.main.drawImage).toHaveBeenCalledTimes(60);
    expect(h.main.drawImage.mock.calls[0][0]).toBe(bake.canvas);
  });

  it("draws the bake over the same box the live draw covered, padded for the glow", () => {
    const h = harness();
    h.cache.drawFrame(h.ctx, h.sheet, h.frame(3));
    const geometry = bossSheetFrameGeometry(h.frame(3))!;
    const [, x, y, width, height] = h.main.drawImage.mock.calls[0] as number[];
    const pad = 32 / 2;
    expect(x).toBeCloseTo(geometry.x - pad);
    expect(y).toBeCloseTo(geometry.y - pad);
    expect(width).toBeCloseTo(h.bakes[0].canvas.width / 2);
    expect(height).toBeCloseTo(h.bakes[0].canvas.height / 2);
    expect(h.bakes[0].canvas.width).toBe(Math.ceil(geometry.width * 2) + 64);
    // The bake maps the live draw box to device pixels inside the padding.
    expect(h.bakes[0].ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 32 - geometry.x * 2, 32 - geometry.y * 2);
  });

  it("applies the bloom pulse when drawing instead of baking again", () => {
    const h = harness();
    h.cache.drawFrame(h.ctx, h.sheet, h.frame(3), 1);
    h.cache.drawFrame(h.ctx, h.sheet, h.frame(3), 1.018);
    expect(h.bakes).toHaveLength(1);
    const plain = h.main.drawImage.mock.calls[0] as number[];
    const pulsed = h.main.drawImage.mock.calls[1] as number[];
    expect(pulsed[3]).toBeCloseTo(plain[3] * 1.018);
    expect(pulsed[1]).toBeCloseTo(plain[1] * 1.018);
  });

  it("re-bakes for a new device scale, but not more than once per interval while the zoom eases", () => {
    const h = harness();
    h.cache.drawFrame(h.ctx, h.sheet, h.frame(0));
    h.transform.a = 2.1;
    h.clock.now = 10;
    h.cache.drawFrame(h.ctx, h.sheet, h.frame(0));
    expect(h.bakes[0].ctx.drawImage).toHaveBeenCalledTimes(1);
    h.clock.now = GLOOMROOT_REBAKE_INTERVAL_MS + 1;
    h.cache.drawFrame(h.ctx, h.sheet, h.frame(0));
    // The canvas is reused for the new bake.
    expect(h.bakes).toHaveLength(1);
    expect(h.bakes[0].ctx.drawImage).toHaveBeenCalledTimes(2);
  });

  it("re-bakes when the sheet is replaced, and after a reset while the art is not loaded", () => {
    const h = harness();
    h.cache.drawFrame(h.ctx, h.sheet, h.frame(0));
    h.cache.drawFrame(h.ctx, { width: 1000, height: 1000 } as unknown as HTMLCanvasElement, h.frame(0));
    expect(h.bakes).toHaveLength(2);
    h.cache.reset();
    h.cache.drawFrame(h.ctx, h.sheet, h.frame(0));
    expect(h.bakes).toHaveLength(3);
  });

  it("bakes the aura gradient once", () => {
    const h = harness();
    for (let tick = 0; tick < 10; tick += 1) expect(h.cache.drawAura(h.ctx, 100 + tick, 200)).toBe(true);
    expect(h.bakes).toHaveLength(1);
    expect(h.bakes[0].ctx.createRadialGradient).toHaveBeenCalledTimes(1);
    expect(h.bakes[0].ctx.createRadialGradient).toHaveBeenCalledWith(0, 45, 22, 0, 55, 205);
    const [, x, y, width] = h.main.drawImage.mock.calls[9] as number[];
    expect(x).toBeCloseTo(109 - 205 - .5);
    expect(y).toBeCloseTo(200 + 55 - 205 - .5);
    expect(width).toBeCloseTo((Math.ceil(410 * 2) + 2) / 2);
  });

  it("leaves the live path to the caller when the transform cannot be read", () => {
    const h = harness();
    const bare = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    expect(h.cache.drawFrame(bare, h.sheet, h.frame(0))).toBe(false);
    expect(h.cache.drawAura(bare, 0, 0)).toBe(false);
    expect(h.bakes).toHaveLength(0);
  });
});
