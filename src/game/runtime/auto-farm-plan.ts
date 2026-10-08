import { REWARD_DATA, type RewardType } from '../enemies';
import type { PlayerPowerStats } from '../../../shared/player-power';
import { isSoulMap, SOUL_STAT_ORDER } from '../../../shared/soul-dimension';

/** How often the farm looks again at which group is furthest behind its share, while its group still has enemies. */
export const SHARE_REPLAN_SECONDS = 20;
/** The growth forecast's copy of the old Auto's camp ranking (growth-forecast.ts), until it goes. */
export const AUTO_REPLAN_SECONDS = SHARE_REPLAN_SECONDS;
const AUTO_SWITCH_MARGIN = 1.5;
export type FarmCandidate = { key: string; alive: number; reward: FarmReward; secondsPerKill: number };
export function rankFarmCandidates(candidates: readonly FarmCandidate[], evaluate: (reward?: FarmReward) => FarmEvaluation) {
  const now = evaluate().power;
  const alive = (pool: readonly FarmCandidate[]) => pool.some(candidate => candidate.alive > 0) ? pool.filter(candidate => candidate.alive > 0) : pool;
  const gains = new Map(candidates.map(candidate => [candidate.key, evaluate(candidate.reward).power - now]));
  const useful = candidates.filter(candidate => gains.get(candidate.key)! > 0);
  return alive(useful.length ? useful : candidates).map(candidate => {
    const gain = gains.get(candidate.key)!;
    return { key: candidate.key, rate: Number.isFinite(gain) ? Math.max(0, gain) / Math.max(.1, candidate.secondsPerKill) : 0 };
  }).sort((a, b) => b.rate - a.rate);
}
export function pickRankedCandidate(ranked: readonly { key: string; rate: number }[], current: string | null = null) {
  if (!ranked.length) return null;
  const held = ranked.find(entry => entry.key === current)?.rate;
  return held !== undefined && ranked[0].rate <= held * AUTO_SWITCH_MARGIN ? current : ranked[0].key;
}

/** What the player's build would be, with or without one more kill's reward: its power, and its effective stats when known. */
export type FarmEvaluation = { power: number; stats?: PlayerPowerStats };
/** `flat`: paid as it is, never grown by research or prestige (soul rewards). */
export type FarmReward = { type: RewardType; amount: number; flat?: boolean };

/**
 * The sliders: each stat group's share of the farming time, in whole percents
 * that add up to 100 over the map's groups. 0% is never farmed.
 */
export type FarmShares = Readonly<Record<string, number>>;

/** Whole percents for `raw` (any non-negative numbers) adding up to exactly `total`, the largest remainders rounded up. */
function wholeShares(raw: readonly { key: string; value: number }[], total: number) {
  const sum = raw.reduce((all, entry) => all + entry.value, 0);
  const exact = raw.map(entry => ({ key: entry.key, value: sum > 0 ? entry.value / sum * total : total / Math.max(1, raw.length) }));
  const out: Record<string, number> = Object.fromEntries(exact.map(entry => [entry.key, Math.floor(entry.value + 1e-9)]));
  let left = total - Object.values(out).reduce((all, value) => all + value, 0);
  for (const entry of [...exact].sort((a, b) => (b.value - Math.floor(b.value + 1e-9)) - (a.value - Math.floor(a.value + 1e-9)))) {
    if (left <= 0) break;
    out[entry.key]++; left--;
  }
  return out;
}

/** The map's groups split evenly: a new map, a first-time player, or an old Auto. */
export function evenShares(groups: readonly string[]): FarmShares {
  return wholeShares(groups.map(key => ({ key, value: 1 })), 100);
}

/**
 * This map's sliders from what is saved: each group's saved share (a group
 * never set is 0%), made to add up to 100; nothing saved for any of them is an
 * even split.
 */
export function sharesForGroups(saved: FarmShares | null, groups: readonly string[]): FarmShares {
  const raw = groups.map(key => ({ key, value: Math.max(0, Number.isFinite(saved?.[key]) ? saved![key] : 0) }));
  return raw.some(entry => entry.value > 0) ? wholeShares(raw, 100) : evenShares(groups);
}

/**
 * One slider moved to `value`: the others share what is left in the
 * proportions they had (evenly, if they were all 0%), so the total stays 100%.
 * Whole percents throughout.
 */
export function rebalanceShares(shares: FarmShares, groups: readonly string[], changed: string, value: number): FarmShares {
  if (!groups.includes(changed)) return sharesForGroups(shares, groups);
  if (groups.length === 1) return { [changed]: 100 };
  const own = Math.min(100, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));
  const others = groups.filter(group => group !== changed);
  return { ...wholeShares(others.map(key => ({ key, value: Math.max(0, shares[key] ?? 0) })), 100 - own), [changed]: own };
}

/** A share as the slider shows it. */
export const shareLabel = (share: number) => `${Math.round(share)}%`;

/**
 * The group furthest behind its share of the farming time. `spent` is the
 * seconds each has been farmed here, walking to it included. Only groups with
 * enemies alive, unless none has any: then it waits at the furthest behind.
 * Ties go to the larger share, then to the first listed.
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

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
function safeParse(text: string | null | undefined): unknown { try { return JSON.parse(text ?? 'null'); } catch { return null; } }
const finiteRecord = (value: unknown): Record<string, number> | null => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] >= 0))
  : null;

/** The sliders, one record for every campaign map (groups are stats, named the same everywhere), and the Soul Dimension's own. */
export const AUTO_FARM_SHARES_KEY = 'wildstat:autofarm-shares:v2';
export const AUTO_FARM_SOUL_SHARES_KEY = 'wildstat:autofarm-soul-shares:v2';
/** Before the shares: 0-200% sliders with an Auto mode, and before those a route of picked stats (an empty one was Auto). */
export const AUTO_FARM_WEIGHTS_KEY = 'wildstat:autofarm-weights:v1';
export const AUTO_FARM_SOUL_WEIGHTS_KEY = 'wildstat:autofarm-soul-weights:v1';
export const AUTO_FARM_CHOICE_KEY = 'wildstat:autofarm-choice:v1';
export const AUTO_FARM_SOUL_CHOICE_KEY = 'wildstat:autofarm-soul-choice:v1';
export const AUTO_FARM_ROUTES_KEY = 'wildstat:autofarm-routes:v1';

/** Every group an old route could name: what it left unpicked was 0%. */
const FARM_GROUPS = [...(Object.keys(REWARD_DATA) as RewardType[]).map(stat => `stat:${stat}`), ...SOUL_STAT_ORDER.map(stat => `soul:${stat}`)];
/** An old 0-200% slider: a group left out of the record was at 100%. */
const OLD_WEIGHT_DEFAULT = 100;

/**
 * The shares saved before 0.901.11, as a record of weights (any scale): the
 * 0-200% sliders as they were (a group never set at 100%), an old route (a
 * picked stat 100%, a pip more 100% more, the rest 0%); null for Auto or
 * nothing saved, an even split.
 */
export function legacyShares(groups: readonly string[], mapId: string, storage: () => Storage | undefined = () => localStorage,
  /** A saved key as this map names it (a campaign stat as its soul stat in the Soul Dimension, and back); a merge keeps the larger. */
  normalize: (key: string) => string = key => key): FarmShares | null {
  const read = (key: string) => { try { return safeParse(storage()?.getItem(key)); } catch { return null; } };
  const sources = isSoulMap(mapId) ? [[AUTO_FARM_SOUL_WEIGHTS_KEY, AUTO_FARM_SOUL_CHOICE_KEY], [AUTO_FARM_WEIGHTS_KEY, AUTO_FARM_CHOICE_KEY]] : [[AUTO_FARM_WEIGHTS_KEY, AUTO_FARM_CHOICE_KEY]];
  const fromWeights = (saved: Record<string, number>) => {
    const weights: Record<string, number> = {};
    for (const [key, value] of Object.entries(saved)) { const group = normalize(key); weights[group] = Math.max(weights[group] ?? 0, value); }
    return Object.fromEntries(groups.map(group => [group, Math.min(200, weights[group] ?? OLD_WEIGHT_DEFAULT)]));
  };
  const fromRoute = (route: unknown) => {
    if (!Array.isArray(route)) return undefined;
    const picked = route.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
    if (!picked.length) return null;
    const weights: Record<string, number> = Object.fromEntries(FARM_GROUPS.map(group => [group, 0]));
    for (const entry of picked) {
      const match = /^(.+)\*(\d+)$/.exec(entry), key = match ? match[1] : entry;
      weights[key] = Math.max(weights[key] ?? 0, Math.min(200, OLD_WEIGHT_DEFAULT * Math.max(1, match ? Number(match[2]) : 1)));
    }
    return fromWeights(weights);
  };
  for (const [weightsKey, routeKey] of sources) {
    const choice = read(weightsKey) as { auto?: unknown; weights?: unknown } | null;
    const weights = finiteRecord(choice?.weights);
    if (weights) return choice!.auto === true ? null : fromWeights(weights);
    const route = fromRoute(read(routeKey));
    if (route !== undefined) return route;
  }
  return fromRoute((read(AUTO_FARM_ROUTES_KEY) as Record<string, unknown> | null)?.[mapId]) ?? null;
}

/** The saved shares record (campaign, or the Soul Dimension's, which carries the campaign's until it has its own); null when none is saved yet. */
export function readSavedShares(mapId: string, storage: () => Storage | undefined = () => localStorage): FarmShares | null {
  try {
    const keys = isSoulMap(mapId) ? [AUTO_FARM_SOUL_SHARES_KEY, AUTO_FARM_SHARES_KEY] : [AUTO_FARM_SHARES_KEY];
    for (const key of keys) { const saved = finiteRecord(safeParse(storage()?.getItem(key))); if (saved) return saved; }
  } catch { /* Nothing saved. */ }
  return null;
}

/**
 * Saves the sliders as the player last set them, one record for every map:
 * another map reads what it has of them (a stat it lacks drops out, one it
 * has that was not on this map is 0%).
 */
export function writeSavedShares(shares: FarmShares, mapId: string, storage: () => Storage | undefined = () => localStorage) {
  const key = isSoulMap(mapId) ? AUTO_FARM_SOUL_SHARES_KEY : AUTO_FARM_SHARES_KEY;
  try { storage()?.setItem(key, JSON.stringify(shares)); } catch { /* The shares still apply this session. */ }
}

/** Shares as the resume store keeps them: JSON, or "auto" (an old even split). */
export function encodeFarmPlan(shares: FarmShares) { return JSON.stringify(shares); }
export function decodeFarmPlan(choice: string): FarmShares | null {
  return choice.startsWith('{') ? finiteRecord(safeParse(choice)) : null;
}

export const AUTO_FARM_ADVANCE_KEY = 'wildstat:autofarm-advance:v1';
export const AUTO_FARM_BOSSES_KEY = 'wildstat:autofarm-bosses:v1';
function readSwitch(key: string, storage: () => Storage | undefined) {
  try { return storage()?.getItem(key) === '1'; } catch { return false; }
}
function writeSwitch(key: string, on: boolean, storage: () => Storage | undefined) {
  try { storage()?.setItem(key, on ? '1' : '0'); } catch { /* Applies this session. */ }
}
export const readFarmAdvance = (storage: () => Storage | undefined = () => localStorage) => readSwitch(AUTO_FARM_ADVANCE_KEY, storage);
export const writeFarmAdvance = (on: boolean, storage: () => Storage | undefined = () => localStorage) => writeSwitch(AUTO_FARM_ADVANCE_KEY, on, storage);
export const readFightBosses = (storage: () => Storage | undefined = () => localStorage) => readSwitch(AUTO_FARM_BOSSES_KEY, storage);
export const writeFightBosses = (on: boolean, storage: () => Storage | undefined = () => localStorage) => writeSwitch(AUTO_FARM_BOSSES_KEY, on, storage);

/**
 * What a map or boss asks before it is tried again: the power the player had
 * when it stepped back or walked away, and 20% more. One number per thing,
 * per character, kept so a reload remembers; one set by a build more than
 * twice as strong (a prestige started over) is ignored.
 */
export const RETRY_POWER_FACTOR = 1.2;
export const AUTO_FARM_RETRY_KEY = 'wildstat:autofarm-retry:v2';
export function createRetryPowers(storage: () => Storage | undefined = () => localStorage) {
  let cache: Record<string, [needed: number, setAt: number]> | null = null;
  const load = () => {
    if (cache) return cache;
    cache = {};
    const saved = finiteRecordOfPairs(safeParse(storage()?.getItem(AUTO_FARM_RETRY_KEY)));
    if (saved) cache = saved;
    return cache;
  };
  return {
    /** The power `key` asks for now (0: nothing holds it back). */
    needed(identity: string, key: string, power: number) {
      const entry = load()[`${identity}|${key}`];
      return entry && entry[1] * .5 <= power ? entry[0] : 0;
    },
    /** Stepped back from, or walked away from, at `power`. */
    raise(identity: string, key: string, power: number) {
      load()[`${identity}|${key}`] = [power * RETRY_POWER_FACTOR, power];
      try { storage()?.setItem(AUTO_FARM_RETRY_KEY, JSON.stringify(cache)); } catch { /* Remembered this session. */ }
    },
  };
}
function finiteRecordOfPairs(value: unknown): Record<string, [number, number]> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, [number, number]] =>
    Array.isArray(entry[1]) && entry[1].length === 2 && entry[1].every(item => typeof item === 'number' && Number.isFinite(item) && item >= 0)));
}
