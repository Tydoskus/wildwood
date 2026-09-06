import { describe, expect, it, vi } from "vitest";
import { drawBossAtlasFrame } from "./boss-atlas-drawing";
import { DREADREAPER_ATLAS, dreadreaperSpriteFrame } from "./dreadreaper-sprite";
import { IRONHORN_ATLAS } from "./ironhorn-sprite";

describe("boss atlas drawing", () => {
  it("crops transparent padding without moving any source pixel on screen", () => {
    const drawImage = vi.fn();
    const ctx = { drawImage } as unknown as CanvasRenderingContext2D;
    const page = {} as HTMLImageElement;
    const frame = dreadreaperSpriteFrame(0, .5);
    drawBossAtlasFrame(ctx, page, frame);
    const [, sx, sy, sw, sh, dx, dy, dw, dh] = drawImage.mock.calls[0];
    const scaleX = frame.drawWidth / frame.w, scaleY = frame.drawHeight / frame.h;
    expect(dx - (sx - frame.x) * scaleX).toBeCloseTo(frame.drawX);
    expect(dy - (sy - frame.y) * scaleY).toBeCloseTo(frame.drawY);
    expect(dw / sw).toBeCloseTo(scaleX);
    expect(dh / sh).toBeCloseTo(scaleY);
    expect(ctx.imageSmoothingQuality).toBe("low");
  });

  it.each([["Reaper", DREADREAPER_ATLAS, .75], ["Ironhorn", IRONHORN_ATLAS, .6]] as const)(
    "%s avoids processing most of its transparent frame area", (_name, atlas, minimumSaving) => {
      const frames = [...atlas.animations.idle.frames, ...atlas.animations.attack.frames];
      let before = 0, after = 0;
      for (const frame of frames) {
        const bounds = frame.contentBounds!;
        expect(bounds).toBeDefined();
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.y).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.w).toBeLessThanOrEqual(frame.w);
        expect(bounds.y + bounds.h).toBeLessThanOrEqual(frame.h);
        before += frame.w * frame.h;
        after += bounds.w * bounds.h;
      }
      expect(1 - after / before).toBeGreaterThan(minimumSaving);
    },
  );

  it("keeps uncropped sprites supported and skips empty frames", () => {
    const drawImage = vi.fn();
    const ctx = { drawImage } as unknown as CanvasRenderingContext2D;
    const page = {} as HTMLImageElement;
    const frame = { x: 2, y: 2, w: 20, h: 20, drawX: -10, drawY: -20, drawWidth: 40, drawHeight: 40 };
    drawBossAtlasFrame(ctx, page, frame);
    expect(drawImage).toHaveBeenCalledWith(page, 2, 2, 20, 20, -10, -20, 40, 40);
    drawBossAtlasFrame(ctx, page, { ...frame, contentBounds: { x: 0, y: 0, w: 0, h: 0 } });
    expect(drawImage).toHaveBeenCalledTimes(1);
  });
});
