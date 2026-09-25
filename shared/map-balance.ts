import { applyCampaignRewardFloor } from './campaign-reward-floor';
import { CAMPAIGN_HEALTH_FACTORS } from './campaign-health-curve';
import { CAMPAIGN_PACING_REWARDS } from './campaign-pacing-rewards';
import { LEGACY_ENEMY_REWARDS } from "./legacy-enemy-rewards";
import { BALANCE_BASELINE_VERSION, BAKED_ENEMY_REWARD_FACTORS, BAKED_ENDLESS_DEFAULTS } from "./balance-baseline";
import { bossHeavyHitAt, bossRewardValue } from "./progression";
import { CAMPAIGN_MAPS, CAMPAIGN_ENDPOINT } from "./campaign-registry";
import { regularMapLoot } from './regular-map-loot';
import { bossRegenFractionFor } from './boss-regeneration';
import { REGULAR_ENEMY_RESPAWN_SECONDS } from './rules';
import { generatedEnemyArt } from "./procedural-enemy-art";
import * as rules from './rules';
import { ENEMY_TYPES, type EnemyKind } from './enemy-definitions';
import { enemyDefeatDefinition, combatMap } from './enemy-defeats';
import { personalBossDefinition } from './personal-bosses';
import { generateMap, generatedBossStats, generatedEnemyStats, isProceduralMap } from './procedural-maps';
import { BOSS_DAMAGE_PROFILES } from './boss-damage';
import { endlessScaling } from './endless-balance';
import { DEFAULT_BALANCE_FACTORS, type BalanceSettings, type MapBalanceSnapshot } from './map-balance-types';
const AUTHORED_RULES = { ...rules };
const AUTHORED_ENEMIES = structuredCloneSafe(ENEMY_TYPES);
function structuredCloneSafe<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
export const BALANCE_MAPS: readonly (readonly [string, string, string])[] = [
  ...CAMPAIGN_MAPS.map((map, index) => [map.id, `${index + 1} · ${map.name}`, map.bossArt] as const),
  ['endless', 'Endless', ''],
];
export function defaultBalanceSettings(): BalanceSettings {
  return { baselineVersion: BALANCE_BASELINE_VERSION, campaignHealthVersion: 1, campaignRewardVersion: 1, maps: Object.fromEntries(BALANCE_MAPS.map(([id]) => [id, { ...DEFAULT_BALANCE_FACTORS,
      enemyRewards: id === 'endless' ? 1 / (CAMPAIGN_PACING_REWARDS[CAMPAIGN_ENDPOINT.mapId] ?? 1) : CAMPAIGN_PACING_REWARDS[id] ?? 1 }])),
    endless: { ...BAKED_ENDLESS_DEFAULTS } };
}
export function validateBalanceSettings(value: unknown): BalanceSettings {
  const input = value as BalanceSettings;
  const result = defaultBalanceSettings();
  if (input?.campaignRewardVersion !== undefined && input.campaignRewardVersion !== 1) throw new Error('Unsupported campaign reward floor.');
  if (input?.campaignRewardVersion === 1) result.campaignRewardVersion = 1;
  else delete result.campaignRewardVersion;
  if (input?.campaignHealthVersion !== undefined && input.campaignHealthVersion !== 1) throw new Error('Unsupported campaign health curve.');
  if (input?.campaignHealthVersion === 1) result.campaignHealthVersion = 1;
  else delete result.campaignHealthVersion; // Archived settings keep their original HP.
  if (input?.baselineVersion !== undefined && input.baselineVersion !== BALANCE_BASELINE_VERSION) throw new Error('Unsupported balance baseline.');
  for (const [map] of BALANCE_MAPS) for (const field of Object.keys(DEFAULT_BALANCE_FACTORS) as (keyof typeof DEFAULT_BALANCE_FACTORS)[]) {
    const optional = ['enemyRespawn', 'bossRespawn', 'bossRegen', 'enemyDrops'].includes(field);
    const raw = input?.maps?.[map]?.[field];
    const n = raw === undefined && (optional || input?.maps?.[map] === undefined) ? 1 : raw;
    const baked = field === 'enemyRewards' ? BAKED_ENEMY_REWARD_FACTORS[map] ?? 1 : 1;
    const min = field === 'bossRegen' || field === 'enemyDrops' ? 0 : .01 / (input?.baselineVersion === 2 ? baked : 1);
    if (!Number.isFinite(n) || n < min || n > 100 || (field === 'enemySpeed' && n > 3)) throw new Error(`Invalid ${map} ${field} (${min}–${field === 'enemySpeed' ? 3 : 100}).`);
    // Old revisions use pre-bake multipliers. Convert once; saved/editor settings
    // carry a version so loading them again cannot divide a second time.
    result.maps[map][field] = input?.baselineVersion === 2 ? n : n / baked;
  }
  for (const field of Object.keys(result.endless) as (keyof BalanceSettings['endless'])[]) {
    const stored = input?.endless?.[field];
    // Versions saved before a field existed keep its authored value rather than
    // failing to load; anything actually present is still validated.
    const n = stored === undefined && field === 'rewardPerHealth' ? result.endless[field] : stored;
    const max = field === 'enduranceExponent' ? 6 : field === 'rewardMultiplier' || field === 'rewardPerHealth' ? 10 : 1;
    if (n === undefined || !Number.isFinite(n) || n < .001 || n > max) throw new Error(`Invalid Endless ${field} (0.001–${max}).`);
    result.endless[field] = n;
  }
  return result;
}
/** Resolved numbers cross the wire; apps do not need the current scaling formula. */
export function resolveMapBalance(mapId: string, settings: BalanceSettings, revision: number, configurationVersion: 1 | 2 = 2): MapBalanceSnapshot {
  // Also cover direct callers (Balance Lab and archived settings), not only server saves.
  if (settings.baselineVersion !== BALANCE_BASELINE_VERSION) settings = validateBalanceSettings(settings);
  const result: MapBalanceSnapshot = { schema: 1, enemyDamageVersion: 1, revision, mapId, enemies: {}, lanes: {}, boss: null, rules: {} };
  if (configurationVersion === 2) result.configurationVersion = 2;
  if (!combatMap(mapId)) return result;
  const generated = isProceduralMap(mapId);
  const factors = settings.maps[generated ? 'endless' : mapId];
  const definition = personalBossDefinition(mapId, true)!;
  if (generated) {
    const storedCampaignFactors = settings.maps[CAMPAIGN_ENDPOINT.mapId] ?? DEFAULT_BALANCE_FACTORS;
    const campaignFactors = { ...storedCampaignFactors,
      enemyRewards: storedCampaignFactors.enemyRewards * (BAKED_ENEMY_REWARD_FACTORS[CAMPAIGN_ENDPOINT.mapId] ?? 1) };
    const map = generateMap(mapId), base = endlessScaling(map.number), depth = Math.min(map.number - 1, 1000), tuning = settings.endless;
    const stats = 1 + tuning.statStep * Math.log2(1 + depth);
    const hpRatio = (1 + tuning.statStep * depth) * (1 + tuning.enduranceStep * depth) ** tuning.enduranceExponent / (base.combatStats * base.endurance);
    // Reward per health is pure pacing: the boss is unchanged, so the power
    // needed to beat it is unchanged; only the kills to earn that power move.
    const rewardRatio = tuning.rewardMultiplier * (tuning.rewardPerHealth ?? 1) * Math.sqrt(stats) / base.rewards;
    // Keep the compiled armor compensation; the authored damage multiplier is explicit.
    const damageRatio = (1 + tuning.statStep * depth) / base.combatStats;
    const lanes = new Set([...map.camps.map(c => c.lane), 'Dread Warden' as const]);
    for (const lane of lanes) {
      const row = generatedEnemyStats(map, lane, true);
      result.lanes[lane] = { hp: row.hp * hpRatio * factors.enemyHealth * campaignFactors.enemyHealth, damage: row.damage * damageRatio * factors.enemyDamage * campaignFactors.enemyDamage,
        reward: { ...row.reward, amount: row.reward.amount * rewardRatio * factors.enemyRewards * campaignFactors.enemyRewards } };
    }
    // Generated camps reuse art, but receive these resolved combat values at spawn.
    const art = generatedEnemyArt(mapId);
    result.enemies[art] = { ...AUTHORED_ENEMIES[art],
      reward: { ...AUTHORED_ENEMIES[art].reward, amount: LEGACY_ENEMY_REWARDS[art] ?? AUTHORED_ENEMIES[art].reward.amount },
      speed: 275 * factors.enemySpeed };
    const boss = generatedBossStats(map, true);
    result.boss = { kind: definition.kind, hp: boss.hp * hpRatio * factors.bossHealth * campaignFactors.bossHealth, damage: boss.damage * damageRatio * factors.bossDamage * campaignFactors.bossDamage,
      respawnSeconds: definition.respawnSeconds, attacks: {}, rewards: Object.fromEntries(boss.rewards.map(r => [r.type, r.amount * rewardRatio * factors.bossRewards * campaignFactors.bossRewards])) };
  } else {
    for (const kind of Object.keys(ENEMY_TYPES) as EnemyKind[]) {
      if (!enemyDefeatDefinition(mapId, kind)) continue;
      const row = AUTHORED_ENEMIES[kind];
      result.enemies[kind] = { ...row, hp: row.hp * (settings.campaignHealthVersion === 1
          ? CAMPAIGN_HEALTH_FACTORS[mapId]?.[`${row.elite ? 'elite' : 'regular'}:${row.reward.type}`] ?? 1 : 1) * factors.enemyHealth, damage: row.damage * factors.enemyDamage,
        speed: row.speed * factors.enemySpeed, reward: { ...row.reward, amount: row.reward.amount * factors.enemyRewards } };
    }
    if (settings.campaignRewardVersion === 1) applyCampaignRewardFloor(mapId, settings, result.enemies);
    const prefix = BALANCE_MAPS.find(([id]) => id === mapId)![2];
    const rewardValues: Record<string, number> = {};
    for (const [key, value] of Object.entries(AUTHORED_RULES)) {
      if (typeof value !== 'number') continue;
      if (key === `${prefix}_MAX_HP`) result.rules[key] = value * factors.bossHealth;
      if (key.startsWith(`${prefix}_REWARD_`)) {
        result.rules[key] = value * factors.bossRewards;
        rewardValues[key.slice(`${prefix}_REWARD_`.length).toLowerCase()] = value * factors.bossRewards;
      }
    }
    const campaignIndex = CAMPAIGN_MAPS.findIndex(map => map.id === mapId);
    const attacks = BOSS_DAMAGE_PROFILES[definition.kind as keyof typeof BOSS_DAMAGE_PROFILES]
      ?? { heavy: bossHeavyHitAt(Math.max(0, campaignIndex - 1)) };
    if (!Object.keys(rewardValues).length) {
      for (const stat of ['damage', 'health', 'armor', 'regen'] as const) rewardValues[stat] = bossRewardValue(stat, Math.max(0, campaignIndex - 1)) * factors.bossRewards;
    }
    result.boss = { ...definition, hp: definition.hp * factors.bossHealth, damage: 0,
      attacks: Object.fromEntries(Object.entries(attacks).map(([key, value]) => [key, value * factors.bossDamage])), rewards: rewardValues };
  }
  if (configurationVersion === 2) {
    result.configurationVersion = 2;
    result.regularRespawnSeconds = REGULAR_ENEMY_RESPAWN_SECONDS * (factors.enemyRespawn ?? 1);
    // The base it was scaled from, so a snapshot pinned under an older base
    // can be told apart and re-pinned (see pinMapBalance).
    result.regularRespawnBaseSeconds = REGULAR_ENEMY_RESPAWN_SECONDS;
    result.loot = regularMapLoot(mapId, true).map(drop => (factors.enemyDrops ?? 1) === 1 ? { ...drop } : ({
      itemId: drop.itemId, outcomes: 1_000_000,
      wins: Math.min(1_000_000, Math.round(drop.wins / drop.outcomes * (factors.enemyDrops ?? 1) * 1_000_000)),
    }));
    if (result.boss) {
      result.boss.respawnSeconds *= factors.bossRespawn ?? 1;
      result.boss.regenFraction = bossRegenFractionFor(mapId) * (factors.bossRegen ?? 1);
    }
  }
  for (const n of [result.boss?.hp, result.boss?.damage, ...Object.values(result.boss?.rewards ?? {}), ...Object.values(result.lanes).flatMap(row => [row.hp, row.damage, row.reward.amount])]) {
    if (n !== undefined && (!Number.isFinite(n) || n < 0 || n > 1e36)) throw new Error('Balance exceeds supported stat range.');
  }
  return result;
}
