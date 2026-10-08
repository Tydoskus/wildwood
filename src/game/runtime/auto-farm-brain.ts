import { wallClockNowMs } from '../../app/trusted-clock';
import { armorDamageReduction } from '../combat';
import type { PlayerPowerStats } from '../../../shared/player-power';

/**
 * Autofarm v2: measure, don't predict. Moving on used to need three models to
 * agree (DPS against the balance curve, a 30-minute offline simulation and a
 * group-fight danger estimate), and players saw "Next map too hard" on maps
 * they farmed fine. Now it tries, watches what actually happens (power gained
 * per minute, deaths, how a boss fight is going) and backs off by a margin
 * that grows every time, so it cannot bounce between two maps all night.
 */

/**
 * How hard autofarm pushes forward: how much more power a map's retry needs,
 * how much slower a new map may farm, and the wait before a retry (doubling
 * with each failure on the same map; a boss waits half as long, and asks for
 * no power, only a fight that projects a win: bossReadiness).
 */
export type FarmPush = 'safe' | 'normal' | 'bold';
export const FARM_PUSHES: Readonly<Record<FarmPush, { retry: number; keep: number; waitMinutes: number }>> = {
  safe: { retry: 1.35, keep: 1, waitMinutes: 20 },
  normal: { retry: 1.2, keep: .9, waitMinutes: 10 },
  bold: { retry: 1.1, keep: .75, waitMinutes: 5 },
};
export const AUTO_FARM_PUSH_KEY = 'wildstat:autofarm-push:v1';
export const AUTO_FARM_RETRY_KEY = 'wildstat:autofarm-retry:v1';
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
const isPush = (value: unknown): value is FarmPush => typeof value === 'string' && value in FARM_PUSHES;

export function readFarmPush(storage: () => Storage | undefined = () => localStorage): FarmPush {
  try { const value = storage()?.getItem(AUTO_FARM_PUSH_KEY); return isPush(value) ? value : 'normal'; } catch { return 'normal'; }
}
export function writeFarmPush(push: FarmPush, storage: () => Storage | undefined = () => localStorage) {
  try { storage()?.setItem(AUTO_FARM_PUSH_KEY, push); } catch { /* Applies this session. */ }
}

/** A freshly reached map is on trial this long: farm too slowly on it and it goes back. */
export const PROBATION_MS = 10 * 60_000;
/** The gain rate is the last ten minutes of power; under five it is not yet known. */
export const GAIN_WINDOW_MS = 10 * 60_000;
export const GAIN_MIN_MS = 5 * 60_000;
const GAIN_SAMPLE_MS = 5_000;
/** A group the player just died to is left alone this long while another has enemies. */
export const DIED_TO_GROUP_MS = 10 * 60_000;
/** A boss fight, walk in included, is judged once this long under way. */
export const BOSS_JUDGE_SECONDS = 3;
/** Walking away from a losing boss fight happens below this share of health, before the last hit. */
export const BOSS_LEAVE_HEALTH = .5;
/**
 * A remembered retry power set by a build more than this many times stronger
 * belongs to another build: a prestige or an Aggro run started over, and the
 * old number would hold the fresh build back for good.
 */
export const BUILD_CHANGE = 2;

/**
 * Power gained per minute on one map, from the live build sampled over time.
 * It is the outcome, so multishot, Reflect, deaths and slow kills are all in
 * it already. A fall in power is another build (a run started, a prestige): the
 * measurement starts over, as it does on another map.
 */
export function createPowerGainMeter() {
  let mapId = '', samples: { at: number; power: number }[] = [];
  return {
    sample(at: number, power: number, map: string) {
      const last = samples[samples.length - 1];
      if (map !== mapId || (last && power < last.power)) { mapId = map; samples = []; }
      else if (last && at - last.at < GAIN_SAMPLE_MS) return;
      samples.push({ at, power });
      while (samples.length > 1 && at - samples[0].at > GAIN_WINDOW_MS) samples.shift();
    },
    /** Power per minute over the window, or null with under GAIN_MIN_MS of it. */
    rate(at: number, map: string) {
      if (map !== mapId) return null;
      const recent = samples.filter(sample => at - sample.at <= GAIN_WINDOW_MS);
      const first = recent[0], last = recent[recent.length - 1];
      if (!first || last.at - first.at < GAIN_MIN_MS) return null;
      return (last.power - first.power) / (last.at - first.at) * 60_000;
    },
  };
}

/** What a map or boss asks before its next try: this much power, and not before this time (wall clock). */
export type RetryGate = { power: number; at: number };
type RetryEntry = [power: number, setAt: number, failures: number, notBefore: number];

/**
 * The power and the wait each map's next try (and each boss's) needs, per
 * character and kept in localStorage, so an overnight farm that reloads still
 * remembers. Every failure asks for more power than the last try needed and
 * doubles the wait, so a wall that keeps winning is tried less and less
 * often, never in a loop. Each entry keeps the power it was set at, to tell
 * another build's apart.
 */
export function createRetryMemory(storage: () => Storage | undefined = () => localStorage, now = wallClockNowMs) {
  let cache: Record<string, Record<string, RetryEntry>> | null = null;
  const load = () => {
    if (cache) return cache;
    cache = {};
    try {
      const saved = JSON.parse(storage()?.getItem(AUTO_FARM_RETRY_KEY) ?? '{}');
      if (saved && typeof saved === 'object') for (const [identity, entries] of Object.entries(saved)) {
        if (!entries || typeof entries !== 'object') continue;
        for (const [key, entry] of Object.entries(entries as object)) {
          // Entries saved before the wait existed have two numbers: no failures counted, no wait.
          if (Array.isArray(entry) && (entry.length === 2 || entry.length === 4) && entry.every(value => Number.isFinite(value) && value >= 0))
            (cache[identity] ??= {})[key] = [entry[0], entry[1], entry[2] ?? 0, entry[3] ?? 0];
        }
      }
    } catch { /* Nothing remembered: every map starts open. */ }
    return cache;
  };
  const save = () => { try { storage()?.setItem(AUTO_FARM_RETRY_KEY, JSON.stringify(cache)); } catch { /* Remembered this session. */ } };
  /** The entry for `key`, unless a build more than BUILD_CHANGE times stronger set it. */
  const current = (identity: string, key: string, power: number) => {
    const entry = load()[identity]?.[key];
    return entry && entry[1] <= power * BUILD_CHANGE ? entry : null;
  };
  return {
    /** What `key` asks of a build of `power` before its next try; nothing when nothing holds it back. */
    get(identity: string, key: string, power: number): RetryGate {
      const entry = current(identity, key, power);
      return entry ? { power: entry[0], at: entry[3] } : { power: 0, at: 0 };
    },
    /** Walked away from or beaten by `key` at `power`: the next try needs `factor` times more and waits `waitMs`, doubled per earlier failure. */
    raise(identity: string, key: string, power: number, factor: number, waitMs: number): RetryGate {
      const previous = current(identity, key, power);
      const failures = (previous?.[2] ?? 0) + 1;
      const entry: RetryEntry = [Math.max(power, previous?.[0] ?? 0) * factor, power, failures, now() + waitMs * 2 ** (failures - 1)];
      (load()[identity] ??= {})[key] = entry;
      save();
      return { power: entry[0], at: entry[3] };
    },
  };
}
export const bossRetryKey = (mapId: string) => `boss:${mapId}`;

/** A boss fight so far: seconds since it began, and the share of health each side had then and has now. */
export type BossFightProgress = { seconds: number; bossStart: number; boss: number; playerStart: number; player: number };
/**
 * Shares of health a second: the boss's lost to the player, the player's lost
 * to the boss, regeneration and everything else included, so a player rate of
 * 0 or less never loses.
 */
export type BossFightRates = { boss: number; player: number };
export const bossFightRates = (fight: BossFightProgress): BossFightRates => ({
  boss: (fight.bossStart - fight.boss) / Math.max(1e-9, fight.seconds), player: (fight.playerStart - fight.player) / Math.max(1e-9, fight.seconds) });

/**
 * Whether a boss fight is being lost: the share of the boss's health falling
 * slower than the player's, projected to the end. The real numbers, measured
 * since the fight began, so every damage source and regeneration is in them.
 */
export function bossFightLosing(fight: BossFightProgress) {
  if (fight.seconds < BOSS_JUDGE_SECONDS) return false;
  const rates = bossFightRates(fight);
  if (!(rates.player > 0)) return false;
  return !(rates.boss > 0) || fight.player / rates.player < fight.boss / rates.boss;
}

/** A boss is fought when the fight projects a win inside this long (Ryan: "5-10 minutes"), and left once it no longer does. */
export const BOSS_FIGHT_SECONDS = 10 * 60;
/** How long a fight is watched at the boss before its pace alone can send the player away. */
export const BOSS_PACE_SECONDS = 30;
/** A boss is gone to with at least this share of health, as a player heals up first. */
export const BOSS_READY_HEALTH = .9;

/**
 * How ready a boss fight is: the seconds the player would last (counted up to
 * BOSS_FIGHT_SECONDS) over the seconds the boss would, from the shares of
 * health each has. 1 or more is a win inside the limit.
 */
export function bossReadiness(rates: BossFightRates, shares = { boss: 1, player: 1 }) {
  const needs = shares.boss / Math.max(1e-12, rates.boss);
  const lasts = rates.player > 0 ? shares.player / rates.player : Infinity;
  return Math.min(lasts, BOSS_FIGHT_SECONDS) / needs;
}

/** A boss fight that was lost or left, as measured at the boss: its rates, and the build that fought it. */
export type MeasuredBossFight = BossFightRates & { mapId: string; stats: PlayerPowerStats };

/**
 * A measured fight's rates as another build would see them, each rescaled by
 * what changed. Damage and attack speed speed up the boss's loss; health makes
 * each hit a smaller share, armor a smaller hit, and regeneration heals some
 * of it back.
 */
export function rescaleBossFight(fight: MeasuredBossFight, stats: PlayerPowerStats): BossFightRates {
  const old = fight.stats;
  const offence = (build: PlayerPowerStats) => build.damage / Math.max(1e-9, build.attackRate);
  // What the boss took off before regeneration put some back, in health, then as this build feels it.
  const hits = (fight.player + old.regen / Math.max(1, old.maxHp)) * old.maxHp;
  const armor = (1 - armorDamageReduction(stats.armor)) / Math.max(1e-9, 1 - armorDamageReduction(old.armor));
  return { boss: fight.boss * offence(stats) / Math.max(1e-9, offence(old)), player: (hits * armor - stats.regen) / Math.max(1, stats.maxHp) };
}

/**
 * Walk away before dying, or from a fight not worth its time: the fight is
 * being lost and the player is under half health; or, watched at the boss for
 * BOSS_PACE_SECONDS, what is left of it no longer projects a win inside
 * BOSS_FIGHT_SECONDS. The walk in counts for the first, not the second.
 */
export function shouldLeaveBoss(fight: BossFightProgress, atBoss?: BossFightProgress) {
  if (fight.player < BOSS_LEAVE_HEALTH && bossFightLosing(fight)) return true;
  return Boolean(atBoss && atBoss.seconds >= BOSS_PACE_SECONDS && bossReadiness(bossFightRates(atBoss), atBoss) < 1);
}

/**
 * A freshly reached map's verdict at the end of probation: 'back' when it
 * grows the build slower than the map before by more than the push allows,
 * 'stay' otherwise (or when either rate is unknown), 'pending' until then.
 * Deaths are not counted here: one costs seconds, and the rate already shows them.
 */
export function probationVerdict(probation: { since: number; previousRate: number | null }, at: number, rate: number | null, push: FarmPush) {
  if (at - probation.since < PROBATION_MS) return 'pending';
  return probation.previousRate !== null && rate !== null && rate < probation.previousRate * FARM_PUSHES[push].keep ? 'back' : 'stay';
}
