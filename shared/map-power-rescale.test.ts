import { describe, expect, it } from "vitest";
import { rankPreservingPowerTargets, previewMapPowerRescale } from "./map-power-rescale";

describe("rank-preserving map rescale preview", () => {
  it("compresses incompatible map targets without rank reversals or buffs", () => {
    const entries = [
      { power: 1_194_520_435_008, mapIndex: 9 },
      { power: 145_998, mapIndex: 0 },
      { power: 68_801, mapIndex: 2 },
      { power: 104, mapIndex: 0 },
      { power: 349_746_974_756, mapIndex: 9 },
    ];
    const target = rankPreservingPowerTargets(entries);
    expect(target[3]).toBe(104);
    entries.forEach((entry, i) => {
      expect(target[i]).toBeLessThanOrEqual(entry.power);
      entries.forEach((other, j) => expect(Math.sign(target[i] - target[j])).toBe(Math.sign(entry.power - other.power)));
    });
    expect(target[0]).toBeLessThan(1_000_000_000);
  });

  it("retains ties even when equal-power players have different unlocks", () => {
    const target = rankPreservingPowerTargets([{ power: 100_000, mapIndex: 0 }, { power: 100_000, mapIndex: 3 }]);
    expect(target[0]).toBe(target[1]);
  });

  it("preserves build proportions and leaves speed/unlocks intact", () => {
    const progress = { damage: 10000, maxHp: 20000, armor: 100, regen: 200, attackRate: .4, desertUnlocked: true };
    const { progress: scaled, factor } = previewMapPowerRescale(progress, 100000);
    for (const key of ["damage", "maxHp", "armor", "regen"] as const) expect(scaled[key] / progress[key]).toBeCloseTo(factor, 12);
    expect(scaled.attackRate).toBe(.4);
    expect(scaled.desertUnlocked).toBe(true);
    expect(progress.damage).toBe(10000);
  });
});
