import { BOSS_TARGET_SECONDS } from '../../../shared/progression';
import type { RewardType } from '../enemies';

/**
 * Autofarm's decisions: which camp, when the boss, when the next map. The rules
 * are the balance simulator's (src/balance/simulator.ts), so a player who lets
 * autofarm plan progresses about as the pacing model expects:
 *
 * - The boss is ready once the fight would take at most BOSS_TARGET_SECONDS
 *   and its hardest hit, after armor, takes at most 30% of max health
 *   (bossReadinessTargetSeconds and bossHitShare there).
 * - Until then, the camp to farm is the one that moves readiness furthest per
 *   second: health and armor while the boss hits too hard, then whatever
 *   shortens the fight. With no boss to aim at, power gained per second.
 */
export const BOSS_READY_FIGHT_SECONDS = BOSS_TARGET_SECONDS;
export const BOSS_READY_HIT_SHARE = .3;
/** A camp has to beat the current one by this much before Auto walks over to it. */
export const AUTO_SWITCH_MARGIN = 1.15;
/** After a death at the boss, farm this long before trying again. */
export const BOSS_RETRY_MS = 5 * 60_000;

/** What the player's build would be, with or without one more kill's reward. */
export type FarmEvaluation = {
  power: number;
  /** Seconds to defeat this map's boss; null when there is no boss to fight. */
  fightSeconds: number | null;
  /** The boss's hardest hit after armor, as a share of max health. */
  hitShare: number | null;
};
export type FarmReward = { type: RewardType; amount: number };
export type FarmCandidate = {
  key: string;
  alive: number;
  reward: FarmReward;
  /** Time to kill one, plus the walk there when it is not the current camp. */
  secondsPerKill: number;
};

export function bossReady(evaluation: FarmEvaluation) {
  return evaluation.fightSeconds !== null && evaluation.hitShare !== null
    && evaluation.fightSeconds <= BOSS_READY_FIGHT_SECONDS && evaluation.hitShare <= BOSS_READY_HIT_SHARE;
}

function objective(now: FarmEvaluation, aimForBoss: boolean): (evaluation: FarmEvaluation) => number {
  if (aimForBoss && now.fightSeconds !== null && now.hitShare !== null) {
    if (now.hitShare > BOSS_READY_HIT_SHARE) return evaluation => -(evaluation.hitShare ?? now.hitShare!);
    return evaluation => -(evaluation.fightSeconds ?? now.fightSeconds!);
  }
  return evaluation => evaluation.power;
}

/**
 * The best camp for Auto, or the current one when nothing beats it by the
 * switch margin. Camps with nobody alive count only when every camp is empty.
 */
export function bestFarmCandidate(candidates: readonly FarmCandidate[], evaluate: (reward?: FarmReward) => FarmEvaluation,
  aimForBoss: boolean, current: string | null = null) {
  const living = candidates.some(candidate => candidate.alive > 0) ? candidates.filter(candidate => candidate.alive > 0) : candidates;
  if (!living.length) return null;
  const now = evaluate();
  const rate = (score: (evaluation: FarmEvaluation) => number) => {
    const base = score(now);
    return new Map(living.map(candidate => [candidate.key,
      Math.max(0, score(evaluate(candidate.reward)) - base) / Math.max(.1, candidate.secondsPerKill)]));
  };
  let rates = rate(objective(now, aimForBoss));
  // Nothing on this map helps the goal (no health camp while the boss hits
  // too hard): fall back to growing power.
  if (![...rates.values()].some(value => value > 0)) rates = rate(objective(now, false));
  let best = living[0].key;
  for (const candidate of living) if (rates.get(candidate.key)! > rates.get(best)!) best = candidate.key;
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

/** A plan as the resume store keeps it: "auto", or camp keys in order. */
export const AUTO_FARM_AUTO_PLAN = 'auto';
const PLAN_SEPARATOR = '\u001f';
export function encodeFarmPlan(route: readonly string[]) { return route.length ? route.join(PLAN_SEPARATOR) : AUTO_FARM_AUTO_PLAN; }
export function decodeFarmPlan(choice: string) { return choice === AUTO_FARM_AUTO_PLAN ? [] : choice.split(PLAN_SEPARATOR).filter(Boolean); }

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
export const AUTO_FARM_ROUTES_KEY = 'wildstat:autofarm-routes:v1';
export const AUTO_FARM_ADVANCE_KEY = 'wildstat:autofarm-advance:v1';

/** Routes are kept per map, so coming back to a map farms it the way the player set it up. */
export function readFarmRoute(mapId: string, storage: () => Storage | undefined = () => localStorage): string[] {
  try {
    const routes = JSON.parse(storage()?.getItem(AUTO_FARM_ROUTES_KEY) ?? '{}');
    const route = routes?.[mapId];
    return Array.isArray(route) ? route.filter((key): key is string => typeof key === 'string' && key.length > 0) : [];
  } catch { return []; }
}

export function writeFarmRoute(mapId: string, route: readonly string[], storage: () => Storage | undefined = () => localStorage) {
  try {
    const routes = JSON.parse(storage()?.getItem(AUTO_FARM_ROUTES_KEY) ?? '{}') ?? {};
    if (route.length) routes[mapId] = [...route]; else delete routes[mapId];
    storage()?.setItem(AUTO_FARM_ROUTES_KEY, JSON.stringify(routes));
  } catch { /* The route still applies this session. */ }
}

export function readFarmAdvance(storage: () => Storage | undefined = () => localStorage) {
  try { return storage()?.getItem(AUTO_FARM_ADVANCE_KEY) === '1'; } catch { return false; }
}

export function writeFarmAdvance(advance: boolean, storage: () => Storage | undefined = () => localStorage) {
  try { storage()?.setItem(AUTO_FARM_ADVANCE_KEY, advance ? '1' : '0'); } catch { /* Applies this session. */ }
}
