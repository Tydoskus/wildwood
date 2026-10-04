import { BOSS_TARGET_SECONDS } from '../../../shared/progression';
import type { RewardType } from '../enemies';

/**
 * Autofarm's decisions: which camp, when the boss, when the next map.
 *
 * - The boss is ready once the fight takes at most BOSS_TARGET_SECONDS (the
 *   balance simulator's readiness target) and everything it lands over that
 *   fight, less regeneration, costs at most BOSS_READY_DAMAGE_SHARE of max
 *   health. Its single hardest hit was the old gate, at 30% of health; a
 *   fight is thirty of them, and autofarm walked in "ready" and died.
 * - Until then, the camp to farm is the one that closes the gap fastest:
 *   whichever of the two limits is furthest off. Damage shortens the fight
 *   and so the hits taken, so a build is not sent for armor it barely needs.
 *   With no boss to aim at, power gained per second.
 * - A camp whose group fight would kill the player is not farmed while any
 *   other is safe (auto-farm-build.ts, SAFE_GROUP_DANGER).
 */
export const BOSS_READY_FIGHT_SECONDS = BOSS_TARGET_SECONDS;
export const BOSS_READY_DAMAGE_SHARE = .6;
/** The panel's "Needs defense" line: one hit taking more than this much. */
export const BOSS_READY_HIT_SHARE = .3;
/** A camp has to beat the current one by this much before Auto walks over to it (players saw it hop camps). */
export const AUTO_SWITCH_MARGIN = 1.5;
/** How often Auto looks again while its camp still has enemies. */
export const AUTO_REPLAN_SECONDS = 20;
/** After a death at the boss, farm this long before trying again. */
export const BOSS_RETRY_MS = 5 * 60_000;
/** The danger at or below which a camp is safe to farm (auto-farm-build.ts keeps the same number). */
export const SAFE_CAMP_DANGER = .75;

/** What the player's build would be, with or without one more kill's reward. */
export type FarmEvaluation = {
  power: number;
  /** Seconds to defeat this map's boss; null when there is no boss to fight. */
  fightSeconds: number | null;
  /** The boss's hardest hit after armor, as a share of max health. */
  hitShare: number | null;
  /** All the boss lands over the fight, less regeneration, as a share of max health. */
  fightDamageShare: number | null;
};
export type FarmReward = { type: RewardType; amount: number };
export type FarmCandidate = {
  key: string;
  alive: number;
  reward: FarmReward;
  /** Time to kill one, plus the walk there when it is not the current camp. */
  secondsPerKill: number;
  /** How close fighting the group comes to killing the player; above SAFE_CAMP_DANGER it is avoided. */
  danger?: number;
};

/** How far the build is from boss-ready: 1 or less is ready. The larger of the two limits' shortfalls. */
export function bossReadiness(evaluation: FarmEvaluation) {
  if (evaluation.fightSeconds === null || evaluation.fightDamageShare === null) return null;
  return Math.max(evaluation.fightSeconds / BOSS_READY_FIGHT_SECONDS, evaluation.fightDamageShare / BOSS_READY_DAMAGE_SHARE);
}

export function bossReady(evaluation: FarmEvaluation) {
  const readiness = bossReadiness(evaluation);
  return readiness !== null && readiness <= 1;
}

function objective(now: FarmEvaluation, aimForBoss: boolean): (evaluation: FarmEvaluation) => number {
  const readiness = bossReadiness(now);
  if (aimForBoss && readiness !== null && Number.isFinite(readiness)) return evaluation => -(bossReadiness(evaluation) ?? readiness);
  return evaluation => evaluation.power;
}

/**
 * The best camp for Auto, or the current one when nothing beats it by the
 * switch margin. Camps with nobody alive count only when every camp is empty;
 * camps it cannot survive, only when none is safe (then the least dangerous).
 */
export function bestFarmCandidate(candidates: readonly FarmCandidate[], evaluate: (reward?: FarmReward) => FarmEvaluation,
  aimForBoss: boolean, current: string | null = null) {
  const living = candidates.some(candidate => candidate.alive > 0) ? candidates.filter(candidate => candidate.alive > 0) : candidates;
  if (!living.length) return null;
  const safe = living.filter(candidate => (candidate.danger ?? 0) <= SAFE_CAMP_DANGER);
  if (!safe.length) return living.reduce((least, candidate) => (candidate.danger ?? 0) < (least.danger ?? 0) ? candidate : least).key;
  const now = evaluate();
  const rate = (score: (evaluation: FarmEvaluation) => number) => {
    const base = score(now);
    return new Map(safe.map(candidate => {
      const gain = score(evaluate(candidate.reward)) - base;
      return [candidate.key, Number.isFinite(gain) ? Math.max(0, gain) / Math.max(.1, candidate.secondsPerKill) : 0];
    }));
  };
  let rates = rate(objective(now, aimForBoss));
  // Nothing on this map helps the goal: fall back to growing power.
  if (![...rates.values()].some(value => value > 0)) rates = rate(objective(now, false));
  let best = safe[0].key;
  for (const candidate of safe) if (rates.get(candidate.key)! > rates.get(best)!) best = candidate.key;
  const held = current !== null ? rates.get(current) : undefined;
  return held !== undefined && rates.get(best)! <= held * AUTO_SWITCH_MARGIN ? current : best;
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
const routeKeys = (value: unknown) => Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string' && key.length > 0) : null;

export function readFarmChoice(mapId: string, storage: () => Storage | undefined = () => localStorage): string[] {
  try {
    const choice = routeKeys(JSON.parse(storage()?.getItem(AUTO_FARM_CHOICE_KEY) ?? 'null'));
    if (choice) return choice;
    return routeKeys(JSON.parse(storage()?.getItem(AUTO_FARM_ROUTES_KEY) ?? '{}')?.[mapId]) ?? [];
  } catch { return []; }
}

export function writeFarmChoice(route: readonly string[], storage: () => Storage | undefined = () => localStorage) {
  try { storage()?.setItem(AUTO_FARM_CHOICE_KEY, JSON.stringify([...route])); } catch { /* The pick still applies this session. */ }
}

export function readFarmAdvance(storage: () => Storage | undefined = () => localStorage) {
  try { return storage()?.getItem(AUTO_FARM_ADVANCE_KEY) === '1'; } catch { return false; }
}

export function writeFarmAdvance(advance: boolean, storage: () => Storage | undefined = () => localStorage) {
  try { storage()?.setItem(AUTO_FARM_ADVANCE_KEY, advance ? '1' : '0'); } catch { /* Applies this session. */ }
}
