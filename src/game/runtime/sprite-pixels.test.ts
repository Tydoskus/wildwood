import { describe, expect, it } from "vitest";
import { keepLargestFrameComponents, removeGreenPixels } from "./sprite-pixels";

describe("sprite pixel preprocessing", () => {
  it("keys green and removes disconnected bleed from each atlas frame", () => {
    const width = 12;
    const height = 4;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index] = 0;
      pixels[index + 1] = 255;
      pixels[index + 2] = 0;
      pixels[index + 3] = 255;
    }
    const opaque = (x: number, y: number) => {
      const index = (y * width + x) * 4;
      pixels[index] = 240;
      pixels[index + 1] = 245;
      pixels[index + 2] = 250;
    };
    for (const x of [1, 2, 3]) for (const y of [1, 2]) opaque(x, y);
    opaque(5, 0);
    for (const x of [8, 9, 10]) for (const y of [1, 2]) opaque(x, y);
    opaque(6, 3);

    removeGreenPixels(pixels, 145, 1.45);
    keepLargestFrameComponents(pixels, width, height, 2);

    expect(pixels[(0 * width + 5) * 4 + 3]).toBe(0);
    expect(pixels[(3 * width + 6) * 4 + 3]).toBe(0);
    expect(pixels[(1 * width + 2) * 4 + 3]).toBe(255);
    expect(pixels[(2 * width + 9) * 4 + 3]).toBe(255);
  });
});
