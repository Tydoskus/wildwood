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
import { ENDLESS_REWARD_MULTIPLIER, ENDLESS_STAT_STEP, ENDLESS_ENDURANCE_STEP, ENDLESS_ENDURANCE_EXPONENT, endlessScaling } from './endless-balance';
import { DEFAULT_BALANCE_FACTORS, type BalanceSettings, type MapBalanceSnapshot } from './map-balance-types';
const AUTHORED_RULES = { ...rules };
const AUTHORED_ENEMIES = structuredCloneSafe(ENEMY_TYPES);
function structuredCloneSafe<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
export const BALANCE_MAPS = [
  ['tutorial_forest', '1 · Tutorial Forest', 'DRAGON'], ['beginner_desert', '2 · Desert', 'SPIDER'],
  ['intermediate_snowlands', '3 · Snowlands', 'FROSTCLAW'], ['advanced_lava_wastes', '4 · Lava Wastes', 'MAGMALISK'],
  ['infernal_depths', '5 · Infernal Depths', 'GLOOMROOT'], ['water_reach', '6 · Water Reach', 'TIDEWYRM'],
  ['samurai_garden', '7 · Samurai Garden', 'KOI_SHOGUN'], ['cloudspire', '8 · Cloudspire', 'TEMPEST_KIRIN'],
  ['moonfen', '9 · Moonfen', 'MIREMAW'], ['crystal_hollows', '10 · Crystal Hollows', 'PRISMSHELL'],
  ['clockwork_ruins', '11 · Clockwork Ruins', 'IRONHORN'], ['duskfall_orchard', '12 · Duskfall Orchard', 'DREADREAPER'],
  ['neon_bastion', '13 · Neon Bastion', 'VOLTWARDEN'], ['verdant_catacombs', '14 · Verdant Catacombs', 'GRAVEBLOOM'],
  ['ion_citadel', '15 · Ion Citadel', 'AEGIS_PRIME'], ['endless', 'Endless', ''],
] as const;
export function defaultBalanceSettings(): BalanceSettings {
  return { maps: Object.fromEntries(BALANCE_MAPS.map(([id]) => [id, { ...DEFAULT_BALANCE_FACTORS }])),
    endless: { rewardMultiplier: ENDLESS_REWARD_MULTIPLIER, statStep: ENDLESS_STAT_STEP, enduranceStep: ENDLESS_ENDURANCE_STEP, enduranceExponent: ENDLESS_ENDURANCE_EXPONENT, rewardPerHealth: 1 } };
}
export function validateBalanceSettings(value: unknown): BalanceSettings {
  const input = value as BalanceSettings;
  const result = defaultBalanceSettings();
  for (const [map] of BALANCE_MAPS) for (const field of Object.keys(DEFAULT_BALANCE_FACTORS) as (keyof typeof DEFAULT_BALANCE_FACTORS)[]) {
    const optional = ['enemyRespawn', 'bossRespawn', 'bossRegen', 'enemyDrops'].includes(field);
    const raw = input?.maps?.[map]?.[field];
    const n = raw === undefined && optional ? 1 : raw;
    const min = field === 'bossRegen' || field === 'enemyDrops' ? 0 : .01;
    if (!Number.isFinite(n) || n < min || n > 100 || (field === 'enemySpeed' && n > 3)) throw new Error(`Invalid ${map} ${field} (${min}–${field === 'enemySpeed' ? 3 : 100}).`);
    result.maps[map][field] = n;
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
  const result: MapBalanceSnapshot = { schema: 1, revision, mapId, enemies: {}, lanes: {}, boss: null, rules: {} };
  if (configurationVersion === 2) result.configurationVersion = 2;
  if (!combatMap(mapId)) return result;
  const generated = isProceduralMap(mapId);
  const factors = settings.maps[generated ? 'endless' : mapId];
  const definition = personalBossDefinition(mapId, true)!;
  if (generated) {
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
      result.lanes[lane] = { hp: row.hp * hpRatio * factors.enemyHealth, damage: row.damage * damageRatio * factors.enemyDamage,
        reward: { ...row.reward, amount: row.reward.amount * rewardRatio * factors.enemyRewards } };
    }
    // Generated camps reuse art, but receive these resolved combat values at spawn.
    const art = generatedEnemyArt(mapId);
    result.enemies[art] = { ...AUTHORED_ENEMIES[art], speed: 275 * factors.enemySpeed };
    const boss = generatedBossStats(map, true);
    result.boss = { kind: definition.kind, hp: boss.hp * hpRatio * factors.bossHealth, damage: boss.damage * damageRatio * factors.bossDamage,
      respawnSeconds: definition.respawnSeconds, attacks: {}, rewards: Object.fromEntries(boss.rewards.map(r => [r.type, r.amount * rewardRatio * factors.bossRewards])) };
  } else {
    for (const kind of Object.keys(ENEMY_TYPES) as EnemyKind[]) {
      if (!enemyDefeatDefinition(mapId, kind)) continue;
      const row = AUTHORED_ENEMIES[kind];
      result.enemies[kind] = { ...row, hp: row.hp * factors.enemyHealth, damage: row.damage * factors.enemyDamage,
        speed: row.speed * factors.enemySpeed, reward: { ...row.reward, amount: row.reward.amount * factors.enemyRewards } };
    }
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
    const attacks = BOSS_DAMAGE_PROFILES[definition.kind as keyof typeof BOSS_DAMAGE_PROFILES];
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
