import { describe, expect, it } from "vitest";
import {
  RANGED_ENEMY_ATTACK_RANGE_GAP,
  RANGED_ENEMY_PREFERRED_RANGE_INSET,
  rangedEnemyAttackRange,
  rangedEnemyPreferredDistance,
} from "./ranged-enemy-range";

describe("ranged enemy reach", () => {
  it("stays slightly inside the target player's current attack range", () => {
    for (const playerRange of [155, 200, 280, 460, 500]) {
      const enemyRange = rangedEnemyAttackRange(playerRange);
      expect(enemyRange).toBe(playerRange - RANGED_ENEMY_ATTACK_RANGE_GAP);
      expect(enemyRange).toBeLessThan(playerRange);
      expect(rangedEnemyPreferredDistance(playerRange)).toBe(
        enemyRange - RANGED_ENEMY_PREFERRED_RANGE_INSET,
      );
    }
  });

  it("sanitizes invalid or tiny authored player ranges", () => {
    expect(rangedEnemyAttackRange(Number.NaN)).toBe(0);
    expect(rangedEnemyAttackRange(10)).toBe(0);
    expect(rangedEnemyPreferredDistance(10, 42)).toBe(42);
  });
});
