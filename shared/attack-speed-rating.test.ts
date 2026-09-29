import { describe, expect, it } from "vitest";
import { addSpeedRating, attacksPerSecondFromSpeed, speedFromAttacksPerSecond } from "./attack-speed-rating";
import { DEFAULT_ATTACK_INTERVAL } from "./rules";
import { applyEnemyRewards } from "./enemy-defeats";

describe("Speed rating", () => {
  it("starts at a new run's rate and closes a fifth of the gap to 3/s every 10x", () => {
    const start = 1 / DEFAULT_ATTACK_INTERVAL, gap = 3 - start;
    expect(attacksPerSecondFromSpeed(0)).toBeCloseTo(start);
    expect(attacksPerSecondFromSpeed(9)).toBeCloseTo(3 - gap * .8);
    expect(attacksPerSecondFromSpeed(999)).toBeCloseTo(3 - gap * .8 ** 3);
    expect(attacksPerSecondFromSpeed(1e36)).toBeLessThan(3);
  });

  it("reads the rating back from a stored interval, and adds points to it", () => {
    for (const speed of [0, .5, 9, 1_234, 1e20]) {
      expect(speedFromAttacksPerSecond(attacksPerSecondFromSpeed(speed)) / Math.max(1, speed)).toBeCloseTo(speed / Math.max(1, speed), 4);
    }
    let interval = DEFAULT_ATTACK_INTERVAL;
    for (let kill = 0; kill < 9; kill++) interval = addSpeedRating(interval, 1);
    expect(1 / interval).toBeCloseTo(attacksPerSecondFromSpeed(9));
  });

  it("is what the server pays only on a map that says so", () => {
    const base = { damage: 1, maxHp: 1, attackRate: DEFAULT_ATTACK_INTERVAL, armor: 0, regen: 0 };
    const speed = [{ type: "speed", amount: 3, count: 3 }];
    expect(1 / applyEnemyRewards(base, speed, 1, true).attackRate).toBeCloseTo(attacksPerSecondFromSpeed(9));
    expect(1 / applyEnemyRewards(base, speed, 1).attackRate).toBeCloseTo(3);   // 9 attacks a second, held at the cap
  });
});
