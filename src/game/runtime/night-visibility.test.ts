import { describe, expect, it } from "vitest";
import { NIGHT_ENEMY_FULL_VISIBILITY_RANGE, NIGHT_ENEMY_REVEAL_RANGE, nightEnemyOpacity } from "./night-visibility";

describe("Night Forest visibility", () => {
  it("reveals enemies only as they approach attack range", () => {
    const attackRange = 200;
    const radius = 20;
    expect(nightEnemyOpacity(attackRange * NIGHT_ENEMY_REVEAL_RANGE + radius, attackRange, radius)).toBe(0);
    expect(nightEnemyOpacity(attackRange * NIGHT_ENEMY_FULL_VISIBILITY_RANGE + radius, attackRange, radius)).toBe(1);
    expect(nightEnemyOpacity(227, attackRange, radius)).toBeCloseTo(.5);
    expect(nightEnemyOpacity(100, attackRange, radius)).toBe(1);
  });
});
