import { describe, expect, it, vi } from "vitest";
import { drawScreenSpaceAt } from "./render-space";

describe("drawScreenSpaceAt", () => {
  it("anchors in world space and cancels the outer camera scale", () => {
    const calls: Array<[string, ...number[]]> = [];
    const ctx = {
      save: vi.fn(() => calls.push(["save"])),
      translate: vi.fn((x: number, y: number) => calls.push(["translate", x, y])),
      scale: vi.fn((x: number, y: number) => calls.push(["scale", x, y])),
      restore: vi.fn(() => calls.push(["restore"])),
    } as unknown as CanvasRenderingContext2D;

    drawScreenSpaceAt(ctx, 1.6, 120, 80, () => calls.push(["draw"]));

    expect(calls).toEqual([
      ["save"],
      ["translate", 120, 80],
      ["scale", .625, .625],
      ["draw"],
      ["restore"],
    ]);
  });

  it("falls back to a neutral scale for an invalid zoom", () => {
    const scale = vi.fn();
    const ctx = {
      save: vi.fn(),
      translate: vi.fn(),
      scale,
      restore: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    drawScreenSpaceAt(ctx, 0, 0, 0, () => {});

    expect(scale).toHaveBeenCalledWith(1, 1);
  });
});
