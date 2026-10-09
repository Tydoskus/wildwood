import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OX_SCALE, OX_SPRITE_SOURCE } from "./ox-sprite";
import { PLAYER_WORLD_SCALE } from "../player-render-scale";
import { EXPANSION_HEAD_FRAME } from "../player-head-template";

describe("Ox's sprite", () => {
  it("ships one front-facing frame that stands a little taller than a player", () => {
    const webp = readFileSync(new URL(`../../../public/${OX_SPRITE_SOURCE}`, import.meta.url));
    // VP8L (lossless) header: 14-bit width and height minus one, after the signature byte.
    const chunk = webp.indexOf("VP8L");
    const bits = webp.readUInt32LE(chunk + 9);
    const width = (bits & 0x3fff) + 1, height = ((bits >> 14) & 0x3fff) + 1;
    expect(width).toBeLessThan(height);
    const playerHeight = (171 - EXPANSION_HEAD_FRAME.y) * PLAYER_WORLD_SCALE;
    expect(height * OX_SCALE).toBeGreaterThan(playerHeight);
    expect(height * OX_SCALE).toBeLessThan(playerHeight * 1.25);
  });
});
