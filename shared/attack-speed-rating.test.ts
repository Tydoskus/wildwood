import { describe, expect, it } from "vitest";
import { addSpeedRating, attacksPerSecondFromSpeed, speedFromAttacksPerSecond } from "./attack-speed-rating";
import { DEFAULT_ATTACK_INTERVAL, MAX_BASE_ATTACKS_PER_SECOND as CAP } from "./rules";
import { applyEnemyRewards } from "./enemy-defeats";

describe("Speed rating", () => {
  it("starts at a new run's rate and closes a fifth of the gap to the cap every 10x", () => {
    const start = 1 / DEFAULT_ATTACK_INTERVAL, gap = CAP - start;
    expect(attacksPerSecondFromSpeed(0)).toBeCloseTo(start);
    expect(attacksPerSecondFromSpeed(9)).toBeCloseTo(CAP - gap * .8);
    expect(attacksPerSecondFromSpeed(999)).toBeCloseTo(CAP - gap * .8 ** 3);
    expect(attacksPerSecondFromSpeed(1e36)).toBeLessThan(CAP);
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
    expect(1 / applyEnemyRewards(base, speed, 1).attackRate).toBeCloseTo(CAP);   // 9 attacks a second, held at the cap
  });
});
