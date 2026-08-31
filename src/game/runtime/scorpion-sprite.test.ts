import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SCORPION_SPRITE, scorpionSpriteFrame } from "./scorpion-sprite";

const sheet = readFileSync(new URL(`../../../public/${SCORPION_SPRITE.source}`, import.meta.url));
const width = sheet.readUInt32BE(16);
const height = sheet.readUInt32BE(20);

describe("desert scorpion sprite", () => {
  it("uses a four-frame strip matching the Dragon and Frostclaw layout", () => {
    expect(sheet.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    expect(width % SCORPION_SPRITE.frames).toBe(0);
    expect(width / height).toBe(3);
    expect(SCORPION_SPRITE.frames).toBe(4);
  });

  it("loops through all four cells without selecting a second row or crossing cell boundaries", () => {
    for (let step = 0; step < 12; step += 1) {
      const frame = scorpionSpriteFrame(step / SCORPION_SPRITE.framesPerSecond, width, height);
      expect(frame.sourceX).toBe(step % 4 * width / 4);
      expect(frame.sourceY).toBe(0);
      expect(frame.sourceWidth).toBe(width / 4);
      expect(frame.sourceHeight).toBe(height);
      expect(frame.sourceX + frame.sourceWidth).toBeLessThanOrEqual(width);
    }
  });

  it("preserves frame proportions and the existing desert-boss ground anchor", () => {
    const frame = scorpionSpriteFrame(0, width, height);
    expect(frame.drawWidth / frame.drawHeight).toBeCloseTo(frame.sourceWidth / frame.sourceHeight);
    expect(frame.drawHeight).toBe(440);
    expect(frame.topOffset + frame.drawHeight * SCORPION_SPRITE.groundBaseline).toBeCloseTo(55);
  });
});
