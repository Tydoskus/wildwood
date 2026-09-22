import { describe, expect, it } from "vitest";
import { defaultBalanceSettings, resolveMapBalance } from "../../shared/map-balance";
import { bossRegenFractionFor } from "../../shared/boss-regeneration";
import { ENEMY_TYPES } from "../../shared/enemy-definitions";
import { createEmptyResearchRanks } from "../../shared/research";
import { bossHitsToDefeat } from "../../shared/boss-regeneration";
import { LIVE_BALANCE } from "./live-balance";
import { createMapDefinitions, createSites, simulateExistingPlayer, type ExistingPlayerSimulation } from "./simulator";
import { minimumReadinessKills } from "./kill-budget";

describe("Balance Lab uses the game's resolved balance contract", () => {
  it("matches the captured server settings on every campaign map and Endless lane", () => {
    const before = structuredClone(ENEMY_TYPES);
    for (const map of createMapDefinitions(3, LIVE_BALANCE.settings)) {
      const expected = resolveMapBalance(map.id, LIVE_BALANCE.settings, LIVE_BALANCE.revision);
      expect(map.boss!.hp, map.id).toBe(expected.boss!.hp);
      for (const reward of map.boss!.rewards) expect(reward.amount).toBe(expected.boss!.rewards[reward.type]);
      for (const site of createSites(map)) {
        const actual = site.definition!;
        if (map.id.startsWith("endless_")) {
          expect(Object.values(expected.lanes)).toContainEqual({ hp: actual.hp, damage: actual.damage, reward: actual.reward });
        } else {
          expect(actual).toEqual(expected.enemies[site.type]);
        }
      }
    }
    expect(ENEMY_TYPES).toEqual(before);
  });

  it("applies independent enemy, boss, loot, regeneration, and timer settings", () => {
    const settings = defaultBalanceSettings();
    Object.assign(settings.maps.tutorial_forest, { enemyHealth: 2, enemyRewards: 3, bossHealth: 4,
      bossRewards: .3, bossDamage: 2, enemyRespawn: 2, bossRespawn: 3, bossRegen: 4, enemyDrops: 2 });
    const base = createMapDefinitions()[0];
    const tuned = createMapDefinitions(0, settings)[0];
    expect(tuned.boss!.hp).toBe(base.boss!.hp * 4);
    expect(tuned.boss!.strongestHit).toBe(base.boss!.strongestHit! * 2);
    expect(tuned.boss!.rewards[0].amount).toBe(base.boss!.rewards[0].amount * .3);
    expect(tuned.balance!.regularRespawnSeconds).toBe(40);
    expect(tuned.balance!.boss!.respawnSeconds).toBe(base.balance!.boss!.respawnSeconds * 3);
    expect(tuned.balance!.boss!.regenFraction).toBe(bossRegenFractionFor("tutorial_forest") * 4);
    const drop = tuned.regularDrops[0], original = base.regularDrops[0];
    expect(drop.numerator! / drop.denominator).toBeCloseTo(original.numerator! / original.denominator * 2);
    expect(createSites(tuned)[0].definition!.hp).toBe(createSites(base)[0].definition!.hp * 2);
    expect(createSites(tuned)[0].definition!.reward.amount).toBe(createSites(base)[0].definition!.reward.amount * 3);
  });
});

function ready(mapIndex = 0): ExistingPlayerSimulation {
  return { stats: { damage: 1e30, maxHp: 1e30, armor: 0, regen: 0, attackRate: 1 },
    research: createEmptyResearchRanks(), equipped: { head: "", chest: "", weapon: "" }, ownedItems: [],
    bootsEquipped: false, itemUpgradeLevel: 0, equipmentStrengthMultiplier: 1,
    mapIndex, highestUnlockedMapIndex: mapIndex + 1, bossRewardClaims: 0 };
}
const config = { durationSeconds: 600, trials: 1, requiredClears: 0,
  researchPlan: "off" as const, steadyEquipmentUpgrades: false, strategy: "boss-farm" as const };

it("applies critical research to personal-boss readiness and fight duration", () => {
  const player = ready();
  const hp = createMapDefinitions()[0].boss!.hp;
  player.stats.damage = hp / 10;
  const ordinary = simulateExistingPlayer(config, player).maps[0];
  player.research.criticalChance = 100;
  player.research.criticalDamage = 10;
  const critical = simulateExistingPlayer(config, player).maps[0];
  const savedHits = bossHitsToDefeat(hp, hp / 10, 1) - bossHitsToDefeat(hp, hp / 10 * 1.55, 1);
  expect(ordinary.entryBossTtkSeconds! - critical.entryBossTtkSeconds!).toBeCloseTo(savedHits);
  expect(critical.bossFightSeconds).toBeLessThan(ordinary.bossFightSeconds!);
});

it("uses the configured boss timer during repeated clears", () => {
  const settings = defaultBalanceSettings();
  settings.maps.tutorial_forest.bossRespawn = 3;
  const base = simulateExistingPlayer(config, ready()).maps[0];
  const tuned = simulateExistingPlayer({ ...config, balanceSettings: settings }, ready()).maps[0];
  expect(tuned.repeatBossKills).toBeLessThan(base.repeatBossKills);
  expect(tuned.repeatBossKills).toBeGreaterThan(0);
  expect(createMapDefinitions(1).at(-1)!.balance!.boss!.respawnSeconds).toBe(60);
});

it("keeps readiness kill counts consistent with configured boss healing", () => {
  const input = { bossHp: 10000, hitDamage: 10, damagePerKill: 5, health: 100,
    healthPerKill: 5, bossHitAfterArmor: 50, maxHitShare: .3, firstHitSeconds: .2,
    attackInterval: 1, targetSeconds: 90, regenFraction: .01 };
  const kills = minimumReadinessKills(input).damageKills!;
  const time = (n: number) => .2 + bossHitsToDefeat(10000, 10 + n * 5, 1, .01) - 1;
  expect(time(kills)).toBeLessThanOrEqual(90);
  expect(time(kills - 1)).toBeGreaterThan(90);
});
