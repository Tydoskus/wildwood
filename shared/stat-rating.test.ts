import { describe, expect, it } from "vitest";
import {
  RATING_MAX, addAttackSpeedRating, attackIntervalForRating, attackSpeedLabel, attackSpeedRatingForInterval, attacksPerSecondForRating,
  critBonusLevels, critDamageForLevels, ratingForLevels, ratingLevels, ratingMapWorthKills, ratingRewardPerKill,
} from "./stat-rating";
import { criticalDamage } from "./critical-damage";
import { challengeMinimumInterval } from "./prestige-challenge";
import { DEFAULT_ATTACK_INTERVAL, MAX_BASE_ATTACKS_PER_SECOND as CAP } from "./rules";
import { applyEnemyRewards } from "./enemy-defeats";
import { withSoulStats, withoutSoulStats } from "./soul-dimension";

const START = 1 / DEFAULT_ATTACK_INTERVAL;

describe("stat ratings", () => {
  it("closes 5% of the attack speed gap and 3% of the crit gap a map's worth, never reaching either cap", () => {
    for (const maps of [1, 5, 15, 65]) {
      expect(attacksPerSecondForRating(ratingForLevels(maps))).toBeCloseTo(CAP - (CAP - START) * .95 ** maps, 9);
      expect(critDamageForLevels(maps)).toBeCloseTo(100 - 98.95 * .97 ** maps, 9);
    }
    expect(attacksPerSecondForRating(0)).toBeCloseTo(START, 12);
    expect(attacksPerSecondForRating(1e200)).toBeLessThan(CAP);
  });

  it("pays a map's worth in its map's worth of kills, each map's twice the last", () => {
    let rating = 0;
    for (let map = 1; map <= 20; map++) {
      rating += ratingRewardPerKill(map) * ratingMapWorthKills(map);
      expect(ratingLevels(rating)).toBeCloseTo(map, 9);
    }
    // Farming an old map gets less and less: a second map's worth of map 1 is 0.58 levels, not 1.
    expect(ratingLevels(2 * ratingRewardPerKill(1) * ratingMapWorthKills(1))).toBeCloseTo(Math.log2(3), 9);
  });

  it("reads the rating back from a stored interval under every Reflect Only cap, and adds to it", () => {
    for (const completed of [0, 2, 4]) {
      const cap = challengeMinimumInterval({ active: false, completed });
      for (const rating of [0, 37, 1_234, 1e12]) {
        const interval = attackIntervalForRating(rating, cap);
        expect(attackSpeedRatingForInterval(interval, cap) / Math.max(1, rating)).toBeCloseTo(rating / Math.max(1, rating), 6);
      }
      expect(1 / attackIntervalForRating(0, cap)).toBeCloseTo(START + completed * .5, 9);
    }
    let interval = DEFAULT_ATTACK_INTERVAL;
    for (let kill = 0; kill < 10; kill++) interval = addAttackSpeedRating(interval, 10);
    expect(1 / interval).toBeCloseTo(attacksPerSecondForRating(100), 9);
    expect(attackSpeedRatingForInterval(1 / CAP)).toBe(RATING_MAX);
  });

  it("applies speed and crit rewards as ratings", () => {
    const next = applyEnemyRewards({ damage: 1, maxHp: 1, armor: 0, regen: 0, attackRate: DEFAULT_ATTACK_INTERVAL, critRating: 50 },
      [{ type: "speed", amount: 25, count: 4 }, { type: "crit", amount: 25, count: 2 }], 1);
    expect(1 / next.attackRate).toBeCloseTo(attacksPerSecondForRating(100), 9);
    expect(next.critRating).toBe(100);
  });

  it("adds the soul's attack speed rating to the run's, and takes it back out", () => {
    const run = { damage: 1, maxHp: 1, armor: 0, regen: 0, attackRate: attackIntervalForRating(300) };
    const played = withSoulStats(run, { attackSpeed: 100 });
    expect(attackSpeedRatingForInterval(played.attackRate)).toBeCloseTo(400, 6);
    expect(withoutSoulStats(played, { attackSpeed: 100 }, run.attackRate).attackRate).toBeCloseTo(run.attackRate, 9);
  });

  it("keeps research and Keen Edge worth their old bonus from nothing, a share closer on top of a rating, capped", () => {
    expect(criticalDamage({ researchRank: 20 }).multiplier).toBeCloseTo(2.05, 9);
    expect(criticalDamage({ researchRank: 20, perks: { keenEdge: 5 } }).multiplier).toBeCloseTo(2.65, 9);
    const rated = criticalDamage({ rating: ratingForLevels(10) }).multiplier;
    const withResearch = criticalDamage({ rating: ratingForLevels(10), researchRank: 20 }).multiplier;
    expect(withResearch).toBeCloseTo(critDamageForLevels(10 + critBonusLevels(1)), 9);
    expect(withResearch).toBeGreaterThan(rated);
    expect(criticalDamage({ rating: RATING_MAX }).multiplier).toBe(50);
    expect(criticalDamage({ rating: RATING_MAX, capRank: 5 }).multiplier).toBeLessThanOrEqual(100);
  });

  it("says Max once the rate reads the same as the cap", () => {
    expect(attackSpeedLabel(attacksPerSecondForRating(ratingForLevels(120)), CAP)).toBe("2.63/s (Max)");
    expect(attackSpeedLabel(2.5, CAP)).toBe("2.50/s");
  });
});
