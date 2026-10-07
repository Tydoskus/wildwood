import { REWARD_DATA, type RewardType } from '../enemies';
import type { PlayerPowerStats } from '../../../shared/player-power';
import { isSoulMap, SOUL_STAT_ORDER } from '../../../shared/soul-dimension';

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
 * Custom: each stat's slider, in percent, is its share of the farming time: 200 /
 * 25 / 25 farms about 80% / 10% / 10%, 0% never, all equal an even split. A group
 * left out of the record is at the default.
 */
export type FarmWeights = Readonly<Record<string, number>>;
export const FARM_WEIGHT_DEFAULT = 100, FARM_WEIGHT_MAX = 200, FARM_WEIGHT_STEP = 25;
export function farmWeight(weights: FarmWeights, key: string) {
  const value = weights[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(FARM_WEIGHT_MAX, Math.max(0, value)) : FARM_WEIGHT_DEFAULT;
}
/** The player's choice: Auto, or custom shares. The sliders are kept on Auto too, so switching back finds them. */
export type FarmChoice = { auto: boolean; weights: FarmWeights };
export const AUTO_FARM_CHOICE: FarmChoice = { auto: true, weights: {} };

/**
 * Custom: the group furthest behind its share of the farming time. Shares are
 * the sliders over this map's groups above 0%; `spent` is the seconds each has
 * been farmed here, walking to it included. Only groups with enemies alive,
 * unless none has any: then it waits at the furthest behind. Ties go to the
 * larger slider, then to the first listed.
 */
export function shareFarmKey(groups: readonly { key: string; weight: number; alive: number }[], spent: (key: string) => number) {
  const weighted = groups.filter(group => group.weight > 0);
  const sum = weighted.reduce((total, group) => total + group.weight, 0);
  const total = weighted.reduce((seconds, group) => seconds + spent(group.key), 0);
  const pool = weighted.some(group => group.alive > 0) ? weighted.filter(group => group.alive > 0) : weighted;
  let best: { key: string; weight: number; behind: number } | null = null;
  for (const group of pool) {
    const behind = group.weight / sum * total - spent(group.key);
    if (!best || behind > best.behind + 1e-9 || (Math.abs(behind - best.behind) <= 1e-9 && group.weight > best.weight)) best = { key: group.key, weight: group.weight, behind };
  }
  return best?.key ?? null;
}

/** Every group a choice can name, campaign and Soul Dimension: what an old route left unpicked is 0%. */
const FARM_GROUPS = [...(Object.keys(REWARD_DATA) as RewardType[]).map(stat => `stat:${stat}`), ...SOUL_STAT_ORDER.map(stat => `soul:${stat}`)];
/**
 * An old route as sliders (before them the player tapped stats in order, with
 * up to three pips of time each): a picked stat is 100%, a pip more 100% more
 * up to the 200% cap, and every stat it left out 0%. An empty route was Auto.
 */
export function routeChoice(route: readonly string[]): FarmChoice {
  if (!route.length) return AUTO_FARM_CHOICE;
  const weights: Record<string, number> = Object.fromEntries(FARM_GROUPS.map(group => [group, 0]));
  for (const entry of route) {
    const match = /^(.+)\*(\d+)$/.exec(entry), key = match ? match[1] : entry;
    weights[key] = Math.max(weights[key] ?? 0, Math.min(FARM_WEIGHT_MAX, FARM_WEIGHT_DEFAULT * Math.max(1, match ? Number(match[2]) : 1)));
  }
  return { auto: false, weights };
}

/** A plan as the resume store keeps it: "auto", or the sliders as JSON. An old route (keys joined) still reads. */
export const AUTO_FARM_AUTO_PLAN = 'auto';
const PLAN_SEPARATOR = '\u001f';
export function encodeFarmPlan(weights: FarmWeights | null) { return weights ? JSON.stringify(weights) : AUTO_FARM_AUTO_PLAN; }
export function decodeFarmPlan(choice: string): FarmWeights | null {
  if (choice === AUTO_FARM_AUTO_PLAN) return null;
  const parsed = choice.startsWith('{') ? parseChoice({ auto: false, weights: safeParse(choice) }) : routeChoice(choice.split(PLAN_SEPARATOR).filter(Boolean));
  return parsed && !parsed.auto ? parsed.weights : null;
}

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
export const AUTO_FARM_ADVANCE_KEY = 'wildstat:autofarm-advance:v1';
/** The player's choice, one for every map: groups are stats, which every map names the same way. */
export const AUTO_FARM_WEIGHTS_KEY = 'wildstat:autofarm-weights:v1';
/** The Soul Dimension's own, so soul sliders never replace the campaign's. Before one is set there, the campaign's carries over. */
export const AUTO_FARM_SOUL_WEIGHTS_KEY = 'wildstat:autofarm-soul-weights:v1';
/** Before the sliders: the route picked (an empty list was Auto), the Soul Dimension's own, and before those one per map. */
export const AUTO_FARM_CHOICE_KEY = 'wildstat:autofarm-choice:v1';
export const AUTO_FARM_SOUL_CHOICE_KEY = 'wildstat:autofarm-soul-choice:v1';
export const AUTO_FARM_ROUTES_KEY = 'wildstat:autofarm-routes:v1';
const routeKeys = (value: unknown) => Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string' && key.length > 0) : null;
function safeParse(text: string | null | undefined): unknown { try { return JSON.parse(text ?? 'null'); } catch { return null; } }
function parseChoice(value: unknown): FarmChoice | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { auto, weights } = value as { auto?: unknown; weights?: unknown };
  if (!weights || typeof weights !== 'object' || Array.isArray(weights)) return null;
  const kept = Object.entries(weights).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]));
  return { auto: auto === true, weights: Object.fromEntries(kept.map(([key, weight]) => [key, Math.min(FARM_WEIGHT_MAX, Math.max(0, weight))])) };
}

export function readFarmChoice(mapId: string, storage: () => Storage | undefined = () => localStorage): FarmChoice {
  try {
    const read = (key: string) => safeParse(storage()?.getItem(key));
    const sources = isSoulMap(mapId) ? [[AUTO_FARM_SOUL_WEIGHTS_KEY, AUTO_FARM_SOUL_CHOICE_KEY], [AUTO_FARM_WEIGHTS_KEY, AUTO_FARM_CHOICE_KEY]] : [[AUTO_FARM_WEIGHTS_KEY, AUTO_FARM_CHOICE_KEY]];
    for (const [weightsKey, routeKey] of sources) {
      const choice = parseChoice(read(weightsKey)), route = routeKeys(read(routeKey));
      if (choice) return choice;
      if (route) return routeChoice(route);
    }
    const route = routeKeys((read(AUTO_FARM_ROUTES_KEY) as Record<string, unknown> | null)?.[mapId]);
    return route ? routeChoice(route) : AUTO_FARM_CHOICE;
  } catch { return AUTO_FARM_CHOICE; }
}

export function writeFarmChoice(choice: FarmChoice, storage: () => Storage | undefined = () => localStorage, mapId = '') {
  const key = isSoulMap(mapId) ? AUTO_FARM_SOUL_WEIGHTS_KEY : AUTO_FARM_WEIGHTS_KEY;
  try { storage()?.setItem(key, JSON.stringify({ auto: choice.auto, weights: choice.weights })); } catch { /* The choice still applies this session. */ }
}

export function readFarmAdvance(storage: () => Storage | undefined = () => localStorage) {
  try { return storage()?.getItem(AUTO_FARM_ADVANCE_KEY) === '1'; } catch { return false; }
}

export function writeFarmAdvance(advance: boolean, storage: () => Storage | undefined = () => localStorage) {
  try { storage()?.setItem(AUTO_FARM_ADVANCE_KEY, advance ? '1' : '0'); } catch { /* Applies this session. */ }
}
