import { ENEMY_TYPES, type EnemyDefinition, type EnemyKind, type RewardType } from '../enemies';
import { SOUL_STAT_DETAILS, SOUL_STAT_ORDER, type SoulStatId } from '../../../shared/soul-dimension';
import { soulStatOfCampName } from '../soul-world';
import type { FarmReward } from './auto-farm-plan';

export type AutoFarmPriority = 'closest' | 'lowest' | 'strongest';

/**
 * What autofarm farms: every enemy that pays one stat ("stat:health"), so a
 * camp's regulars and elites, and every camp paying that stat, are one choice.
 * In the Soul Dimension, every enemy paying one soul stat ("soul:armor"): soul
 * enemies pay no run stat, so grouped by reward they were all one "Damage +0".
 * A bare enemy kind still names that kind alone.
 */
export type AutoFarmGroup = `stat:${RewardType}` | `soul:${SoulStatId}` | EnemyKind;
export const farmStatGroup = (stat: RewardType): AutoFarmGroup => `stat:${stat}`;
export const farmSoulGroup = (stat: SoulStatId): AutoFarmGroup => `soul:${stat}`;
type FarmEnemy = { type: EnemyKind; definition?: EnemyDefinition; campName?: string };
export function enemyRewardStat(enemy: { type: EnemyKind; definition?: EnemyDefinition }): RewardType {
  return (enemy.definition ?? ENEMY_TYPES[enemy.type]).reward.type;
}
/** The soul stat a group farms, or null for a run stat's group or an enemy kind. */
export function farmGroupSoulStat(group: string): SoulStatId | null {
  const stat = group.startsWith('soul:') ? group.slice(5) as SoulStatId : null;
  return stat && SOUL_STAT_ORDER.includes(stat) ? stat : null;
}
/** The group an enemy (or its spawn site) belongs to: its soul stat's in the Soul Dimension, its reward's elsewhere. */
export function farmGroupOf(enemy: FarmEnemy): AutoFarmGroup {
  const soul = soulStatOfCampName(enemy.campName);
  return soul ? farmSoulGroup(soul) : farmStatGroup(enemyRewardStat(enemy));
}
export function farmGroupMatches(enemy: FarmEnemy, group: AutoFarmGroup) {
  return group.startsWith('stat:') || group.startsWith('soul:') ? farmGroupOf(enemy) === group : enemy.type === group;
}

/** The run stat each soul stat matches; Crit Damage has none (no run enemy pays it). */
const SOUL_REWARD: Readonly<Record<SoulStatId, RewardType | null>> = {
  damage: 'damage', health: 'health', armor: 'armor', regen: 'regen', attackSpeed: 'speed', critDamage: null,
};
/**
 * A pick carried between the campaign and the Soul Dimension: "stat:health" is
 * "soul:health" there and back again. A pick with no match (Soul Crit Damage
 * on a campaign map) is left as it is, and the map simply does not have it.
 */
export function carryFarmGroup(key: string, soulMap: boolean): string {
  if (soulMap && key.startsWith('stat:')) {
    const soul = SOUL_STAT_ORDER.find(stat => `stat:${SOUL_REWARD[stat]}` === key);
    return soul ? farmSoulGroup(soul) : key;
  }
  const soul = !soulMap ? farmGroupSoulStat(key) : null;
  return soul && SOUL_REWARD[soul] ? farmStatGroup(SOUL_REWARD[soul]!) : key;
}
/** The run stat a group stands for, for the Aggro picks (a soul group stands for its run stat's). */
export function farmGroupRewardType(group: string): RewardType | null {
  const soul = farmGroupSoulStat(group);
  if (soul) return SOUL_REWARD[soul];
  return group.startsWith('stat:') ? group.slice(5) as RewardType : null;
}
/**
 * One soul kill, priced as the stat it adds: flat (research and prestige never
 * grow soul rewards). Crit Damage adds no power, so Auto leaves it to routes.
 */
export function soulFarmReward(stat: SoulStatId): FarmReward {
  const type = SOUL_REWARD[stat];
  return type ? { type, amount: SOUL_STAT_DETAILS[stat].reward, flat: true } : { type: 'damage', amount: 0, flat: true };
}

export const AUTO_FARM_PRIORITIES: readonly { id: AutoFarmPriority; label: string }[] = [
  { id: 'closest', label: 'Closest' },
  { id: 'lowest', label: 'Lowest HP' },
  { id: 'strongest', label: 'Strongest' },
];

export const AUTO_FARM_PRIORITY_KEY = 'wildstat:autofarm-priority:v1';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
const isPriority = (value: unknown): value is AutoFarmPriority => AUTO_FARM_PRIORITIES.some(entry => entry.id === value);

/** A preference, not session state: it survives reloads and applies to every farm. */
export function readAutoFarmPriority(storage: () => Storage | undefined = () => localStorage): AutoFarmPriority {
  try {
    const value = storage()?.getItem(AUTO_FARM_PRIORITY_KEY);
    return isPriority(value) ? value : 'closest';
  } catch { return 'closest'; }
}

export function writeAutoFarmPriority(priority: AutoFarmPriority, storage: () => Storage | undefined = () => localStorage) {
  try { storage()?.setItem(AUTO_FARM_PRIORITY_KEY, priority); } catch { /* The choice still applies this session. */ }
}

export const AUTO_FARM_PULL_KEY = 'wildstat:autofarm-pull:v1';

/** Whether the farmed group comes for the player as soon as it spawns; a preference like the priority. */
export function readAutoFarmPull(storage: () => Storage | undefined = () => localStorage) {
  try { return storage()?.getItem(AUTO_FARM_PULL_KEY) === '1'; } catch { return false; }
}

export function writeAutoFarmPull(pull: boolean, storage: () => Storage | undefined = () => localStorage) {
  try { storage()?.setItem(AUTO_FARM_PULL_KEY, pull ? '1' : '0'); } catch { /* The choice still applies this session. */ }
}

type Candidate = { hp: number; maxHp: number };

/**
 * Negative when `a` is the better target. Lowest HP is current health, so a
 * wounded enemy is finished first; Strongest is the toughest by maximum health.
 * Distance breaks every tie, so equal enemies still resolve to the nearest.
 */
export function compareAutoFarmTargets(priority: AutoFarmPriority, a: Candidate, aDistance: number, b: Candidate, bDistance: number) {
  if (priority === 'lowest' && a.hp !== b.hp) return a.hp - b.hp;
  if (priority === 'strongest') {
    if (a.maxHp !== b.maxHp) return b.maxHp - a.maxHp;
    if (a.hp !== b.hp) return b.hp - a.hp;
  }
  return aDistance - bDistance;
}
