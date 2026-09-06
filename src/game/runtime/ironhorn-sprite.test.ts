import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { IRONHORN_ATLAS, IRONHORN_USED_PAGES, ironhornSpriteFrame } from "./ironhorn-sprite";

describe("Ironhorn sprite", () => {
  it("loads only the idle and attack sheets and stays within the per-boss budget", () => {
    expect(IRONHORN_ATLAS.frameWidth).toBe(512);
    expect(IRONHORN_ATLAS.frameHeight).toBe(512);
    let bytes = 0;
    let decodedBytes = 0;
    for (const index of IRONHORN_USED_PAGES) {
      const page = IRONHORN_ATLAS.pages[index];
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
    const origin = ironhornSpriteFrame(0);
    for (let index = 0; index < 100; index += 1) {
      for (const attack of [undefined, index / 25]) {
        const frame = ironhornSpriteFrame(index / 25, attack);
        expect(frame.drawX).toBe(origin.drawX);
        expect(frame.drawY).toBe(origin.drawY);
        expect(frame.drawWidth).toBe(origin.drawWidth);
        expect(frame.drawHeight).toBe(origin.drawHeight);
        const page = IRONHORN_ATLAS.pages[frame.page];
        expect(frame.x + frame.w).toBeLessThanOrEqual(page.width - 2);
        expect(frame.y + frame.h).toBeLessThanOrEqual(page.height - 2);
      }
    }
    expect(ironhornSpriteFrame(IRONHORN_ATLAS.animations.idle.durationMs / 1000)).toEqual(origin);
    expect(ironhornSpriteFrame(0, 10)).toEqual(ironhornSpriteFrame(0, 100));
  });
});


it("keeps the original capture timing and displayed alignment", () => {
  const atlas = IRONHORN_ATLAS;
  // Recorded from the original full-resolution capture before the 512px export.
  const previousAtlas = {
    "anchorX": 139.95980834960938,
    "frameHeight": 256,
    "bounds": {
      "bottom": 214,
      "top": 74
    },
    "animations": {
      "idle": {
        "frameCount": 16,
        "durationMs": 1333.3333730697632,
        "frameDurationMs": 83.3333358168602
      },
      "attack": {
        "frameCount": 11,
        "durationMs": 916.6666865348817,
        "frameDurationMs": 83.3333351395347
      }
    }
  };
  const previousScale = 340 / (previousAtlas.bounds.bottom - previousAtlas.bounds.top);
  const frame = ironhornSpriteFrame(0);
  expect(Math.abs(frame.drawX - -previousAtlas.anchorX * previousScale)).toBeLessThan(4);
  expect(Math.abs(frame.drawY - (170 - previousAtlas.bounds.bottom * previousScale))).toBeLessThan(4);
  expect(frame.drawHeight).toBeCloseTo(previousAtlas.frameHeight * previousScale, -1);
  for (const motion of ["idle", "attack"] as const) {
    expect(atlas.animations[motion].frames.length).toBe(previousAtlas.animations[motion].frameCount);
    expect(atlas.animations[motion].durationMs).toBe(previousAtlas.animations[motion].durationMs);
    expect(atlas.animations[motion].frameDurationMs).toBe(previousAtlas.animations[motion].frameDurationMs);
  }
});
