import { describe, expect, it } from "vitest";
import { backgroundMask, removeWhiteBackground } from "./profile-icon-alpha.mjs";

/**
 * A small sheet flattened on white, holding each case the real sheets have: an
 * anti-aliased black outline, a shaded white inside an outline, a pocket of
 * backdrop closed off by an outline, a catchlight, a pearl-like highlight, a
 * coloured edge blended into white and paper noise.
 */
function syntheticSheet() {
  const width = 80, height = 80, rgb = new Uint8Array(width * height * 3).fill(255);
  const set = (x: number, y: number, [r, g, b]: number[]) => { const i = (y * width + x) * 3; rgb[i] = r; rgb[i + 1] = g; rgb[i + 2] = b; };
  const fill = (x0: number, y0: number, x1: number, y1: number, colour: number[]) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, colour);
  };
  const ring = (x0: number, y0: number, x1: number, y1: number, inside: number[]) => {
    fill(x0, y0, x1, y1, [0, 0, 0]); fill(x0 + 3, y0 + 3, x1 - 3, y1 - 3, inside);
  };
  ring(10, 10, 30, 30, [240, 238, 232]); // a white shirt: shaded white inside an outline
  for (let y = 10; y <= 30; y++) set(9, y, [128, 128, 128]); // the outline's anti-aliased rim
  ring(40, 10, 64, 34, [255, 255, 255]); // a mug handle's hole: paper white, closed off by outline
  fill(10, 45, 26, 61, [20, 20, 20]); fill(17, 52, 19, 54, [255, 255, 255]); // a dark eye and its catchlight
  fill(40, 45, 60, 65, [235, 225, 205]); fill(47, 52, 52, 57, [255, 255, 255]); // a pearl and its highlight
  fill(66, 60, 76, 76, [200, 30, 30]); for (let y = 60; y <= 76; y++) set(65, y, [228, 143, 143]); // red, half-blended into white at its left edge
  set(2, 2, [250, 250, 250]); set(70, 5, [247, 249, 252]); set(35, 40, [252, 251, 250]); // paper noise
  return { width, height, rgb };
}
const pixel = (rgba: Uint8Array, width: number, x: number, y: number) => Array.from(rgba.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
/** The pixel laid over a backdrop grey level, as a browser draws it. */
const over = ([r, g, b, a]: number[], backdrop: number) => [r, g, b].map(channel => Math.round(channel * a / 255 + backdrop * (1 - a / 255)));

describe("profile sheet transparency", () => {
  const { width, height, rgb } = syntheticSheet();
  const rgba = removeWhiteBackground(rgb, width, height);
  const at = (x: number, y: number) => pixel(rgba, width, x, y);

  it("clears the backdrop and its paper noise", () => {
    for (const [x, y] of [[0, 0], [79, 79], [2, 2], [70, 5], [35, 40], [5, 70]]) expect(at(x, y)[3], `${x},${y}`).toBe(0);
  });

  it("un-blends an outline's rim from white, so it has no pale fringe on black", () => {
    const rim = at(9, 20);
    expect(rim[3]).toBeGreaterThan(110); expect(rim[3]).toBeLessThan(135);
    for (const channel of rim.slice(0, 3)) expect(channel).toBeLessThanOrEqual(2);
    expect(over(rim, 0).every(channel => channel <= 2)).toBe(true);
    for (const channel of over(rim, 255)) expect(Math.abs(channel - 128)).toBeLessThanOrEqual(8);
    expect(at(10, 20)).toEqual([0, 0, 0, 255]);
  });

  it("recovers a coloured edge's own colour", () => {
    const edge = at(65, 68);
    expect(edge[3]).toBeGreaterThan(110); expect(edge[3]).toBeLessThan(135);
    expect(edge[0]).toBeGreaterThan(185); expect(edge[1]).toBeLessThan(45); expect(edge[2]).toBeLessThan(45);
    for (const [channel, original] of over(edge, 255).map((channel, i) => [channel, [228, 143, 143][i]])) expect(Math.abs(channel - original)).toBeLessThanOrEqual(8);
    expect(at(70, 68)).toEqual([200, 30, 30, 255]);
  });

  it("keeps the whites inside a picture opaque and unchanged", () => {
    expect(at(20, 20)).toEqual([240, 238, 232, 255]); // shaded white
    expect(at(18, 53)).toEqual([255, 255, 255, 255]); // catchlight
    expect(at(49, 54)).toEqual([255, 255, 255, 255]); // pearl highlight
  });

  it("clears a pocket of backdrop that an outline closes off", () => {
    expect(at(52, 22)[3]).toBe(0);
    expect(at(40, 22)).toEqual([0, 0, 0, 255]);
    expect(backgroundMask(rgb, width, height)[22 * width + 52]).toBe(1);
    expect(backgroundMask(rgb, width, height, { pockets: false })[22 * width + 52]).toBe(0);
  });

  it("looks exactly as before laid back on white", () => {
    let worst = 0;
    for (let p = 0; p < width * height; p++) {
      const back = over(pixel(rgba, width, p % width, Math.floor(p / width)), 255);
      for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(back[c] - rgb[p * 3 + c]));
    }
    // Only the paper noise (cleared outright) and the rims' noise allowance move, by a few levels.
    expect(worst).toBeLessThanOrEqual(10);
  });
});
