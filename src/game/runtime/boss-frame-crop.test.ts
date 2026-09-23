import { describe, expect, it, vi } from "vitest";
import { drawBossSheetFrame } from "./boss-frame-crop";

function recorder() {
  const calls: number[][] = [];
  const ctx = { drawImage: vi.fn((_sheet: unknown, ...rest: number[]) => { calls.push(rest); }) };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const sheet = {} as CanvasImageSource;

describe("boss frame crops", () => {
  it("draws an uncorrected frame exactly as the plain call did", () => {
    // The renderer's old line was drawImage(canvas, frame * cellW, 0, cellW,
    // canvas.height, -drawW / 2, -drawH / 2, drawW, drawH). Nothing about that
    // may change for a boss nobody has touched.
    const { ctx, calls } = recorder();
    drawBossSheetFrame(ctx, sheet, {
      bossId: "NOBODY", frame: 2, cellWidth: 300, cellHeight: 500, drawWidth: 470, drawHeight: 532,
    });
    expect(calls).toEqual([[600, 0, 300, 500, -235, -266, 470, 532]]);
  });

  it("reads a two-row sheet by column and row", () => {
    const { ctx, calls } = recorder();
    drawBossSheetFrame(ctx, sheet, {
      bossId: "NOBODY", frame: 3, cellWidth: 200, cellHeight: 400, columns: 2, drawWidth: 430, drawHeight: 430,
    });
    expect(calls[0].slice(0, 4)).toEqual([200, 400, 200, 400]);
  });
});
