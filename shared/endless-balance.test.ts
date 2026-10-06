import { describe, expect, it } from "vitest";
import { endlessScaling } from "./endless-balance";
import { generatedBossStats, generatedEnemyStats } from "./procedural-maps";

describe("compressed Endless progression", () => {
  it("uses diminishing stat jumps while endurance outpaces rewards", () => {
    expect(endlessScaling(1).stats).toBe(1);
    expect(endlessScaling(2).stats).toBe(1.2);
    expect(endlessScaling(21).stats).toBeCloseTo(1 + .2 * Math.log2(21));
    let previousJump = Infinity, previousCost = 0;
    for (let n = 2; n <= 1000; n++) {
      const prior = endlessScaling(n - 1), current = endlessScaling(n);
      const jump = current.stats - prior.stats;
      expect(jump).toBeGreaterThan(0); expect(jump).toBeLessThan(previousJump);
      expect(current.combatStats).toBeCloseTo(1 + .2 * (n - 1));
      expect(current.rewards - prior.rewards).toBeLessThan(current.stats - prior.stats);
      const cost = current.combatStats * current.endurance / current.rewards;
      expect(cost).toBeGreaterThan(previousCost);
      previousJump = jump; previousCost = cost;
    }
    for (const n of [1, 2, 21, 1000, Number.MAX_SAFE_INTEGER]) {
      const normal = generatedEnemyStats({ number: n }, "Cindermaw");
      const boss = generatedBossStats({ number: n });
      expect(boss.rewards).toEqual([]);
      expect(normal.hp).toBeLessThan(1e36); expect(boss.hp).toBeLessThan(1e36);
      if (n > 1) expect(normal.hp / normal.reward.amount).toBeGreaterThan(generatedEnemyStats({ number: 1 }, "Cindermaw").hp / generatedEnemyStats({ number: 1 }, "Cindermaw").reward.amount);
    }
  });
});
