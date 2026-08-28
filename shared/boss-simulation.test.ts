import { describe, expect, it } from "vitest";
import {
  bossSeededUnit,
  seededBossHazardPolar,
} from "./boss-simulation";

describe("deterministic boss simulation", () => {
  it("returns the same addressable sample for the same encounter", () => {
    expect(bossSeededUnit("gloomroot", 12n, "bloom", 3, 7)).toBe(
      bossSeededUnit("gloomroot", 12n, "bloom", 3, 7),
    );
    expect(bossSeededUnit("gloomroot", 12n, "bloom", 3, 7)).not.toBe(
      bossSeededUnit("gloomroot", 13n, "bloom", 3, 7),
    );
  });

  it("keeps centered hazards centered and seeds the surrounding layout", () => {
    const options = {
      kind: "tidewyrm" as const,
      encounter: 21n,
      pattern: "whirlpool",
      patternIndex: 2,
      hazardCount: 11,
      angleJitter: .25,
      minimumRadius: 70,
      maximumRadius: 290,
      centerFirst: true,
    };
    const center = seededBossHazardPolar({ ...options, hazardIndex: 0 });
    const outer = seededBossHazardPolar({ ...options, hazardIndex: 6 });

    expect(center.radius).toBe(0);
    expect(outer.radius).toBeGreaterThanOrEqual(70);
    expect(outer.radius).toBeLessThanOrEqual(290);
    expect(outer).toEqual(seededBossHazardPolar({ ...options, hazardIndex: 6 }));
  });
});
