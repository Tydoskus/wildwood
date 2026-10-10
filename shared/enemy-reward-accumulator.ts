import { applyEnemyRewards } from "./enemy-defeats";
import type { PlayerPowerStats } from "./player-power";
import type { AttackCapArg } from "./stat-rating";

export type EnemyStatReward = { type: string; amount: number; count: number };

/** Preview a claim with its own rewards, then commit only the validated count.
 * Reward order, stat caps and attack-speed rounding stay identical to replaying
 * the whole accepted prefix. A clipped preview never leaks into the next entry.
 */
export function createEnemyRewardAccumulator<T extends PlayerPowerStats>(base: T, multiplier: number, minInterval: AttackCapArg) {
  let current = base;
  let pending: { reward: EnemyStatReward; progress: T } | undefined;
  function preview(reward: EnemyStatReward) {
    const progress = applyEnemyRewards(current, [reward], multiplier, minInterval);
    pending = { reward: { ...reward }, progress };
    return progress;
  }
  return {
    preview,
    commit(reward: EnemyStatReward) {
      if (reward.count > 0) {
        current = pending && pending.reward.type === reward.type && pending.reward.amount === reward.amount
          && pending.reward.count === reward.count ? pending.progress : preview(reward);
      }
      pending = undefined;
    },
    current: () => current,
  };
}
