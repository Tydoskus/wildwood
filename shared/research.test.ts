import { describe, expect, it } from "vitest";
import { researchDurationMs } from "./research";

describe("research timer curve", () => {
  it("grows each research by forty percent from its own starting timer", () => {
    expect(researchDurationMs("foraging", 0)).toBe(15_000);
    expect(researchDurationMs("foraging", 1)).toBe(21_000);
    expect(researchDurationMs("criticalChance", 0)).toBeGreaterThan(researchDurationMs("vitality", 4));
    expect(researchDurationMs("criticalChance", 50)).toBe(72 * 60 * 60 * 1_000);
  });
});
