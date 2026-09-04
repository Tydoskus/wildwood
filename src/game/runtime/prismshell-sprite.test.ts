import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { PRISMSHELL_ATLAS, PRISMSHELL_USED_PAGES, prismshellSpriteFrame } from "./prismshell-sprite";

describe("Prismshell sprite", () => {
  it("loads only the idle and attack sheets and stays within the per-boss budget", () => {
    let bytes = 0;
    let decodedBytes = 0;
    for (const index of PRISMSHELL_USED_PAGES) {
      const page = PRISMSHELL_ATLAS.pages[index];
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
    expect(bytes).toBeLessThan(256 * 1024);
    expect(decodedBytes).toBeLessThan(12 * 1024 * 1024);
  });

  it("preserves its position and size across idle and attack frames", () => {
    const origin = prismshellSpriteFrame(0);
    for (let index = 0; index < 100; index += 1) {
      for (const attack of [undefined, index / 25]) {
        const frame = prismshellSpriteFrame(index / 25, attack);
        expect(frame.drawX).toBe(origin.drawX);
        expect(frame.drawY).toBe(origin.drawY);
        expect(frame.drawWidth).toBe(origin.drawWidth);
        expect(frame.drawHeight).toBe(origin.drawHeight);
        const page = PRISMSHELL_ATLAS.pages[frame.page];
        expect(frame.x + frame.w).toBeLessThanOrEqual(page.width - 2);
        expect(frame.y + frame.h).toBeLessThanOrEqual(page.height - 2);
      }
    }
    expect(prismshellSpriteFrame(PRISMSHELL_ATLAS.animations.idle.durationMs / 1000)).toEqual(origin);
    expect(prismshellSpriteFrame(0, 10)).toEqual(prismshellSpriteFrame(0, 100));
  });
});
