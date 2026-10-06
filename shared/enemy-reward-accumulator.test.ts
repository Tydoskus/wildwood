import { expect, it } from "vitest";
import { createEnemyRewardAccumulator, type EnemyStatReward } from "./enemy-reward-accumulator";
import { applyEnemyRewards } from "./enemy-defeats";
import { MAX_PLAYER_STAT, MAX_ARMOR, MIN_ATTACK_INTERVAL } from "./rules";

it.each([1, 1.23, 5])("matches ordered reward replay with clipping, zero payouts and stat caps (multiplier %s)", multiplier => {
  const base = { damage: MAX_PLAYER_STAT * .8, maxHp: 17.33, regen: .17, armor: MAX_ARMOR * .8, attackRate: .3 };
  const accumulator = createEnemyRewardAccumulator(base, multiplier, MIN_ATTACK_INTERVAL);
  const accepted: EnemyStatReward[] = [];
  for (let i = 0; i < 100; i++) {
    const reward = { type: ["damage", "speed", "health", "armor", "regen"][i % 5],
      amount: i % 5 === 0 ? MAX_PLAYER_STAT * .1 : i % 5 === 3 ? MAX_ARMOR * .1 : .12345, count: 7 };
    expect(accumulator.preview(reward)).toEqual(applyEnemyRewards(base, [...accepted, reward], multiplier, MIN_ATTACK_INTERVAL));
    const count = [7, 2, 0][i % 3];
    accumulator.commit({ ...reward, count });
    if (count) accepted.push({ ...reward, count });
    expect(accumulator.current()).toEqual(applyEnemyRewards(base, accepted, multiplier, MIN_ATTACK_INTERVAL));
  }
  expect(base.attackRate).toBe(.3);
});
