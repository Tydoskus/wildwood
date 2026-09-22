import { describe, expect, it } from "vitest";
import { damageAfterArmor } from "./combat";
import { desertLaneCombatValue, desertLaneRewardValue, referenceBuildForMap, ENCOUNTER_PROFILES,
  DESERT_REFERENCE, FOREST_LANE_BASES, desertBossHealthAt, bossHeavyHitAt, MAP_STAT_GROWTH, CAMPAIGN_ENEMY_REWARD_MULTIPLIERS, CURRENT_ROLE_LANES, campaignEnemyRewardMultiplier, regularRewardStatScale } from "./progression";

describe("encounter experience contract", () => {
  it("awards 72 health for a Desert regent", () => {
    expect(desertLaneRewardValue("King Slime", 0)).toEqual({ type: "health", amount: 72 });
  });
  it("awards 36 health for Desert archers and 6 armor for guards", () => {
    expect(desertLaneRewardValue("Bramble", 0)).toEqual({ type: "health", amount: 36 });
    expect(desertLaneRewardValue("Mossback", 0)).toEqual({ type: "armor", amount: 6 });
  });
  it("leaves damage and regen lanes where they were", () => {
    // Only the two stats bosses were outclassing move; the rest of the lap
    // keeps its value, so the comparison between camps stays meaningful.
    expect(regularRewardStatScale("damage")).toBe(1);
    expect(regularRewardStatScale("regen")).toBe(1);
    expect(regularRewardStatScale("speed")).toBe(1);
    expect(regularRewardStatScale("armor")).toBe(3);
    expect(regularRewardStatScale("health")).toBe(2);
  });
  it("awards 6 damage for a Desert raider", () => {
    expect(desertLaneRewardValue("Cindermaw", 0)).toEqual({ type: "damage", amount: 6 });
  });
  it("awards 22 damage for a Desert reaper", () => {
    const reward = desertLaneRewardValue("Dread Warden", 0);
    expect(reward.type).toBe("damage");
    expect(reward.amount).toBeCloseTo(22, 10);
  });
  it("preserves fight length, reward value, and threat across present and future tiers", () => {
    for (let tier = 0; tier <= 15; tier++) {
      const build = referenceBuildForMap(tier);
      for (const lane of Object.keys(ENCOUNTER_PROFILES) as Array<keyof typeof ENCOUNTER_PROFILES>) {
        const enemy = desertLaneCombatValue(lane, tier), reward = desertLaneRewardValue(lane, tier);
        const profile = ENCOUNTER_PROFILES[lane];
        expect(enemy.hp / (build.damage / build.attackInterval)).toBeCloseTo(profile.seconds);
        expect(damageAfterArmor(enemy.damage, build.armor) / build.maxHp).toBeCloseTo(profile.hitShare, 3);
        if (reward.type !== "speed") {
          const next = desertLaneRewardValue(lane, tier + 1);
          if (tier !== 1) expect(next.amount / reward.amount).toBeCloseTo(MAP_STAT_GROWTH * campaignEnemyRewardMultiplier(tier + 1) / campaignEnemyRewardMultiplier(tier), 8);
        }
      }
      expect(desertBossHealthAt(tier) / (build.damage / build.attackInterval * MAP_STAT_GROWTH)).toBeCloseTo(90);
      expect(damageAfterArmor(bossHeavyHitAt(tier), build.armor * MAP_STAT_GROWTH) / (build.maxHp * MAP_STAT_GROWTH)).toBeCloseTo(.25, 3);
    }
  });
  it("increases every campaign enemy role's payout on each subsequent map", () => {
    for (const lane of Object.values(CURRENT_ROLE_LANES)) {
      for (let tier = 1; tier < CAMPAIGN_ENEMY_REWARD_MULTIPLIERS.length; tier++) {
        expect(desertLaneRewardValue(lane, tier).amount, `${lane} entering tier ${tier}`)
          .toBeGreaterThan(desertLaneRewardValue(lane, tier - 1).amount);
      }
    }
  });
  it("isolates tutorial edits from campaign stats", () => {
    const before = desertLaneCombatValue("Bramble", 0);
    const saved = FOREST_LANE_BASES.Bramble.hp;
    try { FOREST_LANE_BASES.Bramble.hp *= 2; expect(desertLaneCombatValue("Bramble", 0)).toEqual(before); }
    finally { FOREST_LANE_BASES.Bramble.hp = saved; }
    expect(referenceBuildForMap(0).damage).toBe(DESERT_REFERENCE.damage);
  });
  it("lets future rosters add enemies without inflating the damage budget", () => {
    const payout = (roster: { raider: number; reaper: number }) =>
      desertLaneRewardValue("Cindermaw", 10, roster).amount * roster.raider +
      desertLaneRewardValue("Dread Warden", 10, roster).amount * roster.reaper;
    expect(payout({ raider: 12, reaper: 14 })).toBeCloseTo(payout({ raider: 6, reaper: 7 }));
    expect(payout({ raider: 20, reaper: 1 })).toBeCloseTo(payout({ raider: 6, reaper: 7 }));
  });
  it("rejects invalid tiers instead of emitting broken content", () => {
    for (const tier of [-1, .5, NaN, Infinity, 61]) expect(() => referenceBuildForMap(tier)).toThrow(RangeError);
  });
});
