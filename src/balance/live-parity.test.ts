import { expect, it } from "vitest";
import { defaultBalanceSettings } from "../../shared/map-balance";
import { createEmptyResearchRanks } from "../../shared/research";
import { bossHitsToDefeat } from "../../shared/boss-regeneration";
import { createMapDefinitions, simulateExistingPlayer, type ExistingPlayerSimulation } from "./simulator";
import { minimumReadinessKills } from "./kill-budget";

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
