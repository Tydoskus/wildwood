import { CAMPAIGN_MAPS } from "./campaign-registry";
import { ENEMY_TYPES, type EnemyDefinition } from "./enemy-definitions";
import * as camps from "./enemy-camps";
import * as rules from "./rules";
import designs from "../src/game/map-designs.json";
import { BOSS_DAMAGE_REFERENCE } from "./boss-damage";
import { desertLaneCombatValue, desertLaneRewardValue, desertBossHealthAt, bossHeavyHitAt, bossRewardValue, type ForestProgressionLane, type RewardStat } from "./progression";

// Capture authored values before a client installs a live map snapshot.
const ENEMIES = JSON.parse(JSON.stringify(ENEMY_TYPES)) as Record<string, EnemyDefinition>;
const RULES = { ...rules } as unknown as Record<string, number>;
export function finalCampaignEnemy(lane: ForestProgressionLane) {
  const map = CAMPAIGN_MAPS[CAMPAIGN_MAPS.length - 1], tier = CAMPAIGN_MAPS.length - 2;
  const expected = { ...desertLaneCombatValue(lane, tier), reward: desertLaneRewardValue(lane, tier) };
  const design = (designs.maps as Record<string, { status: string; spawnCamps: camps.SpawnCamp[] }>)[map.id];
  const roster = design?.status === "live" && design.spawnCamps.length ? design.spawnCamps
    : (camps as unknown as Record<string, readonly camps.SpawnCamp[]>)[map.campsKey] ?? [];
  const kinds = new Set(roster.flatMap(camp => camp.types));
  const elite = lane === "Dread Warden" || lane === "King Slime";
  return [...kinds].map(kind => ENEMIES[kind]).find(row => row && row.reward.type === expected.reward.type && Boolean(row.elite) === elite) ?? expected;
}
export function finalCampaignBoss() {
  const map = CAMPAIGN_MAPS[CAMPAIGN_MAPS.length - 1], tier = CAMPAIGN_MAPS.length - 2;
  return {
    hp: RULES[`${map.bossArt}_MAX_HP`] ?? desertBossHealthAt(tier),
    damage: (BOSS_DAMAGE_REFERENCE as Record<string, number>)[map.bossKind] ?? bossHeavyHitAt(tier),
    reward: (stat: RewardStat) => RULES[`${map.bossArt}_REWARD_${stat.toUpperCase()}`] ?? bossRewardValue(stat, tier),
  };
}
