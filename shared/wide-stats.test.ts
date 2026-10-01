import { expect, it } from "vitest";
import { F32_STAT_LIMIT, narrowStat, needsWideStats, wideStatsApply } from "./wide-stats";

it("narrows to what an f32 column holds, never Infinity", () => {
  expect(narrowStat(5)).toBe(5);
  expect(narrowStat(1e40)).toBe(F32_STAT_LIMIT);
  expect(narrowStat(Infinity)).toBe(F32_STAT_LIMIT);
  expect(narrowStat(NaN)).toBe(0);
  expect(Number.isFinite(Math.fround(F32_STAT_LIMIT))).toBe(true);
});

it("lays wide values over only the fields that still agree", () => {
  const stats = { maxHp: Math.fround(F32_STAT_LIMIT), damage: 9, armor: Math.fround(F32_STAT_LIMIT), regen: 1 };
  const wide = { maxHp: 1e50, damage: 1e45, armor: 2e40, regen: 1 };
  expect(wideStatsApply(stats, wide)).toEqual({ maxHp: 1e50, damage: 9, armor: 2e40, regen: 1 });
  expect(wideStatsApply(stats, null)).toBe(stats);
  expect(needsWideStats({ maxHp: 1, damage: 4e38, armor: 0, regen: 0 })).toBe(true);
  expect(needsWideStats({ maxHp: 1, damage: 2e38, armor: 0, regen: 0 })).toBe(false);
});
