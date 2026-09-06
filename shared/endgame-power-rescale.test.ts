import { describe, expect, it } from "vitest";
import { rescaleEndgameProgress, rescaleRankingConflict, rescaleRankingStats } from "./endgame-power-rescale";

describe("one-time endgame power conversion", () => {
  it("preserves early progression, build proportions, speed, and unlocks", () => {
    const starter = { damage: 4, maxHp: 100, armor: 0, regen: 0, attackRate: 1.56 };
    expect(rescaleEndgameProgress(starter)).toBe(starter);
    const veteran = { ...starter, damage: 1e8, maxHp: 2e8, armor: 1e6, regen: 2e6, duskfallOrchardUnlocked: true };
    const next = rescaleEndgameProgress(veteran);
    for (const key of ["damage", "maxHp", "armor", "regen"] as const) {
      expect(next[key] / veteran[key]).toBeCloseTo(next.damage / veteran.damage, 7);
    }
    expect(next.damage).toBeLessThan(veteran.damage);
    expect(next.attackRate).toBe(veteran.attackRate);
    expect(next.duskfallOrchardUnlocked).toBe(true);
  });

  it("detects lost ties and ranking reversals after leaderboard storage rounding", () => {
    const first = { damage: 4, maxHp: 100, armor: 0, regen: 0, attackRate: 1.56 };
    const second = { ...first, maxHp: 101 };
    expect(rescaleRankingConflict([
      { before: rescaleRankingStats(first), after: rescaleRankingStats(first) },
      { before: rescaleRankingStats(second), after: rescaleRankingStats(first) },
    ])).toBe("power");
    const a = { power: 100, damage: 10, maxHp: 100, armor: 0, regen: 0 };
    const b = { ...a, power: 200, damage: 20 };
    expect(rescaleRankingConflict([
      { before: a, after: a }, { before: b, after: { ...b, damage: 5 } },
    ])).toBe("damage");
  });
});
