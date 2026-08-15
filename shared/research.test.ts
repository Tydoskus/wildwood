import { describe, expect, it } from "vitest";
import { RESEARCH_DEFINITIONS, researchDurationMs } from "./research";

describe("research timer curve", () => {
  it("grows each research by forty percent from its own starting timer", () => {
    expect(researchDurationMs("foraging", 0)).toBe(15_000);
    expect(researchDurationMs("foraging", 1)).toBe(21_000);
    expect(researchDurationMs("moveSpeed", 0)).toBe(30_000);
    expect(researchDurationMs("criticalChance", 0)).toBeGreaterThan(researchDurationMs("vitality", 4));
    expect(researchDurationMs("criticalChance", 50)).toBe(72 * 60 * 60 * 1_000);
  });

  it("uses the former Tier II slot for normal Stat Gain progression", () => {
    expect(RESEARCH_DEFINITIONS.prosperity).toMatchObject({ effect: "STAT GAIN", valuePerRank: 2, maxRank: 5, durationStartMs: 30_000 });
    expect(RESEARCH_DEFINITIONS.criticalChance.prerequisites).toEqual({ prosperity: 5 });
  });
});
