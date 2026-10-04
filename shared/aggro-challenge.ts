/**
 * Aggro: the second prestige challenge. A run starts over from the forest
 * with no prestige bonuses at all (stat gain, perks, Reflect Only's attack
 * speed), and on every map some camps chase the player from the moment they
 * arrive: one camp on the first run, one more on each run after. A camp is a
 * stat group, every enemy on the map paying one stat, as Autofarm offers them.
 * Dying starts the run over, and Autofarm's own Pull is off during a run. It
 * is won by reaching the player's next regular prestige and pressing
 * Prestige, which hands back the main run; each win lets Pull aggro one more
 * of the player's picked camps at once, up to five.
 */
import { prestigeCampaignComplete, prestigeCampaignTarget } from "./prestige";
import { CAMPAIGN_MAPS } from "./campaign-registry";

export const AGGRO_CHALLENGE_LIMIT = 4;

/**
 * Every run's goal is a first prestige's: the campaign's last boss. It used
 * to be the player's own next prestige, which for a high prestige meant a deep
 * Endless stage (Agnero, prestige 27, 2026-10-04) and showed that stage on the
 * card before a run even started.
 */
export function aggroGoal() {
  const target = prestigeCampaignTarget(1);
  return { label: `Defeat ${target.bossName} (map ${CAMPAIGN_MAPS.indexOf(target) + 1})` };
}
export function aggroGoalMet(bossRewardClaims: number) {
  return prestigeCampaignComplete(bossRewardClaims, 1);
}
export const AGGRO_MAX_PULL_CAMPS = 1 + AGGRO_CHALLENGE_LIMIT;

export type AggroChallenge = { active: boolean; completed: number };

const wins = (challenge: AggroChallenge | null | undefined) =>
  Math.max(0, Math.min(AGGRO_CHALLENGE_LIMIT, Math.floor(Number.isFinite(challenge?.completed) ? challenge!.completed : 0)));

/** Camps that chase the player on every map during a run: one more each run. */
export function aggroForcedCamps(challenge: AggroChallenge | null | undefined) {
  return challenge?.active ? wins(challenge) + 1 : 0;
}

/** How many picked camps (stat groups) Autofarm's Pull aggroes at once: one, and one more per win. */
export function aggroPullCamps(challenge: AggroChallenge | null | undefined) {
  return 1 + wins(challenge);
}

/** Prestige level, perks and challenge rewards count for nothing during a run. */
export function prestigeBonusesOff(challenge: AggroChallenge | null | undefined) {
  return Boolean(challenge?.active);
}

/** Picks `count` different camps at random, a new pick each time a player arrives on a map. */
export function pickForcedCamps(camps: readonly string[], count: number, random: () => number = Math.random) {
  const pool = [...new Set(camps)];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  return pool.slice(0, Math.max(0, count));
}
