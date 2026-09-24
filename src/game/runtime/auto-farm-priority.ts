export type AutoFarmPriority = 'closest' | 'lowest' | 'strongest';

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
