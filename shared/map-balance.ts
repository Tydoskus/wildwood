import { CAMPAIGN_PROGRESSION_ENEMIES, CAMPAIGN_PROGRESSION_BOSS_HEALTH, CAMPAIGN_PROGRESSION_BOSS_REWARDS } from './campaign-progression';
import { applyCampaignRewardFloor } from './campaign-reward-floor';
import { CAMPAIGN_HEALTH_FACTORS } from './campaign-health-curve';
import { LEGACY_ENEMY_REWARDS } from "./legacy-enemy-rewards";
import { BALANCE_BASELINE_VERSION, BAKED_ENEMY_REWARD_FACTORS, BAKED_ENDLESS_DEFAULTS } from "./balance-baseline";
import { bossHeavyHitAt } from "./progression";
import { CAMPAIGN_MAPS, CAMPAIGN_ENDPOINT } from "./campaign-registry";
import { regularMapLoot } from './regular-map-loot';
import { bossRegenFractionFor } from './boss-regeneration';
import { REGULAR_ENEMY_RESPAWN_SECONDS } from './rules';
import { generatedEnemyArt } from "./procedural-enemy-art";
import * as rules from './rules';
import { ENEMY_TYPES, type EnemyKind } from './enemy-definitions';
import { enemyDefeatDefinition, combatMap } from './enemy-defeats';
import { personalBossDefinition } from './personal-bosses';
import { generateMap, isProceduralMap } from './procedural-maps';
import { BOSS_DAMAGE_PROFILES } from './boss-damage';
import { DEFAULT_BALANCE_FACTORS, type BalanceSettings, type MapBalanceSnapshot } from './map-balance-types';
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
 * How much each Endless map grows over the one before. Endless 1 is map 15
 * times the Endless factors (settings.maps.endless); these grow every map
 * after it, the same for every camp. Retuned in the Balance Lab (2026-10-01,
 * 0.845) against a typical player with research and gear, past a boss that
 * takes 12 minutes on arrival:
 * - health and bossHealth ~5.2: a regular keeps taking 8 hits to kill, and
 *   each boss keeps its 12-minute gate;
 * - hit 5.68: from Endless 2 on a regular's hit takes about 7.5% of the
 *   player's health, as in the campaign (Endless 1 is gentler, about 5%);
 * - reward 4.75: map time grows about 8% a map. It keeps growing, since maps
 *   are finite, but slowly.
 * At about 5x a map, enemies reach the stat cap around Endless 30.
 */
export const ENDLESS_STEPS: Readonly<{ health: number; hit: number; reward: number; bossHealth: number }> = Object.freeze({ health: 5.2, hit: 5.68, reward: 4.75, bossHealth: 5.06 });

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
    // Endless N carries on from map 15: its resolved enemies and boss (with map
    // 15's tuning), times the Endless factors, grown N - 1 times by
    // ENDLESS_STEPS, the same for every camp.
    // Endless 1 is map 15 times the Endless factors; each map after grows by the steps.
    const map = generateMap(mapId), depth = Math.min(map.number - 1, 1_000);
    const last = resolveMapBalance(CAMPAIGN_ENDPOINT.mapId, settings, revision, configurationVersion);
    const cap = (n: number) => Math.min(rules.MAX_PLAYER_STAT, Number.isFinite(n) ? n : rules.MAX_PLAYER_STAT);
    const grow = (n: number, step: number) => cap(n * step ** depth);
    // A camp's values on map 15. It has some camps only as an elite (its regen
    // camp): the other version is scaled by the damage camp's elite-to-regular ratio.
    const camp = (type: string, elite: boolean) => {
      const rows = Object.values(last.enemies);
      const exact = rows.find(row => row.reward.type === type && Boolean(row.elite) === elite);
      if (exact) return exact;
      const regular = rows.find(row => row.reward.type === 'damage' && !row.elite)!;
      const other = rows.find(row => row.reward.type === type);
      const eliteDamage = rows.find(row => row.reward.type === 'damage' && row.elite);
      if (!other || !eliteDamage) return regular;
      const k = elite ? 1 : -1, ratio = (a: number, b: number) => (a / b) ** k;
      return { ...other, elite, hp: other.hp * ratio(eliteDamage.hp, regular.hp), damage: other.damage * ratio(eliteDamage.damage, regular.damage),
        reward: { ...other.reward, amount: other.reward.amount * ratio(eliteDamage.reward.amount, regular.reward.amount) } };
    };
    const lanes = new Set([...map.camps.map(c => c.lane), 'Dread Warden' as const]);
    for (const lane of lanes) {
      const authored = AUTHORED_ENEMIES[lane], elite = lane === 'Dread Warden' || lane === 'King Slime';
      const now = camp(authored.reward.type, elite);
      result.lanes[lane] = {
        hp: grow(now.hp * factors.enemyHealth, ENDLESS_STEPS.health),
        damage: grow(now.damage * factors.enemyDamage, ENDLESS_STEPS.hit),
        reward: { ...now.reward, amount: grow(now.reward.amount * factors.enemyRewards, ENDLESS_STEPS.reward) },
      };
    }
    // Generated camps reuse art, but receive these resolved combat values at spawn.
    const art = generatedEnemyArt(mapId);
    result.enemies[art] = { ...AUTHORED_ENEMIES[art],
      reward: { ...AUTHORED_ENEMIES[art].reward, amount: LEGACY_ENEMY_REWARDS[art] ?? AUTHORED_ENEMIES[art].reward.amount },
      speed: 275 * factors.enemySpeed };
    const heaviest = Math.max(...Object.values(last.boss!.attacks), last.boss!.damage);
    result.boss = { kind: definition.kind,
      hp: grow(last.boss!.hp * factors.bossHealth, ENDLESS_STEPS.bossHealth),
      damage: grow(heaviest * factors.bossDamage, ENDLESS_STEPS.hit),
      respawnSeconds: definition.respawnSeconds, attacks: {},
      rewards: Object.fromEntries(Object.entries(last.boss!.rewards).map(([type, amount]) => [type, grow(amount * factors.bossRewards, ENDLESS_STEPS.reward)])) };
  } else {
    for (const kind of Object.keys(ENEMY_TYPES) as EnemyKind[]) {
      if (!enemyDefeatDefinition(mapId, kind)) continue;
      const row = AUTHORED_ENEMIES[kind];
      const curve = settings.campaignProgressionVersion === 1 && mapId !== CAMPAIGN_MAPS[0].id
        ? CAMPAIGN_PROGRESSION_ENEMIES[mapId]?.[`${row.elite ? 'elite' : 'regular'}:${row.reward.type}`] : undefined;
      result.enemies[kind] = { ...row, hp: row.hp * (settings.campaignHealthVersion === 1
          ? CAMPAIGN_HEALTH_FACTORS[mapId]?.[`${row.elite ? 'elite' : 'regular'}:${row.reward.type}`] ?? 1 : 1) * (curve?.hp ?? 1) * factors.enemyHealth, damage: (curve?.damage ?? row.damage) * factors.enemyDamage,
        speed: row.speed * factors.enemySpeed, reward: { ...row.reward, amount: (curve?.reward ?? row.reward.amount) * factors.enemyRewards } };
    }
    if (settings.campaignRewardVersion === 1) applyCampaignRewardFloor(mapId, settings, result.enemies);
    const prefix = BALANCE_MAPS.find(([id]) => id === mapId)![2];
    const rewardValues: Record<string, number> = {};
    for (const [key, value] of Object.entries(AUTHORED_RULES)) {
      if (typeof value !== 'number') continue;
      if (key === `${prefix}_MAX_HP`) result.rules[key] = value * factors.bossHealth;
      // Bosses pay nothing: beating one opens the next map (Ryan, 2026-09-30).
      if (key.startsWith(`${prefix}_REWARD_`)) {
        result.rules[key] = 0;
        rewardValues[key.slice(`${prefix}_REWARD_`.length).toLowerCase()] = 0;
      }
    }
    const campaignIndex = CAMPAIGN_MAPS.findIndex(map => map.id === mapId);
    const attacks = BOSS_DAMAGE_PROFILES[definition.kind as keyof typeof BOSS_DAMAGE_PROFILES]
      ?? { heavy: bossHeavyHitAt(Math.max(0, campaignIndex - 1)) };
    if (!Object.keys(rewardValues).length) {
      for (const stat of ['damage', 'health', 'armor', 'regen'] as const) rewardValues[stat] = 0;
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
