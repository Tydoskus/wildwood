import { describe, expect, it } from "vitest";
import { textSpriteLayout } from "./canvas";

describe("textSpriteLayout", () => {
  it("rejects WebKit zero ascent and falls back to the font box", () => {
    const layout = textSpriteLayout({
      width: 34.2,
      actualBoundingBoxAscent: 0,
      actualBoundingBoxDescent: 0,
      fontBoundingBoxAscent: 9.1,
    }, 11, 2);

    expect(layout.ascent).toBe(10);
    expect(layout.descent).toBe(0);
    expect(layout.textWidth).toBe(35);
  });

  it("uses a conservative font-size fallback when bounding metrics are unavailable", () => {
    const layout = textSpriteLayout({ width: 20 }, 10, null);

    expect(layout.ascent).toBe(8);
    expect(layout.descent).toBe(2);
  });

  it("reserves glyph bleed in addition to outline width", () => {
    const layout = textSpriteLayout({
      width: 20,
      actualBoundingBoxAscent: 7,
      actualBoundingBoxDescent: 2,
    }, 11, 4);

    expect(layout.padding).toBe(5);
    expect(layout.logicalWidth).toBe(30);
    expect(layout.logicalHeight).toBe(19);
  });
});
