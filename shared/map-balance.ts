import { CAMPAIGN_PROGRESSION_BOSS_HEALTH, CAMPAIGN_PROGRESSION_BOSS_REWARDS } from './campaign-progression';
import { BALANCE_BASELINE_VERSION, BAKED_ENEMY_REWARD_FACTORS, BAKED_ENDLESS_DEFAULTS } from "./balance-baseline";
import { CAMPAIGN_MAPS } from "./campaign-registry";
import { regularMapLoot } from './regular-map-loot';
import { BOSS_REGEN_FRACTION_OVERRIDES, bossRegenFractionFor } from './boss-regeneration';
import { REGULAR_ENEMY_RESPAWN_SECONDS } from './rules';
import { generatedEnemyArt } from "./procedural-enemy-art";
import * as rules from './rules';
import { ENEMY_TYPES, type EnemyKind } from './enemy-definitions';
import { enemyDefeatDefinition, combatMap } from './enemy-defeats';
import { personalBossDefinition } from './personal-bosses';
import { generateMap, isProceduralMap } from './procedural-maps';
import { BOSS_DAMAGE_PROFILES } from './boss-damage';
import { DEFAULT_BALANCE_FACTORS, type BalanceSettings, type MapBalanceSnapshot } from './map-balance-types';
import { BALANCE_CURVE_LIMITS, DEFAULT_BALANCE_CURVE, curveBoss, curveEnemy, type BalanceCurve, type CurveRewardStat } from './balance-curve';
const AUTHORED_RULES = { ...rules };
const AUTHORED_ENEMIES = structuredCloneSafe(ENEMY_TYPES);
function structuredCloneSafe<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
export const BALANCE_MAPS: readonly (readonly [string, string, string])[] = [
  ...CAMPAIGN_MAPS.map((map, index) => [map.id, `${index + 1} · ${map.name}`, map.bossArt] as const),
  ['endless', 'Endless', ''],
];
export function defaultBalanceSettings(): BalanceSettings {
  return { baselineVersion: BALANCE_BASELINE_VERSION, campaignHealthVersion: 1, campaignRewardVersion: 1, campaignProgressionVersion: 1, maps: Object.fromEntries(BALANCE_MAPS.map(([id]) => [id, { ...DEFAULT_BALANCE_FACTORS,
      enemyRewards: 1, bossHealth: CAMPAIGN_PROGRESSION_BOSS_HEALTH[id] ?? 1, bossRewards: CAMPAIGN_PROGRESSION_BOSS_REWARDS[id] ?? 1 }])),
    endless: { ...BAKED_ENDLESS_DEFAULTS } };
}
export function validateBalanceSettings(value: unknown): BalanceSettings {
  const input = value as BalanceSettings;
  const result = defaultBalanceSettings();
  if (input?.campaignProgressionVersion !== undefined && input.campaignProgressionVersion !== 1) throw new Error('Unsupported campaign progression curve.');
  if (input?.campaignProgressionVersion === 1) result.campaignProgressionVersion = 1;
  else delete result.campaignProgressionVersion;
  if (input?.campaignRewardVersion !== undefined && input.campaignRewardVersion !== 1) throw new Error('Unsupported campaign reward floor.');
  if (input?.campaignRewardVersion === 1) result.campaignRewardVersion = 1;
  else delete result.campaignRewardVersion;
  if (input?.campaignHealthVersion !== undefined && input.campaignHealthVersion !== 1) throw new Error('Unsupported campaign health curve.');
  if (input?.campaignHealthVersion === 1) result.campaignHealthVersion = 1;
  else delete result.campaignHealthVersion; // Archived settings keep their original HP.
  if (input?.baselineVersion !== undefined && input.baselineVersion !== BALANCE_BASELINE_VERSION) throw new Error('Unsupported balance baseline.');
  if (input?.curveVersion !== undefined && input.curveVersion !== 1) throw new Error('Unsupported balance curve.');
  if (input?.curveVersion === 1) result.curveVersion = 1;
  // Only a revision that has touched the curve carries it, so every older
  // revision keeps its exact shape; a missing knob takes its default.
  if (input?.curve !== undefined || input?.curveVersion === 1) {
    result.curve = { ...DEFAULT_BALANCE_CURVE };
    for (const key of Object.keys(DEFAULT_BALANCE_CURVE) as (keyof BalanceCurve)[]) {
      const n = input?.curve?.[key] ?? DEFAULT_BALANCE_CURVE[key];
      const [min, max] = BALANCE_CURVE_LIMITS[key];
      if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Invalid curve ${key} (${min}–${max}).`);
      result.curve[key] = n;
    }
  }
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
/**
 * Every map from the balance curve: a map's number decides its enemies,
 * rewards and boss, and Endless N is map 15 + N. The per-map multipliers
 * still set movement speed, respawn, drops and boss regeneration; the curve
 * owns health, damage and rewards. Bosses pay no stats: beating one opens the
 * next map.
 */
function resolveCurve(mapId: string, curve: BalanceCurve, factors: typeof DEFAULT_BALANCE_FACTORS,
  definition: NonNullable<ReturnType<typeof personalBossDefinition>>, result: MapBalanceSnapshot) {
  const noRewards = { damage: 0, health: 0, armor: 0, regen: 0 };
  result.rules.ARMOR_CURVE = 1;   // the client blocks hits on the curve's armor rule
  result.rules.SPEED_RATING = 1;  // speed camps pay Speed points; see attack-speed-rating.ts
  if (isProceduralMap(mapId)) {
    const map = generateMap(mapId), y = CAMPAIGN_MAPS.length + map.number;
    for (const lane of new Set([...map.camps.map(c => c.lane), 'Dread Warden' as const])) {
      const row = AUTHORED_ENEMIES[lane];
      result.lanes[lane] = curveEnemy(y, row.reward.type as CurveRewardStat, row.elite === true, curve);
    }
    const art = generatedEnemyArt(mapId);
    result.enemies[art] = { ...AUTHORED_ENEMIES[art], speed: 275 * factors.enemySpeed };
    const boss = curveBoss(y, curve);
    result.boss = { kind: definition.kind, hp: boss.hp, damage: boss.heaviestHit, respawnSeconds: definition.respawnSeconds, attacks: {}, rewards: noRewards,
      ...(boss.regenFraction === null ? {} : { regenFraction: boss.regenFraction }) };
    return;
  }
  const y = CAMPAIGN_MAPS.findIndex(map => map.id === mapId) + 1;
  for (const kind of Object.keys(ENEMY_TYPES) as EnemyKind[]) {
    if (!enemyDefeatDefinition(mapId, kind)) continue;
    const row = AUTHORED_ENEMIES[kind];
    const enemy = curveEnemy(y, row.reward.type as CurveRewardStat, row.elite === true, curve);
    result.enemies[kind] = { ...row, hp: enemy.hp, damage: enemy.damage, speed: row.speed * factors.enemySpeed,
      attackSpeed: enemy.attackSpeed, regen: enemy.regen, armor: enemy.armor,
      reward: { ...row.reward, amount: enemy.reward.amount } };
  }
  // The tutorial dragon has its own health and keeps its gentle regen: it is the first boss anyone meets.
  const dragon = mapId in BOSS_REGEN_FRACTION_OVERRIDES;
  const boss = dragon ? { ...curveBoss(y, { ...curve, bossRegen: 0 }), hp: curve.dragonHp, heaviestHit: curve.dragonHit } : curveBoss(y, curve);
  const prefix = BALANCE_MAPS.find(([id]) => id === mapId)![2];
  // The boss keeps its own attack mix, scaled so its heaviest lands as the curve asks.
  const authored = BOSS_DAMAGE_PROFILES[definition.kind as keyof typeof BOSS_DAMAGE_PROFILES] ?? { heavy: 1 };
  const heaviest = Math.max(...Object.values(authored));
  for (const key of Object.keys(AUTHORED_RULES)) {
    if (key === `${prefix}_MAX_HP`) result.rules[key] = boss.hp;
    if (key.startsWith(`${prefix}_REWARD_`)) result.rules[key] = 0;
  }
  result.boss = { ...definition, hp: boss.hp, damage: 0, rewards: noRewards,
    ...(boss.regenFraction === null ? {} : { regenFraction: boss.regenFraction }),
    attacks: Object.fromEntries(Object.entries(authored).map(([key, value]) => [key, value / heaviest * boss.heaviestHit])) };
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
  resolveCurve(mapId, settings.curve ?? DEFAULT_BALANCE_CURVE, factors, definition, result);
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
      // The curve's boss gate sets its own regen; the factor still scales it.
      result.boss.regenFraction = (result.boss.regenFraction ?? bossRegenFractionFor(mapId)) * (factors.bossRegen ?? 1);
    }
  }
  for (const n of [result.boss?.hp, result.boss?.damage, ...Object.values(result.boss?.rewards ?? {}), ...Object.values(result.lanes).flatMap(row => [row.hp, row.damage, row.reward.amount])]) {
    if (n !== undefined && (!Number.isFinite(n) || n < 0 || n > 1e36)) throw new Error('Balance exceeds supported stat range.');
  }
  return result;
}
