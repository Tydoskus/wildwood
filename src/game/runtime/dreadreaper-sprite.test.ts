import previousAtlas from "../enemy-atlases/reaper-death.mjs";
import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { DREADREAPER_ATLAS, DREADREAPER_USED_PAGES, dreadreaperSpriteFrame } from "./dreadreaper-sprite";

describe("Dreadreaper sprite", () => {
  it("loads only the idle and attack sheets and stays within the per-boss budget", () => {
    expect(DREADREAPER_ATLAS.frameWidth).toBe(512);
    expect(DREADREAPER_ATLAS.frameHeight).toBe(512);
    let bytes = 0;
    let decodedBytes = 0;
    for (const index of DREADREAPER_USED_PAGES) {
      const page = DREADREAPER_ATLAS.pages[index];
      expect(page.src).not.toContain("walk");
      const file = new URL(`../../../public/${page.src}`, import.meta.url);
      bytes += statSync(file).size;
      const buffer = readFileSync(file);
      expect(buffer.subarray(8, 12).toString()).toBe("WEBP");
      expect(buffer.readUIntLE(24, 3) + 1).toBe(page.width);
      expect(buffer.readUIntLE(27, 3) + 1).toBe(page.height);
      decodedBytes += page.width * page.height * 4;
      expect(Math.max(page.width, page.height)).toBeLessThanOrEqual(2048);
    }
    expect(bytes).toBeLessThan(512 * 1024);
    expect(decodedBytes).toBeLessThan(32 * 1024 * 1024);
  });

  it("preserves its position and size across idle and attack frames", () => {
    const origin = dreadreaperSpriteFrame(0);
    for (let index = 0; index < 100; index += 1) {
      for (const attack of [undefined, index / 25]) {
        const frame = dreadreaperSpriteFrame(index / 25, attack);
        expect(frame.drawX).toBe(origin.drawX);
        expect(frame.drawY).toBe(origin.drawY);
        expect(frame.drawWidth).toBe(origin.drawWidth);
        expect(frame.drawHeight).toBe(origin.drawHeight);
        const page = DREADREAPER_ATLAS.pages[frame.page];
        expect(frame.x + frame.w).toBeLessThanOrEqual(page.width - 2);
        expect(frame.y + frame.h).toBeLessThanOrEqual(page.height - 2);
      }
    }
    expect(dreadreaperSpriteFrame(DREADREAPER_ATLAS.animations.idle.durationMs / 1000)).toEqual(origin);
    expect(dreadreaperSpriteFrame(0, 10)).toEqual(dreadreaperSpriteFrame(0, 100));
  });
});


it("keeps the original capture timing and displayed alignment", () => {
  const atlas = DREADREAPER_ATLAS;
  const previousScale = 340 / (previousAtlas.bounds.bottom - previousAtlas.bounds.top);
  const frame = dreadreaperSpriteFrame(0);
  expect(Math.abs(frame.drawX - -previousAtlas.anchorX * previousScale)).toBeLessThan(4);
  expect(Math.abs(frame.drawY - (170 - previousAtlas.bounds.bottom * previousScale))).toBeLessThan(4);
  expect(frame.drawHeight).toBeCloseTo(previousAtlas.frameHeight * previousScale, -1);
  for (const motion of ["idle", "attack"] as const) {
    expect(atlas.animations[motion].frames.length).toBe(previousAtlas.animations[motion].frames.length);
    expect(atlas.animations[motion].durationMs).toBe(previousAtlas.animations[motion].durationMs);
    expect(atlas.animations[motion].frameDurationMs).toBe(previousAtlas.animations[motion].frameDurationMs);
  }
});
