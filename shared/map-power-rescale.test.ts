import { describe, expect, it } from "vitest";
import { previewMapPowerRescale } from "./map-power-rescale";

describe("map rescale preview", () => {
  it("preserves build proportions and leaves speed/unlocks intact", () => {
    const progress = { damage: 10000, maxHp: 20000, armor: 100, regen: 200, attackRate: .4, desertUnlocked: true };
    const { progress: scaled, factor } = previewMapPowerRescale(progress, 100000);
    for (const key of ["damage", "maxHp", "armor", "regen"] as const) expect(scaled[key] / progress[key]).toBeCloseTo(factor, 12);
    expect(scaled.attackRate).toBe(.4);
    expect(scaled.desertUnlocked).toBe(true);
    expect(progress.damage).toBe(10000);
  });
});
