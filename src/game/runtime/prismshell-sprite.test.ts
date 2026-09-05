import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PRISMSHELL_ATLAS, PRISMSHELL_USED_PAGES, prismshellSpriteFrame } from "./prismshell-sprite";

describe("Prismshell amethyst sprite", () => {
  it("loads one high-resolution alpha texture within the boss budget", () => {
    expect(PRISMSHELL_USED_PAGES).toEqual([0]);
    const page = PRISMSHELL_ATLAS.pages[0];
    const buffer = readFileSync(new URL(`../../../public/${page.src}`, import.meta.url));
    expect(buffer.subarray(8, 12).toString()).toBe("WEBP");
    expect(buffer.subarray(12, 16).toString()).toBe("VP8X");
    expect(buffer[20] & 0x10).toBe(0x10); // Alpha channel survives web encoding.
    expect(buffer.readUIntLE(24, 3) + 1).toBe(page.width);
    expect(buffer.readUIntLE(27, 3) + 1).toBe(page.height);
    expect(page.height).toBeGreaterThanOrEqual(1024);
    expect(buffer.length).toBeLessThan(512 * 1024);
    expect(page.width * page.height * 4).toBeLessThan(8 * 1024 * 1024);
  });

  it("keeps feet, horizontal center, and health bar anchored while animating", () => {
    const { bounds } = PRISMSHELL_ATLAS;
    for (let index = 0; index < 100; index += 1) {
      for (const attack of [undefined, index / 25]) {
        const frame = prismshellSpriteFrame(index / 25, attack);
        expect(frame.drawY + bounds.bottom * frame.drawHeight / frame.h).toBeCloseTo(170);
        expect(frame.drawX + (bounds.left + bounds.right) / 2 * frame.drawWidth / frame.w).toBeCloseTo(0);
        expect(frame.top).toBe(-170);
        const visibleHeight = (bounds.bottom - bounds.top) * frame.drawHeight / frame.h;
        expect(visibleHeight).toBeGreaterThan(320);
        expect(visibleHeight).toBeLessThan(345);
      }
    }
    expect(prismshellSpriteFrame(0.5).drawHeight).not.toBe(prismshellSpriteFrame(0).drawHeight);
    expect(prismshellSpriteFrame(0, 0.35).drawWidth).toBeGreaterThan(prismshellSpriteFrame(0).drawWidth);
    expect(prismshellSpriteFrame(0, 10)).toEqual(prismshellSpriteFrame(0));
    expect(prismshellSpriteFrame(NaN, Infinity)).toEqual(prismshellSpriteFrame(0));
  });
});
