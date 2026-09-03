import { describe, expect, it } from "vitest";
import { alphaBounds, coreManifest } from "./import-enemy-sprite.mjs";

function source() {
  return {
    schemaVersion: 1, name: "test-monster", coordinates: "top-left-pixels", alpha: "straight",
    frameWidth: 64, frameHeight: 64, anchorX: 32, anchorY: 60, pixelsPerUnit: 32, warnings: [],
    pages: ["hit-0.png", "idle-0.png", "attack-0.png", "walk-0.png", "death-0.png"].map((file) => ({ file, width: 136, height: 68 })),
    animations: ["hit", "idle", "attack", "walk", "death"].map((key, page) => ({
      key, loop: key === "idle" || key === "walk", durationMs: 200, frameDurationMs: 100,
      frames: [{ page, x: 2, y: 2, w: 64, h: 64 }, { page, x: 70, y: 2, w: 64, h: 64 }],
    })),
  };
}

describe("enemy sprite promotion", () => {
  it("keeps only core motions, remaps pages and retains anchors/timing without changing the source", () => {
    const original = source();
    const before = structuredClone(original);
    const output = coreManifest(original);
    expect(output.animations.map((clip) => clip.key)).toEqual(["idle", "walk", "attack"]);
    expect(output.pages.map((page) => page.file)).toEqual(["idle-0.webp", "walk-0.webp", "attack-0.webp"]);
    expect(output.sourcePages.map((page) => page.file)).toEqual(["idle-0.png", "walk-0.png", "attack-0.png"]);
    output.animations.forEach((clip, index) => expect(clip.frames.every((frame) => frame.page === index)).toBe(true));
    expect(output.anchorX).toBe(original.anchorX); expect(output.anchorY).toBe(original.anchorY);
    expect(output.animations[0].frameDurationMs).toBe(original.animations[1].frameDurationMs);
    expect(original).toEqual(before);
  });

  it("rejects missing core motions, looping attacks and unsafe paths", () => {
    const missing = source(); missing.animations = missing.animations.filter((clip) => clip.key !== "walk");
    expect(() => coreManifest(missing)).toThrow("Missing walk");
    const looping = source(); looping.animations[2].loop = true;
    expect(() => coreManifest(looping)).toThrow("looping mode");
    const unsafe = source(); unsafe.pages[0].file = "../sheet.png";
    expect(() => coreManifest(unsafe)).toThrow("unsafe");
  });

  it("measures visible pixels relative to each frame, ignoring transparent padding", () => {
    const data = new Uint8Array(12 * 6 * 4);
    data[((1 + 2) * 12 + 1 + 1) * 4 + 3] = 255;
    data[((1 + 0) * 12 + 7 + 2) * 4 + 3] = 1;
    expect(alphaBounds(data, 12, [
      { x: 1, y: 1, w: 4, h: 4 }, { x: 7, y: 1, w: 4, h: 4 },
    ])).toEqual({ left: 1, top: 0, right: 3, bottom: 3 });
  });
});
