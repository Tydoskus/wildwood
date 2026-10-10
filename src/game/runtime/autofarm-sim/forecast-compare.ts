/**
 * The growth forecast against what the real-combat harness measured on the
 * same build, map and option (forecast-calibration.test.ts).
 */
import { resolveMapBalance } from '../../../../shared/map-balance';
import { LIVE_BALANCE } from '../../../balance/live-balance';
import { createEmptyResearchRanks, researchStatRewardMultiplier } from '../../../../shared/research';
import { prestigeStatMultiplier } from '../../../../shared/prestige';
import { prestigePerkValue } from '../../../../shared/prestige-perks';
import { criticalDamageMultiplier } from '../../../../shared/critical-damage';
import { challengeMinimumInterval } from '../../../../shared/prestige-challenge';
import { isSoulMap } from '../../../../shared/soul-dimension';
import { movementSpeedMultiplier, PLAYER_SPEED } from '../../../../shared/rules';
import { BASE_ATTACK_RANGE, BASE_PROJECTILE_SPEED } from '../../constants';
import { isMeleeWeapon, weaponAttackRange } from '../../weapon-combat';
import { forecastOption, FORECAST_TUNING, type ForecastResult, type ForecastTuning } from '../growth-forecast';
import { balancedForecastSites, forecastBuild, forecastMap, forecastSite } from '../forecast-inputs';
import { calibrationSites } from './forecast-soul';
import { nextMapProfile, type CalibrationBuild } from './forecast-builds';
import type { HarnessResult } from './forecast-harness';
import type { VirtualPlayerProfile } from './virtual-player';

export type MeasuredRun = HarnessResult & { build: string; which: 'current' | 'next' };
export type CompareRow = {
  build: string; which: string; map: string; group: string; pull: boolean;
  /** How it fought: pulled, one at a time standing, or one at a time kited (autofarm's own way with a bow). */
  mode: 'pull' | 'standing' | 'kited';
  measured: { powerPerMinute: number; deathsPerHour: number; kills: number; meleeHits: number; shotHits: number; killsByGroup: Record<string, number>;
    /** Health lost a minute alive, in shares of max health. */
    damagePerMinute: number };
  forecast: { powerPerMinute: number; deathsPerHour: number; kills: number; sustainable: boolean; meleeHits: number; shotHits: number; killsByGroup: Record<string, number>;
    damagePerMinute: number };
  /** Forecast over measured power a minute (null when both are ~0). */
  ratio: number | null;
};

/** The forecast's inputs for a calibration profile on `mapId`, built as the game would build them. */
export function calibrationInputs(build: CalibrationBuild, profile: VirtualPlayerProfile) {
  const mapId = profile.startMap;
  const snapshot = resolveMapBalance(mapId, LIVE_BALANCE.settings, LIVE_BALANCE.revision);
  const sites = isSoulMap(mapId)
    ? calibrationSites(mapId, build, profile).map(site => forecastSite(site, site.definition!))
    : balancedForecastSites(mapId, snapshot);
  const research = { ...createEmptyResearchRanks(), ...profile.research };
  const perks = profile.perks ?? {};
  const map = forecastMap(mapId, sites, { snapshot, enemyRespawnRank: research.enemyRespawn });
  const forecast = forecastBuild({
    base: { ...profile.base },
    equipment: { equippedHead: profile.head ?? '', equippedChest: profile.chest ?? '', equippedRightHand: profile.weapon, equippedLeftHand: '' },
    research, upgradeLevel: () => 0,
    rewardMultiplier: researchStatRewardMultiplier(research) * prestigeStatMultiplier(profile.prestigeLevel ?? 0),
    minAttackInterval: challengeMinimumInterval(null),
    criticalChance: research.criticalChance * .01 + prestigePerkValue(perks, 'keenEdge'),
    criticalMultiplier: criticalDamageMultiplier({ researchRank: research.criticalDamage, perks, capRank: research.critCap }),
    projectileCount: profile.projectileCount ?? 1,
    melee: isMeleeWeapon(profile.weapon),
    reach: weaponAttackRange(profile.weapon, BASE_ATTACK_RANGE),
    projectileSpeed: BASE_PROJECTILE_SPEED,
    moveSpeed: PLAYER_SPEED * movementSpeedMultiplier(research.moveSpeed) * (1 + prestigePerkValue(perks, 'fleetFoot')),
    bowSkills: profile.bowSkills ?? null,
    perks: { doubleStrike: prestigePerkValue(perks, 'doubleStrike'), splitShot: prestigePerkValue(perks, 'splitShot'),
      reflect: prestigePerkValue(perks, 'riposte'), secondWind: prestigePerkValue(perks, 'secondWind') },
    reflectOnly: profile.reflectOnly,
  });
  return { map, build: forecast };
}

const inputCache = new Map<string, ReturnType<typeof calibrationInputs>>();
export function forecastRun(build: CalibrationBuild, run: MeasuredRun, tuning: ForecastTuning = FORECAST_TUNING): ForecastResult {
  const key = `${build.name}|${run.which}`;
  let inputs = inputCache.get(key);
  if (!inputs) {
    inputs = calibrationInputs(build, run.which === 'current' ? build.profile : nextMapProfile(build)!);
    inputCache.set(key, inputs);
  }
  const all = [...new Set(inputs.map.sites.map(site => site.group))].filter(group => group !== 'soul:critDamage');
  const groups = run.option.group === 'all' ? all : run.option.group ? [run.option.group] : null;
  const result = forecastOption(inputs.map, inputs.build, { pull: run.option.pull, groups, pullCamps: run.option.pullCamps ?? 1, kite: run.option.kite ?? undefined },
    { horizonSeconds: run.simSeconds }, tuning);
  return result;
}

const fmt = (value: number) => Math.abs(value) >= 1e5 ? value.toExponential(2) : value.toFixed(value >= 100 ? 0 : 2);

export function compareCalibration(builds: CalibrationBuild[], runs: MeasuredRun[], tuning: ForecastTuning = FORECAST_TUNING) {
  const rows: CompareRow[] = [];
  for (const run of runs) {
    const build = builds.find(entry => entry.name === run.build);
    if (!build) continue;
    const forecast = forecastRun(build, run, tuning);
    const measured = run.powerPerMinute, predicted = forecast.powerPerMinute;
    const scale = Math.max(Math.abs(measured), Math.abs(predicted));
    rows.push({
      build: run.build, which: run.which, map: run.map, group: run.option.group ?? 'auto', pull: run.option.pull,
      mode: run.option.pull ? 'pull' : run.option.kite === false || isMeleeWeapon(build.profile.weapon) ? 'standing' : 'kited',
      measured: { powerPerMinute: measured, deathsPerHour: run.deathsPerHour, kills: run.kills, meleeHits: run.combat?.meleeHits ?? NaN, shotHits: run.combat?.otherHits ?? NaN, killsByGroup: run.combat?.killsByGroup ?? {},
        damagePerMinute: run.combat?.aliveSeconds ? run.combat.damageTaken / (run.combat.aliveSeconds / 60) : NaN },
      forecast: { powerPerMinute: predicted, deathsPerHour: forecast.deathsPerHour, kills: forecast.kills, sustainable: forecast.sustainable,
        meleeHits: forecast.hits.melee, shotHits: forecast.hits.shots, killsByGroup: forecast.killsByGroup,
        damagePerMinute: forecast.hits.damage / Math.max(1, forecast.maxHealth) / (Math.max(1, run.simSeconds - forecast.time.dead) / 60) },
      ratio: scale <= 1e-9 ? null : measured > 0 ? predicted / measured : null,
    });
  }
  rows.sort((a, b) => a.build.localeCompare(b.build) || a.which.localeCompare(b.which) || a.group.localeCompare(b.group) || a.mode.localeCompare(b.mode));
  const lines = ['build which map group mode | measured/min forecast/min ratio | deaths/h measured forecast | kills measured forecast | melee hits m f | shot hits m f | farmed group share of kills m f | forecast says'];
  const farmedShare = (row: CompareRow, kills: Record<string, number>) => {
    const total = Object.values(kills).reduce((sum, count) => sum + count, 0);
    return row.group === 'auto' || !total ? '-' : ((kills[row.group] ?? 0) / total).toFixed(2);
  };
  for (const row of rows) {
    lines.push(`${row.build} ${row.which} ${row.map} ${row.group} ${row.mode} | ${fmt(row.measured.powerPerMinute)} ${fmt(row.forecast.powerPerMinute)} ${row.ratio === null ? '-' : row.ratio.toFixed(2)} | ${row.measured.deathsPerHour.toFixed(0)} ${row.forecast.deathsPerHour.toFixed(0)} | ${row.measured.kills} ${row.forecast.kills} | ${row.measured.meleeHits} ${row.forecast.meleeHits} | ${row.measured.shotHits} ${row.forecast.shotHits} | ${farmedShare(row, row.measured.killsByGroup)} ${farmedShare(row, row.forecast.killsByGroup)} | ${row.forecast.sustainable ? 'ok' : 'unsustainable'}`);
  }
  const score = scoreRows(rows);
  lines.push('', score.text);
  return { rows, text: lines.join('\n'), score };
}

/** A rate this small next to the best option on the same build and map counts as nothing. */
const NEGLIGIBLE = .05;

/**
 * How well the forecast did: on the options that grew the build, how far its
 * rate was from the measured one; on those that did not, whether it said so;
 * and for each build, how good the option it would pick really was.
 */
export function scoreRows(rows: readonly CompareRow[]) {
  const best = new Map<string, { measured: number; forecast: number }>();
  for (const row of rows) {
    const key = `${row.build}|${row.which}`, entry = best.get(key) ?? { measured: 0, forecast: 0 };
    entry.measured = Math.max(entry.measured, row.measured.powerPerMinute);
    entry.forecast = Math.max(entry.forecast, row.forecast.powerPerMinute);
    best.set(key, entry);
  }
  // A build's best across both maps, for the picks.
  const buildBest = new Map<string, number>();
  for (const row of rows) buildBest.set(row.build, Math.max(buildBest.get(row.build) ?? 0, row.measured.powerPerMinute));
  const growing = rows.filter(row => row.measured.powerPerMinute > NEGLIGIBLE * (buildBest.get(row.build) ?? 0) && row.measured.powerPerMinute > 0);
  // Capped at 20x: a forecast of nothing for an option that grew is one bad miss, not an infinite one.
  const logs = growing.map(row => Math.min(Math.log(20), Math.abs(Math.log(Math.max(1e-9, row.forecast.powerPerMinute) / row.measured.powerPerMinute))));
  const within = (limit: number) => logs.filter(value => value <= Math.log(limit)).length;
  const idle = rows.filter(row => !growing.includes(row));
  const idleAgree = idle.filter(row => row.forecast.powerPerMinute <= NEGLIGIBLE * (buildBest.get(row.build) ?? 0)).length;
  // Picks: the option the forecast rates best (among the measured ones), against the measured best.
  const regrets: { build: string; share: number; pick: string; best: string }[] = [];
  for (const build of new Set(rows.map(row => row.build))) {
    const options = rows.filter(row => row.build === build);
    // The forecast's pick, by the decision rule: the most power a minute among the options it calls sustainable.
    const open = options.filter(row => row.forecast.sustainable);
    if (!open.length) continue;
    const pick = open.reduce((a, b) => b.forecast.powerPerMinute > a.forecast.powerPerMinute ? b : a);
    const top = options.reduce((a, b) => b.measured.powerPerMinute > a.measured.powerPerMinute ? b : a);
    const label = (row: CompareRow) => `${row.which} ${row.group} ${row.mode}`;
    regrets.push({ build, share: top.measured.powerPerMinute > 0 ? pick.measured.powerPerMinute / top.measured.powerPerMinute : 1, pick: label(pick), best: label(top) });
  }
  const deathErrors = rows.map(row => Math.abs(row.forecast.deathsPerHour - row.measured.deathsPerHour));
  const error = (row: CompareRow) => Math.min(Math.log(20), Math.abs(Math.log(Math.max(1e-9, row.forecast.powerPerMinute) / row.measured.powerPerMinute)));
  const byMode = (['pull', 'standing', 'kited'] as const).map(mode => {
    const rowsOf = growing.filter(row => row.mode === mode), errors = rowsOf.map(error);
    return `${mode} ${rowsOf.length}: within ±30% ${errors.filter(value => value <= Math.log(1.3)).length}, median x${Math.exp(median(errors)).toFixed(2)}`;
  }).join('; ');
  const meanLog = logs.reduce((sum, value) => sum + value, 0) / Math.max(1, logs.length);
  const damageLogs = rows.filter(row => row.measured.damagePerMinute > .01)
    .map(row => Math.min(Math.log(20), Math.abs(Math.log(Math.max(1e-6, row.forecast.damagePerMinute) / row.measured.damagePerMinute))));
  const damageLog = damageLogs.reduce((sum, value) => sum + value, 0) / Math.max(1, damageLogs.length);
  // Damage taken: the forecast's health lost a minute alive against what was measured, per mode.
  const damageByMode = (['pull', 'standing', 'kited'] as const).map(mode => {
    const measured = rows.filter(row => row.mode === mode && Number.isFinite(row.measured.damagePerMinute));
    if (!measured.length) return `${mode} -`;
    const sum = measured.reduce((acc, row) => ({ m: acc.m + row.measured.damagePerMinute, f: acc.f + row.forecast.damagePerMinute }), { m: 0, f: 0 });
    const logs = measured.filter(row => row.measured.damagePerMinute > .01 && row.forecast.damagePerMinute > 0)
      .map(row => Math.abs(Math.log(row.forecast.damagePerMinute / row.measured.damagePerMinute)));
    return `${mode} ${measured.length}: forecast/measured ${(sum.f / Math.max(1e-9, sum.m)).toFixed(2)}, within ±30% ${logs.filter(value => value <= Math.log(1.3)).length}/${logs.length}`;
  }).join('; ');
  const text = [
    `options measured ${rows.length}; growing ${growing.length}: within ±30% ${within(1.3)}, within 2x ${within(2)}, median error x${Math.exp(median(logs)).toFixed(2)}, mean |log| ${meanLog.toFixed(3)}`,
    `by mode (growing options): ${byMode}`,
    `damage taken a minute (shares of max health), by mode: ${damageByMode}`,
    `not growing ${idle.length}: forecast agrees on ${idleAgree}`,
    `deaths/hour: median abs error ${median(deathErrors).toFixed(0)}`,
    `picks (forecast's best option, measured rate as a share of the measured best): ${regrets.map(entry => `${entry.build} ${(entry.share * 100).toFixed(0)}%${entry.share < .999 ? ` [${entry.pick} vs ${entry.best}]` : ''}`).join(', ')}`,
  ].join('\n');
  return { growing: growing.length, within30: within(1.3), within2: within(2), medianLog: median(logs), meanLog, idle: idle.length, idleAgree, regrets, text,
    // One number to tune by: growth error, idle disagreement, lost growth from bad picks, and the error in damage taken.
    loss: meanLog + (idle.length - idleAgree) / Math.max(1, rows.length) * 2 + regrets.reduce((sum, entry) => sum + (1 - entry.share), 0) / Math.max(1, regrets.length)
      + damageLog * .5 };
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
