import { CAMPAIGN_MAPS, type CampaignMapDefinition } from "./campaign-registry";
import { MAX_BASE_ATTACKS_PER_SECOND } from "./rules";

export const PRESTIGE_CHALLENGE_LIMIT = 4;
export const PRESTIGE_CHALLENGE_ATTACKS_PER_SECOND = .5;
export type PrestigeChallenge = { active: boolean; completed: number };
export const CHALLENGE_ABSOLUTE_MIN_INTERVAL = 1 / (MAX_BASE_ATTACKS_PER_SECOND + 2);
export function challengeMinimumInterval(challenge: PrestigeChallenge | null | undefined) {
  return 1 / (MAX_BASE_ATTACKS_PER_SECOND + (challenge?.active ? 0 : Math.max(0, Math.min(4, challenge?.completed ?? 0))) * .5);
}
export function challengeAttackInterval(interval: number, challenge: PrestigeChallenge | null | undefined) {
  const count = challenge?.active ? 0 : Math.max(0, Math.min(PRESTIGE_CHALLENGE_LIMIT, challenge?.completed ?? 0));
  return Math.max(challengeMinimumInterval(challenge), 1 / (1 / interval + count * PRESTIGE_CHALLENGE_ATTACKS_PER_SECOND));
}

/**
 * Each Reflect Only win asks for more: the first the campaign's last boss
 * (map 15), then Endless 1, 2 and 3. Prestige's own requirement plays no part.
 */
export function challengeGoal(completed: number, maps: readonly CampaignMapDefinition[] = CAMPAIGN_MAPS) {
  const last = maps[maps.length - 1];
  const endless = Math.max(0, Math.min(PRESTIGE_CHALLENGE_LIMIT - 1, Math.floor(completed)));
  return { endless, claimBit: 2 ** last.claimIndex,
    label: endless ? `Clear Endless ${endless}` : `Defeat ${last.bossName} (map ${maps.length})` };
}
export function challengeGoalMet(completed: number, bossRewardClaims: number, completedEndless: number) {
  const goal = challengeGoal(completed);
  return Boolean((bossRewardClaims >>> 0) & goal.claimBit) && completedEndless >= goal.endless;
}
