export const BOSS_STATUS_HEALTH_FONT_SIZE = 11;
export const BOSS_NAME_FONT_SIZE = BOSS_STATUS_HEALTH_FONT_SIZE * 1.5;
export const BOSS_REWARD_FONT_SIZE = BOSS_STATUS_HEALTH_FONT_SIZE * 1.25;

const BOSS_REWARD_LINE_HEIGHT = 16;
const BOSS_NAME_LINE_GAP = 19;

export function bossStatusLabelOffsets(rewardCount: number, rewardBottomOffsetY = -4) {
  const rewards = Array.from(
    { length: rewardCount },
    (_, index) => rewardBottomOffsetY - (rewardCount - 1 - index) * BOSS_REWARD_LINE_HEIGHT,
  );
  return {
    name: (rewards[0] ?? rewardBottomOffsetY) - BOSS_NAME_LINE_GAP,
    rewards,
  };
}
