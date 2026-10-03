import { ENEMY_TYPES, type EnemyDefinition, type EnemyKind, type RewardType } from '../enemies';

export type AutoFarmPriority = 'closest' | 'lowest' | 'strongest';

/**
 * What autofarm farms: every enemy that pays one stat ("stat:health"), so a
 * camp's regulars and elites, and every camp paying that stat, are one choice.
 * A bare enemy kind still names that kind alone.
 */
export type AutoFarmGroup = `stat:${RewardType}` | EnemyKind;
export const farmStatGroup = (stat: RewardType): AutoFarmGroup => `stat:${stat}`;
export function enemyRewardStat(enemy: { type: EnemyKind; definition?: EnemyDefinition }): RewardType {
  return (enemy.definition ?? ENEMY_TYPES[enemy.type]).reward.type;
}
export function farmGroupMatches(enemy: { type: EnemyKind; definition?: EnemyDefinition }, group: AutoFarmGroup) {
  return group.startsWith('stat:') ? `stat:${enemyRewardStat(enemy)}` === group : enemy.type === group;
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
