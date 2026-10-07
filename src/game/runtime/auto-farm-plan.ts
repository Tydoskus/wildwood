import type { RewardType } from '../enemies';
import type { PlayerPowerStats } from '../../../shared/player-power';
import { isSoulMap } from '../../../shared/soul-dimension';

/** A camp has to beat the current one by this much before Auto walks over to it (players saw it hop camps). */
export const AUTO_SWITCH_MARGIN = 1.5;
/** How often Auto looks again while its camp still has enemies. */
export const AUTO_REPLAN_SECONDS = 20;

/** What the player's build would be, with or without one more kill's reward: its power, and its effective stats when known. */
export type FarmEvaluation = { power: number; stats?: PlayerPowerStats };
/** `flat`: paid as it is, never grown by research or prestige (soul rewards). */
export type FarmReward = { type: RewardType; amount: number; flat?: boolean };
export type FarmCandidate = {
  key: string;
  alive: number;
  reward: FarmReward;
  /** Time to kill one, plus the walk there when it is not the current camp. */
  secondsPerKill: number;
};

/**
 * Auto's camps, on every map, best first, each with its power per second of
 * killing and walking. A camp whose stat
 * can no longer grow (attack speed at its cap) is left out while any other
 * helps: Auto used to farm a capped speed camp whenever it was the only one
 * alive, for nothing, over and over. Camps with nobody alive count only when
 * every useful camp is empty (it waits for one there).
 */
export function rankFarmCandidates(candidates: readonly FarmCandidate[], evaluate: (reward?: FarmReward) => FarmEvaluation) {
  const now = evaluate().power;
  const alive = (pool: readonly FarmCandidate[]) => pool.some(candidate => candidate.alive > 0) ? pool.filter(candidate => candidate.alive > 0) : pool;
  const gains = new Map(candidates.map(candidate => [candidate.key, evaluate(candidate.reward).power - now]));
  // Useful first, then alive: a useful camp respawning beats a useless one standing there.
  const useful = candidates.filter(candidate => gains.get(candidate.key)! > 0);
  return alive(useful.length ? useful : candidates).map(candidate => {
    const gain = gains.get(candidate.key)!;
    return { key: candidate.key, rate: Number.isFinite(gain) ? Math.max(0, gain) / Math.max(.1, candidate.secondsPerKill) : 0 };
  }).sort((a, b) => b.rate - a.rate);
}

/** The best camp for Auto (rankFarmCandidates), or the current one when nothing beats it by the switch margin. */
export function bestFarmCandidate(candidates: readonly FarmCandidate[], evaluate: (reward?: FarmReward) => FarmEvaluation, current: string | null = null) {
  return pickRankedCandidate(rankFarmCandidates(candidates, evaluate), current);
}
export function pickRankedCandidate(ranked: readonly { key: string; rate: number }[], current: string | null = null) {
  if (!ranked.length) return null;
  const held = ranked.find(entry => entry.key === current)?.rate;
  return held !== undefined && ranked[0].rate <= held * AUTO_SWITCH_MARGIN ? current : ranked[0].key;
}

/**
 * The player's own route: stay while the current camp has enemies alive, then
 * the next camp in order that does, looping. When every camp is empty, wait
 * where it is for the respawn.
 */
export function nextRouteKey(route: readonly string[], alive: (key: string) => number, current: string | null) {
  if (!route.length) return null;
  const at = current === null ? -1 : route.indexOf(current);
  if (at >= 0 && alive(route[at]) > 0) return route[at];
  // From the camp after the current one, or from the first when starting.
  for (let step = 0; step < route.length; step += 1) {
    const key = route[(at + 1 + step) % route.length];
    if (alive(key) > 0) return key;
  }
  return at >= 0 ? route[at] : route[0];
}

/**
 * A route entry is a camp key, with its weight after a star when above one:
 * "stat:damage*2" farms damage for two camps' worth of kills each lap.
 */
export const MAX_ROUTE_WEIGHT = 3;
export function routeEntry(entry: string) {
  const match = /^(.+)\*(\d+)$/.exec(entry);
  return match ? { key: match[1], weight: Math.min(MAX_ROUTE_WEIGHT, Math.max(1, Number(match[2]))) } : { key: entry, weight: 1 };
}
export const routeEntryText = (key: string, weight: number) => weight > 1 ? `${key}*${Math.min(MAX_ROUTE_WEIGHT, weight)}` : key;

/** A plan as the resume store keeps it: "auto", or route entries in order. */
export const AUTO_FARM_AUTO_PLAN = 'auto';
const PLAN_SEPARATOR = '\u001f';
export function encodeFarmPlan(route: readonly string[]) { return route.length ? route.join(PLAN_SEPARATOR) : AUTO_FARM_AUTO_PLAN; }
export function decodeFarmPlan(choice: string) { return choice === AUTO_FARM_AUTO_PLAN ? [] : choice.split(PLAN_SEPARATOR).filter(Boolean); }

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
export const AUTO_FARM_ROUTES_KEY = 'wildstat:autofarm-routes:v1';
export const AUTO_FARM_ADVANCE_KEY = 'wildstat:autofarm-advance:v1';

/**
 * The player's last pick, one for every map: picks are stats, which every map
 * names the same way. Routes used to be kept per map, so a map once farmed on
 * Auto went back to Auto whatever the player had picked since. An empty list
 * is Auto, picked on purpose. Before the first pick, the old per-map route.
 */
export const AUTO_FARM_CHOICE_KEY = 'wildstat:autofarm-choice:v1';
/**
 * The Soul Dimension's own last pick, so soul picks never replace the
 * campaign's. Before one is made there, the campaign's pick is carried over.
 */
export const AUTO_FARM_SOUL_CHOICE_KEY = 'wildstat:autofarm-soul-choice:v1';
const routeKeys = (value: unknown) => Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string' && key.length > 0) : null;

export function readFarmChoice(mapId: string, storage: () => Storage | undefined = () => localStorage): string[] {
  try {
    const soul = isSoulMap(mapId) ? routeKeys(JSON.parse(storage()?.getItem(AUTO_FARM_SOUL_CHOICE_KEY) ?? 'null')) : null;
    if (soul) return soul;
    const choice = routeKeys(JSON.parse(storage()?.getItem(AUTO_FARM_CHOICE_KEY) ?? 'null'));
    if (choice) return choice;
    return routeKeys(JSON.parse(storage()?.getItem(AUTO_FARM_ROUTES_KEY) ?? '{}')?.[mapId]) ?? [];
  } catch { return []; }
}

export function writeFarmChoice(route: readonly string[], storage: () => Storage | undefined = () => localStorage, mapId = '') {
  const key = isSoulMap(mapId) ? AUTO_FARM_SOUL_CHOICE_KEY : AUTO_FARM_CHOICE_KEY;
  try { storage()?.setItem(key, JSON.stringify([...route])); } catch { /* The pick still applies this session. */ }
}

export function readFarmAdvance(storage: () => Storage | undefined = () => localStorage) {
  try { return storage()?.getItem(AUTO_FARM_ADVANCE_KEY) === '1'; } catch { return false; }
}

export function writeFarmAdvance(advance: boolean, storage: () => Storage | undefined = () => localStorage) {
  try { storage()?.setItem(AUTO_FARM_ADVANCE_KEY, advance ? '1' : '0'); } catch { /* Applies this session. */ }
}
