/**
 * Autofarm's growth planner: the growth forecast (growth-forecast.ts) run on
 * the live build every PLAN_SECONDS, a little at a time (a few forecasts a
 * frame), so autofarm can choose by what each choice would grow the build:
 * which map (this one, the next, the one before), and which stat group.
 *
 * What it measures on the map it farms (kills and damage taken a minute)
 * against what it predicted for what it is doing corrects every later
 * forecast: kills by the damage calibration, damage taken by the incoming one.
 */
import {
  forecastOption, growthStatChoiceSteps, pullTankCheck, KITE_MAX_CHASERS,
  type ForecastBuild, type ForecastMap, type ForecastOption, type ForecastResult, type ForecastRun, type ForecastedOption, type GrowthMode,
} from './growth-forecast';
import type { Point } from '../../balance/death-model';
import { balancedForecastSites, forecastBuild, forecastMap, liveForecastSites } from './forecast-inputs';
import { damageAfterArmor as installedDamageAfterArmor } from '../combat';
import { isMeleeWeapon, weaponAttackRange } from '../weapon-combat';
import { prestigePerkValue, type PrestigePerkRanks } from '../../../shared/prestige-perks';
import type { PlayerPowerProgress, PlayerPowerResearch, PlayerPowerStats } from '../../../shared/player-power';
import type { BowSkillRoll } from '../../../shared/bow-skills';
import type { MapBalanceSnapshot } from '../../../shared/map-balance-types';
import type { SpawnSite } from '../world';
import type { PlayerState } from './types';

/** What the planner prices with, from the live game; null while any of it is still loading. */
export type GrowthContext = {
  /** The live build (forecast-inputs.ts forecastBuild). */
  build: ForecastBuild;
  /** This map, its sites as they stand. */
  current: ForecastMap;
  /** The unlocked map ahead and the map behind, at full strength from their balance; null when there is none (or it is not loaded yet). */
  next: ForecastMap | null;
  previous: ForecastMap | null;
  /** Where their portals stand on this map, for the walk to each. */
  nextPortal: Point | null;
  previousPortal: Point | null;
};

/** One map, priced: its best option a build can take (valid and sustainable), or nothing. */
export type MapPrice = { powerPerMinute: number; deathsPerHour: number; mode: GrowthMode | null; option: ForecastOption | null };

export type GrowthPlan = {
  /** When it was finished (the controller's clock). */
  at: number;
  mapId: string;
  current: MapPrice;
  next: MapPrice | null;
  previous: MapPrice | null;
  /** The stat group to farm for growth (growthStatChoice); null when it found none. */
  group: string | null;
  /** What it is doing now, as the forecast sees it: what the measurement is checked against. */
  doing: { killsPerMinute: number; damagePerMinute: number; deathsPerHour: number; powerPerMinute: number } | null;
  calibration: { damage: number; incoming: number };
};

/** A plan is made this often; a choice made from it waits for the next. */
export const PLAN_SECONDS = 20;
/**
 * A map is priced over this long. A map just reached stands full, and over a
 * couple of minutes that reads as a little better than it keeps up; the runs
 * grew more with that lean forward (ten minutes kept builds back from the maps
 * that lead on) than without it.
 */
const MAP_HORIZON_SECONDS = 120;
/** A stat's probe is priced over this long: it compares one build with another on the same map, so the bias cancels. */
const PLAN_HORIZON_SECONDS = 120;
/** Forecasts a frame: each takes a few milliseconds. */
const STEPS_PER_TICK = 2;
/** The measurement the calibration is checked against: the last this many seconds on this map. */
const MEASURE_SECONDS = 180;
/** Measured for at least this long before it corrects anything. */
const MEASURE_MIN_SECONDS = 60;
/** How far one plan may move a calibration factor, and the bounds of each. */
const CALIBRATION_STEP = 1.3;
const CALIBRATION_BOUNDS = [.2, 8] as const;

const nothing: MapPrice = { powerPerMinute: 0, deathsPerHour: 0, mode: null, option: null };

function bestOf(options: readonly ForecastedOption[]): MapPrice {
  const open = options.filter(option => option.valid && option.sustainable);
  if (!open.length) return { ...nothing, deathsPerHour: Math.min(...options.map(option => option.deathsPerHour)) };
  const best = open.reduce((a, b) => b.powerPerMinute > a.powerPerMinute ? b : a);
  return { powerPerMinute: best.powerPerMinute, deathsPerHour: best.deathsPerHour, mode: best.mode, option: best.option };
}

/** One map's three ways of fighting, priced (growth-forecast.ts forecastGrowth, for any map and lead). */
function* priceMap(map: ForecastMap, build: ForecastBuild, run: ForecastRun, modes: readonly GrowthMode[], which: 'current' | 'next'): Generator<void, ForecastedOption[], void> {
  const all = [...new Set(map.sites.map(site => site.group))].filter(group => group !== 'soul:critDamage');
  const results: ForecastedOption[] = [];
  const canKite = !build.melee && !build.reflectOnly;
  if (modes.includes('pull') && all.length) {
    const tank = pullTankCheck(map, build, all, { start: run.start, health: run.health });
    yield;
    results.push({ ...forecastOption(map, build, { pull: true, groups: all, pullCamps: all.length }, run), map: which, mode: 'pull', valid: tank.tankable, tank });
    yield;
  }
  if (modes.includes('standing')) {
    results.push({ ...forecastOption(map, build, { pull: false, groups: null, kite: false }, run), map: which, mode: 'standing', valid: true });
    yield;
  }
  if (canKite && modes.includes('kited')) {
    const kited = forecastOption(map, build, { pull: false, groups: null, kite: true }, run);
    results.push({ ...kited, map: which, mode: 'kited', valid: kited.chasers.peak <= KITE_MAX_CHASERS });
    yield;
  }
  return results;
}

/** The planner's choices that measured best in the virtual-player runs (autofarm-sim); a comparison run overrides them. */
export type GrowthTuning = {
  /** How long a rise in the rate is counted for when choosing the stat (growthStatChoice horizonMinutes). */
  horizonMinutes: number;
  /** Off: the stat is Best Gain's, the planner only chooses the map. */
  statChoice: boolean;
};
export const GROWTH_TUNING: GrowthTuning = { horizonMinutes: 60, statChoice: true };

export function createGrowthPlanner(overrides: Partial<GrowthTuning> = {}) {
  const tuning: GrowthTuning = { ...GROWTH_TUNING, ...overrides };
  let plan: GrowthPlan | null = null;
  let working: Generator<void, GrowthPlan | null, void> | null = null;
  let startedAt = -Infinity;
  const calibration = { damage: 1, incoming: 1 };
  /** Measured on this map: per second, kills and health lost (as damage), for the calibration. */
  let measured: { mapId: string; samples: { at: number; seconds: number; kills: number; damage: number }[] } = { mapId: '', samples: [] };

  function* make(at: number, mapId: string, context: GrowthContext, doing: { pull: boolean; groups: readonly string[] | null; position: Point; health: number }): Generator<void, GrowthPlan | null, void> {
    const build: ForecastBuild = { ...context.build, damageCalibration: calibration.damage, incomingCalibration: calibration.incoming };
    const modes: GrowthMode[] = doing.pull ? ['pull', 'standing', 'kited'] : ['standing', 'kited'];
    const here: ForecastRun = { horizonSeconds: MAP_HORIZON_SECONDS, start: doing.position, health: doing.health };
    const lead = (portal: Point | null) => portal ? Math.hypot(portal.x - doing.position.x, portal.y - doing.position.y) / Math.max(1, build.moveSpeed) + 2 : 0;
    const currentOptions = yield* priceMap(context.current, build, here, modes, 'current');
    const nextOptions = context.next ? yield* priceMap(context.next, build, { horizonSeconds: MAP_HORIZON_SECONDS, leadSeconds: lead(context.nextPortal) }, modes, 'next') : null;
    const previousOptions = context.previous ? yield* priceMap(context.previous, build, { horizonSeconds: MAP_HORIZON_SECONDS, leadSeconds: lead(context.previousPortal) }, modes, 'next') : null;
    // What it is doing now, priced the same way: the measurement is checked against it.
    const now: ForecastResult = forecastOption(context.current, build, { pull: doing.pull, groups: doing.groups, pullCamps: doing.groups?.length ?? 1 }, here);
    yield;
    // The stat to farm here: the most growth, the next map's options counted in (its probes, and their baseline, on the short horizon).
    const choice = tuning.statChoice ? yield* growthStatChoiceSteps({ current: context.current, next: context.next, build, start: doing.position, health: doing.health,
      horizonSeconds: PLAN_HORIZON_SECONDS, nextLeadSeconds: lead(context.nextPortal), modes, horizonMinutes: tuning.horizonMinutes }) : { group: null };
    const minutes = MAP_HORIZON_SECONDS / 60;
    return {
      at, mapId,
      current: bestOf(currentOptions), next: nextOptions && bestOf(nextOptions), previous: previousOptions && bestOf(previousOptions),
      group: choice.group,
      doing: { killsPerMinute: now.kills / minutes, damagePerMinute: now.hits.damage / minutes, deathsPerHour: now.deathsPerHour, powerPerMinute: now.powerPerMinute },
      calibration: { ...calibration },
    };
  }

  /** The calibration from what was measured against what the last plan predicted for it. */
  function recalibrate(at: number) {
    const doing = plan?.doing;
    if (!doing || plan!.mapId !== measured.mapId) return;
    const recent = measured.samples.filter(sample => at - sample.at <= MEASURE_SECONDS * 1_000);
    const seconds = recent.reduce((sum, sample) => sum + sample.seconds, 0);
    if (seconds < MEASURE_MIN_SECONDS) return;
    const minutes = seconds / 60;
    const kills = recent.reduce((sum, sample) => sum + sample.kills, 0) / minutes, damage = recent.reduce((sum, sample) => sum + sample.damage, 0) / minutes;
    const step = (ratio: number) => Math.min(CALIBRATION_STEP, Math.max(1 / CALIBRATION_STEP, Math.sqrt(ratio)));
    const bound = (value: number) => Math.min(CALIBRATION_BOUNDS[1], Math.max(CALIBRATION_BOUNDS[0], value));
    // A kill or a hit either way keeps a quiet minute from reading as a factor of zero or infinity.
    calibration.damage = bound(calibration.damage * step((kills + .5) / (doing.killsPerMinute + .5)));
    const unit = Math.max(1e-9, doing.damagePerMinute, damage) * .05;
    calibration.incoming = bound(calibration.incoming * step((damage + unit) / (doing.damagePerMinute + unit)));
  }

  return {
    /**
     * A frame: starts a plan every PLAN_SECONDS (from `context`, read only
     * then) and plays a few of its forecasts.
     */
    tick(at: number, mapId: string, context: () => GrowthContext | null, doing: () => { pull: boolean; groups: readonly string[] | null; position: Point; health: number }) {
      if (!working && at - startedAt >= PLAN_SECONDS * 1_000) {
        const live = context();
        if (!live) return;
        startedAt = at;
        recalibrate(at);
        working = make(at, mapId, live, doing());
      }
      for (let step = 0; working && step < STEPS_PER_TICK; step++) {
        const next = working.next();
        if (next.done) { working = null; if (next.value) plan = { ...next.value, at, mapId }; }
      }
    },
    /** What happened this frame on `mapId`: kills, and health lost. */
    observe(at: number, mapId: string, seconds: number, kills: number, damage: number) {
      if (measured.mapId !== mapId) measured = { mapId, samples: [] };
      const last = measured.samples[measured.samples.length - 1];
      // One sample a second is plenty.
      if (last && at - last.at < 1_000) { last.seconds += seconds; last.kills += kills; last.damage += damage; }
      else measured.samples.push({ at, seconds, kills, damage });
      while (measured.samples.length && at - measured.samples[0].at > MEASURE_SECONDS * 1_000) measured.samples.shift();
    },
    /** The last plan, if it was made on `mapId`. */
    plan: (mapId: string) => plan && plan.mapId === mapId ? plan : null,
    /** Starts over on another map (the calibration is the build's, and is kept). */
    reset() { plan = null; working = null; startedAt = -Infinity; },
    calibration: () => ({ ...calibration }),
  };
}
export type GrowthPlanner = ReturnType<typeof createGrowthPlanner>;

/**
 * Other maps' balance for the planner, from a fetch made once a session per map
 * (main.ts: coop.mapIndexBalance, the map window's): undefined while it loads,
 * null if it cannot.
 */
export function createBalanceCache(fetch: (mapId: string) => Promise<MapBalanceSnapshot | null> | undefined) {
  const balances = new Map<string, MapBalanceSnapshot | null | undefined>();
  return (mapId: string) => {
    if (!balances.has(mapId)) {
      const pending = fetch(mapId);
      balances.set(mapId, pending ? undefined : null);
      void pending?.then(snapshot => balances.set(mapId, snapshot), () => balances.set(mapId, null));
    }
    return balances.get(mapId);
  };
}

/**
 * The planner's inputs from the live game, as main.ts and the virtual player
 * wire it: the build from the player and its gear, research and perks; this
 * map from its live sites; the maps either side from their balance, once it
 * has loaded (null until then, and the planner waits).
 */
export function createGrowthContextSource(deps: {
  player: Pick<PlayerState, 'damage' | 'baseMaxHp' | 'attackRate' | 'armor' | 'regen' | 'projectileCount' | 'attackRange' | 'projectileSpeed'>;
  equipment: () => Omit<PlayerPowerProgress, keyof PlayerPowerStats>;
  weapon: () => string;
  research: () => PlayerPowerResearch & { enemyRespawn?: number };
  upgradeLevel: (itemId: string) => number;
  rewardMultiplier: () => number;
  minAttackInterval: () => number;
  criticalChance: () => number;
  criticalMultiplier: () => number;
  moveSpeed: () => number;
  bowSkills: () => Partial<BowSkillRoll> | null | undefined;
  perks: () => Partial<PrestigePerkRanks> | null | undefined;
  reflectOnly: () => boolean;
  mapId: () => string;
  spawnSites: readonly SpawnSite[];
  /** The game clock site.respawnAt counts on. */
  gameTime: () => number;
  arrival: (mapId: string) => Point;
  /** This map's installed balance (runtimeMapBalance); any other map's: undefined while it loads, null if it cannot. */
  currentBalance: () => MapBalanceSnapshot | null;
  balance: (mapId: string) => MapBalanceSnapshot | null | undefined;
  nextPortal: () => (Point & { destination: string }) | null;
  previousPortal: () => (Point & { destination: string }) | null;
}) {
  const priced = new Map<string, { snapshot: MapBalanceSnapshot; map: ForecastMap }>();
  /** Another map at full strength from its balance, built once per balance. */
  function other(mapId: string): ForecastMap | null | undefined {
    const snapshot = deps.balance(mapId);
    if (!snapshot) return snapshot;
    const cached = priced.get(mapId);
    if (cached && cached.snapshot === snapshot) return cached.map;
    const map = forecastMap(mapId, balancedForecastSites(mapId, snapshot), { snapshot, enemyRespawnRank: deps.research().enemyRespawn ?? 0, arrival: deps.arrival(mapId) });
    priced.set(mapId, { snapshot, map });
    return map;
  }
  return (): GrowthContext | null => {
    const mapId = deps.mapId(), player = deps.player, research = deps.research(), perks = deps.perks();
    const next = deps.nextPortal(), previous = deps.previousPortal();
    const nextMap = next ? other(next.destination) : null, previousMap = previous ? other(previous.destination) : null;
    // A map either side still loading: wait for it rather than plan without it (one that cannot load is left out).
    if (nextMap === undefined || previousMap === undefined) return null;
    const build = forecastBuild({
      base: { damage: player.damage, maxHp: player.baseMaxHp, attackRate: player.attackRate, armor: player.armor, regen: player.regen },
      equipment: deps.equipment(), research, upgradeLevel: deps.upgradeLevel, rewardMultiplier: deps.rewardMultiplier(), minAttackInterval: deps.minAttackInterval(),
      criticalChance: deps.criticalChance(), criticalMultiplier: deps.criticalMultiplier(),
      projectileCount: player.projectileCount ?? 1, melee: isMeleeWeapon(deps.weapon()), reach: weaponAttackRange(deps.weapon(), player.attackRange),
      projectileSpeed: player.projectileSpeed, moveSpeed: deps.moveSpeed(), bowSkills: deps.bowSkills(),
      perks: { doubleStrike: prestigePerkValue(perks, 'doubleStrike'), splitShot: prestigePerkValue(perks, 'splitShot'),
        reflect: prestigePerkValue(perks, 'riposte'), secondWind: prestigePerkValue(perks, 'secondWind') },
      reflectOnly: deps.reflectOnly(),
    });
    const gameTime = deps.gameTime();
    const current = forecastMap(mapId, liveForecastSites(deps.spawnSites, site => site.respawnAt - gameTime),
      { snapshot: deps.currentBalance(), enemyRespawnRank: research.enemyRespawn ?? 0, hitAfterArmor: installedDamageAfterArmor, arrival: deps.arrival(mapId) });
    return { build, current, next: nextMap, previous: previousMap, nextPortal: next, previousPortal: previous };
  };
}
